// ============================================================
//  controllers/companyController.js — SuperAdmin company CRUD
// ============================================================
const Company     = require('../models/Company');
const User        = require('../models/User');
const Lead        = require('../models/Lead');
const ActivityLog = require('../models/ActivityLog');

// ─────────────────────────────────────────────────────────────
//  GET /api/superadmin/dashboard
// ─────────────────────────────────────────────────────────────
exports.getSuperAdminDashboard = async (req, res, next) => {
  try {
    const [
      totalCompanies, activeCompanies, totalUsers, totalLeads,
      activeTrials, expiringIn7Days
    ] = await Promise.all([
      Company.countDocuments({}),
      Company.countDocuments({ isActive: true }),
      User.countDocuments({ role: { $ne: 'superadmin' } }),
      Lead.countDocuments({}),
      Company.countDocuments({ 'plan.type': 'trial', 'subscription.status': { $in: ['trial','active'] } }),
      Company.countDocuments({
        'subscription.expiresAt': {
          $gt: new Date(),
          $lt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        }
      })
    ]);

    const recentCompanies = await Company.find({})
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    const recentActivity = await ActivityLog.find({})
      .sort({ createdAt: -1 })
      .limit(20)
      .populate('userId', 'username')
      .populate('companyId', 'name')
      .lean();

    res.json({
      success: true,
      data: {
        stats: { totalCompanies, activeCompanies, totalUsers, totalLeads, activeTrials, expiringIn7Days },
        recentCompanies,
        recentActivity
      }
    });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────────────────────────
//  GET /api/superadmin/companies
// ─────────────────────────────────────────────────────────────
exports.listCompanies = async (req, res, next) => {
  try {
    const page     = parseInt(req.query.page)  || 1;
    const limit    = parseInt(req.query.limit) || 20;
    const search   = req.query.search || '';
    const planType = req.query.plan   || '';
    const status   = req.query.status || '';

    const filter = {};
    if (search) {
      const re = new RegExp(search, 'i');
      filter.$or = [{ name: re }, { email: re }, { slug: re }];
    }
    if (planType) filter['plan.type'] = planType;
    if (status === 'active')   filter.isActive = true;
    if (status === 'inactive') filter.isActive = false;

    const [companies, total] = await Promise.all([
      Company.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Company.countDocuments(filter)
    ]);

    // Enrich with user count
    const enriched = await Promise.all(companies.map(async (c) => ({
      ...c,
      userCount: await User.countDocuments({ companyId: c._id })
    })));

    res.json({
      success: true,
      data: { companies: enriched, total, page, pages: Math.ceil(total / limit) }
    });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────────────────────────
//  GET /api/superadmin/companies/:id
// ─────────────────────────────────────────────────────────────
exports.getCompany = async (req, res, next) => {
  try {
    const company = await Company.findById(req.params.id).lean();
    if (!company) return res.status(404).json({ success: false, error: 'Company not found' });

    const [users, leadCount, waCount] = await Promise.all([
      User.find({ companyId: company._id }).select('-password -refreshToken -resetPasswordToken').lean(),
      Lead.countDocuments({ companyId: company._id }),
      Lead.countDocuments({ companyId: company._id, wa_sent: true })
    ]);

    res.json({ success: true, data: { company, users, stats: { leadCount, waCount } } });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────────────────────────
//  POST /api/superadmin/companies
// ─────────────────────────────────────────────────────────────
exports.createCompany = async (req, res, next) => {
  try {
    const {
      name, email, phone, plan, trialDays,
      adminUsername, adminPassword, adminEmail,
      leadLimit, userLimit, waLimit
    } = req.body;

    if (!name || !adminUsername || !adminPassword) {
      return res.status(400).json({ success: false, error: 'Company name, admin username, and password are required' });
    }

    // Check if username already taken
    const existingUser = await User.findOne({ username: adminUsername.toLowerCase().trim() });
    if (existingUser) {
      return res.status(409).json({ success: false, error: 'Username already taken' });
    }

    // Plan limits
    const planLimits = {
      trial:    { leadLimit: 500,   userLimit: 2,  waLimit: 200,  exportEnabled: false },
      starter:  { leadLimit: 2000,  userLimit: 5,  waLimit: 1000, exportEnabled: true  },
      business: { leadLimit: 10000, userLimit: 20, waLimit: 5000, exportEnabled: true  },
      agency:   { leadLimit: 999999,userLimit: 999,waLimit: 99999,exportEnabled: true  }
    };

    const planType = plan || 'trial';
    const limits   = planLimits[planType] || planLimits.trial;

    // Create company
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + (parseInt(trialDays) || 14));

    const company = await Company.create({
      name,
      email,
      phone,
      plan: {
        type:          planType,
        leadLimit:     leadLimit  || limits.leadLimit,
        userLimit:     userLimit  || limits.userLimit,
        waLimit:       waLimit    || limits.waLimit,
        exportEnabled: limits.exportEnabled
      },
      subscription: {
        status:      planType === 'trial' ? 'trial' : 'active',
        trialEndsAt: planType === 'trial' ? trialEnd : undefined,
        expiresAt:   planType === 'trial' ? trialEnd : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      },
      createdBy: req.user._id
    });

    // Create company admin user
    const adminUser = await User.create({
      companyId: company._id,
      role:      'company_admin',
      username:  adminUsername.toLowerCase().trim(),
      email:     adminEmail,
      password:  adminPassword,
      firstName: name.split(' ')[0]
    });

    // Update company createdBy
    company.createdBy = adminUser._id;
    await company.save();

    // Log
    await ActivityLog.create({
      userId:    req.user._id,
      action:    'company_created',
      resource:  'company',
      resourceId:company._id,
      details:   { companyName: name, adminUsername }
    }).catch(() => {});

    res.status(201).json({
      success: true,
      message: `Company "${name}" created successfully`,
      data: {
        company,
        adminUser: {
          username: adminUser.username,
          email:    adminUser.email,
          role:     adminUser.role
        }
      }
    });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────────────────────────
//  PUT /api/superadmin/companies/:id
// ─────────────────────────────────────────────────────────────
exports.updateCompany = async (req, res, next) => {
  try {
    const allowed = ['name','email','phone','businessCategory','address','website','branding'];
    const update  = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k]; });

    const company = await Company.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!company) return res.status(404).json({ success: false, error: 'Company not found' });

    res.json({ success: true, data: company });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────────────────────────
//  POST /api/superadmin/companies/:id/activate
// ─────────────────────────────────────────────────────────────
exports.activateCompany = async (req, res, next) => {
  try {
    const company = await Company.findByIdAndUpdate(req.params.id, { isActive: true }, { new: true });
    if (!company) return res.status(404).json({ success: false, error: 'Company not found' });
    res.json({ success: true, message: `Company "${company.name}" activated` });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────────────────────────
//  POST /api/superadmin/companies/:id/deactivate
// ─────────────────────────────────────────────────────────────
exports.deactivateCompany = async (req, res, next) => {
  try {
    const company = await Company.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!company) return res.status(404).json({ success: false, error: 'Company not found' });
    res.json({ success: true, message: `Company "${company.name}" deactivated` });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────────────────────────
//  POST /api/superadmin/companies/:id/assign-plan
// ─────────────────────────────────────────────────────────────
exports.assignPlan = async (req, res, next) => {
  try {
    const { planType, leadLimit, userLimit, waLimit, exportEnabled, expiresAt } = req.body;

    const planLimits = {
      trial:    { leadLimit: 500,   userLimit: 2,  waLimit: 200,  exportEnabled: false },
      starter:  { leadLimit: 2000,  userLimit: 5,  waLimit: 1000, exportEnabled: true  },
      business: { leadLimit: 10000, userLimit: 20, waLimit: 5000, exportEnabled: true  },
      agency:   { leadLimit: 999999,userLimit: 999,waLimit: 99999,exportEnabled: true  }
    };

    const defaults = planLimits[planType] || planLimits.trial;

    const update = {
      'plan.type':          planType,
      'plan.leadLimit':     leadLimit      !== undefined ? leadLimit     : defaults.leadLimit,
      'plan.userLimit':     userLimit      !== undefined ? userLimit     : defaults.userLimit,
      'plan.waLimit':       waLimit        !== undefined ? waLimit       : defaults.waLimit,
      'plan.exportEnabled': exportEnabled  !== undefined ? exportEnabled : defaults.exportEnabled,
      'subscription.status': planType === 'trial' ? 'trial' : 'active'
    };

    if (expiresAt) update['subscription.expiresAt'] = new Date(expiresAt);

    const company = await Company.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!company) return res.status(404).json({ success: false, error: 'Company not found' });

    res.json({ success: true, message: `Plan updated to ${planType}`, data: company });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────────────────────────
//  GET /api/superadmin/companies/:id/stats
// ─────────────────────────────────────────────────────────────
exports.getCompanyStats = async (req, res, next) => {
  try {
    const companyId = req.params.id;
    const [totalLeads, waSent, emailSent, userCount, followups] = await Promise.all([
      Lead.countDocuments({ companyId }),
      Lead.countDocuments({ companyId, wa_sent: true }),
      Lead.countDocuments({ companyId, email_sent: true }),
      User.countDocuments({ companyId }),
      Lead.countDocuments({ companyId, followup_queued: true })
    ]);

    const catBreakdown = await Lead.aggregate([
      { $match: { companyId: require('mongoose').Types.ObjectId.createFromHexString(companyId) } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    res.json({ success: true, data: { totalLeads, waSent, emailSent, userCount, followups, catBreakdown } });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────────────────────────
//  DELETE /api/superadmin/companies/:id/data
// ─────────────────────────────────────────────────────────────
exports.resetCompanyData = async (req, res, next) => {
  try {
    const { companyId } = req.params;
    await Lead.deleteMany({ companyId });
    await Company.findByIdAndUpdate(companyId, { 'usage.leadCount': 0, 'usage.waCount': 0 });
    res.json({ success: true, message: 'All company leads deleted' });
  } catch (err) { next(err); }
};
