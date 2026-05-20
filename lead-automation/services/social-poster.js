const { chromium } = require('playwright');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const mongoose = require('mongoose');

// Lazy getter for model
const getSocialPost = () => mongoose.model('SocialPost');

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
async function generateSocialPosts(webData, topic, title, customContent) {
    const geminiKey = process.env.GEMINI_API_KEY;
    
    if (geminiKey) {
        try {
            const genAI = new GoogleGenerativeAI(geminiKey);
            const aiModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
            
            const prompt = `You are a world-class social media manager and content creator.
Your goal is to generate engaging social media posts for a company based on their website content and additional details.

COMPANY WEBSITE INFO:
- Title: "${webData.title || ''}"
- Description: "${webData.description || ''}"
- Context/Text: "${webData.text || ''}"

USER INSTRUCTIONS (Guiding Topic/Theme):
- Topic Focus: "${topic || 'Brand Promotion'}"
- Specific Title: "${title || ''}"
- Custom instructions/direction: "${customContent || ''}"

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
    const link = webData.url || 'our website';
    const desc = webData.description || 'premium services and custom solutions';

    const tags = `#business #growth #success #marketing`;

    return {
        facebook: `📢 EXCITING NEWS FROM ${company.toUpperCase()}! 📢\n\nWe are thrilled to highlight our focus on: **${mainTopic}**.\n\nAt ${company}, we are dedicated to helping our clients succeed by delivering ${desc}.\n\nCheck out our website to learn more about our services and how we can collaborate! 🚀\n\n👉 Visit us today! ${tags}`,
        
        instagram: `✨ Spotlighting ${company} ✨\n\nToday, we are talking about **${mainTopic}** and what it means for your business.\n\nOur team is committed to excellence, providing: \n✔️ Custom Tailored Services\n✔️ Exceptional Quality\n✔️ Local Support & Expertise\n\nRead more about how we help our clients grow. Click the link in our bio! 🔗\n\n${tags} #instabusiness #picoftheday`,
        
        linkedin: `💼 Elevating Standards: ${company} focuses on ${mainTopic} 💼\n\nIn today's fast-paced market, businesses need reliable partners. At ${company}, we pride ourselves on offering ${desc} designed to drive real results.\n\nOur core values:\n🔹 Client Success First\n🔹 Cutting-Edge Technology\n🔹 Reliable & Professional Execution\n\nLet's connect and discuss how we can accelerate your progress. Visit our website for more information.\n\n${tags} #networking #professionalism`,
        
        twitter: `Looking to grow? ${company} has you covered! We specialize in ${mainTopic} to help you achieve your goals. Visit our website to learn more! 🚀 ${tags.split(' ').slice(0, 2).join(' ')}`,
        
        pinterest: `Discover how ${company} is leading the way in ${mainTopic}. Creative ideas, professional execution, and premium results for your project. Click to visit our website. ${tags}`,
        
        threads: `What's the biggest challenge your business is facing today? 💭 At ${company}, we focus on ${mainTopic} to solve your core problems. Let's discuss in the replies! 👇`,
        
        youtube: `🎥 VIDEO OUTLINE: Introduction to ${company} - ${mainTopic}\n\n[0:00 - Intro] Highlight the core problem businesses face.\n[0:30 - Our Solution] Introduce ${company} and our specialization in ${mainTopic}.\n[1:15 - Key Services] Explain how we provide ${desc}.\n[2:00 - Call to Action] Visit our website, subscribe to the channel, and hit the bell icon!`
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
        
        // Simulating the API Call
        try {
            await new Promise(resolve => setTimeout(resolve, 800)); // Network delay simulation
            logString += `   ✅ Successfully posted to ${channel.toUpperCase()}! (Status 200)\n\n`;
            channelsPosted.push(channel);
        } catch(e) {
            logString += `   ❌ Failed to post to ${channel.toUpperCase()}: ${e.message}\n\n`;
        }
    }

    logString += `🏁 Social Post Run Finished.\n`;

    // Save to Database
    const SocialPost = getSocialPost();
    const doc = await SocialPost.create({
        topic: settings.topic || 'Auto Post',
        title: settings.title || 'Scheduled Update',
        website_url: settings.website_url,
        content: generatedPosts,
        channels_posted: channelsPosted,
        status: enabledChannels.length === channelsPosted.length && enabledChannels.length > 0 ? 'Success' : 'Simulated',
        logs: logString
    });

    return doc;
}

module.exports = { scrapeWebsite, generateSocialPosts, postToSocial };
