// ============================================================
//  controllers/userController.js — Company user management
// ============================================================
const User    = require('../models/User');
const Company = require('../models/Company');
const bcrypt  = require('bcryptjs');

// ─────────────────────────────────────────────────────────────
//  GET /api/company/users
// ─────────────────────────────────────────────────────────────
exports.listUsers = async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    const users = await User.find({ companyId })
      .select('-password -refreshToken -resetPasswordToken -resetPasswordExpires')
      .sort({ createdAt: -1 })
      .lean();
    res.json({ success: true, data: users });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────────────────────────
//  GET /api/company/users/:id
// ─────────────────────────────────────────────────────────────
exports.getUser = async (req, res, next) => {
  try {
    const user = await User.findOne({ _id: req.params.id, companyId: req.user.companyId })
      .select('-password -refreshToken -resetPasswordToken')
      .lean();
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────────────────────────
//  POST /api/company/users  (CompanyAdmin creates employee)
// ─────────────────────────────────────────────────────────────
exports.createUser = async (req, res, next) => {
  try {
    const { username, email, password, firstName, lastName, phone, role } = req.body;
    const companyId = req.user.companyId;

    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Username and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
    }

    // Only company_admin can create users; employees can only be created with 'employee' role
    const allowedRole = req.user.role === 'superadmin' ? (role || 'employee') : 'employee';

    const existing = await User.findOne({ username: username.toLowerCase().trim() });
    if (existing) return res.status(409).json({ success: false, error: 'Username already taken' });

    const newUser = await User.create({
      companyId,
      role:      allowedRole,
      username:  username.toLowerCase().trim(),
      email,
      password,
      firstName,
      lastName,
      phone
    });

    // Update company user count
    await Company.findByIdAndUpdate(companyId, { $inc: { 'usage.userCount': 1 } });

    res.status(201).json({
      success: true,
      message: `User "${username}" created`,
      data: {
        _id:       newUser._id,
        username:  newUser.username,
        email:     newUser.email,
        role:      newUser.role,
        firstName: newUser.firstName,
        lastName:  newUser.lastName,
        isActive:  newUser.isActive
      }
    });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────────────────────────
//  PUT /api/company/users/:id
// ─────────────────────────────────────────────────────────────
exports.updateUser = async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    const { firstName, lastName, email, phone, isActive } = req.body;

    const user = await User.findOneAndUpdate(
      { _id: req.params.id, companyId },
      { firstName, lastName, email, phone, isActive },
      { new: true }
    ).select('-password -refreshToken -resetPasswordToken');

    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────────────────────────
//  DELETE /api/company/users/:id
// ─────────────────────────────────────────────────────────────
exports.deleteUser = async (req, res, next) => {
  try {
    const companyId = req.user.companyId;

    // Can't delete yourself
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({ success: false, error: 'Cannot delete your own account' });
    }

    const user = await User.findOneAndDelete({ _id: req.params.id, companyId });
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    await Company.findByIdAndUpdate(companyId, { $inc: { 'usage.userCount': -1 } });

    res.json({ success: true, message: 'User deleted' });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────────────────────────
//  POST /api/company/users/:id/reset-password
// ─────────────────────────────────────────────────────────────
exports.resetPassword = async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ success: false, error: 'New password must be at least 6 characters' });
    }

    const user = await User.findOne({ _id: req.params.id, companyId });
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    user.password = newPassword;
    user.refreshToken = undefined;
    await user.save();

    res.json({ success: true, message: 'Password reset successfully' });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────────────────────────
//  GET /api/company/profile
// ─────────────────────────────────────────────────────────────
exports.getCompanyProfile = async (req, res, next) => {
  try {
    const company = await Company.findById(req.user.companyId).lean();
    if (!company) return res.status(404).json({ success: false, error: 'Company not found' });
    // Mask SMTP password
    if (company.smtp?.pass) company.smtp.pass = '••••••••';
    res.json({ success: true, data: company });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────────────────────────
//  PUT /api/company/profile
// ─────────────────────────────────────────────────────────────
exports.updateCompanyProfile = async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    const allowed = ['name','email','phone','businessCategory','address','website','branding','whatsappNumber'];
    const update  = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k]; });

    // Handle SMTP update
    if (req.body.smtp) {
      const smtp = req.body.smtp;
      if (smtp.pass === '••••••••' || smtp.pass?.includes('•')) delete smtp.pass;
      update.smtp = smtp;
    }

    const company = await Company.findByIdAndUpdate(companyId, update, { new: true });
    res.json({ success: true, data: company });
  } catch (err) { next(err); }
};
