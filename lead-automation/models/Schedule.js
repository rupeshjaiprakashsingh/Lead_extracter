const mongoose = require('mongoose');

const scheduleSchema = new mongoose.Schema({
    userId:         { type: String, required: true, index: true },
    name:           { type: String, default: 'My Schedule' },
    enabled:        { type: Boolean, default: false },

    // ── Target Filters ───────────────────────────────────────
    categories:     [String],       // empty = ALL categories
    cities:         [String],       // empty = ALL cities
    daily_limit:    { type: Number, default: 60 },   // max per day

    // ── Behaviour ────────────────────────────────────────────
    skip_sent:      { type: Boolean, default: true }, // skip already wa_sent
    allow_resend:   { type: Boolean, default: false },// re-send to wa_sent leads

    // ── Timing (IST 24-hour hours) ───────────────────────────
    send_hours:     { type: [Number], default: [10, 16] }, // hours of day (0-23)

    // ── Reporting ────────────────────────────────────────────
    report_email:   { type: String, default: '' },   // where to send daily report

    // ── Daily stats (reset each day) ─────────────────────────
    today_sent:     { type: Number, default: 0 },
    today_failed:   { type: Number, default: 0 },
    today_date:     { type: String, default: '' },   // YYYY-MM-DD

    // ── All-time stats ────────────────────────────────────────
    total_sent:     { type: Number, default: 0 },
    last_run:       { type: Date },
    last_report_at: { type: Date }

}, { timestamps: true });

// Compound index on userId and name (non-unique)
scheduleSchema.index({ userId: 1 });

module.exports = mongoose.model('Schedule', scheduleSchema);
