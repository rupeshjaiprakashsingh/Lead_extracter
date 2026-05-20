const mongoose = require('mongoose');

const socialPostSchema = new mongoose.Schema({
    topic: { type: String, default: '' },
    title: { type: String, default: '' },
    website_url: { type: String, default: '' },
    content: {
        facebook: { type: String, default: '' },
        instagram: { type: String, default: '' },
        linkedin: { type: String, default: '' },
        twitter: { type: String, default: '' },
        pinterest: { type: String, default: '' },
        threads: { type: String, default: '' },
        youtube: { type: String, default: '' }
    },
    channels_posted: [String], // e.g. ['linkedin', 'facebook']
    status: { type: String, default: 'Simulated' }, // 'Success', 'Simulated', 'Failed'
    logs: { type: String, default: '' },
    last_run_at: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('SocialPost', socialPostSchema);
