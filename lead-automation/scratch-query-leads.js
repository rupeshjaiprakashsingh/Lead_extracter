const mongoose = require('mongoose');
require('dotenv').config();

const leadSchema = new mongoose.Schema({
    userId: String,
    name: String,
    email: String,
    email_sent: Boolean,
    email_count: Number,
    email_last_date: String,
    activity: Array
}, { strict: false });

const Lead = mongoose.model('Lead', leadSchema);

async function run() {
    console.log('Connecting...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected!');

    const sentLeads = await Lead.find({ email_sent: true }).limit(20);
    console.log('Total sent leads count:', await Lead.countDocuments({ email_sent: true }));
    sentLeads.forEach(l => {
        console.log({
            _id: l._id,
            name: l.name,
            email: l.email,
            email_sent: l.email_sent,
            email_count: l.email_count,
            email_last_date: l.email_last_date,
            activity: l.activity ? l.activity.map(a => a.message) : []
        });
    });

    await mongoose.disconnect();
}

run().catch(console.error);
