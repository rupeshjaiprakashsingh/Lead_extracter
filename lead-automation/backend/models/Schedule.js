const mongoose = require('mongoose');

const scheduleSchema = new mongoose.Schema({
  // ── Multi-Tenant ──────────────────────────────────────────
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },

  // ── Toggle ────────────────────────────────────────────────
  enabled: { type: Boolean, default: false },

  // ── Target ────────────────────────────────────────────────
  categories:  [String],     // empty = ALL categories
  daily_limit: { type: Number, default: 60 },

  // ── Behaviour ────────────────────────────────────────────
  skip_sent:    { type: Boolean, default: true },
  allow_resend: { type: Boolean, default: false },

  // ── Timing (IST 24-hour) ──────────────────────────────────
  morning_hour: { type: Number, default: 10 }, // 10:00 AM
  evening_hour: { type: Number, default: 16 }, // 04:00 PM

  // ── Reporting ─────────────────────────────────────────────
  report_email: { type: String, default: '' },

  // ── Daily stats (reset each day) ─────────────────────────
  today_sent:   { type: Number, default: 0 },
  today_failed: { type: Number, default: 0 },
  today_date:   { type: String, default: '' }, // YYYY-MM-DD

  // ── All-time stats ────────────────────────────────────────
  total_sent:     { type: Number, default: 0 },
  last_run:       { type: Date },
  last_report_at: { type: Date }

}, { timestamps: true });

// One schedule per company
scheduleSchema.index({ companyId: 1 }, { unique: true });

module.exports = mongoose.model('Schedule', scheduleSchema);
