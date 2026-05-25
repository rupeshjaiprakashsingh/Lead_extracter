const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://rupeshwork72:Gate%40air7208@ac-ielsbkk-shard-00-00.ahj3x8j.mongodb.net:27017,ac-ielsbkk-shard-00-01.ahj3x8j.mongodb.net:27017,ac-ielsbkk-shard-00-02.ahj3x8j.mongodb.net:27017/lead_automation?ssl=true&replicaSet=atlas-dm8oc5-shard-0&authSource=admin&retryWrites=true&w=majority';

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
