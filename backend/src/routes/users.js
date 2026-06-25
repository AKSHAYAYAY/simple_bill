import { Router } from 'express';
import { body, param, validationResult } from 'express-validator';
import { pool } from '../db/pool.js';
import { asyncHandler } from '../middleware/async-handler.js';

export const businessUserRouter = Router();

// 1. GET /b/:businessId/users - List business users
businessUserRouter.get('/', asyncHandler(async (req, res) => {
  const [rows] = await pool.execute(`
    SELECT bu.business_user_id, bu.role, bu.is_active, bu.invited_at, bu.joined_at, 
           au.user_id, au.full_name, au.email, au.phone
    FROM business_users bu
    JOIN app_users au ON bu.user_id = au.user_id
    WHERE bu.business_id = ?
    ORDER BY bu.joined_at DESC, bu.invited_at DESC
  `, [req.businessId]);

  res.json({ success: true, data: rows });
}));

// 2. POST /b/:businessId/users/invite - Invite user to business
businessUserRouter.post('/invite', [
  body('role').isIn(['Owner', 'Admin', 'Manager', 'Accountant', 'Staff']),
  body('phone').optional().trim(),
  body('email').optional().trim().isEmail()
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details: errors.array() } });
  }

  // Permission Check: Owner or Admin
  if (req.userRole !== 'Owner' && req.userRole !== 'Admin') {
    return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Only Owners or Admins can invite staff.' } });
  }

  // Enforce seat/user limit constraint based on SaaS license configuration
  let maxUsers = 999;
  try {
    const [bizLicenseRows] = await pool.execute(`
      SELECT slk.max_users
      FROM saas_license_keys slk
      JOIN master_users_registry mur ON LOWER(slk.license_key) = LOWER(mur.license_key)
      JOIN businesses b ON LOWER(mur.email) = LOWER(b.email)
      WHERE b.business_id = ?
    `, [req.businessId]);
    
    if (bizLicenseRows.length > 0 && bizLicenseRows[0].max_users !== null) {
      maxUsers = bizLicenseRows[0].max_users;
    }
  } catch (dbErr) {
    console.warn("Failed to retrieve license seat limit, defaulting to 999:", dbErr.message);
  }

  const [countRows] = await pool.execute(
    'SELECT COUNT(*) AS count FROM business_users WHERE business_id = ?',
    [req.businessId]
  );
  const currentCount = countRows[0].count;

  if (currentCount >= maxUsers) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'LIMIT_EXCEEDED',
        message: `User login limit reached. Your current license allows a maximum of ${maxUsers} user(s). Please upgrade your subscription to add more seats.`
      }
    });
  }

  const { phone, email, role } = req.body;
  if (!phone && !email) {
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Either email or phone is required to invite a user.' } });
  }

  let userId = null;
  let isNewUser = false;

  // Search user by email or phone
  if (email) {
    const [rows] = await pool.execute('SELECT user_id FROM app_users WHERE email = ?', [email]);
    if (rows.length > 0) userId = rows[0].user_id;
  }
  if (!userId && phone) {
    const [rows] = await pool.execute('SELECT user_id FROM app_users WHERE phone = ?', [phone]);
    if (rows.length > 0) userId = rows[0].user_id;
  }

  // If user does not exist, provision a placeholder app_user
  if (!userId) {
    isNewUser = true;
    const namePlaceholder = email ? email.split('@')[0] : phone;
    const [result] = await pool.execute(
      'INSERT INTO app_users (full_name, email, phone, password_hash) VALUES (?, ?, ?, NULL)',
      [namePlaceholder, email || null, phone || null]
    );
    userId = result.insertId;
  }

  // Check if they already belong to the business
  const [buRows] = await pool.execute(
    'SELECT business_user_id FROM business_users WHERE business_id = ? AND user_id = ?',
    [req.businessId, userId]
  );

  if (buRows.length > 0) {
    return res.status(409).json({ success: false, error: { code: 'CONFLICT', message: 'User is already a member of this business.' } });
  }

  // Create the business user relation
  const joinedDate = isNewUser ? null : new Date(); // If they exist already, auto-join them, else pending invite
  const [buResult] = await pool.execute(
    'INSERT INTO business_users (business_id, user_id, role, is_active, joined_at) VALUES (?, ?, ?, TRUE, ?)',
    [req.businessId, userId, role, joinedDate]
  );

  res.status(201).json({
    success: true,
    data: {
      business_user_id: buResult.insertId,
      status: isNewUser ? 'invited' : 'active'
    },
    message: isNewUser ? 'Invitation sent successfully' : 'Staff member added successfully'
  });
}));

// 3. PUT /b/:businessId/users/:userId/role - Update user role
businessUserRouter.put('/:userId/role', [
  param('userId').isInt(),
  body('role').isIn(['Owner', 'Admin', 'Manager', 'Accountant', 'Staff'])
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details: errors.array() } });
  }

  if (req.userRole !== 'Owner' && req.userRole !== 'Admin') {
    return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Only Owners or Admins can update roles.' } });
  }

  const targetUserId = parseInt(req.params.userId, 10);
  const { role } = req.body;

  // Cannot modify own role unless owner
  if (targetUserId === req.user.user_id && req.userRole !== 'Owner') {
    return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'You cannot change your own permission level.' } });
  }

  await pool.execute(
    'UPDATE business_users SET role = ? WHERE user_id = ? AND business_id = ?',
    [role, targetUserId, req.businessId]
  );

  res.json({ success: true, message: 'Role updated successfully' });
}));

// 4. PUT /b/:businessId/users/:userId/toggle-active - Enable/Disable user access
businessUserRouter.put('/:userId/toggle-active', [
  param('userId').isInt()
], asyncHandler(async (req, res) => {
  if (req.userRole !== 'Owner' && req.userRole !== 'Admin') {
    return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Only Owners or Admins can toggle active status.' } });
  }

  const targetUserId = parseInt(req.params.userId, 10);

  if (targetUserId === req.user.user_id) {
    return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'You cannot deactivate your own account.' } });
  }

  // Get current active state
  const [rows] = await pool.execute(
    'SELECT is_active FROM business_users WHERE user_id = ? AND business_id = ?',
    [targetUserId, req.businessId]
  );

  if (rows.length === 0) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User relation not found.' } });
  }

  const newActiveState = rows[0].is_active ? 0 : 1;
  await pool.execute(
    'UPDATE business_users SET is_active = ? WHERE user_id = ? AND business_id = ?',
    [newActiveState, targetUserId, req.businessId]
  );

  res.json({ success: true, data: { is_active: newActiveState === 1 }, message: 'Status updated successfully' });
}));

// 5. DELETE /b/:businessId/users/:userId - Remove member
businessUserRouter.delete('/:userId', [
  param('userId').isInt()
], asyncHandler(async (req, res) => {
  if (req.userRole !== 'Owner') {
    return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Only Owners can remove users from the business.' } });
  }

  const targetUserId = parseInt(req.params.userId, 10);

  if (targetUserId === req.user.user_id) {
    return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'You cannot remove yourself. Transfer ownership first.' } });
  }

  await pool.execute(
    'DELETE FROM business_users WHERE user_id = ? AND business_id = ?',
    [targetUserId, req.businessId]
  );

  res.status(204).send();
}));
