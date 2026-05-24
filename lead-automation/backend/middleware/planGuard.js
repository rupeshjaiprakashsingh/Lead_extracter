// ============================================================
//  middleware/planGuard.js — Plan limit enforcement
// ============================================================
const Company = require('../models/Company');

/**
 * checkLeadLimit — blocks lead creation if company has hit lead limit
 */
async function checkLeadLimit(req, res, next) {
  try {
    const company = req.company;
    if (!company) return next();

    // Agency plan = unlimited
    if (company.plan.type === 'agency') return next();

    if (company.usage.leadCount >= company.plan.leadLimit) {
      return res.status(403).json({
        success: false,
        error: `Lead limit reached (${company.plan.leadLimit} leads). Please upgrade your plan.`,
        code: 'LEAD_LIMIT_EXCEEDED',
        limit: company.plan.leadLimit,
        current: company.usage.leadCount
      });
    }
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * checkWALimit — blocks WA sending if monthly limit hit
 */
async function checkWALimit(req, res, next) {
  try {
    const company = req.company;
    if (!company) return next();
    if (company.plan.type === 'agency') return next();

    // Reset monthly counter if needed
    const now = new Date();
    const resetAt = new Date(company.usage.waCountResetAt || 0);
    if (now.getMonth() !== resetAt.getMonth() || now.getFullYear() !== resetAt.getFullYear()) {
      await Company.findByIdAndUpdate(company._id, {
        'usage.waCountMonth': 0,
        'usage.waCountResetAt': now
      });
      company.usage.waCountMonth = 0;
    }

    if (company.usage.waCountMonth >= company.plan.waLimit) {
      return res.status(403).json({
        success: false,
        error: `WhatsApp limit reached (${company.plan.waLimit}/month). Please upgrade your plan.`,
        code: 'WA_LIMIT_EXCEEDED',
        limit: company.plan.waLimit,
        current: company.usage.waCountMonth
      });
    }
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * checkUserLimit — blocks user creation if company has hit user limit
 */
async function checkUserLimit(req, res, next) {
  try {
    const company = req.company;
    if (!company) return next();
    if (company.plan.type === 'agency') return next();

    if (company.usage.userCount >= company.plan.userLimit) {
      return res.status(403).json({
        success: false,
        error: `User limit reached (${company.plan.userLimit} users). Please upgrade your plan.`,
        code: 'USER_LIMIT_EXCEEDED',
        limit: company.plan.userLimit,
        current: company.usage.userCount
      });
    }
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * checkExportEnabled — blocks export if plan doesn't support it
 */
function checkExportEnabled(req, res, next) {
  const company = req.company;
  if (!company) return next();

  if (!company.plan.exportEnabled) {
    return res.status(403).json({
      success: false,
      error: 'Export is not available on your current plan. Please upgrade to Starter or higher.',
      code: 'EXPORT_NOT_ALLOWED'
    });
  }
  next();
}

module.exports = { checkLeadLimit, checkWALimit, checkUserLimit, checkExportEnabled };
