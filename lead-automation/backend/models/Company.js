const mongoose = require('mongoose');

// ── Utility: auto-generate URL-safe slug ─────────────────────
function generateSlug(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 50);
}

const companySchema = new mongoose.Schema({
  // ── Identity ──────────────────────────────────────────────
  name:  { type: String, required: true, trim: true },
  slug:  { type: String, unique: true, lowercase: true, trim: true },
  email: { type: String, trim: true, lowercase: true },
  phone: { type: String, trim: true },
  logo:  { type: String }, // URL or base64

  // ── Plan & Subscription ───────────────────────────────────
  plan: {
    type:           { type: String, enum: ['trial','starter','business','agency'], default: 'trial' },
    leadLimit:      { type: Number, default: 500 },
    userLimit:      { type: Number, default: 2 },
    waLimit:        { type: Number, default: 200 },
    exportEnabled:  { type: Boolean, default: false }
  },

  subscription: {
    status:      { type: String, enum: ['active','expired','cancelled','trial'], default: 'trial' },
    expiresAt:   { type: Date },
    trialEndsAt: { type: Date },
    autoRenew:   { type: Boolean, default: false }
  },

  // ── Branding ─────────────────────────────────────────────
  branding: {
    primaryColor: { type: String, default: '#6366f1' },
    logoUrl:      { type: String }
  },

  // ── SMTP Settings (company-level) ────────────────────────
  smtp: {
    host:     { type: String, default: '' },
    port:     { type: Number, default: 587 },
    secure:   { type: Boolean, default: false },
    user:     { type: String, default: '' },
    pass:     { type: String, default: '' },
    fromName: { type: String, default: '' }
  },

  // ── Business Info ─────────────────────────────────────────
  whatsappNumber:   { type: String, default: '' },
  businessCategory: { type: String, default: '' },
  address:          { type: String, default: '' },
  website:          { type: String, default: '' },

  // ── Status ───────────────────────────────────────────────
  isActive:  { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  // ── Usage Tracking (denormalized for quick access) ────────
  usage: {
    leadCount: { type: Number, default: 0 },
    waCount:   { type: Number, default: 0 },
    userCount: { type: Number, default: 1 }, // counts admin
    waCountMonth: { type: Number, default: 0 },
    waCountResetAt: { type: Date, default: Date.now }
  },

  // ── WhatsApp Config (UltraMsg) ────────────────────────────
  ultramsg: {
    instanceId: { type: String, default: '' },
    token:      { type: String, default: '' }
  },

  // ── Google OAuth ──────────────────────────────────────────
  google: {
    clientId:     { type: String, default: '' },
    clientSecret: { type: String, default: '' },
    accessToken:  { type: String, default: '' },
    refreshToken: { type: String, default: '' },
    tokenExpiry:  { type: Date }
  }

}, { timestamps: true });

// ── Auto-generate slug before save ───────────────────────────
companySchema.pre('save', async function(next) {
  if (this.isNew && !this.slug) {
    let slug = generateSlug(this.name);
    // Ensure uniqueness
    let exists = await mongoose.model('Company').findOne({ slug });
    let i = 1;
    while (exists) {
      slug = generateSlug(this.name) + '-' + i++;
      exists = await mongoose.model('Company').findOne({ slug });
    }
    this.slug = slug;
  }

  // Set trial expiry if new trial company
  if (this.isNew && this.plan.type === 'trial' && !this.subscription.trialEndsAt) {
    const trialDays = 14;
    this.subscription.trialEndsAt = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);
    this.subscription.expiresAt   = this.subscription.trialEndsAt;
  }

  next();
});

// ── Static: check if subscription is valid ────────────────────
companySchema.methods.isSubscriptionValid = function() {
  if (!this.isActive) return false;
  if (!this.subscription.expiresAt) return true; // no expiry = agency
  return new Date() < new Date(this.subscription.expiresAt);
};

// ── Indexes ───────────────────────────────────────────────────
companySchema.index({ slug: 1 });
companySchema.index({ 'subscription.status': 1 });
companySchema.index({ 'subscription.expiresAt': 1 });
companySchema.index({ isActive: 1 });

module.exports = mongoose.model('Company', companySchema);
