const mongoose = require('mongoose');

const emailScheduleSchema = new mongoose.Schema({
    userId:         { type: String, required: true, index: true },
    name:           { type: String, default: 'My Email Schedule' },
    enabled:        { type: Boolean, default: false },

    // ── Target Filters ───────────────────────────────────────
    categories:     [String],       // empty = ALL categories
    cities:         [String],       // empty = ALL cities
    temperatures:   [String],       // empty = ALL temperatures
    daily_limit:    { type: Number, default: 60 },   // max per day

    // ── Behaviour ────────────────────────────────────────────
    skip_sent:      { type: Boolean, default: true }, // skip already email_sent
    allow_resend:   { type: Boolean, default: false },// re-send to email_sent leads
    filter_no_website: { type: Boolean, default: false },
    filter_has_email:  { type: Boolean, default: false },
    filter_min_rating: { type: Number, default: 0 },

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

// Compound index on userId (non-unique)
emailScheduleSchema.index({ userId: 1 });

module.exports = mongoose.model('EmailSchedule', emailScheduleSchema);
