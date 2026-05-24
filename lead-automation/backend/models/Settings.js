const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true }, // optional: per-user setting
  key:       { type: String, required: true },
  value:     { type: mongoose.Schema.Types.Mixed }
}, { timestamps: true });

// Each company has their own unique key
settingsSchema.index({ companyId: 1, key: 1 }, { unique: true });

module.exports = mongoose.model('Settings', settingsSchema);
