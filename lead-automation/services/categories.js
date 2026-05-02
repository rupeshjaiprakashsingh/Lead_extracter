// Maps keywords → business categories
const MAP = {
    'laptop|computer|mobile|phone|electronic|tech|digital|printer|tablet|camera|refurbish|iphone|android': 'Electronics & IT',
    'clinic|hospital|doctor|dental|medical|health|pharmacy|eye|ortho|cancer|oncol|physio|ayurved': 'Healthcare',
    'restaurant|cafe|hotel|food|dhaba|bakery|sweet|pizza|burger|biryani|kitchen|catering|tiffin': 'Food & Hospitality',
    'school|college|coaching|institute|academy|tutor|education|university|classes|play school': 'Education',
    'salon|beauty|spa|parlour|gym|fitness|yoga|massage|wellness|grooming': 'Beauty & Wellness',
    'real estate|property|builder|flat|apartment|plot|land|housing|villa|pg|hostel': 'Real Estate',
    'car|bike|vehicle|auto|garage|mechanic|tyre|motor|service center|scooter': 'Automotive',
    'cloth|fashion|boutique|tailor|garment|saree|jewel|lehenga|kurta|ethnic': 'Fashion & Retail',
    'law|legal|advocate|lawyer|court|attorney|notary': 'Legal Services',
    'ca |chartered|accountant|finance|tax|audit|gst|income tax|insurance|loan|investment': 'Finance & Accounting',
    'travel|tour|resort|holiday|visa|flight|ticket|bus|cab|rental': 'Travel & Tourism',
    'event|wedding|party|caterer|decoration|photograph|videograph|dj|band|tent': 'Events & Media',
    'construction|interior|architect|engineer|contractor|carpenter|plumber|electric|civil': 'Construction & Design',
    'pest|clean|laundry|dry clean|packer|mover|painting|repair|maintenance|ac': 'Home Services',
    'grocery|kirana|supermarket|mart|store|wholesale|provision|departmental': 'Grocery & Retail',
};

function categorize(keyword = '', googleCategory = '') {
    const kw = (keyword + ' ' + googleCategory).toLowerCase();
    for (const [pattern, cat] of Object.entries(MAP)) {
        if (new RegExp(pattern).test(kw)) return cat;
    }
    return 'General Business';
}

const ALL_CATEGORIES = [...new Set(Object.values(MAP)), 'General Business'];

module.exports = { categorize, ALL_CATEGORIES };
