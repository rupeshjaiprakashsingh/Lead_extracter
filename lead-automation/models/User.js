const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    username:    { type: String, required: true, unique: true, trim: true, lowercase: true },
    password:    { type: String, required: true },
    company:     { type: String, required: true, trim: true },
    email:       { type: String, trim: true, lowercase: true },
    role:        { type: String, default: 'user', enum: ['admin', 'user'] },
    plan:        { type: String, default: 'pro', enum: ['trial', 'starter', 'pro', 'agency'] },
    licenseKey:  { type: String },
    licenseExpiry: { type: Date },
    isActive:    { type: Boolean, default: true },
    createdAt:   { type: Date, default: Date.now },
    lastLogin:   { type: Date },
    // Custom branding
    fromName:    { type: String },   // override email "From Name"
    logo:        { type: String },   // future: logo URL
}, { timestamps: true });

// Hash password before save
userSchema.pre('save', async function() {
    if (!this.isModified('password')) return;
    this.password = await bcrypt.hash(this.password, 10);
});

userSchema.methods.comparePassword = function(plain) {
    return bcrypt.compare(plain, this.password);
};

module.exports = mongoose.model('User', userSchema);
