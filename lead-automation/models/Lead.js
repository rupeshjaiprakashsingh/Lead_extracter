const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
    type:    { type: String }, // wa_sent, email_sent, followup, status_change, note
    message: { type: String },
    date:    { type: Date, default: Date.now }
}, { _id: false });

const leadSchema = new mongoose.Schema({
    name:       { type: String, required: true, trim: true },
    phone:      { type: String, trim: true },   // E.164: 919876543210
    raw_phone:  { type: String, trim: true },   // Display: 9876543210
    email:      { type: String, trim: true, lowercase: true },
    website:    { type: String, trim: true },
    rating:     { type: Number },
    reviews:    { type: Number },
    category:   { type: String, default: 'General Business' },
    keyword:    { type: String },
    city:       { type: String },
    address:    { type: String },
    place_id:   { type: String },
    source:     { type: String, default: 'google_maps', enum: ['google_maps','manual','import'] },
    status:     { type: String, default: 'new',
                  enum: ['new','contacted','followup','interested','converted','not_interested','lost'] },

    // ── WhatsApp tracking ─────────────────────────────────
    wa_sent:      { type: Boolean, default: false },
    wa_sent_at:   { type: Date },
    wa_count:     { type: Number, default: 0 },
    wa_last_date: { type: String }, // YYYY-MM-DD for same-day check

    // ── Email tracking ────────────────────────────────────
    email_sent:      { type: Boolean, default: false },
    email_sent_at:   { type: Date },
    email_count:     { type: Number, default: 0 },
    email_last_date: { type: String },

    // ── Follow-up ─────────────────────────────────────────
    next_followup:   { type: Date },
    followup_count:  { type: Number, default: 0 },

    // ── Activity log ──────────────────────────────────────
    activity: [activitySchema],
    notes:    { type: String },
    tags:     [String]
}, { timestamps: true });

// Deduplication indexes
leadSchema.index({ phone: 1 }, { unique: true, sparse: true });
leadSchema.index({ name: 1, city: 1 });
leadSchema.index({ category: 1 });
leadSchema.index({ status: 1 });
leadSchema.index({ wa_sent: 1 });
leadSchema.index({ next_followup: 1 });

module.exports = mongoose.model('Lead', leadSchema);
