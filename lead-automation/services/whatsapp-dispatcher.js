const mongoose = require('mongoose');

/**
 * Dispatches a WhatsApp campaign to the user's selected gateway (Playwright or UltraMsg).
 * @param {Array<string>} ids - The database IDs of the leads to message.
 * @param {boolean} isFollowup - Whether this is a follow-up message campaign.
 * @param {Object} options - Sending options (skipWaSent, companyId/userId, onComplete callback).
 */
async function sendWA(ids, isFollowup = false, options = {}) {
    const userId = options.companyId;
    if (!userId) {
        throw new Error('companyId (userId) is required for WhatsApp sending dispatcher');
    }

    const Settings = mongoose.model('Settings');
    const gatewayRow = await Settings.findOne({ userId, key: 'wa_gateway' });
    const gateway = gatewayRow ? gatewayRow.value : 'playwright';

    console.log(`[DISPATCHER] User ${userId} is routing campaign via gateway: "${gateway}"`);

    if (gateway === 'ultramsg') {
        const { sendWhatsAppMessages } = require('../ultramsg-sender');
        return await sendWhatsAppMessages(ids, isFollowup, options);
    } else {
        const { sendLocalWA } = require('../playwright-sender');
        return await sendLocalWA(ids, isFollowup, options);
    }
}

module.exports = { sendWA };
