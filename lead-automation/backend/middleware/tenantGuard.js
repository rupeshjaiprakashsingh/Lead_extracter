// ============================================================
//  middleware/tenantGuard.js — Multi-tenant isolation
// ============================================================
const Company = require('../models/Company');

/**
 * tenantGuard
 * - Loads the company from DB based on req.user.companyId
 * - Validates company is active + subscription not expired
 * - Attaches req.company to the request
 * - SuperAdmin bypasses this check (they can access any company)
 */
async function tenantGuard(req, res, next) {
  try {
    // SuperAdmin: optionally scope to a company via query param ?companyId=xxx
    if (req.user.role === 'superadmin') {
      const companyId = req.params.companyId || req.query.companyId || req.body.companyId;
      if (companyId) {
        const company = await Company.findById(companyId).lean();
        if (!company) return res.status(404).json({ success: false, error: 'Company not found' });
        req.company = company;
        req.user.companyId = company._id; // Scope queries
      }
      return next();
    }

    // Regular user: must have companyId in token
    if (!req.user.companyId) {
      return res.status(403).json({ success: false, error: 'No company associated with this account' });
    }

    const company = await Company.findById(req.user.companyId).lean();

    if (!company) {
      return res.status(404).json({ success: false, error: 'Company not found' });
    }

    if (!company.isActive) {
      return res.status(403).json({
        success: false,
        error: 'Your company account has been deactivated. Please contact support.',
        code: 'COMPANY_INACTIVE'
      });
    }

    // Check subscription expiry
    if (company.subscription.expiresAt && new Date() > new Date(company.subscription.expiresAt)) {
      return res.status(403).json({
        success: false,
        error: 'Your subscription has expired. Please contact support to renew.',
        code: 'SUBSCRIPTION_EXPIRED'
      });
    }

    req.company = company;
    next();
  } catch (err) {
    console.error('tenantGuard error:', err);
    res.status(500).json({ success: false, error: 'Server error in tenant validation' });
  }
}

module.exports = tenantGuard;
