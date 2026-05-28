/**
 * post-linkedin-now.js
 * Direct LinkedIn personal-profile poster — bypasses server/cache entirely.
 * Run: node scratch/post-linkedin-now.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) { console.error('❌ No MONGO_URI in .env'); process.exit(1); }

// ── Step 1: Fetch person URN from LinkedIn API ─────────────────────────────
async function fetchPersonUrn(token) {
    // Try /v2/userinfo (OpenID Connect — works with newer tokens)
    try {
        const r = await fetch('https://api.linkedin.com/v2/userinfo', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (r.ok) {
            const d = await r.json();
            if (d.sub) {
                console.log(`   ✅ Got person ID from /v2/userinfo: ${d.sub}`);
                return `urn:li:person:${d.sub}`;
            }
        } else {
            const t = await r.text();
            console.log(`   ⚠️  /v2/userinfo returned ${r.status}: ${t}`);
        }
    } catch (e) { console.log(`   ⚠️  /v2/userinfo error: ${e.message}`); }

    // Try /v2/me (older scope)
    try {
        const r = await fetch('https://api.linkedin.com/v2/me', {
            headers: {
                'Authorization': `Bearer ${token}`,
                'X-Restli-Protocol-Version': '2.0.0'
            }
        });
        if (r.ok) {
            const d = await r.json();
            if (d.id) {
                console.log(`   ✅ Got person ID from /v2/me: ${d.id}`);
                return `urn:li:person:${d.id}`;
            }
        } else {
            const t = await r.text();
            console.log(`   ⚠️  /v2/me returned ${r.status}: ${t}`);
        }
    } catch (e) { console.log(`   ⚠️  /v2/me error: ${e.message}`); }

    return null;
}

// ── Step 2: Post content to LinkedIn ──────────────────────────────────────
async function postToLinkedIn(token, authorUrn, content) {
    console.log(`\n   📤 Posting as: ${authorUrn}`);
    console.log(`   📝 Content preview: ${content.substring(0, 100)}...\n`);

    // Try new Posts API first
    try {
        const r = await fetch('https://api.linkedin.com/rest/posts', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'X-Restli-Protocol-Version': '2.0.0',
                'LinkedIn-Version': '202404'
            },
            body: JSON.stringify({
                author: authorUrn,
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

        if (r.ok) {
            const postId = r.headers.get('x-restli-id') || 'SUCCESS';
            console.log(`   ✅ Posted via REST Posts API! Post URN: ${postId}`);
            return { success: true, method: 'rest/posts', postId };
        } else {
            const errText = await r.text();
            console.log(`   ⚠️  REST Posts API failed (${r.status}): ${errText}`);
            console.log(`   🔄  Trying legacy ugcPosts API...`);
        }
    } catch (e) {
        console.log(`   ⚠️  REST Posts API error: ${e.message}`);
    }

    // Fallback: ugcPosts API
    try {
        const r = await fetch('https://api.linkedin.com/v2/ugcPosts', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'X-Restli-Protocol-Version': '2.0.0'
            },
            body: JSON.stringify({
                author: authorUrn,
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
            })
        });

        if (r.ok) {
            const data = await r.json();
            console.log(`   ✅ Posted via ugcPosts API! Post ID: ${data.id}`);
            return { success: true, method: 'ugcPosts', postId: data.id };
        } else {
            const errText = await r.text();
            console.log(`   ❌ ugcPosts also failed (${r.status}): ${errText}`);
            return { success: false, error: errText };
        }
    } catch (e) {
        console.log(`   ❌ ugcPosts error: ${e.message}`);
        return { success: false, error: e.message };
    }
}

// ── Sample post content (varied each run) ─────────────────────────────────
function buildPost() {
    const angles = [
        `🚀 Is your business invisible on Google?\n\nMost local businesses in Delhi lose 30–50 enquiries every month simply because they don't rank when customers search.\n\nAt Innvoque Solutions, we've helped 200+ businesses go from invisible to #1 on Google Maps — getting 20–40 new enquiries every month.\n\nWhat we do:\n✅ Google Business Profile Optimization\n✅ Local SEO & Website\n✅ Review Generation\n✅ Google Ads\n\nWant to see how many leads your business is missing? Drop a comment or DM me for a FREE audit. 👇\n\n#LocalSEO #GoogleMyBusiness #DigitalMarketing #Delhi #BusinessGrowth #InnvoqueSolutions`,

        `💡 Why do some local businesses get 40+ calls from Google every month while others get zero?\n\nIt's not luck. It's strategy.\n\nHere's what top-ranking businesses do differently:\n🔹 Their Google Business Profile is 100% complete & active\n🔹 They have consistent 5-star reviews coming in every week\n🔹 Their website is fast, mobile-friendly & SEO-optimized\n🔹 They show up in the TOP 3 of Google Maps\n\nAt Innvoque Solutions, we build this entire system for local businesses in Delhi.\n\nBook a FREE 10-minute call this week — I'll show you exactly what's holding your business back. 📞\n\n#LocalBusiness #SEO #GoogleRanking #Delhi #LeadGeneration #InnvoqueSolutions`,

        `📈 Real results we delivered for a CA firm in Delhi:\n\n❌ Before: 3–4 calls/week from Google, no website, invisible on Maps\n✅ After (90 days): 15–20 calls/day, top 3 on Google Maps, professional website live\n\nWhat changed?\n→ Google Business Profile fully optimized\n→ Local SEO strategy implemented\n→ Review generation campaign running\n→ Mobile-friendly website launched\n\nThis isn't magic — it's a proven system.\n\nIf you run a local business in Delhi and want more customers from Google, let's talk. DM me or drop a comment 👇\n\n#CaseStudy #LocalSEO #GoogleBusiness #Delhi #DigitalGrowth #InnvoqueSolutions`,

        `🎯 3 things costing your business customers RIGHT NOW:\n\n1️⃣ Your Google Business Profile is incomplete or outdated\n2️⃣ You have fewer than 10 Google reviews (or no response to existing ones)\n3️⃣ Your website isn't mobile-friendly or doesn't rank on Google\n\nEach of these is silently sending potential customers to your competitors.\n\nAt Innvoque Solutions, we fix all three — and help local businesses in Delhi get 20–40 new enquiries per month from Google.\n\nInterested in a FREE business visibility audit? Comment "AUDIT" below or send me a DM 🚀\n\n#GoogleSEO #LocalMarketing #BusinessGrowth #Delhi #DigitalMarketing #InnvoqueSolutions`,

        `🏆 If you own a local business in Delhi, here's the truth:\n\nYour competitors are spending money to appear on Google — and they're taking YOUR customers.\n\nThe good news? It's not too late. With the right strategy:\n• Google Maps ranking → more calls & walk-ins\n• Optimized Google Business Profile → more trust\n• Professional website → more conversions\n• Active reviews → more credibility\n\nThis is exactly what Innvoque Solutions does for Finance, Healthcare, Restaurants, Retail & Service businesses across Delhi.\n\nLet's get your business to the top. 💪 Message me for a FREE consultation.\n\n#LocalSEO #GoogleBusiness #Delhi #MarketingStrategy #BusinessOwner #InnvoqueSolutions`
    ];

    // Pick one based on minute of day so each post is different
    const idx = new Date().getMinutes() % angles.length;
    return angles[idx];
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
    console.log('\n╔════════════════════════════════════════════════════╗');
    console.log('║   LinkedIn Direct Post — Personal Profile Mode    ║');
    console.log('╚════════════════════════════════════════════════════╝\n');

    // Connect to MongoDB
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('   ✅ Connected!\n');

    // Load SocialSettings (any document with linkedin enabled & token)
    const rawSettings = await mongoose.connection.db
        .collection('socialsettings')
        .findOne({ 'channels.linkedin.enabled': true });

    if (!rawSettings) {
        console.log('❌ No enabled LinkedIn settings found in database.');
        console.log('   → Go to Social Poster → Settings → Enable LinkedIn & save your token.');
        await mongoose.disconnect();
        process.exit(1);
    }

    const token = rawSettings.channels?.linkedin?.token;
    const savedUrn = rawSettings.channels?.linkedin?.urn || '';

    console.log(`📋 Found settings for company: ${rawSettings.companyId}`);
    console.log(`   Token: ${token ? token.substring(0,4) + '...' + token.substring(token.length-4) : 'MISSING'}`);
    console.log(`   Saved URN: ${savedUrn || '(empty)'}`);

    if (!token) {
        console.log('\n❌ No LinkedIn token found. Please save your access token in Social Poster settings.');
        await mongoose.disconnect();
        process.exit(1);
    }

    // ── Resolve correct author URN ─────────────────────────────────────
    let authorUrn = '';

    // If saved URN is a personal profile URL or empty → auto-detect
    const isCompanyUrl = /\/company\/\d+/.test(savedUrn) || /^urn:li:organization:/.test(savedUrn);

    if (!savedUrn || !isCompanyUrl) {
        console.log('\n👤 Personal profile mode — auto-detecting your LinkedIn person URN...');
        authorUrn = await fetchPersonUrn(token);
        if (!authorUrn) {
            console.log('\n❌ Could not auto-detect your LinkedIn person URN.');
            console.log('   Possible causes:');
            console.log('   1. Your access token has expired — generate a new one at https://www.linkedin.com/developers/');
            console.log('   2. Your LinkedIn app doesn\'t have the "profile" or "openid" scope');
            await mongoose.disconnect();
            process.exit(1);
        }
    } else {
        // Company page posting
        const companyMatch = savedUrn.match(/\/company\/(\d+)/);
        if (companyMatch) {
            authorUrn = `urn:li:organization:${companyMatch[1]}`;
        } else {
            authorUrn = savedUrn;
        }
        console.log(`\n🏢 Company page mode — URN: ${authorUrn}`);
        console.log('   ⚠️  NOTE: This requires "Organization Pages" scope on your LinkedIn app.');
        console.log('   ℹ️  To post as your personal profile instead, clear the URN field in settings.');
    }

    // ── Clear company URN from DB so future posts use personal profile ─
    if (isCompanyUrl && savedUrn) {
        console.log('\n🔧 Clearing company URN from database so future posts use personal profile...');
        await mongoose.connection.db.collection('socialsettings').updateOne(
            { _id: rawSettings._id },
            { $set: { 'channels.linkedin.urn': '' } }
        );
        console.log('   ✅ URN cleared. Future scheduler posts will auto-detect your person URN.');
        
        // Re-detect with personal profile
        console.log('\n👤 Auto-detecting personal profile URN...');
        authorUrn = await fetchPersonUrn(token);
        if (!authorUrn) {
            console.log('\n❌ Could not auto-detect person URN. Token may be expired or missing scopes.');
            await mongoose.disconnect();
            process.exit(1);
        }
    }

    // ── Build fresh post content ────────────────────────────────────────
    const postContent = buildPost();
    console.log(`\n📝 Post content selected (${postContent.length} chars)`);

    // ── Post to LinkedIn ────────────────────────────────────────────────
    console.log('\n🚀 Posting to LinkedIn now...');
    const result = await postToLinkedIn(token, authorUrn, postContent);

    if (result.success) {
        console.log('\n🎉 ═══════════════════════════════════════════════════');
        console.log('   ✅ POST SUCCESSFUL!');
        console.log(`   Method: ${result.method}`);
        console.log(`   Post ID: ${result.postId}`);
        console.log('   Check your LinkedIn profile: https://www.linkedin.com/in/rupeshsingh7208');
        console.log('═══════════════════════════════════════════════════\n');
    } else {
        console.log('\n💥 Post failed. Full error:', result.error);
        console.log('\nTroubleshooting:');
        console.log('  1. Your access token may have EXPIRED → get a new one from LinkedIn Developer Portal');
        console.log('  2. Your app may be missing scopes: openid, profile, w_member_social');
        console.log('  3. Token must be a "Member" token, not a "Service Account" token');
    }

    await mongoose.disconnect();
}

main().catch(err => {
    console.error('Fatal error:', err.message);
    mongoose.disconnect();
    process.exit(1);
});
