const mongoose = require('mongoose');

const MONGO_URI = 'mongodb+srv://rupeshwork72:Gate%40air7208@mern-cluster.ahj3x8j.mongodb.net/lead_automation?appName=mern-cluster';

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
