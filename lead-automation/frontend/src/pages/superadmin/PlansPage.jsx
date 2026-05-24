import React from 'react'

export default function PlansPage() {
  const planTiers = [
    {
      name: 'Trial',
      price: '$0',
      period: '14 days',
      leads: '100 leads',
      users: '1 user account',
      wa: '50 WhatsApp messages',
      export: 'No Export Allowed',
      color: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
      features: [
        'Google Maps Scraper',
        'Manual WhatsApp Outreach',
        'Standard Email Outreach',
        'Basic Dashboard Analytics'
      ]
    },
    {
      name: 'Starter',
      price: '$29',
      period: 'per month',
      leads: '1,000 leads',
      users: '2 user accounts',
      wa: '500 WhatsApp/mo',
      export: 'Excel/VCF Exports',
      color: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
      features: [
        'Google Maps Scraper',
        'WhatsApp Auto-Scheduler',
        'Email Extraction & Validation',
        'Social Poster Automations',
        'Excel & VCF Contact Exports'
      ]
    },
    {
      name: 'Business',
      price: '$79',
      period: 'per month',
      leads: '10,000 leads',
      users: '10 user accounts',
      wa: '5,000 WhatsApp/mo',
      export: 'Excel/VCF Exports',
      color: 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)',
      features: [
        'Everything in Starter',
        'Priority Scraper Scraping',
        'Dedicated WhatsApp Sessions',
        'SMTP Custom Server Credentials',
        'Standard Tech Support'
      ]
    },
    {
      name: 'Agency',
      price: '$199',
      period: 'per month',
      leads: '50,000 leads',
      users: '50 user accounts',
      wa: '30,000 WhatsApp/mo',
      export: 'Excel/VCF Exports',
      color: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
      features: [
        'Everything in Business',
        'White-label Logo branding',
        'Full CSV Data Dumping',
        'Google Contact Auto-syncing',
        '24/7 Dedicated Server Support'
      ]
    }
  ]

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">SaaS Pricing Plans</h1>
          <p className="page-subtitle">Overview of preset subscription packages available to companies</p>
        </div>
      </div>

      <div className="grid grid-4">
        {planTiers.map((tier) => (
          <div key={tier.name} className="card" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '1.5rem', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: tier.color }} />
            
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '0.5rem', color: 'var(--text-primary)' }}>{tier.name}</h3>
            
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.25rem', marginBottom: '1.5rem' }}>
              <span style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-primary)' }}>{tier.price}</span>
              <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>/ {tier.period}</span>
            </div>

            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 1.5rem 0', display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.875rem' }}>
              <li style={{ display: 'flex', gap: '0.5rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                📂 {tier.leads}
              </li>
              <li style={{ display: 'flex', gap: '0.5rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                👤 {tier.users}
              </li>
              <li style={{ display: 'flex', gap: '0.5rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                💬 {tier.wa}
              </li>
              <li style={{ display: 'flex', gap: '0.5rem', color: 'var(--text-muted)', textDecoration: tier.export.includes('No') ? 'line-through' : 'none' }}>
                📤 {tier.export}
              </li>
            </ul>

            <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '1.25rem', marginTop: 'auto' }}>
              <p style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
                Features Included:
              </p>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                {tier.features.map((feat, index) => (
                  <li key={index} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.375rem' }}>
                    <span style={{ color: 'var(--color-success)' }}>✓</span>
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
