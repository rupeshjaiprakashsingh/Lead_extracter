const mongoose = require('mongoose');

const socialSettingsSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, unique: true, index: true },
  enabled:        { type: Boolean, default: false },
  frequency:      { type: String, default: 'daily' },
  time_hour:      { type: Number, default: 10 },
  website_url:    { type: String, default: '' },
  topic:          { type: String, default: '' },
  title:          { type: String, default: '' },
  custom_content: { type: String, default: '' },
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
      token:   { type: String, default: '' },
      pageId:  { type: String, default: '' }
    },
    instagram: {
      enabled:   { type: Boolean, default: false },
      token:     { type: String, default: '' },
      accountId: { type: String, default: '' }
    },
    linkedin: {
      enabled: { type: Boolean, default: false },
      token:   { type: String, default: '' },
      urn:     { type: String, default: '' }
    },
    twitter: {
      enabled: { type: Boolean, default: false },
      token:   { type: String, default: '' },
      apiKey:  { type: String, default: '' }
    },
    pinterest: {
      enabled: { type: Boolean, default: false },
      token:   { type: String, default: '' },
      boardId: { type: String, default: '' }
    },
    threads: {
      enabled: { type: Boolean, default: false },
      token:   { type: String, default: '' }
    },
    youtube: {
      enabled: { type: Boolean, default: false },
      token:   { type: String, default: '' }
    }
  }
}, { timestamps: true });

module.exports = mongoose.model('SocialSettings', socialSettingsSchema);
