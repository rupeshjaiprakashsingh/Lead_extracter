// ============================================================
//  controllers/authController.js — Authentication logic
// ============================================================
const crypto    = require('crypto');
const User      = require('../models/User');
const Company   = require('../models/Company');
const ActivityLog = require('../models/ActivityLog');
const { signToken, signRefreshToken, verifyRefreshToken } = require('../config/jwt');

// ── Helper: issue token pair ─────────────────────────────────
function issueTokens(user) {
  const payload = {
    _id:       user._id,
    companyId: user.companyId || null,
    role:      user.role,
    username:  user.username
  };
  const accessToken  = signToken(payload);
  const refreshToken = signRefreshToken({ _id: user._id });
  return { accessToken, refreshToken };
}

// ── Helper: safe user object (no password/tokens) ─────────────
function safeUser(user, company = null) {
  return {
    _id:       user._id,
    username:  user.username,
    email:     user.email,
    firstName: user.firstName,
    lastName:  user.lastName,
    role:      user.role,
    companyId: user.companyId,
    isActive:  user.isActive,
    lastLogin: user.lastLogin,
    company:   company ? {
      _id:      company._id,
      name:     company.name,
      slug:     company.slug,
      plan:     company.plan,
      usage:    company.usage,
      branding: company.branding,
      subscription: company.subscription,
      isActive: company.isActive
    } : null
  };
}

// ─────────────────────────────────────────────────────────────
//  POST /api/auth/login
// ─────────────────────────────────────────────────────────────
exports.login = async (req, res, next) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Username and password are required' });
    }

    // Find user (case-insensitive username or email)
    const user = await User.findOne({
      $or: [
        { username: username.toLowerCase().trim() },
        { email: username.toLowerCase().trim() }
      ],
      isActive: true
    });

    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid username or password' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Invalid username or password' });
    }

    // Load company info
    let company = null;
    if (user.companyId) {
      company = await Company.findById(user.companyId).lean();
      if (company && !company.isActive) {
        return res.status(403).json({
          success: false,
          error: 'Your company account has been deactivated. Please contact support.',
          code: 'COMPANY_INACTIVE'
        });
      }
      if (company && company.subscription.expiresAt && new Date() > new Date(company.subscription.expiresAt)) {
        return res.status(403).json({
          success: false,
          error: 'Your subscription has expired. Please contact support to renew.',
          code: 'SUBSCRIPTION_EXPIRED'
        });
      }
    }

    // Issue tokens
    const { accessToken, refreshToken } = issueTokens(user);

    // Save refresh token
    user.refreshToken = refreshToken;
    user.lastLogin    = new Date();
    await user.save();

    // Log activity
    await ActivityLog.create({
      companyId: user.companyId,
      userId:    user._id,
      action:    'login',
      resource:  'auth',
      ip:        req.ip,
      userAgent: req.get('user-agent')
    }).catch(() => {});

    res.json({
      success: true,
      accessToken,
      refreshToken,
      user: safeUser(user, company)
    });

  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────
//  POST /api/auth/refresh
// ─────────────────────────────────────────────────────────────
exports.refreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(401).json({ success: false, error: 'Refresh token required' });
    }

    const decoded = verifyRefreshToken(refreshToken);
    const user    = await User.findById(decoded._id);

    if (!user || user.refreshToken !== refreshToken) {
      return res.status(401).json({ success: false, error: 'Invalid refresh token' });
    }

    const { accessToken, refreshToken: newRefreshToken } = issueTokens(user);
    user.refreshToken = newRefreshToken;
    await user.save();

    res.json({ success: true, accessToken, refreshToken: newRefreshToken });
  } catch (err) {
    if (err.name === 'TokenExpiredError' || err.name === 'JsonWebTokenError') {
      return res.status(401).json({ success: false, error: 'Refresh token invalid or expired' });
    }
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────
//  POST /api/auth/logout
// ─────────────────────────────────────────────────────────────
exports.logout = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      await User.findOneAndUpdate(
        { refreshToken },
        { $unset: { refreshToken: 1 } }
      );
    }
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────
//  GET /api/auth/me
// ─────────────────────────────────────────────────────────────
exports.getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).lean();
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    let company = null;
    if (user.companyId) {
      company = await Company.findById(user.companyId).lean();
    }

    res.json({ success: true, user: safeUser(user, company) });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────
//  POST /api/auth/forgot-password
// ─────────────────────────────────────────────────────────────
exports.forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, error: 'Email is required' });

    const user = await User.findOne({ email: email.toLowerCase().trim() });

    // Always return success (don't reveal if email exists)
    if (!user) {
      return res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken   = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await user.save();

    // Send email (if system email configured)
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;
    try {
      const nodemailer = require('nodemailer');
      if (process.env.SYSTEM_EMAIL_USER && process.env.SYSTEM_EMAIL_PASS) {
        const transport = nodemailer.createTransport({
          host:   process.env.SYSTEM_EMAIL_HOST   || 'smtp.gmail.com',
          port:   parseInt(process.env.SYSTEM_EMAIL_PORT) || 587,
          secure: process.env.SYSTEM_EMAIL_SECURE === 'true',
          auth: { user: process.env.SYSTEM_EMAIL_USER, pass: process.env.SYSTEM_EMAIL_PASS }
        });
        await transport.sendMail({
          from:    `"Lead CRM" <${process.env.SYSTEM_EMAIL_USER}>`,
          to:      user.email,
          subject: 'Password Reset Request',
          html: `
            <h2>Password Reset</h2>
            <p>Click the link below to reset your password (valid for 1 hour):</p>
            <a href="${resetUrl}">${resetUrl}</a>
            <p>If you did not request this, ignore this email.</p>
          `
        });
      }
    } catch (emailErr) {
      console.error('Password reset email error:', emailErr.message);
    }

    res.json({
      success: true,
      message: 'If that email exists, a reset link has been sent.',
      // In dev mode, show the URL directly
      ...(process.env.NODE_ENV === 'development' ? { resetUrl } : {})
    });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────
//  POST /api/auth/reset-password/:token
// ─────────────────────────────────────────────────────────────
exports.resetPassword = async (req, res, next) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (!password || password.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
    }

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      resetPasswordToken:   hashedToken,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ success: false, error: 'Invalid or expired reset token' });
    }

    user.password             = password;
    user.resetPasswordToken   = undefined;
    user.resetPasswordExpires = undefined;
    user.refreshToken         = undefined;
    await user.save();

    res.json({ success: true, message: 'Password reset successfully. Please log in.' });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────
//  PUT /api/auth/change-password
// ─────────────────────────────────────────────────────────────
exports.changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, error: 'Current and new password required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, error: 'New password must be at least 6 characters' });
    }

    const user = await User.findById(req.user._id);
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Current password is incorrect' });
    }

    user.password = newPassword;
    await user.save();

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (err) {
    next(err);
  }
};
