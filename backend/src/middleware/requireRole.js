/**
 * Middleware to enforce role-based access control.
 * Must be used AFTER resolveBusiness middleware (which sets req.userRole).
 * 
 * @param  {...string} allowedRoles - List of allowed roles (e.g., 'Owner', 'Admin')
 */
export const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.userRole) {
      return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Role not resolved' }});
    }

    if (!allowedRoles.includes(req.userRole)) {
      return res.status(403).json({ success: false, error: { code: 'ROLE_FORBIDDEN', message: 'You do not have permission to perform this action' }});
    }

    next();
  };
};
