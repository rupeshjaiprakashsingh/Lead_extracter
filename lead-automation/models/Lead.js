const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
    type:    { type: String }, // wa_sent, email_sent, followup, status_change, note
    message: { type: String },
    date:    { type: Date, default: Date.now }
}, { _id: false });

const leadSchema = new mongoose.Schema({
    userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
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
    source:     { type: String, default: 'google_maps', enum: ['google_maps','manual','import','excel_import','google_maps_auto'] },
    status:     { type: String, default: 'new',
                  enum: ['new','contacted','followup','interested','converted','not_interested','lost'] },

    // ── Google Contacts sync ───────────────────────────────
    contact_saved:    { type: Boolean, default: false },
    contact_saved_at: { type: Date },

    // ── WhatsApp tracking ─────────────────────────────────
    wa_sent:      { type: Boolean, default: false },
    wa_sent_at:   { type: Date },
    wa_count:     { type: Number, default: 0 },
    wa_last_date: { type: String }, // YYYY-MM-DD for same-day check
    wa_invalid:   { type: Boolean, default: false },

    // ── Email tracking ────────────────────────────────────
    email_sent:      { type: Boolean, default: false },
    email_sent_at:   { type: Date },
    email_count:     { type: Number, default: 0 },
    email_last_date: { type: String },

    // ── Lead Temperature (CRM Qualification) ──────────────
    temperature: {
        type: String,
        default: '',
        enum: ['hot', 'warm', 'cold', '']
    },

    // ── Follow-up ─────────────────────────────────────────────
    next_followup:        { type: Date },
    followup_count:       { type: Number, default: 0 },
    followup_queued:      { type: Boolean, default: false },   // manually added to follow-up tab
    followup_note:        { type: String },                    // user's note for this lead
    followup_scheduled_at:{ type: Date },                      // when to send follow-up

    // ── Activity log ──────────────────────────────────────
    activity: [activitySchema],
    notes:    { type: String },
    tags:     [String]
}, { timestamps: true });

// Deduplication and query-optimized compound indexes — scoped per user
leadSchema.index({ phone: 1, userId: 1 }, { unique: true, sparse: true });
leadSchema.index({ userId: 1, name: 1, city: 1 });
leadSchema.index({ userId: 1, createdAt: -1 });
leadSchema.index({ userId: 1, category: 1, createdAt: -1 });
leadSchema.index({ userId: 1, city: 1, createdAt: -1 });
leadSchema.index({ userId: 1, status: 1, createdAt: -1 });
leadSchema.index({ userId: 1, wa_sent: 1, createdAt: -1 });
leadSchema.index({ userId: 1, email_sent: 1, createdAt: -1 });
leadSchema.index({ userId: 1, rating: -1, createdAt: 1, email: 1 });
leadSchema.index({ userId: 1, temperature: 1, rating: -1, createdAt: 1, email: 1 });
leadSchema.index({ userId: 1, next_followup: 1 });
leadSchema.index({ userId: 1, wa_last_date: 1 });
leadSchema.index({ userId: 1, email_last_date: 1 });

leadSchema.pre('save', async function() {
    const hasPhone = !!(this.phone && this.phone.trim());
    const hasEmail = !!(this.email && this.email.trim());
    const rating = this.rating || 0;
    if (rating >= 4 && hasPhone && hasEmail) {
        this.temperature = 'hot';
    } else if (rating >= 3 && (hasPhone || hasEmail)) {
        this.temperature = 'warm';
    } else {
        this.temperature = 'cold';
    }
});

module.exports = mongoose.model('Lead', leadSchema);
