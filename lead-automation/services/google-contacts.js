// ============================================================
//  services/google-contacts.js
//  Google People API — OAuth2 + save contacts automatically
// ============================================================
const { google }  = require('googleapis');
const path        = require('path');
const fs          = require('fs');

// ── Token file (fallback if DB not ready) ─────────────────────
const TOKEN_FILE = path.join(__dirname, '..', '.google_token.json');

// ── OAuth2 Client ─────────────────────────────────────────────
let _oauth2Client = null;
let _credentials  = null;   // { client_id, client_secret, redirect_uri }

function getOAuth2Client() {
    if (!_credentials) return null;
    if (!_oauth2Client) {
        _oauth2Client = new google.auth.OAuth2(
            _credentials.client_id,
            _credentials.client_secret,
            _credentials.redirect_uri
        );
    }
    return _oauth2Client;
}

// ── Setup credentials (called from index.js after loading settings) ──
function setupCredentials(creds) {
    _credentials = creds;
    _oauth2Client = null; // reset so it's rebuilt with new creds
}

// ── Generate Google OAuth URL ─────────────────────────────────
function getAuthUrl() {
    const client = getOAuth2Client();
    if (!client) return null;
    return client.generateAuthUrl({
        access_type: 'offline',
        prompt:      'consent',
        scope: [
            'https://www.googleapis.com/auth/contacts',
            'https://www.googleapis.com/auth/contacts.other.readonly'
        ]
    });
}

// ── Exchange code → tokens & persist ─────────────────────────
async function exchangeCode(code, Settings) {
    const client = getOAuth2Client();
    if (!client) throw new Error('Google OAuth not configured');

    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    // Persist to file
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens));

    // Also persist to MongoDB
    if (Settings) {
        await Settings.findOneAndUpdate(
            { key: 'google_tokens' },
            { value: JSON.stringify(tokens) },
            { upsert: true }
        );
    }
    return tokens;
}

// ── Load stored tokens ────────────────────────────────────────
async function loadTokens(Settings) {
    const client = getOAuth2Client();
    if (!client) return false;

    try {
        // Try MongoDB first
        if (Settings) {
            const row = await Settings.findOne({ key: 'google_tokens' });
            if (row?.value) {
                const tokens = JSON.parse(row.value);
                client.setCredentials(tokens);
                // Auto-refresh handler
                client.on('tokens', async (newTokens) => {
                    const merged = { ...tokens, ...newTokens };
                    fs.writeFileSync(TOKEN_FILE, JSON.stringify(merged));
                    await Settings.findOneAndUpdate(
                        { key: 'google_tokens' },
                        { value: JSON.stringify(merged) },
                        { upsert: true }
                    ).catch(() => {});
                });
                return true;
            }
        }
        // Fallback: file
        if (fs.existsSync(TOKEN_FILE)) {
            const tokens = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
            client.setCredentials(tokens);
            return true;
        }
    } catch(e) {
        console.error('Token load error:', e.message);
    }
    return false;
}

// ── Check if OAuth is ready ───────────────────────────────────
function isAuthorized() {
    const client = getOAuth2Client();
    if (!client) return false;
    const creds = client.credentials;
    return !!(creds?.access_token || creds?.refresh_token);
}

// ── Save a single contact to Google Contacts ──────────────────
async function saveContact(lead) {
    const client = getOAuth2Client();
    if (!client || !isAuthorized()) {
        throw new Error('Google not connected. Please authorize in Settings.');
    }

    const people = google.people({ version: 'v1', auth: client });

    // Build the contact payload
    const contactBody = {
        names: [{
            givenName: lead.name || 'Unknown Business',
        }],
        phoneNumbers: [{
            value: '+' + (lead.phone || lead.raw_phone),
            type:  'mobile'
        }]
    };

    // Add address if available
    if (lead.address || lead.city) {
        contactBody.addresses = [{
            formattedValue: [lead.address, lead.city].filter(Boolean).join(', '),
            type: 'work'
        }];
    }

    // Add email if available
    if (lead.email) {
        contactBody.emailAddresses = [{
            value: lead.email,
            type:  'work'
        }];
    }

    // Add organization/category
    if (lead.category || lead.keyword) {
        contactBody.organizations = [{
            name:  lead.name || '',
            title: lead.category || lead.keyword || 'Business'
        }];
    }

    const result = await people.people.createContact({
        requestBody: contactBody
    });

    return result.data.resourceName; // e.g. "people/c12345678"
}

// ── Save multiple contacts in batches ─────────────────────────
async function saveContactsBatch(leads, onProgress) {
    let saved = 0, skipped = 0, failed = 0;

    for (const lead of leads) {
        if (!lead.phone && !lead.raw_phone) {
            skipped++;
            if (onProgress) onProgress({ type: 'skip', name: lead.name, reason: 'No phone number' });
            continue;
        }

        try {
            await saveContact(lead);
            saved++;
            if (onProgress) onProgress({ type: 'saved', name: lead.name, saved, failed });

            // Small delay to respect Google API rate limits (100 req/100s)
            await new Promise(r => setTimeout(r, 1100));

        } catch(e) {
            // Ignore "duplicate" errors silently — contact may already exist
            if (e.message?.includes('409') || e.message?.includes('already exists')) {
                skipped++;
                if (onProgress) onProgress({ type: 'skip', name: lead.name, reason: 'Already in contacts' });
            } else {
                failed++;
                if (onProgress) onProgress({ type: 'fail', name: lead.name, reason: e.message });
            }
            // Small delay even on error
            await new Promise(r => setTimeout(r, 500));
        }
    }

    return { saved, skipped, failed };
}

// ── Save ONE contact quietly (used inside playwright-sender) ──
async function saveContactQuiet(lead) {
    try {
        if (!isAuthorized()) return false;
        if (!lead.phone && !lead.raw_phone) return false;
        await saveContact(lead);
        return true;
    } catch(e) {
        // Silently ignore — don't break the WA send if contact save fails
        console.log(`  ⚠️  Contact save skipped for ${lead.name}: ${e.message?.split('\n')[0]}`);
        return false;
    }
}

module.exports = {
    setupCredentials,
    getAuthUrl,
    exchangeCode,
    loadTokens,
    isAuthorized,
    saveContact,
    saveContactsBatch,
    saveContactQuiet,
};
