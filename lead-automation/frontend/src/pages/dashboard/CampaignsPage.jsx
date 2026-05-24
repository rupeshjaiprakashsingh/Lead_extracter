import React, { useEffect, useState } from 'react'
import { campaignAPI } from '../../services/api'
import StatsCard from '../../components/ui/StatsCard'
import Badge from '../../components/ui/Badge'
import toast from 'react-hot-toast'

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadCampaignData()
  }, [])

  const loadCampaignData = async () => {
    try {
      const [campRes, statsRes] = await Promise.all([
        campaignAPI.getAll(),
        campaignAPI.getStats()
      ])
      setCampaigns(campRes.data || [])
      setStats(statsRes.data)
    } catch (err) {
      toast.error('Failed to load campaigns')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '4rem' }}>
        <div className="loading-spinner-lg" />
      </div>
    )
  }

  const s = stats || { totalCampaigns: 0, leadsCount: 0, waSentCount: 0 }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Scraper Campaigns</h1>
          <p className="page-subtitle">Track, monitor, and analyze lead generation search batches</p>
        </div>
      </div>

      <div className="grid grid-3" style={{ marginBottom: 'var(--space-6)' }}>
        <StatsCard
          title="Total Search Batches"
          value={s.totalCampaigns}
          subtitle="Unique keyword terms run"
          icon="🎯"
          color="var(--gradient-primary)"
        />
        <StatsCard
          title="Total Scraped Leads"
          value={s.leadsCount}
          subtitle="All campaign captures"
          icon="👥"
          color="linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)"
        />
        <StatsCard
          title="Total Broadcast Touches"
          value={s.waSentCount}
          subtitle="Contacted via WhatsApp campaigns"
          icon="📱"
          color="linear-gradient(135deg, #10b981 0%, #059669 100%)"
        />
      </div>

      <div className="card">
        <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '1.25rem' }}>Campaign Batches Overview</h2>
        
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>Campaign Keyword</th>
                <th>Estimated Category</th>
                <th>Target Location</th>
                <th>Leads Harvested</th>
                <th>Outreach Progress</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '3rem' }}>
                    No campaigns found. Use the Maps Scraper tool to build one.
                  </td>
                </tr>
              ) : (
                campaigns.map((camp, idx) => {
                  const outreachPct = camp.leadsCount > 0 ? Math.round(((camp.waSentCount || 0) / camp.leadsCount) * 100) : 0
                  return (
                    <tr key={idx}>
                      <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        🎯 {camp.name}
                      </td>
                      <td><Badge variant="starter">{camp.category}</Badge></td>
                      <td>📍 {camp.city}</td>
                      <td><strong>{camp.leadsCount}</strong> leads</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: '150px' }}>
                          <div className="progress-bar-wrap" style={{ flex: 1 }}>
                            <div className="progress-bar-fill" style={{ width: `${outreachPct}%` }} />
                          </div>
                          <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>{outreachPct}%</span>
                        </div>
                      </td>
                      <td>
                        <Badge variant={outreachPct >= 100 ? 'success' : outreachPct > 0 ? 'pending' : 'new'}>
                          {outreachPct >= 100 ? 'COMPLETE' : outreachPct > 0 ? 'ACTIVE' : 'QUEUED'}
                        </Badge>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
