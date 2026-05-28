const SocialSettings = require('../models/SocialSettings');
const SocialPost = require('../models/SocialPost');
const scheduler = require('../../services/scheduler');

// ── GET /api/social/settings ──────────────────────────────────────
exports.getSettings = async (req, res, next) => {
    try {
        const companyId = req.user.companyId;
        let s = await SocialSettings.findOne({ companyId });
        if (!s) {
            s = await SocialSettings.create({ companyId, userId: req.user._id });
        }
        
        const settingsObj = s.toObject();
        // Mask passwords/tokens
        if (settingsObj.channels) {
            for (const ch of Object.keys(settingsObj.channels)) {
                if (settingsObj.channels[ch].token) {
                    settingsObj.channels[ch].token = '••••••••';
                }
                if (settingsObj.channels[ch].apiKey) {
                    settingsObj.channels[ch].apiKey = '••••••••';
                }
            }
        }
        res.json({ success: true, data: settingsObj });
    } catch(err) {
        next(err);
    }
};

// ── POST /api/social/settings ─────────────────────────────────────
exports.saveSettings = async (req, res, next) => {
    try {
        const companyId = req.user.companyId;
        const { enabled, frequency, time_hour, website_url, topic, title, custom_content, channels } = req.body;
        let s = await SocialSettings.findOne({ companyId });
        if (!s) {
            s = new SocialSettings({ companyId, userId: req.user._id });
        }

        s.enabled = !!enabled;
        s.frequency = frequency || 'daily';
        s.time_hour = parseInt(time_hour) || 10;
        s.website_url = website_url || '';
        s.topic = topic || '';
        s.title = title || '';
        s.custom_content = custom_content || '';

        if (channels) {
            for (const [ch, config] of Object.entries(channels)) {
                if (!s.channels[ch]) s.channels[ch] = {};
                s.channels[ch].enabled = !!config.enabled;
                
                if (config.token !== undefined && config.token !== '••••••••') {
                    s.channels[ch].token = config.token;
                }
                if (config.pageId !== undefined) {
                    s.channels[ch].pageId = config.pageId;
                }
                if (config.accountId !== undefined) {
                    s.channels[ch].accountId = config.accountId;
                }
                if (config.urn !== undefined) {
                    s.channels[ch].urn = config.urn;
                }
                if (config.apiKey !== undefined && config.apiKey !== '••••••••') {
                    s.channels[ch].apiKey = config.apiKey;
                }
                if (config.boardId !== undefined) {
                    s.channels[ch].boardId = config.boardId;
                }
            }
        }

        await s.save();
        
        // Restart social scheduler to pick up changes
        try {
            scheduler.startSocialScheduler();
        } catch(e) {
            console.warn('Could not restart social scheduler:', e.message);
        }

        res.json({ success: true, data: s });
    } catch(err) {
        next(err);
    }
};

// ── GET /api/social/posts ─────────────────────────────────────────
exports.getPosts = async (req, res, next) => {
    try {
        const companyId = req.user.companyId;
        const posts = await SocialPost.find({ companyId }).sort({ createdAt: -1 }).limit(100).lean();
        res.json({ success: true, data: posts });
    } catch(err) {
        next(err);
    }
};

// ── POST /api/social/preview ──────────────────────────────────────
exports.generatePreview = async (req, res, next) => {
    try {
        const { website_url, topic, title, custom_content } = req.body;
        if (!website_url) {
            return res.status(400).json({ success: false, error: 'Website URL is required' });
        }
        
        const { scrapeWebsite, generateSocialPosts } = require('../../services/social-poster');
        const webData = await scrapeWebsite(website_url);
        const posts = await generateSocialPosts(webData, topic, title, custom_content, {
            companyId: req.user?.companyId,
            userId: req.user?._id
        });
        res.json({ success: true, data: { posts, webData } });
    } catch(err) {
        next(err);
    }
};

// ── POST /api/social/post ─────────────────────────────────────────
exports.postNow = async (req, res, next) => {
    try {
        const companyId = req.user.companyId;
        const { website_url, topic, title, custom_content } = req.body;
        const { scrapeWebsite, generateSocialPosts, postToSocial } = require('../../services/social-poster');
        
        let settings = await SocialSettings.findOne({ companyId });
        if (!settings) {
            return res.status(400).json({ success: false, error: 'Please save settings first before running immediate post.' });
        }

        // Use request body inputs as temporary overrides if provided
        const webUrl = website_url || settings.website_url;
        if (!webUrl) {
            return res.status(400).json({ success: false, error: 'Website URL is required' });
        }
        
        const tempSettings = {
            companyId,
            userId: req.user._id,
            website_url: webUrl,
            topic: topic || settings.topic,
            title: title || settings.title,
            custom_content: custom_content || settings.custom_content,
            channels: settings.channels
        };

        const webData = await scrapeWebsite(webUrl);
        const posts = await generateSocialPosts(webData, tempSettings.topic, tempSettings.title, tempSettings.custom_content, {
            companyId: tempSettings.companyId,
            userId: tempSettings.userId
        });
        const postDoc = await postToSocial(posts, tempSettings);
        
        res.json({ success: true, data: postDoc });
    } catch(err) {
        next(err);
    }
};
