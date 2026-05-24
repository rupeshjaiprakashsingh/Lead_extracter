const mongoose = require('mongoose');
const settingsSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    key:    { type: String, required: true },
    value:  { type: mongoose.Schema.Types.Mixed }
}, { timestamps: true });
// Each user has their own unique key
settingsSchema.index({ userId: 1, key: 1 }, { unique: true });
module.exports = mongoose.model('Settings', settingsSchema);
