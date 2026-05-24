const mongoose = require('mongoose');

const planSchema = new mongoose.Schema({
  name:           { type: String, required: true }, // 'Trial', 'Starter', 'Business', 'Agency'
  slug:           { type: String, required: true, unique: true, lowercase: true }, // 'trial', ...
  price:          { type: Number, default: 0 },   // monthly price in INR
  leadLimit:      { type: Number, default: 500 },
  userLimit:      { type: Number, default: 2 },
  waLimit:        { type: Number, default: 200 },  // per month
  exportEnabled:  { type: Boolean, default: false },
  features:       [String],
  trialDays:      { type: Number, default: 0 },
  isActive:       { type: Boolean, default: true },
  sortOrder:      { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('Plan', planSchema);
