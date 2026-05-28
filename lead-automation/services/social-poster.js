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
        if (mongoose.Types.ObjectId.isValid(userId)) {
            query.userId = new mongoose.Types.ObjectId(userId);
        } else {
            query.userId = userId;
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
    const targetWebsite = options.websiteUrl || webData.url || "";

    const { companyId, userId } = options;
    const query = {};
    if (companyId) query.companyId = companyId;
    else if (userId) {
        if (mongoose.Types.ObjectId.isValid(userId)) {
            query.userId = new mongoose.Types.ObjectId(userId);
        } else {
            query.userId = userId;
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
            
            const prompt = `You are a world-class social media copywriter, viral marketing consultant, and expert content creator.
Your goal is to generate highly engaging, reaction-inducing, and viral social media posts for a company based on their website content, category topic, and guidelines.

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

CRITICAL RULES FOR VIRAL ENGAGEMENT & REACTION-INDUCING COPY:
You must strictly follow this value-first, high-engagement copywriting structure for all channels (adapted for character limits):

1. THE VIRAL HOOK (Line 1): Start with an extremely compelling, contrarian, shocking, or deeply relatable first line. 
   Examples: 
   - "I stopped doing [Common Practice] and my business grew by 300%."
   - "95% of founders make this outreach mistake (it cost us $10,000)."
   - "Here is the uncomfortable truth about [Industry Topic] that nobody wants to admit."
   NEVER start with generic self-promotion (e.g. do NOT say "We are excited to launch...", "At our company...", or "Check out...").

2. READABILITY & FORMATTING (The "LinkedIn Broetry" Style):
   - Use short, punchy, single-sentence paragraphs.
   - Leave a double line break after almost every sentence.
   - Keep sentences under 12 words. High readability on mobile screen is vital.
   - Use bullet points and emojis to break up text visually.

3. ACTIONABLE VALUE: Provide 3 high-impact, actionable tips, a checklist, or a simple "how-to" that teaches the reader something immediately useful without leaving the platform.

4. SOFT PITCH: Seamlessly tie the value back to the company's product/services as the ultimate automated way to save time/money or scale results.

5. ALGORITHM-BOOSTING COMMENT CTA: End the post with a thought-provoking, interactive question that practically forces readers to reply in the comments (drives the viral algorithm).
   Examples:
   - "What is your #1 strategy for this? Let me know in the comments."
   - "Have you faced this challenge too? Share below."
   - "Do you agree with this approach, or do you prefer the old way?"
   Followed by: "P.S. Learn how to automate this entire process here: ${targetWebsite}"

Generate customized posts for the following social media channels:
1. "facebook": Highly engaging, friendly/informal, uses emojis, lists value points with space breaks, ends with a soft pitch, comments CTA, and 3-5 hashtags.
2. "instagram": Visually descriptive, highly engaging hook, uses emojis, space breaks for readability, ends with a comments CTA + bio CTA, and 5-10 hashtags.
3. "linkedin": Professional, informative, business-oriented. Uses bullet points, structured spacing, professional tone, lists value/checklists, ends with a soft pitch, algorithm comment question, and 3-5 relevant hashtags.
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
- For "image_prompt", provide a highly detailed, professional visual description for an AI image generator representing the topic/theme of the posts (e.g. corporate modern scene, vector illustration of tech solutions, digital workflows, productivity boost). DO NOT include any text inside the image. Focus purely on visual descriptions.
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
                // Dynamically generate the Pollinations AI URL based on the parsed image_prompt
                const imagePrompt = parsed.image_prompt || `${topic || 'business'} ${title || 'solutions'} professional illustration graphic`;
                parsed.image_url = `https://image.pollinations.ai/prompt/${encodeURIComponent(imagePrompt)}?width=800&height=600&nologo=true&seed=${Math.floor(Math.random() * 100000)}`;

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
    
    // Pick the least-recently-used template index (0, 1, or 2)
    const t = await selectFallbackTemplateIndex(options.userId, options.companyId);
    console.log(`🤖 Social Poster: Selected fallback template index: ${t} (LRU)`);
    
    const fbTemplates = [
        `💡 Did you know? Most businesses lose 10–20% of their clients just because of delayed follow-ups or lack of clear online visibility.\n\nHere are 3 quick tips to solve this:\n1️⃣ Automate your first outreach step.\n2️⃣ Follow up within 5 minutes of a query.\n3️⃣ Always provide upfront educational value.\n\nAt ${company}, we help you solve this by delivering high-impact **${mainTopic}** and ${desc}.\n\n👉 Learn more and scale your business: ${targetLink} ${tags}`,
        `🔥 Want to build instant trust with your clients? Value-first outreach is the key. Try this checklist:\n✔️ Educate your leads instead of just hard selling.\n✔️ Share actionable checklists to show your expertise.\n✔️ Make access to your services simple and frictionless.\n\nWe specialize in custom **${mainTopic}** to make your operations seamless. Let's achieve your goals together!\n\n🔗 Visit us to learn how: ${targetLink} ${tags}`,
        `🚀 Scale smarter, not harder. If your outreach and social media are completely manual, you are losing closing time. Here is a 3-step audit for your operations:\n🔹 Use templates to keep your messaging consistent.\n🔹 Pre-schedule your postings so your brand stays active 24/7.\n🔹 Automate tracking for all responses.\n\nAt ${company}, we handle the heavy lifting for ${desc}. Let us take care of the automation so you can close more clients.\n\n👉 Get started: ${targetLink} ${tags}`
    ];

    const liTemplates = [
        `💼 Value-First Business Strategy: Help Before You Sell 💼\n\nIn today's B2B environment, clients don't want sales pitches—they want solutions. Here is a simple 3-step value checklist you can implement today:\n\n1️⃣ Share high-value industry tips rather than product features.\n2️⃣ Teach your prospects something that saves them time or money.\n3️⃣ Connect them to a reliable, automated platform when they are ready to scale.\n\nAt ${company}, we focus on **${mainTopic}** to deliver exactly these results for our partners.\n\nLet's connect or visit our site to see how we can assist: ${targetLink}\n\n${tags} #b2b #networking #automation`,
        `💡 Is your business struggling with response times or outreach consistency?\n\nStudies show that response rates drop by 391% if you wait more than 5 minutes to follow up. To fix this immediately:\n✔️ Implement automated template builders.\n✔️ Use CRM tools to centralize user queries.\n✔️ Outsource non-core data extraction.\n\nAt ${company}, we deliver custom ${desc} so your team never misses an opportunity.\n\n👉 Explore our services: ${targetLink}\n\n${tags} #productivity #businesssolutions`,
        `📈 Scaling your workflow requires a clear balance between strategy and automation.\n\nIf you want to optimize your marketing and sales outreach:\n🔹 Create educational content that answers client FAQs.\n🔹 Automate your posting schedule to keep engagement high.\n🔹 Base your campaigns on real data insights.\n\nWe help businesses achieve this with top-tier **${mainTopic}** and dedicated support.\n\n🔗 Let's collaborate: ${targetLink}\n\n${tags} #leadership #salespipeline`
    ];

    const twTemplates = [
        `Delayed follow-ups cost sales. Fix it in 3 steps:\n1. Automate initial contact\n2. Share value-first templates\n3. Track response rates\n\nAt ${company}, we specialize in ${mainTopic} to automate this workflow. Learn more! 🚀 ${targetLink} ${tags.split(' ').slice(0, 2).join(' ')}`,
        `Value-first content builds trust. Don't just sell—help your audience first, then introduce your services. ${company} handles your customized ${desc} so you can focus on growth. Check us out: ${targetLink} ⚡`,
        `Struggling to scale your outreach? Automate the process! Save time by scheduling updates & tracking leads. We build custom ${desc} & **${mainTopic}** to streamline your operations. 🔗 ${targetLink}`
    ];

    const igTemplates = [
        `✨ Spotlighting ${company}: Educate & Elevate ✨\n\nAre you struggling to convert outreach into active clients? Here is our 3-step checklist for high-conversion messaging:\n\n✔️ Offer a quick value hack immediately.\n✔️ Address a real pain point your client experiences daily.\n✔️ Introduce your solution as the ultimate time-saver.\n\nWe specialize in **${mainTopic}** to make this seamless for you. Tap the link in our bio to get started! 🔗\n\n${tags} #instabusiness #growthmindset`,
        `💡 Elevate your workflow with ${company}!\n\nManual lead tracking and inconsistent posting are the biggest bottlenecks for growing brands. Solve this today:\n1️⃣ Pre-schedule your postings.\n2️⃣ Sync your contacts automatically.\n3️⃣ Focus on helping your clients succeed first.\n\nWe provide custom ${desc} to make automation simple. Link in bio! 🚀\n\n${tags} #agencylife #b2b`,
        `🔥 Value-First Marketing works. Here's why:\n\nPeople buy from those they trust. Share tips, solve problems, and then offer your premium services. At ${company}, we deliver first-class **${mainTopic}** and custom ${desc} to help you build that trust.\n\nReady to transform your brand? Click the link in our bio! 📲\n\n${tags} #tech #solutions`
    ];

    const pinTemplates = [
        `How to get more customers by helping them first. Simple value-first marketing templates by ${company}. Discover our customized ${mainTopic} services. Click to visit! ${targetLink} ${tags}`,
        `3 steps to automate your outreach workflow. Stop wasting hours on manual tasks. We provide premium ${desc} to scale your brand. Pin this and visit our website: ${targetLink} ${tags}`,
        `Value-first copywriting ideas that close deals. Learn how ${company} helps you implement custom **${mainTopic}** to elevate your B2B sales. Click to read: ${targetLink} ${tags}`
    ];

    const thrTemplates = [
        `B2B sales tip: Don't start your outreach by asking for a call. Start by sharing a quick tip that solves an immediate problem. What's the #1 challenge you are facing in your business today? replies below! 👇 (Visit ${targetLink} to see how we help)`,
        `Are you still manually posting every day? 💭 You are losing valuable hours that could be spent closing deals. Schedule your posts, cycle your keywords, and provide value first. Let us know how you automate your work below! 👇`,
        `Help your audience, then pitch. Educate, then sell. That's the formula for high-converting marketing. At ${company}, we make automation around **${mainTopic}** simple. Share your thoughts or questions! 👇`
    ];

    const ytTemplates = [
        `🎥 VIDEO OUTLINE: Value-First Outreach that Actually Converts\n\n[0:00 - Hook] Why standard sales pitches fail immediately.\n[0:30 - Value] 3 tips to educate your prospects first.\n[1:15 - Pitch] How ${company} automates value-first outreach with ${mainTopic}.\n[2:00 - CTA] Visit ${targetLink} to get our templates and subscribe!`,
        `🎥 VIDEO OUTLINE: Automating Your Lead Flow & Social Postings\n\n[0:00] The hidden cost of manual outreach.\n[0:45] How ${company} helps you save 10+ hours a week via ${desc}.\n[1:30] Best practices for scheduled, value-first campaigns.\n[2:15] Outro: Visit ${targetLink} to start, and subscribe!`,
        `🎥 VIDEO OUTLINE: Value Hacks for B2B Growth\n\n[0:00] Finding the bottlenecks in your operations.\n[0:30] How our specialization in ${mainTopic} resolves these issues.\n[1:20] Giving value first to build long-term client relationships.\n[2:00] Call to action: Check the link in the description (${targetLink}) & subscribe!`
    ];

    const imagePrompt = `professional graphic illustration representing ${mainTopic} automation and business success`;
    const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(imagePrompt)}?width=800&height=600&nologo=true&seed=${Math.floor(Math.random() * 100000)}`;

    return {
        facebook: fbTemplates[t],
        linkedin: liTemplates[t],
        twitter: twTemplates[t],
        instagram: igTemplates[t],
        pinterest: pinTemplates[t],
        threads: thrTemplates[t],
        youtube: ytTemplates[t],
        image_prompt: imagePrompt,
        image_url: imageUrl
    };
}

// Simulate Posting to Enabled Channels
async function postToSocial(generatedPosts, settings) {
    // 2-minute double post cooldown check
    const SocialPost = getSocialPost();
    const query = {};
    if (settings.companyId) {
        query.companyId = settings.companyId;
    } else if (settings.userId) {
        if (mongoose.Types.ObjectId.isValid(settings.userId)) {
            query.userId = new mongoose.Types.ObjectId(settings.userId);
        } else {
            query.userId = settings.userId;
        }
    }

    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
    try {
        const recentDuplicate = await SocialPost.findOne({
            ...query,
            createdAt: { $gte: twoMinutesAgo },
            status: { $in: ['Success', 'Simulated'] }
        }).lean();
        if (recentDuplicate) {
            console.log(`⚠️ Social Poster: Concurrent run guard triggered. Post skipped to prevent double-posting.`);
            return recentDuplicate;
        }
    } catch (e) {
        console.error('Error checking duplicate posting cooldown:', e.message);
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

    // Save to Database
    const docData = {
        topic: settings.topic || 'Auto Post',
        title: settings.title || 'Scheduled Update',
        website_url: settings.website_url,
        content: generatedPosts,
        image_url: generatedPosts.image_url || '',
        image_prompt: generatedPosts.image_prompt || '',
        channels_posted: channelsPosted,
        status: enabledChannels.length === channelsPosted.length && enabledChannels.length > 0 ? 'Success' : 'Simulated',
        logs: logString
    };

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
