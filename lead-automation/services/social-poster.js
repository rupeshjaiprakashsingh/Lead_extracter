const { chromium } = require('playwright');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const mongoose = require('mongoose');

// Lazy getter for model
const getSocialPost = () => {
    try {
        return mongoose.model('SocialPost');
    } catch (e) {
        try {
            return require('../models/SocialPost');
        } catch (err) {
            return require('../backend/models/SocialPost');
        }
    }
};

// Check if a URN/URL is for a personal profile
function isPersonalProfile(input) {
    if (!input) return false;
    const val = input.trim();
    // Personal profile URL like https://www.linkedin.com/in/username or /in/username
    if (/\/in\/[^/]+/.test(val)) return true;
    // Already a person URN
    if (val.startsWith('urn:li:person:')) return true;
    // If it's not a company URL and not a number-only org ID, treat as personal
    if (!/\/company\//.test(val) && !/^\d+$/.test(val) && !val.startsWith('urn:li:organization:')) {
        // Could be a username or personal profile
        if (val.startsWith('http') && val.includes('linkedin.com')) return true;
    }
    return false;
}

// Format company URN only - for organization posting
function formatOrganizationUrn(input) {
    if (!input) return '';
    let val = input.trim();
    const companyMatch = val.match(/\/company\/(\d+)/);
    if (companyMatch) return `urn:li:organization:${companyMatch[1]}`;
    if (val.startsWith('urn:li:')) return val;
    if (/^\d+$/.test(val)) return `urn:li:organization:${val}`;
    return val;
}

// Auto-detect LinkedIn person URN using the token via /v2/me
async function fetchLinkedInPersonUrn(token) {
    try {
        // Try newer /v2/userinfo (OpenID Connect) first
        const r1 = await fetch('https://api.linkedin.com/v2/userinfo', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (r1.ok) {
            const data = await r1.json();
            if (data.sub) {
                return { urn: `urn:li:person:${data.sub}`, method: '/v2/userinfo' };
            }
        }
    } catch(e) { /* ignore */ }

    try {
        // Fallback: /v2/me
        const r2 = await fetch('https://api.linkedin.com/v2/me', {
            headers: {
                'Authorization': `Bearer ${token}`,
                'X-Restli-Protocol-Version': '2.0.0'
            }
        });
        if (r2.ok) {
            const data = await r2.json();
            if (data.id) {
                return { urn: `urn:li:person:${data.id}`, method: '/v2/me' };
            }
        }
    } catch(e) { /* ignore */ }

    return null;
}

// Scrape website content using fetch and playwright
async function scrapeWebsite(url) {
    if (!url) return { title: '', description: '', text: '' };
    
    // Normalize URL
    let targetUrl = url.trim();
    if (!/^https?:\/\//i.test(targetUrl)) {
        targetUrl = 'https://' + targetUrl;
    }
    
    console.log(`🌐 Scraper: Crawling website: ${targetUrl}`);
    
    // 1. Try fast fetch first
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout
        const res = await fetch(targetUrl, {
            signal: controller.signal,
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' 
            }
        });
        clearTimeout(timeoutId);
        if (res.ok) {
            const html = await res.text();
            const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
            const descMatch = html.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"/i) ||
                              html.match(/<meta[^>]+content="([^"]+)"[^>]+name="description"/i);
            
            const title = titleMatch ? titleMatch[1].trim() : '';
            const description = descMatch ? descMatch[1].trim() : '';
            
            // Basic tag stripping
            const bodyContent = html.match(/<body[^>]*>([\s\S]+?)<\/body>/i);
            let text = '';
            if (bodyContent) {
                text = bodyContent[1]
                    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                    .replace(/<[^>]+>/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim()
                    .substring(0, 2500);
            }
            
            if (title || description || text.length > 200) {
                console.log('✅ Scraper: Fetch request succeeded!');
                return { title, description, text };
            }
        }
    } catch(e) {
        console.log(`⚠️ Scraper: Fetch failed (${e.message}). Falling back to Playwright...`);
    }

    // 2. Playwright fallback (headless browser)
    let browser = null;
    try {
        browser = await chromium.launch({ headless: true });
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });
        const page = await context.newPage();
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 12000 });
        
        const title = await page.title().catch(() => '');
        const description = await page.locator('meta[name="description"]').getAttribute('content').catch(() => '');
        const text = await page.evaluate(() => {
            return document.body ? document.body.innerText.substring(0, 2500) : '';
        }).catch(() => '');
        
        console.log('✅ Scraper: Playwright extraction succeeded!');
        return { title, description, text };
    } catch (e) {
        console.error(`❌ Scraper: Playwright extraction failed: ${e.message}`);
        return { 
            title: 'Local Business Website', 
            description: 'Scraping was blocked or timed out.', 
            text: `This is a website for a company at ${targetUrl}. They provide high-quality services in their industry.`
        };
    } finally {
        if (browser) await browser.close().catch(() => {});
    }
}

// Generate platform-specific posts using Gemini
async function generateSocialPosts(webData, topic, title, customContent, options = {}) {
    const geminiKey = process.env.GEMINI_API_KEY;

    let recentPostsText = "";
    try {
        const { companyId, userId } = options;
        const query = {};
        if (companyId) query.companyId = companyId;
        else if (userId) query.userId = userId;

        if (companyId || userId) {
            const SocialPost = getSocialPost();
            const recentPosts = await SocialPost.find(query)
                .sort({ createdAt: -1 })
                .limit(3)
                .lean();
            
            if (recentPosts && recentPosts.length > 0) {
                recentPostsText = recentPosts.map((p, idx) => {
                    return `Post ${idx + 1}:\n- LinkedIn: "${p.content?.linkedin || ''}"\n- Facebook: "${p.content?.facebook || ''}"\n- Twitter: "${p.content?.twitter || ''}"`;
                }).join("\n\n");
            }
        }
    } catch (e) {
        console.error('Error fetching recent posts for prompt variation:', e.message);
    }

    const angles = [
        "Thought Leadership & Industry Trends: Focus on forward-looking insights, predictions, or industry analysis.",
        "Problem & Solution: Highlight a common pain point businesses face and how our services solve it.",
        "Actionable Advice: Provide a quick, useful checklist, tips, or step-by-step guide.",
        "Myth-Busting: Debunk a common misconception or mistake in this domain.",
        "Benefits Focus: Detail specific tangible benefits (ROI, time saved, efficiency) of implementing these services.",
        "Question-Based Engagement: Start with an engaging question to spark replies and discussions.",
        "Case Study Style: Frame the post around a hypothetical success story, challenge, action, and result."
    ];
    const randomAngle = angles[Math.floor(Math.random() * angles.length)];
    
    if (geminiKey) {
        try {
            const genAI = new GoogleGenerativeAI(geminiKey);
            const aiModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
            
            const prompt = `You are a world-class social media manager and content creator.
Your goal is to generate engaging, unique social media posts for a company based on their website content and additional details.

COMPANY WEBSITE INFO:
- Title: "${webData.title || ''}"
- Description: "${webData.description || ''}"
- Context/Text: "${webData.text || ''}"

USER INSTRUCTIONS (Guiding Topic/Theme):
- Topic Focus: "${topic || 'Brand Promotion'}"
- Specific Title: "${title || ''}"
- Custom instructions/direction: "${customContent || ''}"

SPECIFIC POST ANGLE/STYLE FOR THIS RUN (You must write the post focusing on this style to ensure variety):
- Style Focus: ${randomAngle}

${recentPostsText ? `AVOID REPETITION: Here are the texts of our recently published posts. DO NOT repeat the same concepts, hooks, phrasing, or structures:
${recentPostsText}
` : ''}

Generate customized posts for the following social media channels:
1. "facebook": Highly engaging, friendly/informal, uses emojis, lists benefits, ends with a clear Call to Action (CTA) and 3-5 hashtags.
2. "instagram": Visually descriptive, highly engaging hook, uses emojis, space breaks, ends with a call to link-in-bio and 5-10 hashtags.
3. "linkedin": Professional, informative, business-oriented. Uses bullet points, structured spacing, professional tone, adds 3-5 relevant hashtags.
4. "twitter": Short, punchy, under 280 characters, includes 1-2 hashtags, clear message.
5. "pinterest": Image description focus, highly descriptive, uses search-friendly keywords, clear call to action.
6. "threads": Conversational, interactive, invites comments, under 500 characters.
7. "youtube": A short video script outline or video description (100-200 words), uses keywords, tells viewers to subscribe.

Strict Rules:
- Return ONLY a valid JSON object matching this schema. Do not include markdown code block formatting (like \`\`\`json). Just the raw JSON string:
{
  "facebook": "string",
  "instagram": "string",
  "linkedin": "string",
  "twitter": "string",
  "pinterest": "string",
  "threads": "string",
  "youtube": "string"
}
- Ensure strings are properly escaped for valid JSON.`;

            const result = await aiModel.generateContent({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: { responseMimeType: 'application/json' }
            });
            
            const rawText = result.response.text().trim();
            const parsed = JSON.parse(rawText);
            return parsed;
        } catch (e) {
            console.error('❌ Gemini social generation failed, using fallback:', e.message);
        }
    }

    // Heuristic Fallback
    console.log('🤖 Social Poster: Using fallback content generator...');
    return buildFallbackPosts(webData, topic, title, customContent);
}

// Build fallback posts when Gemini is not available
function buildFallbackPosts(webData, topic, title, customContent) {
    const company = title || webData.title || 'Our Company';
    const mainTopic = topic || 'Innovation & Excellence';
    const desc = webData.description || 'premium services and custom solutions';

    const tags = `#business #growth #success #marketing`;
    
    // Pick a random template index (0, 1, or 2)
    const t = Math.floor(Math.random() * 3);
    
    const fbTemplates = [
        `📢 EXCITING NEWS FROM ${company.toUpperCase()}! 📢\n\nWe are thrilled to highlight our focus on: **${mainTopic}**.\n\nAt ${company}, we are dedicated to helping our clients succeed by delivering ${desc}.\n\nCheck out our website to learn more about our services and how we can collaborate! 🚀\n\n👉 Visit us today! ${tags}`,
        `💡 Looking to elevate your operations? At ${company}, we specialize in **${mainTopic}** to help you stay ahead of the competition.\n\nOur custom-tailored solutions for ${desc} are designed to deliver exceptional quality and reliability. Let's build something great together!\n\n🔗 Learn more on our website! ${tags}`,
        `🚀 Innovate, scale, and grow with ${company}! Today, we're sharing insights on **${mainTopic}**.\n\nWhether you need support with ${desc} or want to optimize your workflows, our team has the expertise to guide you every step of the way.\n\n👉 Send us a message or visit our link to get started! ${tags}`
    ];

    const liTemplates = [
        `💼 Elevating Standards: ${company} focuses on ${mainTopic} 💼\n\nIn today's fast-paced market, businesses need reliable partners. At ${company}, we pride ourselves on offering ${desc} designed to drive real results.\n\nOur core values:\n🔹 Client Success First\n🔹 Cutting-Edge Technology\n🔹 Reliable & Professional Execution\n\nLet's connect and discuss how we can accelerate your progress. Visit our website for more information.\n\n${tags} #networking #professionalism`,
        `💡 How is your organization addressing ${mainTopic} this year?\n\nAt ${company}, we help businesses optimize their workflows and implement custom ${desc} to unlock new growth channels.\n\nHere is what makes our approach different:\n✔️ Customized project roadmaps\n✔️ Transparent communication\n✔️ Focus on long-term scalability\n\nConnect with us or visit our website to explore our services. Let's discuss in the comments!\n\n${tags} #innovation #leadership`,
        `📈 Scaling your business requires the right technology and strategy. At ${company}, we are committed to delivering top-tier solutions in **${mainTopic}**.\n\nFrom consulting to final deployment of ${desc}, we partner with you to turn complex challenges into simple, efficient workflows.\n\n👉 Read our latest updates or visit our site to schedule a consultation.\n\n${tags} #businesssolutions #b2b`
    ];

    const twTemplates = [
        `Looking to grow? ${company} has you covered! We specialize in ${mainTopic} to help you achieve your goals. Visit our website to learn more! 🚀 ${tags.split(' ').slice(0, 2).join(' ')}`,
        `How does your team handle ${mainTopic}? At ${company}, we deliver premium ${desc} to streamline your operations and maximize ROI. Let's connect! ⚡ ${tags.split(' ').slice(0, 2).join(' ')}`,
        `Ready to scale? ${company} specializes in custom ${desc} and **${mainTopic}** designed for your business needs. Visit our website today! 🔗 ${tags.split(' ').slice(0, 2).join(' ')}`
    ];

    const igTemplates = [
        `✨ Spotlighting ${company} ✨\n\nToday, we are talking about **${mainTopic}** and what it means for your business.\n\nOur team is committed to excellence, providing: \n✔️ Custom Tailored Services\n✔️ Exceptional Quality\n✔️ Local Support & Expertise\n\nRead more about how we help our clients grow. Click the link in our bio! 🔗\n\n${tags} #instabusiness #picoftheday`,
        `💡 Elevate your vision with ${company}!\n\nWe specialize in **${mainTopic}** and custom ${desc} to help your brand stand out and grow.\n\nSwipe left to see our core offerings and tap the link in our bio to connect with our experts today! 🚀\n\n${tags} #growthmindset #agencylife`,
        `🔥 Transforming ideas into reality with ${company}!\n\nOur focus on **${mainTopic}** ensures that your business gets the best-in-class ${desc}.\n\nReady to take the next step? Head to the link in our bio and let's get started! 📲\n\n${tags} #tech #solutions`
    ];

    const pinTemplates = [
        `Discover how ${company} is leading the way in ${mainTopic}. Creative ideas, professional execution, and premium results for your project. Click to visit our website. ${tags}`,
        `Modern solutions for ${mainTopic} by ${company}. Elevate your business with custom ${desc}. Pin this and visit our website to learn more! ${tags}`,
        `Get inspired by ${company}'s approach to ${mainTopic}. Quality, reliability, and custom-tailored ${desc} for your business. Click to visit. ${tags}`
    ];

    const thrTemplates = [
        `What's the biggest challenge your business is facing today? 💭 At ${company}, we focus on ${mainTopic} to solve your core problems. Let's discuss in the replies! 👇`,
        `Thinking about how to optimize ${mainTopic} for your team? At ${company}, we build custom ${desc} to make workflows seamless. What tools do you use? Let us know below! 💬`,
        `Scale smarter, not harder. At ${company}, we help brands focus on **${mainTopic}**. Share your thoughts or questions about it below! 👇`
    ];

    const ytTemplates = [
        `🎥 VIDEO OUTLINE: Introduction to ${company} - ${mainTopic}\n\n[0:00 - Intro] Highlight the core problem businesses face.\n[0:30 - Our Solution] Introduce ${company} and our specialization in ${mainTopic}.\n[1:15 - Key Services] Explain how we provide ${desc}.\n[2:00 - Call to Action] Visit our website, subscribe to the channel, and hit the bell icon!`,
        `🎥 VIDEO OUTLINE: Why ${mainTopic} Matters for Your Business\n\n[0:00] The changing landscape of business today.\n[0:45] How ${company} helps you adapt through ${desc}.\n[1:30] Key benefits: scalability, support, and custom options.\n[2:15] Outro: Subscribe for more tips and visit our website link!`,
        `🎥 VIDEO OUTLINE: Scaling with ${company}\n\n[0:00] Overview of scaling challenges.\n[0:30] Case study/examples of our specialization in ${mainTopic}.\n[1:20] How we implement ${desc} for our partners.\n[2:00] Call to action: Comment below, subscribe, and check the description link!`
    ];

    return {
        facebook: fbTemplates[t],
        linkedin: liTemplates[t],
        twitter: twTemplates[t],
        instagram: igTemplates[t],
        pinterest: pinTemplates[t],
        threads: thrTemplates[t],
        youtube: ytTemplates[t]
    };
}

// Simulate Posting to Enabled Channels
async function postToSocial(generatedPosts, settings) {
    const channelsPosted = [];
    let logString = `📝 Post Run Started: ${new Date().toLocaleString()}\n`;
    logString += `Website URL: ${settings.website_url}\n`;
    logString += `Topic: ${settings.topic || 'N/A'}, Title: ${settings.title || 'N/A'}\n\n`;

    const enabledChannels = Object.keys(settings.channels || {}).filter(
        ch => settings.channels[ch] && settings.channels[ch].enabled
    );

    if (enabledChannels.length === 0) {
        logString += `⚠️ Warning: No social media channels are enabled. Post saved to history log only.\n`;
    }

    for (const channel of enabledChannels) {
        const channelConfig = settings.channels[channel];
        const content = generatedPosts[channel] || '';
        const maskedToken = channelConfig.token 
            ? `${channelConfig.token.substring(0, 4)}...${channelConfig.token.substring(channelConfig.token.length - 4)}` 
            : 'MOCK_TOKEN';

        logString += `🌐 Posting to ${channel.toUpperCase()}...\n`;
        logString += `   [Config] Token: ${maskedToken}\n`;
        if (channelConfig.pageId) logString += `   [Config] Page ID: ${channelConfig.pageId}\n`;
        if (channelConfig.accountId) logString += `   [Config] Account ID: ${channelConfig.accountId}\n`;
        if (channelConfig.urn) logString += `   [Config] URN: ${channelConfig.urn}\n`;
        if (channelConfig.apiKey) logString += `   [Config] API Key: ${channelConfig.apiKey}\n`;
        
        logString += `   [Content] ${content.substring(0, 80)}...\n`;
        
        // Real API Call for LinkedIn, Fallback/Simulation for other channels
        if (channel === 'linkedin' && channelConfig.token) {
            logString += `   [LinkedIn] Authenticating and preparing post...\n`;
            try {
                let finalUrn = '';
                const urnInput = (channelConfig.urn || '').trim();

                // ── Step 1: Resolve the correct author URN ──────────────────
                // Personal profile: auto-detect via /v2/me or /v2/userinfo
                if (!urnInput || isPersonalProfile(urnInput)) {
                    logString += `   [LinkedIn] Personal profile detected — auto-resolving person URN via API...\n`;
                    const resolved = await fetchLinkedInPersonUrn(channelConfig.token);
                    if (resolved) {
                        finalUrn = resolved.urn;
                        logString += `   [LinkedIn] Person URN resolved (${resolved.method}): ${finalUrn}\n`;
                    } else {
                        throw new Error('Could not resolve your LinkedIn person URN. Make sure your access token has the r_liteprofile or profile scope.');
                    }
                } else {
                    // Organization URN from company URL or explicit urn:li:organization:ID
                    finalUrn = formatOrganizationUrn(urnInput);
                    logString += `   [LinkedIn] Organization URN: ${finalUrn}\n`;
                }

                let success = false;
                let errorMsg = '';

                // ── Step 2a: Try new versioned Posts API (/rest/posts) ─────
                try {
                    const response = await fetch('https://api.linkedin.com/rest/posts', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${channelConfig.token}`,
                            'Content-Type': 'application/json',
                            'X-Restli-Protocol-Version': '2.0.0',
                            'LinkedIn-Version': '202404'
                        },
                        body: JSON.stringify({
                            author: finalUrn,
                            commentary: content,
                            visibility: 'PUBLIC',
                            distribution: {
                                feedDistribution: 'MAIN_FEED',
                                targetEntities: [],
                                thirdPartyDistributionChannels: []
                            },
                            lifecycleState: 'PUBLISHED',
                            isReshareDisabledByAuthor: false
                        })
                    });

                    if (response.ok) {
                        const postId = response.headers.get('x-restli-id') || 'SUCCESS';
                        logString += `   ✅ Successfully posted to LINKEDIN (Posts API)! Post URN: ${postId}\n\n`;
                        channelsPosted.push(channel);
                        success = true;
                    } else {
                        const errorText = await response.text();
                        errorMsg = `Posts API returned ${response.status}: ${errorText}`;
                        logString += `   ⚠️ Posts API failed (${response.status}), trying legacy ugcPosts...\n`;
                    }
                } catch (err) {
                    errorMsg = err.message;
                    logString += `   ⚠️ Posts API error: ${errorMsg}, trying legacy ugcPosts...\n`;
                }

                // ── Step 2b: Fallback to legacy ugcPosts API (/v2/ugcPosts) ─
                if (!success) {
                    try {
                        const ugcBody = {
                            author: finalUrn,
                            lifecycleState: 'PUBLISHED',
                            specificContent: {
                                'com.linkedin.ugc.ShareContent': {
                                    shareCommentary: { text: content },
                                    shareMediaCategory: 'NONE'
                                }
                            },
                            visibility: {
                                'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'
                            }
                        };

                        const response = await fetch('https://api.linkedin.com/v2/ugcPosts', {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${channelConfig.token}`,
                                'Content-Type': 'application/json',
                                'X-Restli-Protocol-Version': '2.0.0'
                            },
                            body: JSON.stringify(ugcBody)
                        });

                        if (response.ok) {
                            const resJson = await response.json();
                            const postId = resJson.id || 'SUCCESS';
                            logString += `   ✅ Successfully posted to LINKEDIN (ugcPosts API)! Post URN: ${postId}\n\n`;
                            channelsPosted.push(channel);
                            success = true;
                        } else {
                            const errorText = await response.text();
                            throw new Error(`ugcPosts API returned ${response.status}: ${errorText}`);
                        }
                    } catch (err2) {
                        throw new Error(`Posts API failed (${errorMsg}) | ugcPosts also failed (${err2.message})`);
                    }
                }
            } catch(e) {
                console.error(`❌ LinkedIn Post Error:`, e.message);
                logString += `   ❌ Failed to post to LINKEDIN: ${e.message}\n\n`;
            }
        } else {
            // Simulating the API Call for other channels
            try {
                await new Promise(resolve => setTimeout(resolve, 800)); // Network delay simulation
                logString += `   ✅ Successfully posted to ${channel.toUpperCase()}! (Status 200) [SIMULATED]\n\n`;
                channelsPosted.push(channel);
            } catch(e) {
                logString += `   ❌ Failed to post to ${channel.toUpperCase()}: ${e.message}\n\n`;
            }
        }
    }

    logString += `🏁 Social Post Run Finished.\n`;

    // Save to Database
    const SocialPost = getSocialPost();
    const docData = {
        topic: settings.topic || 'Auto Post',
        title: settings.title || 'Scheduled Update',
        website_url: settings.website_url,
        content: generatedPosts,
        channels_posted: channelsPosted,
        status: enabledChannels.length === channelsPosted.length && enabledChannels.length > 0 ? 'Success' : 'Simulated',
        logs: logString
    };

    if (settings.companyId) {
        docData.companyId = settings.companyId;
    }
    if (settings.userId && mongoose.Types.ObjectId.isValid(settings.userId)) {
        docData.userId = new mongoose.Types.ObjectId(settings.userId);
    }

    const doc = await SocialPost.create(docData);

    return doc;
}

module.exports = { scrapeWebsite, generateSocialPosts, postToSocial };
