// ============================================================
//  services/auth.js — Authentication middleware
// ============================================================
const User = require('../models/User');

// Middleware: require login
function requireAuth(req, res, next) {
    if (req.session && req.session.userId) return next();
    // API calls → 401 JSON
    const fullPath = req.originalUrl || req.path || '';
    if (fullPath.startsWith('/api/') || fullPath.startsWith('/auth/')) {
        if (req.method !== 'GET' || fullPath.split('?')[0] !== '/auth/status') {
            return res.status(401).json({ error: 'Not authenticated' });
        }
    }
    // Browser calls → redirect to login
    return res.redirect('/login');
}

// Middleware: require admin role
function requireAdmin(req, res, next) {
    if (req.session && req.session.userRole === 'admin') return next();
    return res.status(403).json({ error: 'Admin access required' });
}

// Middleware: inject user info into every request
async function loadUser(req, res, next) {
    if (req.session && req.session.userId) {
        try {
            // Cache user in request so we don't hit DB on every request
            req.user = {
                _id:     req.session.userId,
                company: req.session.company,
                username:req.session.username,
                role:    req.session.userRole,
                plan:    req.session.plan,
            };
        } catch(e) {}
    }
    next();
}

module.exports = { requireAuth, requireAdmin, loadUser };
