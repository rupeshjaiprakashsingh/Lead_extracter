const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema({
  companyId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Company', index: true },
  userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  action:     { type: String, required: true }, // 'login', 'lead_created', 'wa_sent', 'email_sent', 'scrape', etc.
  resource:   { type: String }, // 'lead', 'user', 'settings', 'company'
  resourceId: { type: mongoose.Schema.Types.ObjectId },
  details:    { type: mongoose.Schema.Types.Mixed }, // extra context
  ip:         { type: String },
  userAgent:  { type: String },
  success:    { type: Boolean, default: true }
}, { timestamps: true });

// TTL: auto-delete logs older than 90 days
activityLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });
activityLogSchema.index({ companyId: 1, createdAt: -1 });
activityLogSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('ActivityLog', activityLogSchema);
