import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { companyAPI } from '../../services/api'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import AddCompanyModal from '../../components/modals/AddCompanyModal'
import toast from 'react-hot-toast'

export default function CompaniesPage() {
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [isPlanOpen, setIsPlanOpen] = useState(false)
  const [selectedCompany, setSelectedCompany] = useState(null)
  
  const [planForm, setPlanForm] = useState({
    type: 'trial',
    leadLimit: 500,
    userLimit: 2,
    waLimit: 200,
    exportEnabled: false,
    trialDays: 14
  })

  useEffect(() => {
    loadCompanies()
  }, [page, search])

  const loadCompanies = async () => {
    setLoading(true)
    try {
      const res = await companyAPI.getAll({ page, limit: 10, search })
      setCompanies(res.data?.companies || [])
      setTotalPages(res.data?.pages || 1)
    } catch (err) {
      toast.error('Failed to load companies')
    } finally {
      setLoading(false)
    }
  }

  const handleToggleActive = async (company) => {
    try {
      if (company.isActive) {
        await companyAPI.deactivate(company._id)
        toast.success(`${company.name} deactivated`)
      } else {
        await companyAPI.activate(company._id)
        toast.success(`${company.name} activated`)
      }
      loadCompanies()
    } catch (err) {
      toast.error('Operation failed')
    }
  }

  const handleOpenPlanModal = (company) => {
    setSelectedCompany(company)
    setPlanForm({
      type: company.plan?.type || 'trial',
      leadLimit: company.plan?.leadLimit || 500,
      userLimit: company.plan?.userLimit || 2,
      waLimit: company.plan?.waLimit || 200,
      exportEnabled: !!company.plan?.exportEnabled,
      trialDays: 14
    })
    setIsPlanOpen(true)
  }

  const handleSavePlan = async (e) => {
    e.preventDefault()
    try {
      await companyAPI.assignPlan(selectedCompany._id, planForm)
      toast.success('Subscription plan updated')
      setIsPlanOpen(false)
      loadCompanies()
    } catch (err) {
      toast.error('Failed to update plan')
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Companies & Tenants</h1>
          <p className="page-subtitle">Manage registered organizations and their plan limits</p>
        </div>
        <button className="btn btn-primary" onClick={() => setIsAddOpen(true)}>
          ➕ Add Company
        </button>
      </div>

      <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
        <div style={{ display: 'flex', gap: '1rem', padding: '1rem 0' }}>
          <input
            type="text"
            placeholder="🔍 Search companies by name or email..."
            className="form-control"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            style={{ maxWidth: '400px' }}
          />
        </div>

        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>Company Name</th>
                <th>Slug</th>
                <th>Plan</th>
                <th>Status</th>
                <th>Users</th>
                <th>Leads</th>
                <th>Created</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '3rem' }}>
                    <div className="loading-spinner" style={{ margin: '0 auto' }} />
                  </td>
                </tr>
              ) : companies.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '3rem' }}>
                    No companies found.
                  </td>
                </tr>
              ) : (
                companies.map((company) => (
                  <tr key={company._id}>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{company.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{company.email}</div>
                    </td>
                    <td><code>{company.slug}</code></td>
                    <td>
                      <Badge variant={company.plan?.type}>{company.plan?.type?.toUpperCase()}</Badge>
                    </td>
                    <td>
                      <Badge variant={company.isActive ? 'active' : 'inactive'}>
                        {company.isActive ? 'Active' : 'Suspended'}
                      </Badge>
                    </td>
                    <td>{company.usage?.userCount || 0} / {company.plan?.userLimit}</td>
                    <td>{company.usage?.leadCount || 0} / {company.plan?.leadLimit}</td>
                    <td>{new Date(company.createdAt).toLocaleDateString()}</td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                        <Link to={`/superadmin/companies/${company._id}`} className="btn btn-secondary btn-sm">
                          👁️ View
                        </Link>
                        <button className="btn btn-secondary btn-sm" onClick={() => handleOpenPlanModal(company)}>
                          ⚙️ Plan
                        </button>
                        <button 
                          className={`btn ${company.isActive ? 'btn-danger' : 'btn-primary'} btn-sm`}
                          onClick={() => handleToggleActive(company)}
                        >
                          {company.isActive ? 'Suspend' : 'Activate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem' }}>
            <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
              Page {page} of {totalPages}
            </span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button 
                className="btn btn-secondary btn-sm" 
                disabled={page === 1} 
                onClick={() => setPage(p => p - 1)}
              >
                Previous
              </button>
              <button 
                className="btn btn-secondary btn-sm" 
                disabled={page === totalPages} 
                onClick={() => setPage(p => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add Company Modal */}
      <AddCompanyModal 
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onSuccess={() => { setIsAddOpen(false); loadCompanies(); }}
      />

      {/* Plan Assignment Modal */}
      <Modal
        isOpen={isPlanOpen}
        onClose={() => setIsPlanOpen(false)}
        title={`Configure Subscription Limits: ${selectedCompany?.name}`}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <button className="btn btn-secondary" onClick={() => setIsPlanOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSavePlan}>Save Changes</button>
          </div>
        }
      >
        <form onSubmit={handleSavePlan}>
          <div className="form-group">
            <label className="form-label">Plan Type</label>
            <select
              className="form-control"
              value={planForm.type}
              onChange={(e) => setPlanForm(f => ({ ...f, type: e.target.value }))}
            >
              <option value="trial">Trial</option>
              <option value="starter">Starter</option>
              <option value="business">Business</option>
              <option value="agency">Agency</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Lead Scrapes/Storage Limit</label>
            <input
              type="number"
              className="form-control"
              value={planForm.leadLimit}
              onChange={(e) => setPlanForm(f => ({ ...f, leadLimit: parseInt(e.target.value) || 0 }))}
            />
          </div>

          <div className="form-group">
            <label className="form-label">WhatsApp Session/Outreach Limit (Monthly)</label>
            <input
              type="number"
              className="form-control"
              value={planForm.waLimit}
              onChange={(e) => setPlanForm(f => ({ ...f, waLimit: parseInt(e.target.value) || 0 }))}
            />
          </div>

          <div className="form-group">
            <label className="form-label">User Account Limit</label>
            <input
              type="number"
              className="form-control"
              value={planForm.userLimit}
              onChange={(e) => setPlanForm(f => ({ ...f, userLimit: parseInt(e.target.value) || 0 }))}
            />
          </div>

          <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1rem' }}>
            <input
              type="checkbox"
              id="exportEnabled"
              checked={planForm.exportEnabled}
              onChange={(e) => setPlanForm(f => ({ ...f, exportEnabled: e.target.checked }))}
            />
            <label htmlFor="exportEnabled" className="form-label" style={{ marginBottom: 0 }}>
              Enable Excel/VCF Contact Exports
            </label>
          </div>
        </form>
      </Modal>
    </div>
  )
}
