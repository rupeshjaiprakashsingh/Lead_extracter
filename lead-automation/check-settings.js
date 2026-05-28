const mongoose = require('mongoose');
const MONGO_URI = "mongodb+srv://rupeshwork72:Gate%40air7208@mern-cluster.ahj3x8j.mongodb.net/lead_automation?appName=mern-cluster";

// Simulate index.js loading models/Settings first
require('./models/Settings');

const { getTemplates } = require('./services/templates-cache');

async function check() {
    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB!");
    
    const templates = await getTemplates("6a118ad7233c520ca1587307");
    console.log("\n--- Retrieved Templates for User 6a118ad7233c520ca1587307 ---");
    console.log(JSON.stringify(templates, null, 2));

    await mongoose.disconnect();
    console.log("Disconnected!");
}

check().catch(console.error);
