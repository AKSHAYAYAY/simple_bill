import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { provisionTenantDatabase } from './utils/provisionTenant.js';
import { masterPool } from './db/ConnectionManager.js';
import jwt from 'jsonwebtoken';
import { env } from './config/env.js';
import { ensureMasterTables } from './db/masterInit.js';

const ADMIN_SECRET = process.env.ADMIN_SECRET || 'bizbytech.admin';
const ALLOW_CLIENT_DB_CONFIG = process.env.ALLOW_CLIENT_DB_CONFIG === 'true';

let pool = null;

const getDbConfig = (config = {}) => ({
    host: process.env.MYSQL_HOST || (ALLOW_CLIENT_DB_CONFIG ? config.host : undefined),
    user: process.env.MYSQL_USER || (ALLOW_CLIENT_DB_CONFIG ? config.user : undefined),
    password: process.env.MYSQL_PASSWORD || (ALLOW_CLIENT_DB_CONFIG ? config.password : undefined),
    database: process.env.MYSQL_DATABASE || (ALLOW_CLIENT_DB_CONFIG ? config.database : undefined)
});

const getPool = (config) => {
    if (pool) return pool;
    const resolved = getDbConfig(config);
    if (!resolved.host || !resolved.user || !resolved.password || !resolved.database) {
        throw new Error('Database configuration is missing. Set MYSQL_* environment variables on server.');
    }

    pool = mysql.createPool({
        ...resolved,
        waitForConnections: true,
        connectionLimit: 10,
        maxIdle: 10,
        idleTimeout: 60000,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 0,
        ssl: process.env.MYSQL_SSL === 'false' ? undefined : { rejectUnauthorized: false }
    });

    return pool;
};

const normalizeEmail = (email = '') => String(email).trim().toLowerCase();
const normalizePhone = (phone = '') => String(phone).replace(/\s+/g, '').trim();
const isEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const isValidLicense = (license = '') => /^SB-(FREE|PRO|ENT)-[A-Z0-9]{6,}$/i.test(license.trim());
const isValidPhone = (phone = '') => /^\+?[0-9]{7,15}$/.test(phone);

const sanitizeForLog = (value = '') => String(value).slice(0, 4000);

const planFromLicense = (license = '') => {
    const normalized = String(license).trim().toUpperCase();
    if (normalized.startsWith('SB-PRO-')) return 'PRO';
    if (normalized.startsWith('SB-ENT-')) return 'ENTERPRISE';
    return 'FREE';
};

export default async function handler(req, res) {
    // CORS handled by express middleware in server.js

    const { config, action, data = {}, license_key } = req.body || {};
    if (!action) return res.status(400).json({ error: 'Invalid Request: Missing action' });

    // Admin login should not depend on DB connectivity/configuration.
    if (action === 'admin_login') {
        if (data.password === ADMIN_SECRET) {
            return res.status(200).json({
                data: {
                    token: 'SB-ADMIN-' + Date.now(),
                    user: { name: 'Super Admin', email: 'admin@bizbytech.in', role: 'SuperAdmin' }
                }
            });
        }
        return res.status(401).json({ error: 'Invalid Credentials' });
    }

    let db;
    try {
        db = getPool(config || {});

        const query = async (sql, params = []) => {
            const [rows] = await db.execute(sql, params);
            return rows;
        };

        const ensureGlobalTables = async () => {
            await ensureMasterTables(db);
        };

        const recordErrorLog = async ({ source = 'API', message = 'Unknown error', context = null, level = 'ERROR' }) => {
            await ensureGlobalTables();
            await query(
                'INSERT INTO saas_error_logs (source, level, message, context, created_at) VALUES (?, ?, ?, ?, NOW())',
                [sanitizeForLog(source), sanitizeForLog(level || 'ERROR'), sanitizeForLog(message), context ? JSON.stringify(context).slice(0, 20000) : null]
            );
        };

        const getLicenseRecord = async (license) => {
            const rows = await query(
                'SELECT license_key, plan_id, status, assigned_email, max_users FROM saas_license_keys WHERE LOWER(license_key) = LOWER(?) LIMIT 1',
                [license]
            );
            return rows.length ? rows[0] : null;
        };

        const verifyAndNormalizeLicense = async (license) => {
            const normalized = String(license || '').trim().toUpperCase();
            if (!isValidLicense(normalized)) {
                return { key: normalized, plan: planFromLicense(normalized), status: 'INVALID', expiryDate: null, maxUsers: 1 };
            }

            await ensureGlobalTables();
            const record = await getLicenseRecord(normalized);
            if (!record) {
                return { key: normalized, plan: planFromLicense(normalized), status: 'INVALID', expiryDate: null, maxUsers: 1 };
            }

            if (String(record.status || '').toUpperCase() !== 'ACTIVE') {
                return { key: normalized, plan: planFromLicense(normalized), status: 'EXPIRED', expiryDate: null, maxUsers: 1 };
            }

            return {
                key: normalized,
                plan: String(record.plan_id || planFromLicense(normalized)).toUpperCase() === 'ENT' ? 'ENTERPRISE' : String(record.plan_id || planFromLicense(normalized)).toUpperCase(),
                status: 'ACTIVE',
                maxUsers: record.max_users || (record.plan_id === 'ENT' ? 10 : record.plan_id === 'PRO' ? 3 : 1),
                expiryDate: '2099-12-31T23:59:59Z'
            };
        };


        const assessRegistrationEligibility = async ({ email, phone, license }) => {
            const normalizedEmail = normalizeEmail(email);
            const normalizedPhone = normalizePhone(phone || '');
            const normalizedLicense = String(license || '').trim().toUpperCase();

            if (!isEmail(normalizedEmail)) throw new Error('Invalid email format.');
            if (!isValidLicense(normalizedLicense)) throw new Error('Invalid license key format. Use SB-FREE/PRO/ENT-XXXXXX.');
            if (normalizedPhone) {
                let localNumber = normalizedPhone.replace(/\D/g, '');
                if (localNumber.startsWith('91') && localNumber.length > 10) {
                    localNumber = localNumber.substring(2);
                }
                if (normalizedPhone.startsWith('+91') || normalizedPhone.startsWith('91') || localNumber.length === 10 || normalizedPhone.length <= 10) {
                    if (localNumber.length !== 10) {
                        throw new Error('Provide 10 digits only.');
                    }
                } else {
                    if (!isValidPhone(normalizedPhone)) {
                        throw new Error('Format must be 7-15 digits (optional + prefix).');
                    }
                }
            }

            await ensureGlobalTables();

            const byEmail = await query('SELECT email FROM master_users_registry WHERE LOWER(email) = LOWER(?) LIMIT 1', [normalizedEmail]);
            if (byEmail.length) throw new Error('Already registered user: this email is already in use.');

            if (normalizedPhone) {
                const byPhone = await query('SELECT email FROM master_users_registry WHERE phone = ? LIMIT 1', [normalizedPhone]);
                if (byPhone.length) throw new Error('Already registered user: this phone number is already in use.');
            }

            const licenseRecord = await getLicenseRecord(normalizedLicense);
            if (!licenseRecord) throw new Error('Invalid license key.');
            if (String(licenseRecord.status || '').toUpperCase() !== 'ACTIVE') throw new Error('Invalid license key.');

            const byLicenseCount = await query('SELECT COUNT(*) as c FROM master_users_registry WHERE LOWER(license_key) = LOWER(?)', [normalizedLicense]);
            const maxUsers = licenseRecord.max_users || (licenseRecord.plan_id === 'ENT' ? 10 : licenseRecord.plan_id === 'PRO' ? 3 : 1);
            if (byLicenseCount[0].c >= maxUsers) {
                throw new Error('Already registered user: this license key is already at maximum capacity.');
            }

            if (maxUsers === 1 && licenseRecord.assigned_email && String(licenseRecord.assigned_email).toLowerCase() !== normalizedEmail) {
                throw new Error('This license does not belong to you.');
            }

            return {
                ok: true,
                normalizedEmail,
                normalizedPhone,
                normalizedLicense
            };
        };

        const ensureTenantTables = async (pfx) => {
            if (!pfx) return;
            const tables = {
                [`${pfx}invoices`]: `(id VARCHAR(50) PRIMARY KEY, customerId VARCHAR(50), date DATETIME, dueDate DATE, items LONGTEXT, subtotal DECIMAL(15,2), tax DECIMAL(15,2), total DECIMAL(15,2), status VARCHAR(50), notes TEXT, overallDiscount DECIMAL(15,2), packingCharges DECIMAL(15,2), freightCharges DECIMAL(15,2))`,
                [`${pfx}customers`]: `(id VARCHAR(50) PRIMARY KEY, name VARCHAR(255), email VARCHAR(255), address TEXT, phone VARCHAR(50), notes TEXT, type VARCHAR(50), gstin VARCHAR(50))`,
                [`${pfx}loginactivity`]: `(id INT AUTO_INCREMENT PRIMARY KEY, email VARCHAR(255), ip VARCHAR(100), timestamp DATETIME, action VARCHAR(50), details TEXT)`
            };

            for (const [name, schema] of Object.entries(tables)) {
                await query(`CREATE TABLE IF NOT EXISTS ${name} ${schema}`);
            }
        };

        const prefix = (license_key && !String(license_key).startsWith('SB-ADMIN'))
            ? String(license_key).replace(/[^a-zA-Z0-9]/g, '').toLowerCase() + '_'
            : '';

        let responseData = null;

        if (action.startsWith('admin_')) {
            if (action === 'admin_init_system') await ensureGlobalTables();

            if (action === 'admin_init_system') {
                responseData = 'Global Tables Verified';
            } else if (action === 'admin_get_users') {
                await ensureGlobalTables();
                responseData = await query('SELECT email, license_key, name, phone, created_at FROM master_users_registry ORDER BY created_at DESC');
            } else if (action === 'admin_get_plans') {
                await ensureGlobalTables();
                responseData = await query('SELECT * FROM saas_plans');
            } else if (action === 'admin_get_payments') {
                await ensureGlobalTables();
                responseData = await query('SELECT * FROM saas_payments ORDER BY timestamp DESC LIMIT 500');
            } else if (action === 'admin_get_metrics') {
                await ensureGlobalTables();
                const [tenantCountRow] = await query('SELECT COUNT(*) AS count FROM master_users_registry');
                const [activeTenantRow] = await query("SELECT COUNT(DISTINCT license_key) AS count FROM saas_login_activity WHERE timestamp >= DATE_SUB(NOW(), INTERVAL 24 HOUR)");
                const [paymentAggRow] = await query("SELECT COALESCE(SUM(amount), 0) AS revenue, COUNT(*) AS payments, SUM(CASE WHEN UPPER(status) = 'SUCCESS' THEN 1 ELSE 0 END) AS successCount, SUM(CASE WHEN UPPER(status) = 'PENDING' THEN 1 ELSE 0 END) AS pendingCount FROM saas_payments");
                const [mtdRow] = await query("SELECT COALESCE(SUM(amount), 0) AS mtdRevenue FROM saas_payments WHERE UPPER(status) = 'SUCCESS' AND timestamp >= DATE_FORMAT(CURRENT_DATE, '%Y-%m-01')");
                responseData = {
                    totalTenants: Number(tenantCountRow?.count || 0),
                    activeTenants24h: Number(activeTenantRow?.count || 0),
                    totalRevenue: Number(paymentAggRow?.revenue || 0),
                    totalPayments: Number(paymentAggRow?.payments || 0),
                    successPayments: Number(paymentAggRow?.successCount || 0),
                    pendingPayments: Number(paymentAggRow?.pendingCount || 0),
                    mtdRevenue: Number(mtdRow?.mtdRevenue || 0)
                };
            } else if (action === 'admin_get_licenses') {
                await ensureGlobalTables();
                responseData = await query('SELECT license_key, plan_id, status, assigned_email, max_users, assigned_at, created_at, updated_at FROM saas_license_keys ORDER BY created_at DESC LIMIT 1000');
            } else if (action === 'admin_save_license') {
                await ensureGlobalTables();
                const license = String(data.license_key || '').trim().toUpperCase();
                const plan = String(data.plan_id || '').trim().toUpperCase();
                const status = String(data.status || 'ACTIVE').trim().toUpperCase();
                const assignedEmail = data.assigned_email ? normalizeEmail(data.assigned_email) : null;
                const maxUsers = Number(data.max_users) || (plan === 'ENT' || plan === 'ENTERPRISE' ? 10 : plan === 'PRO' ? 3 : 1);

                if (!isValidLicense(license)) throw new Error('License format invalid. Use SB-(FREE|PRO|ENT)-XXXXXX.');
                if (!['FREE', 'PRO', 'ENT', 'ENTERPRISE'].includes(plan)) throw new Error('Plan ID must be FREE, PRO, ENT, or ENTERPRISE.');
                if (!['ACTIVE', 'INACTIVE', 'EXPIRED'].includes(status)) throw new Error('Status must be ACTIVE, INACTIVE, or EXPIRED.');
                if (assignedEmail && !isEmail(assignedEmail)) throw new Error('Assigned email format invalid.');

                const normalizedPlan = plan === 'ENTERPRISE' ? 'ENT' : plan;
                await query(
                    `REPLACE INTO saas_license_keys (license_key, plan_id, status, assigned_email, max_users, assigned_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, NOW())`,
                    [license, normalizedPlan, status, assignedEmail, maxUsers, assignedEmail ? new Date() : null]
                );
                responseData = 'License Saved';
            } else if (action === 'admin_delete_license') {
                await ensureGlobalTables();
                const license = String(data.license_key || '').trim().toUpperCase();
                if (!isValidLicense(license)) throw new Error('License format invalid.');

                const linkedUser = await query('SELECT email FROM master_users_registry WHERE LOWER(license_key) = LOWER(?) LIMIT 1', [license]);
                if (linkedUser.length) throw new Error(`Cannot delete: license is linked to user ${linkedUser[0].email}.`);
                await query('DELETE FROM saas_license_keys WHERE LOWER(license_key) = LOWER(?)', [license]);
                responseData = 'License Deleted';
            } else if (action === 'admin_get_error_logs') {
                await ensureGlobalTables();
                responseData = await query('SELECT id, source, level, message, context, created_at FROM saas_error_logs ORDER BY created_at DESC LIMIT 500');
            } else if (action === 'admin_get_contact_messages') {
                await ensureGlobalTables();
                responseData = await query('SELECT id, name, email, subject, message, status, created_at FROM saas_contact_messages ORDER BY created_at DESC LIMIT 500');
            } else if (action === 'admin_save_plan') {
                await ensureGlobalTables();
                await query('REPLACE INTO saas_plans (id, name, price, description, features, isPopular) VALUES (?, ?, ?, ?, ?, ?)', [data.id, data.name, data.price, data.description, data.features, data.isPopular ? 1 : 0]);
                responseData = 'Plan Saved';

                // ── V3 Multi-Tenant: List all provisioned businesses ─────────────
            } else if (action === 'admin_get_businesses') {
                const [bizRows] = await masterPool.execute(`
                    SELECT
                        b.business_id,
                        b.business_name,
                        b.owner_name,
                        b.email,
                        b.phone,
                        b.gst_number,
                        b.is_active,
                        b.created_at,
                        CONCAT('uvuytecv_biz_', b.business_id, '_db') AS tenant_db,
                        u.full_name  AS user_full_name,
                        u.email      AS user_email,
                        bu.role      AS owner_role
                    FROM businesses b
                    LEFT JOIN business_users bu ON bu.business_id = b.business_id AND bu.role = 'Owner'
                    LEFT JOIN app_users u       ON u.user_id = bu.user_id
                    ORDER BY b.created_at DESC
                `);
                responseData = bizRows;

                // ── V3 Multi-Tenant: Provision new client (user + DB) ───────────
            } else if (action === 'admin_provision_client') {
                const name = String(data.name || '').trim();
                const email = String(data.email || '').trim().toLowerCase();
                const phone = String(data.phone || '').trim() || null;
                const password = String(data.password || '').trim();
                const bizName = String(data.business_name || name).trim();

                if (!name || !email || !password || !bizName) {
                    throw new Error('Missing required fields: name, email, password, business_name.');
                }
                if (password.length < 8) {
                    throw new Error('Password must be at least 8 characters.');
                }

                // Check email uniqueness in app_users (V3 table)
                const [existingUser] = await masterPool.execute(
                    'SELECT user_id FROM app_users WHERE email = ? LIMIT 1',
                    [email]
                );
                if (existingUser.length > 0) {
                    throw new Error(`User already exists with email: ${email}`);
                }

                // Create the app_user in master DB
                const passwordHash = await bcrypt.hash(password, 10);
                const [userResult] = await masterPool.execute(
                    'INSERT INTO app_users (full_name, email, phone, password_hash, created_at) VALUES (?, ?, ?, ?, NOW())',
                    [name, email, phone, passwordHash]
                );
                const newUserId = userResult.insertId;

                // Provision isolated tenant DB + full schema + link records
                const { businessId, tenantDbName } = await provisionTenantDatabase({
                    userId: newUserId,
                    businessName: bizName,
                    ownerName: name,
                    email,
                    phone,
                });

                // Add to master_users_registry so they can login normally
                const fallbackLicense = `SB-PRO-${Date.now()}`;
                await db.execute(
                    'INSERT INTO master_users_registry (email, license_key, name, password_hash, phone, created_at) VALUES (?, ?, ?, ?, ?, NOW()) ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)',
                    [email, fallbackLicense, name, passwordHash, phone || null]
                );

                responseData = {
                    message: 'Client provisioned successfully.',
                    userId: newUserId,
                    businessId,
                    tenantDbName,
                };
            }
        } else if (action === 'verify_license_key') {
            const license = String(data.license || '').trim().toUpperCase();
            responseData = await verifyAndNormalizeLicense(license);
        } else if (action === 'check_registration_eligibility') {
            responseData = await assessRegistrationEligibility({
                email: data.email,
                phone: data.phone,
                license: data.license
            });
        } else if (action === 'register_user') {
            const name = String(data.name || '').trim();
            const password = String(data.password || '');
            if (!name || !password) throw new Error('Missing required fields: Name or Password.');
            if (password.length < 8) throw new Error('Password must be at least 8 characters.');

            const eligibility = await assessRegistrationEligibility({
                email: data.email,
                phone: data.phone,
                license: data.license
            });

            const email = eligibility.normalizedEmail;
            const phone = eligibility.normalizedPhone;
            const license = eligibility.normalizedLicense;
            const hash = await bcrypt.hash(password, 10);

            const conn = await db.getConnection();
            try {
                await conn.beginTransaction();
                const [lockRows] = await conn.execute(
                    'SELECT assigned_email, status, plan_id, max_users FROM saas_license_keys WHERE LOWER(license_key) = LOWER(?) LIMIT 1 FOR UPDATE',
                    [license]
                );
                if (!lockRows.length || String(lockRows[0].status || '').toUpperCase() !== 'ACTIVE') {
                    throw new Error('Invalid license key.');
                }

                const maxUsers = lockRows[0].max_users || (lockRows[0].plan_id === 'ENT' ? 10 : lockRows[0].plan_id === 'PRO' ? 3 : 1);
                if (maxUsers === 1 && lockRows[0].assigned_email && String(lockRows[0].assigned_email).toLowerCase() !== email) {
                    throw new Error('This license does not belong to you.');
                }

                await conn.execute('INSERT INTO master_users_registry (email, license_key, name, password_hash, phone, created_at) VALUES (?, ?, ?, ?, ?, NOW())', [email, license, name, hash, phone || null]);
                await conn.execute("INSERT INTO saas_user_profiles (email, license_key, name, role, phone, avatar_url) VALUES (?, ?, ?, 'Admin', ?, '')", [email, license, name, phone || null]);
                await conn.execute('INSERT INTO saas_login_activity (email, license_key, action, timestamp) VALUES (?, ?, ?, NOW())', [email, license, 'REGISTER']);
                await conn.execute('UPDATE saas_license_keys SET assigned_email = ?, assigned_at = NOW() WHERE LOWER(license_key) = LOWER(?)', [email, license]);

                await conn.commit();
            } catch (txErr) {
                await conn.rollback();
                throw txErr;
            } finally {
                conn.release();
            }

            // Step 1: Create user in app_users (if doesn't exist)
            const [existing] = await masterPool.execute('SELECT user_id FROM app_users WHERE email = ? LIMIT 1', [email]);
            let userId = existing.length ? existing[0].user_id : null;
            if (!userId) {
                const [ur] = await masterPool.execute(
                    'INSERT INTO app_users (full_name, email, phone, password_hash, created_at) VALUES (?, ?, ?, ?, NOW())',
                    [name, email, phone || null, hash]
                );
                userId = ur.insertId;
            }

            // Step 2: Provision tenant DB
            const { businessId, tenantDbName } = await provisionTenantDatabase({
                userId,
                businessName: name + " Business",
                ownerName: name,
                email,
                phone: phone || null
            });

            // Sign access token
            const payload = {
                user_id: userId,
                email,
                name,
                default_business_id: businessId
            };
            const accessToken = jwt.sign(payload, env.jwt.secret, { expiresIn: env.jwt.accessExpiresIn });

            responseData = { message: 'Registered', businessId, tenantDbName, access_token: accessToken };
        } else if (action === 'submit_contact_message') {
            const name = String(data.name || '').trim();
            const email = normalizeEmail(data.email);
            const message = String(data.message || '').trim();
            const subject = String(data.subject || 'General Inquiry').trim();

            if (!name || !email || !message) throw new Error('Name, email and message are required.');
            if (!isEmail(email)) throw new Error('Invalid email format.');

            await ensureGlobalTables();
            await query(
                'INSERT INTO saas_contact_messages (name, email, subject, message, status, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
                [name, email, subject || 'General Inquiry', message, 'NEW']
            );
            responseData = 'Contact request submitted';
        } else if (action === 'log_error') {
            await recordErrorLog({
                source: data.source || 'CLIENT',
                message: data.message || 'Unknown client error',
                context: data.context || null,
                level: data.level || 'ERROR'
            });
            responseData = 'Error Logged';
        } else if (action === 'login_user') {
            const email = normalizeEmail(data.email);
            const password = String(data.password || '');
            if (!isEmail(email) || !password) throw new Error('Valid email and password are required.');

            await ensureGlobalTables();
            const users = await query('SELECT name, email, license_key, password_hash FROM master_users_registry WHERE LOWER(email) = LOWER(?) LIMIT 1', [email]);
            if (!users.length) throw new Error('User not found.');

            const user = users[0];
            const match = await bcrypt.compare(password, user.password_hash);
            if (!match) throw new Error('Invalid password.');
            await query('INSERT INTO saas_login_activity (email, license_key, action, timestamp) VALUES (?, ?, ?, NOW())', [user.email, user.license_key, 'LOGIN']);

            // Fetch V3 business_id
            let businessId = null;
            try {
                // First check business_users mapping
                const [buRows] = await masterPool.execute(`
                   SELECT bu.business_id 
                   FROM business_users bu 
                   JOIN app_users u ON bu.user_id = u.user_id 
                   WHERE LOWER(u.email) = LOWER(?) AND bu.is_active = 1
                   ORDER BY bu.joined_at ASC 
                   LIMIT 1
               `, [user.email]);

                if (buRows.length > 0) {
                    businessId = buRows[0].business_id;
                } else {
                    // Fallback to businesses.user_id
                    const [bRows] = await masterPool.execute(`
                       SELECT b.business_id 
                       FROM businesses b 
                       JOIN app_users u ON b.user_id = u.user_id 
                       WHERE LOWER(u.email) = LOWER(?) 
                       ORDER BY b.created_at ASC 
                       LIMIT 1
                   `, [user.email]);
                    if (bRows.length > 0) businessId = bRows[0].business_id;
                }
            } catch (e) {
                console.error("Error fetching business_id for login:", e);
            }

            if (!businessId) {
                throw new Error("No active business found for this user. Please contact support.");
            }

            // Fetch V3 user_id and generate access token
            let userId = null;
            try {
                const [appUsers] = await masterPool.execute(
                    'SELECT user_id FROM app_users WHERE LOWER(email) = LOWER(?) LIMIT 1',
                    [user.email]
                );
                if (appUsers.length > 0) {
                    userId = appUsers[0].user_id;
                }
            } catch (err) {
                console.error("Error fetching user_id for token generation:", err);
            }

            if (!userId) {
                throw new Error("No user profile found. Please contact support.");
            }

            const payload = {
                user_id: userId,
                email: user.email,
                name: user.name,
                default_business_id: businessId
            };
            const accessToken = jwt.sign(payload, env.jwt.secret, { expiresIn: env.jwt.accessExpiresIn });

            responseData = {
                name: user.name,
                email: user.email,
                license_key: user.license_key,
                businessId,
                access_token: accessToken
            };
        } else {
            if (!['ping', 'verify_license_key', 'check_registration_eligibility', 'forgot_password', 'reset_password'].includes(action) && !license_key) throw new Error('license_key is required for this action.');

            if (action === 'init_db') {
                await ensureTenantTables(prefix);
                responseData = 'Ready';
            } else if (action === 'ping') {
                await query('SELECT 1');
                responseData = 'Pong';
            } else if (action === 'save_app_settings') {
                await ensureGlobalTables();
                await query(`REPLACE INTO saas_app_settings
          (license_key, companyName, companyGstin, logoUrl, taxRate, currency, countryCode, invoicePrefix, terms, invoiceHeader, invoiceFooter, enableDateTime)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [license_key, data.companyName, data.companyGstin, data.logoUrl, data.taxRate, data.currency, data.countryCode, data.invoicePrefix, data.terms, data.invoiceHeader, data.invoiceFooter, data.enableDateTime ? 1 : 0]
                );
                responseData = 'Saved';
            } else if (action === 'get_app_settings') {
                await ensureGlobalTables();
                responseData = await query('SELECT * FROM saas_app_settings WHERE license_key = ?', [license_key]);
            } else if (action === 'save_profile') {
                await ensureGlobalTables();
                await query('REPLACE INTO saas_user_profiles (email, license_key, name, role, phone, avatar_url) VALUES (?, ?, ?, ?, ?, ?)', [data.email, license_key, data.name, data.role, data.phone, data.avatar_url]);
                responseData = 'Saved';
            } else if (action === 'get_profile') {
                await ensureGlobalTables();
                responseData = await query('SELECT * FROM saas_user_profiles WHERE license_key = ? LIMIT 1', [license_key]);
            } else if (action.startsWith('save_')) {
                const table = action.replace('save_', '');
                if (!['invoices', 'customers'].includes(table)) throw new Error('Invalid save action.');

                if (table === 'customers') {
                    const phone = normalizePhone(data.phone);
                    const id = data.id;
                    if (phone) {
                        const existing = await query(`SELECT name FROM ${prefix}customers WHERE phone = ? AND id != ?`, [phone, id]);
                        if (existing.length > 0) throw new Error(`Customer Duplicate: Phone '${phone}' is already associated with '${existing[0].name}'.`);
                    }
                }

                // Sanitize invoice dates: convert ISO strings to MySQL DATETIME format
                if (table === 'invoices') {
                    const validCols = ['id', 'customerId', 'date', 'dueDate', 'items', 'subtotal', 'tax', 'total', 'status', 'notes', 'overallDiscount', 'packingCharges', 'freightCharges'];
                    Object.keys(data).forEach(k => { if (!validCols.includes(k)) delete data[k]; });
                    ['date', 'dueDate'].forEach(field => {
                        if (data[field]) {
                            const d = new Date(data[field]);
                            if (!isNaN(d.getTime())) {
                                data[field] = d.toISOString().slice(0, 19).replace('T', ' ');
                            }
                        }
                    });
                }

                const keys = Object.keys(data);
                const values = Object.values(data);
                const placeholders = values.map(() => '?').join(', ');
                await query(`REPLACE INTO ${prefix}${table} (${keys.join(', ')}) VALUES (${placeholders})`, values);
                responseData = 'Saved';
            } else if (action === 'delete_invoice') {
                await query(`UPDATE ${prefix}invoices SET status = 'Deleted' WHERE id = ?`, [data.id]);
                responseData = 'Deleted';
            } else if (action === 'get_customers') {
                responseData = await query(`SELECT * FROM ${prefix}customers`);
            } else if (action === 'get_invoices') {
                responseData = await query(`SELECT * FROM ${prefix}invoices WHERE status != 'Deleted'`);
            } else if (action === 'log_activity') {
                await ensureGlobalTables();
                await query(`INSERT INTO saas_login_activity (email, license_key, action, timestamp) VALUES (?, ?, ?, NOW())`, [data.email, license_key, data.action]);
                responseData = 'Logged';
            } else if (action === 'forgot_password') {
                const email = normalizeEmail(data.email);
                if (!email) throw new Error('Email is required.');

                const users = await query('SELECT email FROM master_users_registry WHERE LOWER(email) = LOWER(?) LIMIT 1', [email]);
                if (!users.length) throw new Error('User not found.');

                // Generate a 6-digit numeric token
                const token = String(Math.floor(100000 + Math.random() * 900000));
                // Set expiry for 1 hour from now
                await query(
                    'UPDATE master_users_registry SET reset_token = ?, reset_expiry = DATE_ADD(NOW(), INTERVAL 1 HOUR) WHERE LOWER(email) = LOWER(?)',
                    [token, email]
                );

                responseData = {
                    message: 'Reset instructions sent to your email.',
                    debug_token: token
                };
            } else if (action === 'reset_password') {
                const email = normalizeEmail(data.email);
                const token = String(data.token || '').trim();
                const newPassword = String(data.new_password || '').trim();

                if (!email || !token || !newPassword) {
                    throw new Error('Email, token, and new password are required.');
                }
                if (newPassword.length < 8) {
                    throw new Error('New password must be at least 8 characters.');
                }

                // Check reset token in master registry
                const users = await query(
                    'SELECT reset_token, reset_expiry FROM master_users_registry WHERE LOWER(email) = LOWER(?) LIMIT 1',
                    [email]
                );
                if (!users.length) throw new Error('User not found.');

                const user = users[0];
                if (!user.reset_token || user.reset_token !== token) {
                    throw new Error('Invalid reset token.');
                }

                // Check expiry
                const expiry = new Date(user.reset_expiry);
                if (expiry < new Date()) {
                    throw new Error('Reset token has expired.');
                }

                // Hash new password
                const newHash = await bcrypt.hash(newPassword, 10);

                // Update master registry
                await query(
                    'UPDATE master_users_registry SET password_hash = ?, reset_token = NULL, reset_expiry = NULL WHERE LOWER(email) = LOWER(?)',
                    [newHash, email]
                );

                // Update master profiles
                await query(
                    'UPDATE saas_user_profiles SET updated_at = NOW() WHERE LOWER(email) = LOWER(?)',
                    [email]
                );

                // Update app_users password_hash in master DB to allow correct login!
                await query(
                    'UPDATE app_users SET password_hash = ? WHERE LOWER(email) = LOWER(?)',
                    [newHash, email]
                );

                responseData = 'Password reset successfully.';
            } else if (action === 'change_password') {
                const email = normalizeEmail(data.email);
                const currentPassword = String(data.current_password || '');
                const newPassword = String(data.new_password || '');
                if (!email || !currentPassword || !newPassword) throw new Error('Missing required fields: email, current password, and new password.');
                if (newPassword.length < 8) throw new Error('New password must be at least 8 characters.');

                const users = await query('SELECT password_hash FROM master_users_registry WHERE LOWER(email) = LOWER(?) LIMIT 1', [email]);
                if (!users.length) throw new Error('User not found.');

                const match = await bcrypt.compare(currentPassword, users[0].password_hash);
                if (!match) throw new Error('Invalid current password.');

                const newHash = await bcrypt.hash(newPassword, 10);
                await query('UPDATE master_users_registry SET password_hash = ? WHERE LOWER(email) = LOWER(?)', [newHash, email]);
                responseData = 'Password changed successfully.';
            } else {
                throw new Error(`Unsupported action: ${action}`);
            }
        }

        return res.status(200).json({ data: responseData });
    } catch (error) {
        console.error('API Error', error);
        if (db) {
            try {
                const [tableRows] = await db.execute(`SELECT COUNT(*) AS c FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'saas_error_logs'`);
                if (Number(tableRows?.[0]?.c || 0) > 0) {
                    await db.execute(
                        'INSERT INTO saas_error_logs (source, level, message, context, created_at) VALUES (?, ?, ?, ?, NOW())',
                        ['API', 'ERROR', sanitizeForLog(error.message || 'Internal Server Error'), JSON.stringify({ action: req?.body?.action || 'unknown' }).slice(0, 20000)]
                    );
                }
            } catch (loggingError) {
                console.error('Failed to write error log', loggingError);
            }
        }
        const rawMsg = String(error.message || 'Internal Server Error');
        let status = 500;
        let msg = 'Request failed. Please try again.';
        if (rawMsg.includes('Invalid') || rawMsg.includes('Missing') || rawMsg.includes('Registration Failed') || rawMsg.includes('Cannot delete') || rawMsg.includes('Already registered user') || rawMsg.includes('does not belong to you') || rawMsg.includes('not found') || rawMsg.includes('expired')) {
            msg = rawMsg;
            if (rawMsg.includes('Invalid password') || rawMsg.includes('Invalid Credentials') || rawMsg.includes('User not found') || rawMsg.includes('not found')) {
                status = 401;
            } else if (rawMsg.includes('Already registered user')) {
                status = 409;
            } else {
                status = 400;
            }
        }
        if (rawMsg.includes('ER_NO_SUCH_TABLE')) msg = 'Database tables missing. Run admin initialization or migration first.';
        if (rawMsg.includes('ETIMEDOUT') || rawMsg.includes('ECONNREFUSED')) msg = 'Connection to database failed. Check network and DB allowlist.';
        return res.status(status).json({ error: msg });
    }
}
