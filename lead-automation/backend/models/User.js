const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const userSchema = new mongoose.Schema({
  // ── Tenant ────────────────────────────────────────────────
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', index: true },
  // null companyId = superadmin (not scoped to any company)

  // ── Role ──────────────────────────────────────────────────
  role: {
    type: String,
    enum: ['superadmin', 'company_admin', 'employee'],
    default: 'employee'
  },

  // ── Credentials ───────────────────────────────────────────
  username: { type: String, required: true, unique: true, trim: true, lowercase: true },
  email:    { type: String, trim: true, lowercase: true },
  password: { type: String, required: true },

  // ── Profile ───────────────────────────────────────────────
  firstName: { type: String, trim: true },
  lastName:  { type: String, trim: true },
  phone:     { type: String, trim: true },
  fromName:  { type: String }, // Email "From Name" override
  logo:      { type: String }, // Avatar URL

  // ── Status ────────────────────────────────────────────────
  isActive:  { type: Boolean, default: true },
  lastLogin: { type: Date },

  // ── JWT Refresh Token ─────────────────────────────────────
  refreshToken: { type: String },

  // ── Password Reset ────────────────────────────────────────
  resetPasswordToken:   { type: String },
  resetPasswordExpires: { type: Date },

  // ── Legacy compat (plan, company string for existing data) ─
  company:      { type: String }, // deprecated — use companyId
  plan:         { type: String }, // deprecated — use company.plan
  licenseKey:   { type: String },
  licenseExpiry:{ type: Date }

}, { timestamps: true });

// ── Hash password before save ────────────────────────────────
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// ── Instance: compare password ───────────────────────────────
userSchema.methods.comparePassword = function(plain) {
  return bcrypt.compare(plain, this.password);
};

// ── Instance: get full name ───────────────────────────────────
userSchema.virtual('fullName').get(function() {
  if (this.firstName && this.lastName) return `${this.firstName} ${this.lastName}`;
  return this.firstName || this.username;
});

// ── Indexes ───────────────────────────────────────────────────
userSchema.index({ companyId: 1, role: 1 });
userSchema.index({ resetPasswordToken: 1 });
userSchema.index({ refreshToken: 1 });

module.exports = mongoose.model('User', userSchema);
