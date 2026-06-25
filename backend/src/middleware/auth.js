import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { masterPool } from '../db/ConnectionManager.js';

export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const userEmail = req.headers['x-user-email'];

  if (token) {
    try {
      req.user = jwt.verify(token, env.jwt.secret);
      return next();
    } catch {
      // Ignore invalid token, fallback below
    }
  }

  if (env.nodeEnv !== 'production') {
    if (userEmail) {
      try {
        const [rows] = await masterPool.execute(
          'SELECT user_id, full_name as name, email FROM app_users WHERE email = ? LIMIT 1',
          [userEmail]
        );
        if (rows.length > 0) {
          req.user = rows[0];
          return next();
        }
      } catch(e) {
        console.error('requireAuth email lookup failed:', e);
      }
    }

    // Development fallback for seamless frontend integration
    req.user = { user_id: 1, email: 'admin@simplebill.com', name: 'Admin User', default_business_id: 1 };
    return next();
  }

  // Production requires a valid JWT access token
  return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication token required' } });
}
