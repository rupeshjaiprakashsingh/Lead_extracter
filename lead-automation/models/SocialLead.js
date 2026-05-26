const mongoose = require('mongoose');

const socialLeadSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },

    // Source platform
    platform: {
        type: String,
        enum: ['linkedin', 'twitter', 'indiamart', 'justdial'],
        required: true,
        index: true
    },

    // Identity
    name:       { type: String, trim: true },
    company:    { type: String, trim: true },
    title:      { type: String, trim: true },   // Job title / business category
    location:   { type: String, trim: true },

    // Contact
    profileUrl:     { type: String, trim: true },
    contactEmail:   { type: String, trim: true, lowercase: true },
    phone:          { type: String, trim: true },
    website:        { type: String, trim: true },
    followers:      { type: Number },

    // Intent signals
    intentKeyword:  { type: String },   // the keyword used to find this lead
    intentText:     { type: String },   // the tweet/bio/post that showed intent
    serviceCategory:{ type: String },   // which Innvoque service they need

    // Scoring (1-5)
    score: {
        type: Number,
        min: 1,
        max: 5,
        default: 2
    },

    // Pipeline status
    status: {
        type: String,
        enum: ['new', 'reviewed', 'contacted', 'qualified', 'converted', 'rejected'],
        default: 'new',
        index: true
    },

    addedToCRM:   { type: Boolean, default: false },
    addedToCRMAt: { type: Date },
    crmLeadId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' },

    notes: { type: String },

}, { timestamps: true });

socialLeadSchema.index({ platform: 1, userId: 1 });
socialLeadSchema.index({ status: 1, userId: 1 });
socialLeadSchema.index({ score: -1 });
socialLeadSchema.index({ profileUrl: 1, userId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('SocialLead', socialLeadSchema);
