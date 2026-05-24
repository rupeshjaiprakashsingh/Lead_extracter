const mongoose = require('mongoose');

const connectDB = async () => {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/lead_automation_saas';
  let retries = 5;

  while (retries > 0) {
    try {
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 5000,
      });
      console.log(`  ✅ MongoDB connected: ${uri.replace(/\/\/.*@/, '//***@')}`);
      return true;
    } catch (err) {
      retries--;
      if (retries === 0) {
        console.error(`  ❌ MongoDB connection failed: ${err.message}`);
        return false;
      }
      console.log(`  ⚠️  MongoDB connection failed, retrying (${retries} left)...`);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
};

const isConnected = () => mongoose.connection.readyState === 1;

module.exports = { connectDB, isConnected };
