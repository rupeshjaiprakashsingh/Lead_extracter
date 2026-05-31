const mongoose = require('mongoose');

const socialSettingsSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true, index: true },
    enabled: { type: Boolean, default: false },
    frequency: { type: String, default: 'daily' }, // 'daily' or 'hourly'
    time_hour: { type: Number, default: 10 }, // 10:00 AM (0-23) if daily
    website_url: { type: String, default: '' },
    topic: { type: String, default: '' },
    title: { type: String, default: '' },
    custom_content: { type: String, default: '' },
    
    // Enterprise Extensions
    business_category: { type: String, default: 'IT Services' },
    business_name: { type: String, default: '' },
    business_desc: { type: String, default: '' },
    target_audience: { type: String, default: '' },
    primary_services: { type: String, default: '' },
    language: { type: String, default: 'English' },
    content_goal: { type: String, default: 'Brand Awareness' },
    content_type: { type: String, default: 'Promotional' },
    tone: { type: String, default: 'Professional' },
    post_length: { type: String, default: 'Medium' },
    gen_images: { type: Boolean, default: true },
    gen_hashtags: { type: Boolean, default: true },
    auto_publish: { type: Boolean, default: true },
    time_zone: { type: String, default: 'IST' },
    topics: [{ type: String }],
    categories: [{
        name: { type: String, default: '' },
        keywords: { type: String, default: '' },
        topic: { type: String, default: '' },
        custom_content: { type: String, default: '' }
    }],
    current_category_index: { type: Number, default: 0 },
    channels: {
        facebook: {
            enabled: { type: Boolean, default: false },
            token: { type: String, default: '' },
            pageId: { type: String, default: '' }
        },
        instagram: {
            enabled: { type: Boolean, default: false },
            token: { type: String, default: '' },
            accountId: { type: String, default: '' }
        },
        linkedin: {
            enabled: { type: Boolean, default: false },
            token: { type: String, default: '' },
            urn: { type: String, default: '' }
        },
        twitter: {
            enabled: { type: Boolean, default: false },
            token: { type: String, default: '' },
            apiKey: { type: String, default: '' }
        },
        pinterest: {
            enabled: { type: Boolean, default: false },
            token: { type: String, default: '' },
            boardId: { type: String, default: '' }
        },
        threads: {
            enabled: { type: Boolean, default: false },
            token: { type: String, default: '' }
        },
        gbp: {
            enabled: { type: Boolean, default: false },
            token: { type: String, default: '' }
        },
        youtube: {
            enabled: { type: Boolean, default: false },
            token: { type: String, default: '' }
        }
    }
}, { timestamps: true });

module.exports = mongoose.model('SocialSettings', socialSettingsSchema);
