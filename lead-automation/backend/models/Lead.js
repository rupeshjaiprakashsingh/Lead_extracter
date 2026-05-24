const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
  type:    { type: String }, // wa_sent, email_sent, followup, status_change, note
  message: { type: String },
  date:    { type: Date, default: Date.now }
}, { _id: false });

const leadSchema = new mongoose.Schema({
  // ── Multi-Tenant Isolation ────────────────────────────────
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true }, // created by

  // ── Lead Info ─────────────────────────────────────────────
  name:      { type: String, required: true, trim: true },
  phone:     { type: String, trim: true },    // E.164: 919876543210
  raw_phone: { type: String, trim: true },    // Display: 9876543210
  email:     { type: String, trim: true, lowercase: true },
  website:   { type: String, trim: true },
  rating:    { type: Number },
  reviews:   { type: Number },
  category:  { type: String, default: 'General Business' },
  keyword:   { type: String },
  city:      { type: String },
  address:   { type: String },
  place_id:  { type: String },
  source:    {
    type: String,
    default: 'google_maps',
    enum: ['google_maps', 'manual', 'import', 'excel_import']
  },
  status: {
    type: String,
    default: 'new',
    enum: ['new', 'contacted', 'followup', 'interested', 'converted', 'not_interested', 'lost']
  },

  // ── Google Contacts sync ──────────────────────────────────
  contact_saved:    { type: Boolean, default: false },
  contact_saved_at: { type: Date },

  // ── WhatsApp tracking ─────────────────────────────────────
  wa_sent:      { type: Boolean, default: false },
  wa_sent_at:   { type: Date },
  wa_count:     { type: Number, default: 0 },
  wa_last_date: { type: String }, // YYYY-MM-DD

  // ── Email tracking ────────────────────────────────────────
  email_sent:      { type: Boolean, default: false },
  email_sent_at:   { type: Date },
  email_count:     { type: Number, default: 0 },
  email_last_date: { type: String },

  // ── Follow-up ─────────────────────────────────────────────
  next_followup:         { type: Date },
  followup_count:        { type: Number, default: 0 },
  followup_queued:       { type: Boolean, default: false },
  followup_note:         { type: String },
  followup_scheduled_at: { type: Date },

  // ── Activity Log ──────────────────────────────────────────
  activity: [activitySchema],
  notes:    { type: String },
  tags:     [String]

}, { timestamps: true });

// ── Indexes — scoped per company ──────────────────────────────
leadSchema.index({ phone: 1, companyId: 1 }, { unique: true, sparse: true });
leadSchema.index({ name: 1, city: 1, companyId: 1 });
leadSchema.index({ category: 1, companyId: 1 });
leadSchema.index({ status: 1, companyId: 1 });
leadSchema.index({ wa_sent: 1, companyId: 1 });
leadSchema.index({ next_followup: 1, companyId: 1 });
leadSchema.index({ followup_queued: 1, companyId: 1 });

module.exports = mongoose.model('Lead', leadSchema);
