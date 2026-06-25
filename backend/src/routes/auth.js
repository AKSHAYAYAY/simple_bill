import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import { env } from '../config/env.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { masterPool } from '../db/ConnectionManager.js';
import { provisionTenantDatabase } from '../db/tenantProvisioner.js';

export const authRouter = Router();

const signAccess = (payload) => jwt.sign(payload, env.jwt.secret, { expiresIn: env.jwt.accessExpiresIn });
const signRefresh = (payload) => jwt.sign(payload, env.jwt.refreshSecret, { expiresIn: env.jwt.refreshExpiresIn });

// ── REGISTER HANDLER ──────────────────────────────────────────────────────────
authRouter.post('/register', [
  body('email').isEmail(),
  body('password').isLength({ min: 8 }),
  body('name').notEmpty()
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Validation failed', details: errors.array() });
  }

  const { email, password, name, phone, businessName, licenseKey } = req.body;
  const hash = await bcrypt.hash(password, 10);
  const conn = await masterPool.getConnection();
  let dbName = null;
  let businessId = null;
  let userId = null;

  try {
    await conn.beginTransaction();

    // Check duplicate email in app_users
    const [existing] = await conn.execute(
      'SELECT user_id FROM app_users WHERE email = ? LIMIT 1',
      [email.trim().toLowerCase()]
    );
    if (existing.length > 0) {
      return res.status(409).json({ success: false, error: { code: 'CONFLICT', message: 'Email already registered' } });
    }

    // Resolve/Insert license key if needed
    const license = licenseKey || `SB-FREE-${Date.now()}`;

    // Write to master_users_registry
    await conn.execute(
      'INSERT INTO master_users_registry (email, license_key, name, password_hash, phone, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
      [email.trim().toLowerCase(), license, name.trim(), hash, phone || null]
    );

    // Write to saas_user_profiles
    await conn.execute(
      "INSERT INTO saas_user_profiles (email, license_key, name, role, phone, avatar_url) VALUES (?, ?, ?, 'Admin', ?, '')",
      [email.trim().toLowerCase(), license, name.trim(), phone || null]
    );

    // STEP 4: INSERT into app_users
    const [userResult] = await conn.execute(
      'INSERT INTO app_users (full_name, email, phone, password_hash, created_at) VALUES (?, ?, ?, ?, NOW())',
      [name.trim(), email.trim().toLowerCase(), phone || null, hash]
    );
    userId = userResult.insertId;

    // STEP 5: INSERT into businesses
    const [bizResult] = await conn.execute(
      "INSERT INTO businesses (user_id, business_name, owner_name, email, phone, invoice_prefix, is_active, created_at) VALUES (?, ?, ?, ?, ?, 'INV', 1, NOW())",
      [userId, businessName || `${name}'s Business`, name.trim(), email.trim().toLowerCase(), phone || null]
    );
    businessId = bizResult.insertId;

    // STEP 6: INSERT into business_users (Owner role)
    await conn.execute(
      "INSERT INTO business_users (business_id, user_id, role, is_active, joined_at) VALUES (?, ?, 'Owner', 1, NOW())",
      [businessId, userId]
    );

    await conn.commit();
  } catch (error) {
    await conn.rollback();
    console.error('Registration master DB transaction failed:', error);
    return res.status(500).json({ success: false, error: { code: 'REGISTRATION_FAILED', message: error.message } });
  } finally {
    conn.release();
  }

  // STEP 7: PROVISION THE TENANT DATABASE (outside active transaction to prevent Read Committed isolation issues)
  dbName = `uvuytecv_biz_${businessId}_db`;
  try {
    await provisionTenantDatabase(masterPool, businessId);

    // STEP 8: Return JWT with { user_id, business_id, email, role: 'Owner' }
    const payload = {
      user_id: userId,
      business_id: businessId,
      email: email.trim().toLowerCase(),
      role: 'Owner'
    };

    return res.status(201).json({
      success: true,
      data: {
        access_token: signAccess(payload),
        refresh_token: signRefresh({ user_id: userId, email: email.trim().toLowerCase() }),
        expires_in: 900,
        user: {
          user_id: userId,
          full_name: name.trim(),
          email: email.trim().toLowerCase()
        },
        business_id: businessId,
        db_name: dbName
      },
      message: 'User registered and tenant DB provisioned successfully'
    });
  } catch (provError) {
    console.error('Registration tenant provisioning failed:', provError);
    // Cleanup master database records manually
    try {
      await masterPool.execute('DELETE FROM business_users WHERE business_id = ?', [businessId]);
      await masterPool.execute('DELETE FROM businesses WHERE business_id = ?', [businessId]);
      await masterPool.execute('DELETE FROM saas_user_profiles WHERE email = ?', [email.trim().toLowerCase()]);
      await masterPool.execute('DELETE FROM master_users_registry WHERE email = ?', [email.trim().toLowerCase()]);
      const [appUserRows] = await masterPool.execute('SELECT user_id FROM app_users WHERE email = ?', [email.trim().toLowerCase()]);
      if (appUserRows.length > 0) {
        await masterPool.execute('DELETE FROM app_users WHERE user_id = ?', [appUserRows[0].user_id]);
      }
      // Omit database drop for manual MilesWeb provisioning compatibility
      console.log(`[Cleanup] Successfully cleaned up master DB records after provisioning failure (retaining manually created database ${dbName}).`);
    } catch (cleanupErr) {
      console.error('[Cleanup] Failed to clean up master DB records after provisioning failure:', cleanupErr);
    }
    return res.status(500).json({ success: false, error: { code: 'REGISTRATION_FAILED', message: provError.message } });
  }
}));

// ── LOGIN HANDLER ─────────────────────────────────────────────────────────────
authRouter.post('/login', [
  body('email').isEmail(),
  body('password').notEmpty()
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Validation failed', details: errors.array() });
  }

  const { email, password } = req.body;

  // STEP 1: Find user by email in app_users (master DB)
  const [rows] = await masterPool.execute(
    'SELECT user_id, email, full_name, phone, password_hash FROM app_users WHERE email = ?',
    [email.trim().toLowerCase()]
  );
  const user = rows[0];

  // STEP 2: Verify bcrypt password against password_hash
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } });
  }

  // STEP 3: Fetch all businesses for this user
  const [businesses] = await masterPool.execute(`
    SELECT b.business_id, b.business_name, b.business_type,
           b.gst_type, b.invoice_prefix, bu.role
    FROM businesses b
    JOIN business_users bu ON b.business_id = bu.business_id
    WHERE bu.user_id = ? AND bu.is_active = 1
  `, [user.user_id]);

  if (businesses.length === 0) {
    return res.status(403).json({ success: false, error: { code: 'NO_BUSINESS', message: 'No active businesses linked to this user' } });
  }

  // STEP 4: Return JWT payload and response body
  const defaultBusiness = businesses[0].business_id;
  const role = businesses[0].role;

  const payload = {
    user_id: user.user_id,
    email: user.email,
    full_name: user.full_name,
    default_business_id: defaultBusiness,
    role: role
  };

  return res.json({
    success: true,
    data: {
      access_token: signAccess(payload),
      refresh_token: signRefresh({ user_id: user.user_id, email: user.email }),
      expires_in: 900,
      user: {
        user_id: user.user_id,
        email: user.email,
        full_name: user.full_name
      },
      businesses: businesses.map(b => ({
        business_id: b.business_id,
        business_name: b.business_name,
        role: b.role,
        gst_type: b.gst_type
      }))
    }
  });
}));

// ── REFRESH TOKEN HANDLER ─────────────────────────────────────────────────────
authRouter.post('/refresh', [body('refreshToken').notEmpty()], (req, res) => {
  const { refreshToken } = req.body;
  try {
    const decoded = jwt.verify(refreshToken, env.jwt.refreshSecret);
    const accessToken = signAccess({ user_id: decoded.user_id, email: decoded.email });
    return res.json({ accessToken });
  } catch {
    return res.status(401).json({ error: 'Invalid refresh token' });
  }
});
