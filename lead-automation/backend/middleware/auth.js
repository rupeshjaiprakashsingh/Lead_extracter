// ============================================================
//  middleware/auth.js — JWT Authentication Middleware
// ============================================================
const { verifyToken } = require('../config/jwt');
const User = require('../models/User');

/**
 * verifyToken middleware
 * Reads Bearer token, verifies it, attaches req.user
 */
async function authenticateToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'No token provided' });
    }

    const token = authHeader.slice(7);
    const decoded = verifyToken(token);

    // Attach lightweight user info from token payload
    req.user = {
      _id:       decoded._id,
      companyId: decoded.companyId || null,
      role:      decoded.role,
      username:  decoded.username
    };

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ success: false, error: 'Invalid token' });
  }
}

/**
 * requireRole(...roles) — Role-based access guard factory
 * Usage: requireRole('superadmin') or requireRole('company_admin', 'superadmin')
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: `Access denied. Required role: ${roles.join(' or ')}`
      });
    }
    next();
  };
}

/** Shorthand guards */
const requireSuperAdmin  = requireRole('superadmin');
const requireCompanyAdmin = requireRole('company_admin', 'superadmin');
const requireEmployee    = requireRole('employee', 'company_admin', 'superadmin');

/**
 * optionalAuth — attach user info if token present, but don't fail
 */
async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const decoded = verifyToken(token);
      req.user = {
        _id:       decoded._id,
        companyId: decoded.companyId || null,
        role:      decoded.role,
        username:  decoded.username
      };
    }
  } catch (e) {
    // Ignore auth errors in optional mode
  }
  next();
}

module.exports = {
  authenticateToken,
  requireRole,
  requireSuperAdmin,
  requireCompanyAdmin,
  requireEmployee,
  optionalAuth
};
