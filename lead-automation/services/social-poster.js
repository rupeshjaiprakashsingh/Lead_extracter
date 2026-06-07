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
                const name = data.name || (data.given_name && data.family_name ? `${data.given_name} ${data.family_name}` : '');
                return { urn: `urn:li:person:${data.sub}`, method: '/v2/userinfo', name };
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
                const name = (data.localizedFirstName && data.localizedLastName) 
                    ? `${data.localizedFirstName} ${data.localizedLastName}` 
                    : (data.localizedFirstName || '');
                return { urn: `urn:li:person:${data.id}`, method: '/v2/me', name };
            }
        }
    } catch(e) { /* ignore */ }

    return null;
}


// Upload image to LinkedIn using versioned or legacy API
async function uploadLinkedInImage(token, ownerUrn, imageUrl, isVersioned = true, apiVersion = '202605') {
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) {
        throw new Error(`Failed to fetch image from URL: ${imageUrl} (${imgRes.status})`);
    }
    const arrayBuffer = await imgRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (isVersioned) {
        const initRes = await fetch('https://api.linkedin.com/rest/images?action=initializeUpload', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'X-Restli-Protocol-Version': '2.0.0',
                'LinkedIn-Version': apiVersion
            },
            body: JSON.stringify({
                initializeUploadRequest: {
                    owner: ownerUrn
                }
            })
        });

        if (!initRes.ok) {
            const errText = await initRes.text();
            throw new Error(`initializeUpload failed (${initRes.status}): ${errText}`);
        }

        const data = await initRes.json();
        const uploadUrl = data.value.uploadUrl;
        const imageUrn = data.value.image;

        const uploadRes = await fetch(uploadUrl, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/octet-stream'
            },
            body: buffer
        });

        if (!uploadRes.ok) {
            const errText = await uploadRes.text();
            throw new Error(`Binary upload failed (${uploadRes.status}): ${errText}`);
        }

        return imageUrn;
    } else {
        const regRes = await fetch('https://api.linkedin.com/v2/assets?action=registerUpload', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'X-Restli-Protocol-Version': '2.0.0'
            },
            body: JSON.stringify({
                registerUploadRequest: {
                    recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
                    owner: ownerUrn,
                    relationshipType: 'OWNER'
                }
            })
        });

        if (!regRes.ok) {
            const errText = await regRes.text();
            throw new Error(`registerUpload failed (${regRes.status}): ${errText}`);
        }

        const data = await regRes.json();
        const uploadUrl = data.value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadMechanism'].uploadUrl;
        const assetUrn = data.value.asset;

        const uploadRes = await fetch(uploadUrl, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/octet-stream'
            },
            body: buffer
        });

        if (!uploadRes.ok) {
            const errText = await uploadRes.text();
            throw new Error(`Legacy binary upload failed (${uploadRes.status}): ${errText}`);
        }

        return assetUrn;
    }
}

// Select fallback template index in an LRU (least-recently-used) fashion over 30 days
async function selectFallbackTemplateIndex(userId, companyId) {
    const SocialPost = getSocialPost();
    const query = {};
    if (companyId) {
        query.companyId = companyId;
    } else if (userId) {
        const userIdStr = userId.toString();
        if (mongoose.Types.ObjectId.isValid(userIdStr)) {
            query.$or = [
                { userId: userIdStr },
                { userId: new mongoose.Types.ObjectId(userIdStr) }
            ];
        } else {
            query.userId = userIdStr;
        }
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    try {
        const posts = await SocialPost.find({
            ...query,
            createdAt: { $gte: thirtyDaysAgo }
        }).sort({ createdAt: -1 }).lean();

        const lastUsed = { 0: null, 1: null, 2: null };

        for (const post of posts) {
            const liText = post.content?.linkedin || '';
            if (!liText) continue;

            let indexMatched = -1;
            if (liText.includes("Value-First Business Strategy")) {
                indexMatched = 0;
            } else if (liText.includes("response times") || liText.includes("response rates")) {
                indexMatched = 1;
            } else if (liText.includes("Scaling your workflow") || liText.includes("balance between strategy")) {
                indexMatched = 2;
            }

            if (indexMatched !== -1 && lastUsed[indexMatched] === null) {
                lastUsed[indexMatched] = post.createdAt;
            }
        }

        const unused = [0, 1, 2].filter(idx => lastUsed[idx] === null);
        if (unused.length > 0) {
            return unused[0];
        }

        let bestIndex = 0;
        let oldestTime = lastUsed[0];
        for (let i = 1; i <= 2; i++) {
            if (lastUsed[i] < oldestTime) {
                oldestTime = lastUsed[i];
                bestIndex = i;
            }
        }

        return bestIndex;
    } catch (err) {
        console.error('Error selecting fallback template index:', err.message);
        return Math.floor(Math.random() * 3);
    }
}

// Check if new post is too similar to any post from last 30 days
function isDuplicatePost(newText, recentPosts) {
    if (!newText || !recentPosts || recentPosts.length === 0) return false;
    const cleanNew = newText.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const post of recentPosts) {
        const existingText = post.content?.linkedin || '';
        if (!existingText) continue;
        const cleanExisting = existingText.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (cleanNew === cleanExisting) return true;
        if (cleanNew.substring(0, 100) === cleanExisting.substring(0, 100)) return true;
    }
    return false;
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
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout
    try {
        const res = await fetch(targetUrl, {
            signal: controller.signal,
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' 
            }
        });
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
    } finally {
        clearTimeout(timeoutId);
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
    const targetWebsite = options.websiteUrl || webData.url || "";

    const { companyId, userId } = options;
    const query = {};
    if (companyId) query.companyId = companyId;
    else if (userId) {
        const userIdStr = userId.toString();
        if (mongoose.Types.ObjectId.isValid(userIdStr)) {
            query.$or = [
                { userId: userIdStr },
                { userId: new mongoose.Types.ObjectId(userIdStr) }
            ];
        } else {
            query.userId = userIdStr;
        }
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    let recentPosts30Days = [];
    let recentPostsText = "";
    try {
        if (companyId || userId) {
            const SocialPost = getSocialPost();
            recentPosts30Days = await SocialPost.find({
                ...query,
                createdAt: { $gte: thirtyDaysAgo }
            }).sort({ createdAt: -1 }).lean();

            if (recentPosts30Days && recentPosts30Days.length > 0) {
                recentPostsText = recentPosts30Days.slice(0, 5).map((p, idx) => {
                    return `Post ${idx + 1}:\n- LinkedIn: "${p.content?.linkedin || ''}"\n- Facebook: "${p.content?.facebook || ''}"\n- Twitter: "${p.content?.twitter || ''}"`;
                }).join("\n\n");
            }
        }
    } catch (e) {
        console.error('Error fetching recent posts for prompt variation & duplicate check:', e.message);
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
            
            const prompt = `You are a world-class social media copywriter, B2B viral marketing consultant, and expert content creator.
Your goal is to generate highly engaging, reaction-inducing, and extremely informative social media posts for a company based on their website content, category topic, and guidelines.

COMPANY WEBSITE INFO:
- Title: "${webData.title || ''}"
- Description: "${webData.description || ''}"
- Context/Text: "${webData.text || ''}"
- Target Website URL / Product Link: "${targetWebsite}"

USER INSTRUCTIONS (Guiding Topic/Theme):
- Topic Focus: "${topic || 'Brand Promotion'}"
- Specific Title/Category Name: "${title || ''}"
- Custom instructions/direction: "${customContent || ''}"

SPECIFIC POST ANGLE/STYLE FOR THIS RUN (Focus on this style to ensure variety):
- Style Focus: ${randomAngle}

${recentPostsText ? `AVOID REPETITION: Here are the texts of our recently published posts. DO NOT repeat the same concepts, hooks, phrasing, or structures:
${recentPostsText}
` : ''}

CRITICAL RULES FOR B2B ENGAGEMENT, TARGETING & INFORMATIVE COPY:
You must strictly follow this value-first, high-engagement, detailed copywriting structure for all channels:

1. THE TARGETED VIRAL HOOK (Line 1): Start with an extremely compelling, direct first line that specifically addresses or targets CEOs, CTOs, and Management.
   Examples of hook style:
   - "Attention: All CEOs, CTOs, and operations management — read this before sending another sales campaign."
   - "Why 95% of CEOs and founders are failing at B2B lead generation (and the simple operational fix)."
   - "Dear CTOs and technical management: Stop wasting engineering bandwidth building custom scraper scripts."
   - "The B2B outreach strategy that top-performing CEOs use to double their meeting booking rates."
   NEVER start with generic self-promotion (e.g. do NOT say "We are excited to launch...", "At our company...", or "Check out...").

2. READABILITY & FORMATTING:
   - Use short, punchy paragraphs.
   - Leave a double line break after almost every sentence.
   - Keep sentences highly readable, using bullet points and emojis to break up text visually.

3. HIGHLY DETAILED & ACTIONABLE VALUE:
   - Do NOT write generic or brief tips. Provide deep, comprehensive, and highly informative advice (3 detailed tips, a checklist, or a step-by-step technical guide) that teaches the reader something immediately useful.
   - Explain the "how" and "why" behind each tip so the post has real, professional-grade depth.

4. SOFT PITCH: Seamlessly tie the value back to the company's product/services as the ultimate automated way to save time/money or scale results.

5. ALGORITHM-BOOSTING COMMENT CTA: End the post with a thought-provoking, interactive question that practically forces readers to reply in the comments (drives the viral algorithm).
   Followed by: "P.S. Learn how to automate this entire process here: ${targetWebsite}"

Generate customized posts for the following social media channels:
1. "facebook": Highly engaging, friendly/informal, uses emojis, lists value points with space breaks, ends with a soft pitch, comments CTA, and 3-5 hashtags.
2. "instagram": Visually descriptive, highly engaging hook, uses emojis, space breaks for readability, ends with a comments CTA + bio CTA, and 5-10 hashtags.
3. "linkedin": Professional, highly informative, business-oriented. Uses bullet points, structured spacing, professional tone, lists detailed value/checklists, ends with a soft pitch, algorithm comment question, and 3-5 relevant hashtags.
4. "twitter": Short, punchy, under 280 characters, starts with a value hook, ends with a short pitch & CTA/link: "${targetWebsite}".
5. "pinterest": Highly descriptive, uses search-friendly keywords, lists tips, includes a clear call to action pointing to the link.
6. "threads": Conversational, interactive, invites comments, value-first, under 500 characters.
7. "youtube": A short video script outline or video description (100-200 words), uses keywords, structured as Hook -> Tips -> Pitch -> CTA to subscribe & visit the link.

Strict Rules:
- Return ONLY a valid JSON object matching this schema. Do not include markdown code block formatting (like \`\`\`json). Just the raw JSON string:
{
  "facebook": "string",
  "instagram": "string",
  "linkedin": "string",
  "twitter": "string",
  "pinterest": "string",
  "threads": "string",
  "youtube": "string",
  "image_prompt": "string"
}
- For "image_prompt", generate a highly descriptive prompt for an AI image generator (like DALL-E/Midjourney) to create an image strictly related to the post topic (e.g. "realistic photo of a professional workspace with a laptop..."). Do NOT leave it empty.
- Ensure strings are properly escaped for valid JSON.`;

            let parsed = null;
            let retryCount = 0;
            const maxRetries = 3;
            let duplicateWarning = "";

            while (retryCount < maxRetries) {
                const finalPrompt = prompt + (duplicateWarning ? `\n\n${duplicateWarning}` : "");
                const result = await aiModel.generateContent({
                    contents: [{ role: 'user', parts: [{ text: finalPrompt }] }],
                    generationConfig: { responseMimeType: 'application/json' }
                });
                
                const rawText = result.response.text().trim();
                parsed = JSON.parse(rawText);

                const liPostText = parsed.linkedin || '';
                if (isDuplicatePost(liPostText, recentPosts30Days)) {
                    retryCount++;
                    console.warn(`⚠️ Social Poster: Gemini generated a duplicate LinkedIn post (Retry ${retryCount}/${maxRetries}): "${liPostText.substring(0, 50)}..."`);
                    duplicateWarning = `WARNING: The last generated LinkedIn post was: "${liPostText}". This is a duplicate of a post published in the last 30 days. You MUST write a completely new, uniquely phrased post. Do NOT reuse the same hooks, phrasing, or bullet points.`;
                } else {
                    break;
                }
            }

            if (parsed && !isDuplicatePost(parsed.linkedin || '', recentPosts30Days)) {
                // Fetch settings to check options like gen_images
                let settings = null;
                try {
                    const SocialSettings = mongoose.model('SocialSettings');
                    settings = await SocialSettings.findOne(query).lean();
                } catch(e) {}

                // Add image URL from prompt
                const shouldGenImage = settings ? (settings.gen_images !== false) : true;
                if (shouldGenImage && parsed.image_prompt) {
                    parsed.image_url = `https://image.pollinations.ai/prompt/${encodeURIComponent(parsed.image_prompt)}?width=800&height=600&nologo=true&seed=${Math.floor(Math.random() * 100000)}`;
                } else {
                    parsed.image_url = '';
                }

                return parsed;
            } else {
                console.warn(`⚠️ Social Poster: All AI retries returned duplicates. Falling back to LRU templates...`);
            }
        } catch (e) {
            console.error('❌ Gemini social generation failed, using fallback:', e.message);
        }
    }

    // Heuristic Fallback
    console.log('🤖 Social Poster: Using fallback content generator...');
    return await buildFallbackPosts(webData, topic, title, customContent, targetWebsite, options);
}

// Build fallback posts when Gemini is not available
async function buildFallbackPosts(webData, topic, title, customContent, websiteUrl = "", options = {}) {
    const company = title || webData.title || 'Our Company';
    const mainTopic = topic || 'Innovation & Excellence';
    const desc = webData.description || 'premium services and custom solutions';
    const targetLink = websiteUrl || 'our website';

    const tags = `#business #growth #success #marketing`;

    // Query SocialPost count to determine combinations
    const SocialPost = getSocialPost();
    const query = {};
    if (options.companyId) {
        query.companyId = options.companyId;
    } else if (options.userId) {
        const userIdStr = options.userId.toString();
        if (mongoose.Types.ObjectId.isValid(userIdStr)) {
            query.$or = [
                { userId: userIdStr },
                { userId: new mongoose.Types.ObjectId(userIdStr) }
            ];
        } else {
            query.userId = userIdStr;
        }
    }

    const hooks = [
        `Attention: All CEOs, CTOs, and management team members — read this before sending your next cold outreach campaign.`,
        `Why 95% of CEOs and founders are failing at B2B lead generation (and how to fix it).`,
        `Dear CTOs and technical management: Stop wasting engineering hours building custom scraper scripts.`,
        `The B2B outreach strategy that top-performing CEOs are using to double their meeting booking rates.`,
        `A message to all operations management: Manual lead tracking is killing your team's productivity.`,
        `How smart CEOs structure their CRM and WhatsApp automations to scale without adding headcount.`,
        `What every CTO needs to know about API limits and deliverability when scaling client outreach.`,
        `The simple value-first outreach blueprint that B2B management teams are using to build instant trust.`,
        `Why cold pitches fail and how modern management is pivoting to educational, tip-based outreach.`,
        `Operations audit: How top management teams eliminate outreach consistency issues using scheduling.`
    ];

    const bodies = [
        `Here is a detailed 3-step action plan to optimize your client acquisition:
1️⃣ Implement Multi-Channel Data Extraction: Instead of manually copying leads, extract high-intent prospects from Google Maps and LinkedIn automatically to build a structured database of targeted leads.
2️⃣ Deploy WhatsApp & Email Hyper-Personalization: Personalize your outreach at scale. Use dynamic variables (Business Name, City, Industry Rating, and specific local insights) to ensure every message feels uniquely researched.
3️⃣ Leverage Automated Multi-Step Follow-ups: Establish automated follow-up sequences within 24-48 hours. Consistent follow-ups can increase response rates by over 150% compared to a single touchpoint.`,

        `Here is a technical guide for CTOs and operations management to scale outreach safely:
🔹 Establish Dedicated Outreach Domains: Protect your main corporate domain by setting up secondary domains specifically for B2B email outreach. This safeguards your domain authority and email deliverability.
🔹 Warm Up New IP/Sender Addresses: Gradually increase your sending limits over 2-4 weeks to establish positive sender reputation with major ESPs (Google, Outlook, etc.).
🔹 Monitor Real-time Verification & Bounce Rates: Automatically filter out invalid emails and inactive phone numbers before launching campaigns to keep your bounce rates strictly below 2%.`,

        `Here is the Value-First Outreach Blueprint to build instant B2B trust:
1️⃣ Offer an Upfront Audit: Instead of asking for a sales meeting, offer a quick free review of their public profile, website load times, or business listings. This shows immediate value.
2️⃣ Share a Frictionless Checklist: Provide a simple, 5-point industry-specific PDF or guide that they can implement immediately to see results without spending money.
3️⃣ Connect the Solution to Automation: Once trust is established, introduce how your platform can automate and scale these results with zero manual effort.`,

        `To improve your client acquisition pipeline and eliminate outreach consistency issues:
🔹 Build a Centralized Leads CRM: Store all potential client data in a single unified dashboard, categorizing leads as Hot, Warm, or Cold based on rating and responsiveness.
🔹 Schedule Dynamic Batches: Stagger your outreach sending times (e.g. 10:00 AM and 4:00 PM) to align with when business owners and management are most likely to check their messages.
🔹 Sync Client Contacts Automatically: Use secure OAuth integrations to sync leads directly to your workspace, saving hours of manual data entry for your sales team.`,

        `Here is the ultimate workflow checklist for high-converting B2B outreach:
✔️ Personalized hooks targeting specific local pain points.
✔️ Educational tips offering immediate solutions.
✔️ Clear, low-friction call-to-actions (CTAs) directing to a helpful landing page.
✔️ Automated follow-up triggers linked directly to response tracking.`
    ];

    const pitches = [
        `At ${company}, we help you solve this by delivering high-impact **${mainTopic}** and ${desc}.`,
        `We specialize in custom **${mainTopic}** to make your operations seamless and successful.`,
        `At ${company}, we handle the heavy lifting for ${desc} so you can focus on closing deals.`,
        `Our team focuses on **${mainTopic}** to deliver exactly these results for our partners.`,
        `At ${company}, we deliver custom ${desc} so your team never misses an opportunity.`,
        `We help businesses achieve this with top-tier **${mainTopic}** and dedicated support.`,
        `At ${company}, we make it easy to streamline ${desc} and accelerate growth.`,
        `Our custom solutions in **${mainTopic}** are designed to put your outreach on autopilot.`,
        `We help you automate the busywork of ${desc} so you can scale efficiently.`,
        `Partner with ${company} to integrate modern **${mainTopic}** into your daily stack.`
    ];

    const ctas = [
        `What is your #1 strategy for this? Let me know in the comments below! 👇\n\nP.S. Learn how to automate this: ${targetLink}`,
        `Have you faced this outreach challenge too? Share your thoughts below! 👇\n\n🔗 Get started: ${targetLink}`,
        `Do you agree with this approach, or do you prefer the old way? Let's discuss! 👇\n\n👉 Details: ${targetLink}`,
        `What is the biggest bottleneck in your business right now? Comment below! 👇\n\n🔗 Visit us to learn how: ${targetLink}`,
        `How do you handle follow-ups? Share your tips in the comments! 👇\n\n👉 Explore our services: ${targetLink}`,
        `Would this save your team time? Let's talk in the replies! 👇\n\n🔗 Let's collaborate: ${targetLink}`,
        `What's your go-to outreach channel? Share below! 👇\n\n👉 Learn more: ${targetLink}`,
        `Agree or disagree? I'd love to hear your perspective! 👇\n\n🔗 Check it out: ${targetLink}`,
        `How much time does your team spend on manual tasks? Comment below! 👇\n\n👉 Start now: ${targetLink}`,
        `Ready to transform your brand? Let me know in the comments! 👇\n\n🔗 Visit: ${targetLink}`
    ];

    const count = await SocialPost.countDocuments(query).catch(() => 0);

    const hookIdx = count % hooks.length;
    const bodyIdx = count % bodies.length;
    const pitchIdx = count % pitches.length;
    const ctaIdx = count % ctas.length;

    const hook = hooks[hookIdx];
    const body = bodies[bodyIdx];
    const pitch = pitches[pitchIdx];
    const cta = ctas[ctaIdx];

    // Build specific contents
    const facebook = `💡 ${hook}\n\n${body}\n\n${pitch}\n\n${cta}\n\n${tags}`;
    const linkedin = `💼 ${hook}\n\n${body}\n\n${pitch}\n\n${cta}\n\n${tags} #b2b #networking #automation`;
    const instagram = `✨ ${hook} ✨\n\n${body}\n\n${pitch}\n\nTap the link in our bio to get started! 🔗\n\n${cta}\n\n${tags} #instabusiness #growthmindset`;
    
    let twitter = `${hook}\n\n${body.substring(0, 100)}...\n\n🔗 ${targetLink}`;
    if (twitter.length > 275) {
        twitter = `${hook.substring(0, 120)}\n\n💡 Automate it with ${company}!\n\n🔗 ${targetLink}`;
    }

    const pinterest = `How to: ${hook}\n\n${body}\n\nDiscover how ${company} helps you implement custom solutions. Click to visit: ${targetLink} ${tags}`;
    
    let threads = `${hook}\n\n${body.substring(0, 180)}...\n\n${cta.substring(0, 150)}`;
    if (threads.length > 490) {
        threads = `${hook}\n\n${cta.substring(0, 200)}`;
    }

    const youtube = `🎥 VIDEO OUTLINE: ${hook}\n\n[0:00 - Hook] ${hook}\n\n[0:30 - Value] Tips/Checklist:\n${body}\n\n[1:15 - Pitch] ${pitch}\n\n[2:00 - CTA] ${cta} (Subscribe & visit the link!)`;

    let settings = null;
    try {
        const SocialSettings = mongoose.model('SocialSettings');
        settings = await SocialSettings.findOne(query).lean();
    } catch(e) {}

    // Forced false to remove images for now per user request
    const shouldGenImage = false;
    const imagePrompt = '';
    let imageUrl = '';

    return {
        facebook,
        linkedin,
        twitter,
        instagram,
        pinterest,
        threads,
        youtube,
        image_prompt: imagePrompt,
        image_url: imageUrl
    };
}

// Simulate Posting to Enabled Channels
async function postToSocial(generatedPosts, settings, retryPostId = null) {
    // Stagger concurrent runs to prevent race conditions across server instances
    const delayMs = 200 + Math.floor(Math.random() * 1800);
    await new Promise(resolve => setTimeout(resolve, delayMs));

    // 2-minute double post cooldown check
    const SocialPost = getSocialPost();
    const query = {};
    if (settings.companyId) {
        query.companyId = settings.companyId;
    } else if (settings.userId) {
        const userIdStr = settings.userId.toString();
        if (mongoose.Types.ObjectId.isValid(userIdStr)) {
            query.$or = [
                { userId: userIdStr },
                { userId: new mongoose.Types.ObjectId(userIdStr) }
            ];
        } else {
            query.userId = userIdStr;
        }
    }

    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
    try {
        const recentDuplicate = await SocialPost.findOne({
            ...query,
            createdAt: { $gte: twoMinutesAgo },
            status: { $in: ['Pending', 'Success', 'Simulated'] }
        }).lean();
        if (recentDuplicate) {
            console.log(`⚠️ Social Poster: Concurrent run guard triggered. Post skipped to prevent double-posting.`);
            return recentDuplicate;
        }
    } catch (e) {
        console.error('Error checking duplicate posting cooldown:', e.message);
    }

    // Create a pending lock document immediately to block concurrent server processes
    let pendingDoc;
    try {
        const pendingData = {
            topic: settings.topic || 'Auto Post',
            title: settings.title || 'Scheduled Update',
            website_url: settings.website_url,
            content: generatedPosts,
            image_url: generatedPosts.image_url || '',
            image_prompt: generatedPosts.image_prompt || '',
            channels_posted: [],
            status: 'Pending',
            logs: 'Posting in progress...'
        };
        if (settings.companyId) pendingData.companyId = settings.companyId;
        if (settings.userId) {
            if (mongoose.Types.ObjectId.isValid(settings.userId)) {
                pendingData.userId = new mongoose.Types.ObjectId(settings.userId);
            } else {
                pendingData.userId = settings.userId;
            }
        }
        pendingDoc = await SocialPost.create(pendingData);
    } catch (e) {
        console.error('Error creating pending lock document:', e.message);
    }

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
        if (channel === 'linkedin' && channelConfig.token && !channelConfig.token.toUpperCase().startsWith('MOCK')) {
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

                // Try uploading image if image_url is present
                let imageUrnVersioned = null;
                let imageUrnLegacy = null;
                const imageUrl = generatedPosts.image_url;

                if (imageUrl) {
                    logString += `   [LinkedIn] Attempting to upload image: ${imageUrl} ...\n`;
                    try {
                        imageUrnVersioned = await uploadLinkedInImage(channelConfig.token, finalUrn, imageUrl, true);
                        logString += `   [LinkedIn] Image uploaded successfully (versioned): ${imageUrnVersioned}\n`;
                    } catch (imgErr) {
                        logString += `   ⚠️ Versioned image upload failed: ${imgErr.message}. Trying legacy upload...\n`;
                        try {
                            imageUrnLegacy = await uploadLinkedInImage(channelConfig.token, finalUrn, imageUrl, false);
                            logString += `   [LinkedIn] Image uploaded successfully (legacy): ${imageUrnLegacy}\n`;
                        } catch (legacyImgErr) {
                            logString += `   ⚠️ Legacy image upload also failed: ${legacyImgErr.message}. Proceeding without image.\n`;
                        }
                    }
                }

                // ── Step 2a: Try new versioned Posts API (/rest/posts) ─────
                try {
                    const postPayload = {
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
                    };
                    if (imageUrnVersioned) {
                        postPayload.content = {
                            media: {
                                id: imageUrnVersioned
                            }
                        };
                    }

                    const response = await fetch('https://api.linkedin.com/rest/posts', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${channelConfig.token}`,
                            'Content-Type': 'application/json',
                            'X-Restli-Protocol-Version': '2.0.0',
                            'LinkedIn-Version': '202605'
                        },
                        body: JSON.stringify(postPayload)
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
                                    shareMediaCategory: imageUrnLegacy ? 'IMAGE' : 'NONE'
                                }
                            },
                            visibility: {
                                'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'
                            }
                        };
                        if (imageUrnLegacy) {
                            ugcBody.specificContent['com.linkedin.ugc.ShareContent'].media = [
                                {
                                    status: 'READY',
                                    description: { text: settings.title || 'Social Post Image' },
                                    media: imageUrnLegacy,
                                    title: { text: settings.topic || 'Social Post' }
                                }
                            ];
                        }

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

    let finalStatus = 'Simulated';
    if (enabledChannels.length > 0) {
        if (channelsPosted.length === enabledChannels.length) {
            finalStatus = 'Success';
        } else if (channelsPosted.length === 0) {
            finalStatus = 'Failed';
        } else {
            finalStatus = 'Partial Success';
        }
    }
    
    // If we failed, calculate next_retry_at (30 mins from now)
    let nextRetryAt = null;
    let newRetryCount = 0;
    if (finalStatus === 'Failed') {
        const now = new Date();
        now.setMinutes(now.getMinutes() + 30);
        nextRetryAt = now;
        
        if (retryPostId) {
            // Retrieve existing retry count
            try {
                const existing = await SocialPost.findById(retryPostId).lean();
                if (existing && existing.retry_count) {
                    newRetryCount = existing.retry_count + 1;
                } else {
                    newRetryCount = 1;
                }
            } catch (e) {}
        } else {
            newRetryCount = 1;
        }
    }

    if (pendingDoc) {
        try {
            const updateFields = {
                channels_posted: channelsPosted,
                status: finalStatus,
                logs: logString
            };
            if (finalStatus === 'Failed') {
                updateFields.retry_count = newRetryCount;
                updateFields.next_retry_at = nextRetryAt;
            }
            
            await SocialPost.findByIdAndUpdate(pendingDoc._id, { $set: updateFields });
            return await SocialPost.findById(pendingDoc._id);
        } catch (e) {
            console.error('Error updating pending lock document:', e.message);
        }
    }

    // Fallback if pendingDoc creation/update failed
    const docData = {
        topic: settings.topic || 'Auto Post',
        title: settings.title || 'Scheduled Update',
        website_url: settings.website_url,
        content: generatedPosts,
        image_url: generatedPosts.image_url || '',
        image_prompt: generatedPosts.image_prompt || '',
        channels_posted: channelsPosted,
        status: finalStatus,
        logs: logString
    };
    
    if (finalStatus === 'Failed') {
        docData.retry_count = newRetryCount;
        docData.next_retry_at = nextRetryAt;
    }

    if (settings.companyId) {
        docData.companyId = settings.companyId;
    }
    if (settings.userId) {
        if (mongoose.Types.ObjectId.isValid(settings.userId)) {
            docData.userId = new mongoose.Types.ObjectId(settings.userId);
        } else {
            docData.userId = settings.userId;
        }
    }

    const doc = await SocialPost.create(docData);
    return doc;
}

module.exports = { scrapeWebsite, generateSocialPosts, postToSocial, isPersonalProfile, formatOrganizationUrn, fetchLinkedInPersonUrn };
