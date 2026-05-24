// models/Subscription.js — Company subscription history / tracking
const mongoose = require('mongoose');
const { Schema } = mongoose;

const subscriptionSchema = new Schema(
    {
        companyId: {
            type: Schema.Types.ObjectId,
            ref: 'Company',
            required: true,
            index: true,
        },
        planSlug: {
            type: String,
            required: true,
        },
        status: {
            type: String,
            enum: ['trial', 'active', 'expired', 'cancelled'],
            default: 'trial',
        },
        startsAt:  { type: Date, required: true, default: Date.now },
        expiresAt: { type: Date },

        // Usage counters (reset monthly or tracked over plan lifetime)
        leadUsage: { type: Number, default: 0 },
        waUsage:   { type: Number, default: 0 },

        // Payment reference (if integrated later)
        paymentId:  { type: String },
        invoiceUrl: { type: String },
        notes:      { type: String },
    },
    { timestamps: true }
);

subscriptionSchema.index({ companyId: 1, status: 1 });
subscriptionSchema.index({ expiresAt: 1 });

module.exports = mongoose.model('Subscription', subscriptionSchema);
