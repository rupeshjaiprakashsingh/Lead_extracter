const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/lead_automation';

async function connectDB() {
    try {
        if (mongoose.connection.readyState === 1) return true;
        await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 8000 });
        console.log('✅ MongoDB connected → lead_automation');
        return true;
    } catch(e) {
        console.error('❌ MongoDB connection failed:', e.message);
        return false;
    }
}

function isConnected() {
    return mongoose.connection.readyState === 1;
}

module.exports = { connectDB, isConnected };
