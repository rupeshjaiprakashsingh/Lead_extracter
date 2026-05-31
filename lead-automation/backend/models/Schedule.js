const mongoose = require('mongoose');

const scheduleSchema = new mongoose.Schema({
  // ── Multi-Tenant ──────────────────────────────────────────
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },

  // ── Rule Identity ─────────────────────────────────────────
  name:    { type: String, default: 'Default Schedule' },
  enabled: { type: Boolean, default: false },

  // ── Channel Selection ─────────────────────────────────────
  send_whatsapp: { type: Boolean, default: true },   // Send via WhatsApp
  send_email:    { type: Boolean, default: false },  // Also send via Email

  // ── Lead Targeting — Category & Temperature ───────────────
  categories:   [String],     // Business categories (empty = ALL)
  temperatures: [String],     // Lead temperature: 'hot','warm','cold' (empty = ALL)
  cities:       [String],     // Target cities (empty = ALL)

  // ── Advanced Lead Filters ─────────────────────────────────
  filter_has_phone:         { type: Boolean, default: true  }, // Only leads with phone
  filter_has_email:         { type: Boolean, default: false }, // Only leads with email
  filter_no_website:        { type: Boolean, default: false }, // Only leads WITHOUT website
  filter_min_rating:        { type: Number,  default: 0     }, // Minimum star rating (0 = any)
  filter_skip_wa_sent:      { type: Boolean, default: true  }, // Skip leads already WA sent
  filter_skip_email_sent:   { type: Boolean, default: false }, // Skip leads already Email sent
  allow_resend:             { type: Boolean, default: false }, // Override skip — allow resend

  // ── Volume & Timing (IST 24-hour hours array) ─────────────
  daily_limit: { type: Number, default: 60 },
  send_hours:  [Number],     // e.g. [10, 16] = 10am and 4pm

  // ── Reporting ─────────────────────────────────────────────
  report_email: { type: String, default: '' },

  // ── Daily WhatsApp stats (reset each day) ─────────────────
  today_wa_sent:    { type: Number, default: 0 },
  today_wa_failed:  { type: Number, default: 0 },

  // ── Daily Email stats (reset each day) ────────────────────
  today_email_sent:   { type: Number, default: 0 },
  today_email_failed: { type: Number, default: 0 },

  // ── Shared daily reset marker ──────────────────────────────
  today_date: { type: String, default: '' }, // YYYY-MM-DD

  // ── All-time stats ────────────────────────────────────────
  total_wa_sent:    { type: Number, default: 0 },
  total_email_sent: { type: Number, default: 0 },
  last_run:         { type: Date },
  last_report_at:   { type: Date }

}, { timestamps: true });

// Multiple schedules per company allowed
scheduleSchema.index({ companyId: 1 });

module.exports = mongoose.model('Schedule', scheduleSchema);
