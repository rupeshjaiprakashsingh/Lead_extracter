const mongoose = require('mongoose');

const scheduleSchema = new mongoose.Schema({
    // ── Toggle ────────────────────────────────────────────────
    enabled:        { type: Boolean, default: false },

    // ── Target ───────────────────────────────────────────────
    categories:     [String],       // empty = ALL categories
    daily_limit:    { type: Number, default: 60 },   // max per day

    // ── Behaviour ────────────────────────────────────────────
    skip_sent:      { type: Boolean, default: true }, // skip already wa_sent
    allow_resend:   { type: Boolean, default: false },// re-send to wa_sent leads

    // ── Timing (IST 24-hour) ─────────────────────────────────
    morning_hour:   { type: Number, default: 10 },   // 10:00 AM
    evening_hour:   { type: Number, default: 16 },   // 04:00 PM

    // ── Reporting ────────────────────────────────────────────
    report_email:   { type: String, default: '' },   // where to send daily report

    // ── Daily stats (reset each day) ─────────────────────────
    today_sent:     { type: Number, default: 0 },
    today_failed:   { type: Number, default: 0 },
    today_date:     { type: String, default: '' },   // YYYY-MM-DD

    // ── All-time stats ────────────────────────────────────────
    total_sent:     { type: Number, default: 0 },
    last_run:       { type: Date },
    last_report_at: { type: Date },

}, { timestamps: true });

module.exports = mongoose.model('Schedule', scheduleSchema);
