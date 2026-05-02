const XLSX = require('xlsx');

function exportLeads(leads) {
    const rows = leads.map((l, i) => ({
        '#':           i + 1,
        'Business':    l.name || '',
        'Category':    l.category || '',
        'Phone':       l.raw_phone || l.phone || '',
        'Email':       l.email || '',
        'Website':     l.website || '',
        'Rating':      l.rating || '',
        'Reviews':     l.reviews || '',
        'City':        l.city || '',
        'Keyword':     l.keyword || '',
        'Status':      l.status || 'new',
        'WA Sent':     l.wa_sent ? 'Yes' : 'No',
        'WA Count':    l.wa_count || 0,
        'Email Sent':  l.email_sent ? 'Yes' : 'No',
        'Email Count': l.email_count || 0,
        'Next Follow-up': l.next_followup ? new Date(l.next_followup).toLocaleDateString('en-IN') : '',
        'Notes':       l.notes || '',
        'Added On':    l.createdAt ? new Date(l.createdAt).toLocaleDateString('en-IN') : '',
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);

    // Column widths
    ws['!cols'] = [
        {wch:4},{wch:30},{wch:20},{wch:16},{wch:28},{wch:28},
        {wch:8},{wch:8},{wch:14},{wch:18},{wch:14},{wch:8},
        {wch:8},{wch:8},{wch:8},{wch:16},{wch:30},{wch:14}
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Leads');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = { exportLeads };
