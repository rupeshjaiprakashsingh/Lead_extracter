const mongoose = require('mongoose');

const autoScraperSchema = new mongoose.Schema({
    userId:             { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    companyId:          { type: mongoose.Schema.Types.ObjectId, ref: 'Company', index: true },

    // 35 industry keywords — automatically cycled one-by-one
    keywords: {
        type: String,
        default: [
            'clinic', 'doctor', 'hospital', 'dentist', 'pharmacy',
            'gym', 'yoga studio', 'spa', 'salon', 'beauty parlour',
            'hotel', 'restaurant', 'cafe', 'catering', 'bakery',
            'CA firm', 'chartered accountant', 'law firm', 'advocate', 'insurance agent',
            'interior designer', 'architect', 'real estate agent', 'builder', 'construction',
            'travel agent', 'tour operator', 'event management', 'wedding planner', 'photographer',
            'coaching institute', 'school', 'tutor', 'driving school', 'computer training'
        ].join(', ')
    },

    // 30 major Indian cities — automatically cycled one-by-one
    cities: {
        type: String,
        default: [
            'Mumbai', 'Delhi', 'Bangalore', 'Pune', 'Ahmedabad',
            'Hyderabad', 'Kolkata', 'Chennai', 'Lucknow', 'Jaipur',
            'Surat', 'Kanpur', 'Nagpur', 'Indore', 'Thane',
            'Bhopal', 'Visakhapatnam', 'Patna', 'Vadodara', 'Ghaziabad',
            'Ludhiana', 'Agra', 'Nashik', 'Faridabad', 'Meerut',
            'Rajkot', 'Varanasi', 'Srinagar', 'Aurangabad', 'Dhanbad'
        ].join(', ')
    },

    enabled:            { type: Boolean, default: false },
    maxResults:         { type: Number, default: 200 },          // max results per cycle (increased for 5k/day target)
    intervalMinutes:    { type: Number, default: 2 },            // wait between cycles (2 min = 30 cycles/hr = 720/day)
    dailyTarget:        { type: Number, default: 5000 },         // stop when this many leads extracted today
    deepEmailExtract:   { type: Boolean, default: false },       // disabled for speed (email slows each lead by ~6s)
    currentKeywordIdx:  { type: Number, default: 0 },
    currentCityIdx:     { type: Number, default: 0 },
    exhaustedCombos:    { type: [String], default: [] },         // list of "keyword||city" combos that returned 0 new leads
    status:             { type: String, default: 'Stopped' }, // 'Stopped', 'Idle', 'Scraping Maps', 'Extracting Contacts'
    logs:               { type: String, default: '' },
    lastRunAt:          { type: Date },
    // Daily lead tracking
    leadsToday:         { type: Number, default: 0 },
    totalLeadsExtracted:{ type: Number, default: 0 },
    lastCountResetAt:   { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('AutoScraper', autoScraperSchema);
