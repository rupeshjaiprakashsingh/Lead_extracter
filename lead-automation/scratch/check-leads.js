const mongoose = require('mongoose');
const MONGO_URI = 'mongodb+srv://rupeshwork72:Gate%40air7208@mern-cluster.ahj3x8j.mongodb.net/lead_automation?appName=mern-cluster';

const LeadSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    name:   { type: String },
    phone:  { type: String },
    city:   { type: String }
});

const Lead = mongoose.model('Lead', LeadSchema);

async function run() {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to DB');
    const firstFew = await Lead.find({}).limit(5).lean();
    console.log('LEADS:');
    firstFew.forEach(l => {
        console.log(`NAME: ${l.name}, PHONE: ${l.phone}, CITY: ${l.city}, USERID: ${l.userId}`);
    });
    await mongoose.disconnect();
}

run().catch(err => console.error(err));
