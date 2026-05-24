import React, { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { companyAPI } from '../../services/api'
import Badge from '../../components/ui/Badge'
import StatsCard from '../../components/ui/StatsCard'
import toast from 'react-hot-toast'

export default function CompanyDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [company, setCompany] = useState(null)
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadCompanyData()
  }, [id])

  const loadCompanyData = async () => {
    setLoading(true)
    try {
      const [compRes, statsRes] = await Promise.all([
        companyAPI.getById(id),
        companyAPI.getById(id) // Note: company detail has basic info, getById returns company info + usage details in API
      ])
      setCompany(compRes.data?.company)
      // stats details are embedded in company query
      setStats(compRes.data?.company?.usage)
    } catch (err) {
      toast.error('Failed to load company details')
      navigate('/superadmin/companies')
    } finally {
      setLoading(false)
    }
  }

  const handleResetData = async () => {
    if (!window.confirm('WARNING: This will permanently delete all leads, settings, followups, and schedules for this company. This cannot be undone! Type "RESET" to confirm.')) {
      return
    }
    
    const confirmText = window.prompt('Type RESET to confirm deletion:')
    if (confirmText !== 'RESET') {
      toast.error('Reset cancelled (incorrect confirmation text)')
      return
    }

    try {
      await companyAPI.resetData(id)
      toast.success('Company leads data successfully reset!')
      loadCompanyData()
    } catch (err) {
      toast.error('Failed to reset company data')
    }
  }

  const handleDeleteCompany = async () => {
    if (!window.confirm('Are you absolutely sure you want to delete this company account? All associated users and data will be permanently deleted.')) {
      return
    }
    try {
      await companyAPI.delete(id)
      toast.success('Company permanently deleted')
      navigate('/superadmin/companies')
    } catch (err) {
      toast.error('Failed to delete company')
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '4rem' }}>
        <div className="loading-spinner-lg" />
      </div>
    )
  }

  if (!company) return <div>Company not found</div>

  return (
    <div>
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
            <Link to="/superadmin/companies" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>
              ← Back to Companies
            </Link>
          </div>
          <h1 className="page-title">{company.name}</h1>
          <p className="page-subtitle">Detailed subscription parameters and usage analytics</p>
        </div>
        <div>
          <Badge variant={company.isActive ? 'active' : 'inactive'}>
            {company.isActive ? 'Active Tenant' : 'Suspended Tenant'}
          </Badge>
        </div>
      </div>

      {/* Grid of stats */}
      <div className="grid grid-3" style={{ marginBottom: 'var(--space-6)' }}>
        <StatsCard
          title="Scraped Leads Storage"
          value={`${company.usage?.leadCount || 0} / ${company.plan?.leadLimit || 0}`}
          subtitle={`${company.plan?.leadLimit - (company.usage?.leadCount || 0)} leads remaining`}
          icon="👥"
          color="var(--gradient-primary)"
        />
        <StatsCard
          title="WhatsApp Sent Today"
          value={`${company.usage?.waCount || 0} / ${company.plan?.waLimit || 0}`}
          subtitle="Scoped by current plan limits"
          icon="📱"
          color="linear-gradient(135deg, #10b981 0%, #059669 100%)"
        />
        <StatsCard
          title="Team Members Assigned"
          value={`${company.usage?.userCount || 0} / ${company.plan?.userLimit || 0}`}
          subtitle="User accounts configured"
          icon="👤"
          color="linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)"
        />
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '1.25rem' }}>Company Parameters</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>ORGANIZATION SLUG</span>
              <span style={{ fontWeight: 500 }}>{company.slug}</span>
            </div>
            <div>
              <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>PRIMARY BILLING EMAIL</span>
              <span style={{ fontWeight: 500 }}>{company.email}</span>
            </div>
            <div>
              <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>CONTACT TELEPHONE</span>
              <span style={{ fontWeight: 500 }}>{company.phone || 'Not configured'}</span>
            </div>
            <div>
              <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>PLAN TYPE</span>
              <span style={{ fontWeight: 500, textTransform: 'capitalize' }}>{company.plan?.type}</span>
            </div>
            <div>
              <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>EXPORTS ALLOWED</span>
              <span style={{ fontWeight: 500 }}>{company.plan?.exportEnabled ? 'Yes (Excel/VCF allowed)' : 'No (Exports restricted)'}</span>
            </div>
          </div>
        </div>

        <div className="card" style={{ borderColor: 'rgba(239, 68, 68, 0.2)' }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--color-danger)', marginBottom: '1.25rem' }}>Danger Zone</h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1.5rem', lineHeight: 1.5 }}>
            Perform administrative operations on this company. These operations can result in permanent data deletion.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong style={{ display: 'block', fontSize: '0.875rem' }}>Reset Company Database</strong>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Wipes all leads, follow-ups, and campaign lists.</span>
              </div>
              <button className="btn btn-danger" onClick={handleResetData}>Reset Leads</button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '1rem' }}>
              <div>
                <strong style={{ display: 'block', fontSize: '0.875rem' }}>Delete Organization</strong>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Completely delete organization and all employee credentials.</span>
              </div>
              <button className="btn btn-danger" onClick={handleDeleteCompany}>Delete Tenant</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
