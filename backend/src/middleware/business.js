import { masterPool, getTenantPool } from '../db/ConnectionManager.js';

export const resolveBusiness = async (req, res, next) => {
  try {
    // 1. Get the businessId from headers (or fallback to default_business_id in JWT if applicable)
    const businessId = req.headers['x-business-id'] || req.user?.default_business_id;

    if (!businessId) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_BUSINESS', message: 'Missing X-Business-Id header' }});
    }

    // 2. Validate that the logged-in user belongs to this business and is active
    const [rows] = await masterPool.execute(
      'SELECT role FROM business_users WHERE user_id = ? AND business_id = ? AND is_active = 1',
      [req.user.user_id, businessId]
    );

    if (!rows || rows.length === 0) {
      return res.status(403).json({ success: false, error: { code: 'INVALID_BUSINESS', message: 'Access denied or business inactive' }});
    }

    // 3. Attach metadata to the request
    req.businessId = parseInt(businessId, 10);
    req.userRole = rows[0].role;
    
    // 4. Construct the tenant database name (Convention: uvuytecv_biz_{id}_db)
    req.tenantDbName = `uvuytecv_biz_${businessId}_db`;

    // 5. Fetch the dedicated connection pool for this tenant
    // Controllers will use req.tenantDb.execute(...) instead of global pool
    req.tenantDb = await getTenantPool(req.businessId);

    // Dynamic Metadata Sync (Bulletproofing Foreign Keys)
    try {
      const [tenBizRows] = await req.tenantDb.execute(
        'SELECT business_id FROM businesses WHERE business_id = ?',
        [req.businessId]
      );
      if (tenBizRows.length === 0) {
        const [masterBiz] = await masterPool.execute('SELECT * FROM businesses WHERE business_id = ?', [req.businessId]);
        if (masterBiz.length > 0) {
          const b = masterBiz[0];
          // Ensure Owner/User exists in tenant DB first
          const [masterUser] = await masterPool.execute('SELECT * FROM app_users WHERE user_id = ?', [b.user_id]);
          if (masterUser.length > 0) {
            const u = masterUser[0];
            await req.tenantDb.execute(
              'INSERT IGNORE INTO app_users (user_id, full_name, email, phone, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)',
              [u.user_id, u.full_name, u.email, u.phone, u.password_hash, u.created_at]
            );
          }
          // Insert business
          await req.tenantDb.execute(
            'INSERT IGNORE INTO businesses (business_id, user_id, business_name, owner_name, email, business_type, gst_type, invoice_prefix, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [b.business_id, b.user_id, b.business_name, b.owner_name, b.email, b.business_type || 'Retail', b.gst_type || 'GST', b.invoice_prefix || 'INV', b.is_active || 1, b.created_at]
          );
          // Insert business user link
          const [masterBizUser] = await masterPool.execute('SELECT * FROM business_users WHERE business_id = ? AND user_id = ?', [b.business_id, b.user_id]);
          if (masterBizUser.length > 0) {
            const bu = masterBizUser[0];
            await req.tenantDb.execute(
              'INSERT IGNORE INTO business_users (business_user_id, business_id, user_id, role, is_active, invited_at, joined_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
              [bu.business_user_id, bu.business_id, bu.user_id, bu.role, bu.is_active, bu.invited_at, bu.joined_at]
            );
          }
        }
      }
    } catch (syncErr) {
      console.warn('Tenant metadata sync warning:', syncErr.message);
    }

    next();
  } catch (error) {
    if (error?.code === 'ER_BAD_DB_ERROR') {
      return res.status(503).json({
        error: 'TENANT_DB_NOT_READY',
        message: 'Business database is being set up. Try again in a moment.'
      });
    }
    console.error('Error resolving business:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to route request' }});
  }
};
