const mongoose = require('mongoose');

const smtpAccountSchema = new mongoose.Schema({
    userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    label:       { type: String, default: 'Gmail Account' },   // friendly name
    smtp_host:   { type: String, default: 'smtp.gmail.com' },
    smtp_port:   { type: Number, default: 587 },
    smtp_secure: { type: Boolean, default: false },             // false = STARTTLS
    smtp_user:   { type: String, required: true },              // Gmail address
    smtp_pass:   { type: String, required: true },              // 16-char App Password
    smtp_from:   { type: String, default: 'Lead Automation' },  // "From" display name
    isActive:    { type: Boolean, default: true },
    // Per-account daily tracking (reset each day)
    daily_sent:  { type: Number, default: 0 },
    daily_date:  { type: String, default: '' },                 // 'YYYY-MM-DD'
    daily_limit: { type: Number, default: 400 },               // Gmail safe: max ~500/day
    // Metadata
    last_used_at: { type: Date, default: null },
    total_sent:   { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('SmtpAccount', smtpAccountSchema);
