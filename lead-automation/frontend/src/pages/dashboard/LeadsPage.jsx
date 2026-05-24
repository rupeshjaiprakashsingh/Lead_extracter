import React, { useEffect, useState } from 'react'
import { leadAPI } from '../../services/api'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import AddLeadModal from '../../components/modals/AddLeadModal'
import ScrapeModal from '../../components/modals/ScrapeModal'
import ImportExcelModal from '../../components/modals/ImportExcelModal'
import ProgressOverlay from '../../components/ui/ProgressOverlay'
import toast from 'react-hot-toast'

export default function LeadsPage() {
  const [leads, setLeads] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  
  // Filters
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [city, setCity] = useState('')
  const [status, setStatus] = useState('')
  const [skipWa, setSkipWa] = useState(false)
  const [skipEmail, setSkipEmail] = useState(false)
  const [noSite, setNoSite] = useState(false)

  // Filters Lists
  const [categories, setCategories] = useState([])
  const [cities, setCities] = useState([])

  // Selection
  const [selectedIds, setSelectedIds] = useState([])
  const [activeLead, setActiveLead] = useState(null)

  // Modals States
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isScrapeOpen, setIsScrapeOpen] = useState(false)
  const [isImportOpen, setIsImportOpen] = useState(false)

  // SSE Progress Overlay
  const [progressOpen, setProgressOpen] = useState(false)
  const [progressEndpoint, setProgressEndpoint] = useState('')
  const [progressTitle, setProgressTitle] = useState('')

  useEffect(() => {
    loadFilterOptions()
  }, [])

  useEffect(() => {
    loadLeads()
  }, [page, search, category, city, status, skipWa, skipEmail, noSite])

  const loadFilterOptions = async () => {
    try {
      const [catRes, cityRes] = await Promise.all([
        leadAPI.getCategories(),
        leadAPI.getCities()
      ])
      setCategories(catRes.data || [])
      setCities(cityRes.data || [])
    } catch {}
  }

  const loadLeads = async () => {
    setLoading(true)
    try {
      const res = await leadAPI.getAll({
        page,
        limit: 15,
        search,
        category,
        city,
        status,
        skipWaSent: skipWa ? '1' : '0',
        skipEmailSent: skipEmail ? '1' : '0',
        noWebsite: noSite ? '1' : '0'
      })
      setLeads(res.data?.leads || [])
      setTotal(res.data?.total || 0)
      setTotalPages(res.data?.pages || 1)
      setSelectedIds([])
    } catch (err) {
      toast.error('Failed to load leads list')
    } finally {
      setLoading(false)
    }
  }

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedIds(leads.map(l => l._id))
    } else {
      setSelectedIds([])
    }
  }

  const handleSelectOne = (id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const handleDeleteOne = async (id) => {
    if (!window.confirm('Delete this lead?')) return
    try {
      await leadAPI.delete(id)
      toast.success('Lead deleted successfully')
      loadLeads()
      if (activeLead?._id === id) setActiveLead(null)
    } catch (err) {
      toast.error('Delete failed')
    }
  }

  const handleBulkDelete = async () => {
    if (!selectedIds.length) return
    if (!window.confirm(`Delete all ${selectedIds.length} selected leads?`)) return
    try {
      await leadAPI.deleteMany(selectedIds)
      toast.success('Selected leads deleted')
      loadLeads()
    } catch (err) {
      toast.error('Bulk delete failed')
    }
  }

  const handleBulkSendWA = async (mode) => {
    if (!selectedIds.length) {
      toast.error('Select leads first')
      return
    }
    const modeEndpoint = mode === 'draft' ? '/leads/send/wa-draft' : mode === 'manual' ? '/leads/send/wa-manual' : '/leads/send/wa'
    setProgressTitle(mode === 'draft' ? 'Drafting WhatsApp Messages' : mode === 'manual' ? 'Manual WhatsApp Broadcast' : 'WhatsApp Automated Outreach')
    setProgressEndpoint(modeEndpoint)
    
    try {
      const apiMethod = mode === 'draft' ? leadAPI.sendWABulk || (() => leadAPI.sendWA({ ids: selectedIds, skipWaSent: true })) : leadAPI.sendWA
      await apiMethod({ ids: selectedIds, skipWaSent: true })
      setProgressOpen(true)
    } catch (err) {
      toast.error('WhatsApp campaign failed to start')
    }
  }

  const handleBulkSendEmail = async () => {
    if (!selectedIds.length) {
      toast.error('Select leads first')
      return
    }
    try {
      await leadAPI.sendEmail({ ids: selectedIds })
      setProgressTitle('Email Outreach Broadcast')
      setProgressEndpoint('/leads/send/email')
      setProgressOpen(true)
    } catch (err) {
      toast.error('Email outreach campaign failed to start')
    }
  }

  const handleExtractEmails = async () => {
    if (!selectedIds.length) {
      toast.error('Select leads first')
      return
    }
    try {
      await leadAPI.extractEmails(selectedIds)
      setProgressTitle('Extracting Email Addresses')
      setProgressEndpoint('/leads/extract-emails')
      setProgressOpen(true)
    } catch (err) {
      toast.error('Extraction campaign failed to start')
    }
  }

  const handleExportVcf = async () => {
    try {
      toast.loading('Generating VCF file...')
      const res = await leadAPI.exportExcel({ responseType: 'blob' }) // Fallback to vcf
      // Actually download the file
      window.open(`/api/leads/export-vcf${category ? `?category=${category}` : ''}`)
      toast.dismiss()
      toast.success('Downloaded VCF file!')
    } catch {
      toast.dismiss()
      toast.error('VCF generation failed')
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Lead Management</h1>
          <p className="page-subtitle">View, query, segment and broadcast outreach to extracted leads</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-secondary" onClick={() => setIsImportOpen(true)}>📥 Import Excel</button>
          <button className="btn className=btn-secondary" onClick={() => window.open(`/api/leads/export${category ? `?category=${category}` : ''}`)}>📤 Export Excel</button>
          <button className="btn btn-secondary" onClick={handleExportVcf}>📇 Export VCF</button>
          <button className="btn btn-primary" onClick={() => setIsScrapeOpen(true)}>🔍 Scrape Maps</button>
        </div>
      </div>

      {/* Filter card */}
      <div className="card" style={{ marginBottom: 'var(--space-5)' }}>
        <div className="grid grid-4" style={{ gap: '0.75rem', marginBottom: '0.75rem' }}>
          <input
            type="text"
            placeholder="🔍 Search name, phone, city..."
            className="form-control"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />

          <select
            className="form-control"
            value={category}
            onChange={(e) => { setCategory(e.target.value); setPage(1); }}
          >
            <option value="">All Categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <select
            className="form-control"
            value={city}
            onChange={(e) => { setCity(e.target.value); setPage(1); }}
          >
            <option value="">All Cities</option>
            {cities.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <select
            className="form-control"
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          >
            <option value="">All Statuses</option>
            <option value="new">New</option>
            <option value="contacted">Contacted</option>
            <option value="followup">Followup</option>
            <option value="interested">Interested</option>
            <option value="converted">Converted</option>
            <option value="lost">Lost</option>
          </select>
        </div>

        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', fontSize: '0.875rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={skipWa} onChange={(e) => { setSkipWa(e.target.checked); setPage(1); }} />
            Skip WhatsApp Sent
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={skipEmail} onChange={(e) => { setSkipEmail(e.target.checked); setPage(1); }} />
            Skip Email Sent
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={noSite} onChange={(e) => { setNoSite(e.target.checked); setPage(1); }} />
            Has No Website / Social Links
          </label>
        </div>
      </div>

      {/* Bulk action toolbar */}
      {selectedIds.length > 0 && (
        <div style={{
          background: 'var(--bg-selected)',
          border: '1px solid var(--border-color-hover)',
          borderRadius: 'var(--radius-md)',
          padding: '0.75rem 1rem',
          marginBottom: 'var(--space-5)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '1rem',
          flexWrap: 'wrap'
        }}>
          <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)' }}>
            Selected: {selectedIds.length} lead(s)
          </span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => handleBulkSendWA('auto')}>📱 Send WA</button>
            <button className="btn btn-secondary btn-sm" onClick={() => handleBulkSendWA('draft')}>📝 Draft WA</button>
            <button className="btn btn-secondary btn-sm" onClick={() => handleBulkSendWA('manual')}>👆 Manual WA</button>
            <button className="btn btn-secondary btn-sm" onClick={handleBulkSendEmail}>📧 Send Email</button>
            <button className="btn btn-secondary btn-sm" onClick={handleExtractEmails}>🌐 Extract Emails</button>
            <button className="btn btn-danger btn-sm" onClick={handleBulkDelete}>🗑️ Delete</button>
          </div>
        </div>
      )}

      {/* Leads Table Card */}
      <div className="card">
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}>
                  <input type="checkbox" checked={leads.length > 0 && selectedIds.length === leads.length} onChange={handleSelectAll} />
                </th>
                <th>Name</th>
                <th>Phone</th>
                <th>Category</th>
                <th>City</th>
                <th>Status</th>
                <th>Outreach Status</th>
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
              ) : leads.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '3rem' }}>
                    No leads match your filter parameters.
                  </td>
                </tr>
              ) : (
                leads.map((lead) => (
                  <tr 
                    key={lead._id}
                    className={selectedIds.includes(lead._id) ? 'selected' : ''}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setActiveLead(lead)}
                  >
                    <td onClick={(e) => { e.stopPropagation(); handleSelectOne(lead._id); }}>
                      <input type="checkbox" checked={selectedIds.includes(lead._id)} readOnly />
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{lead.name}</div>
                      {lead.email && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{lead.email}</div>}
                    </td>
                    <td>{lead.phone || lead.raw_phone || '-'}</td>
                    <td><Badge variant="starter">{lead.category}</Badge></td>
                    <td>{lead.city || '-'}</td>
                    <td><Badge variant={lead.status}>{lead.status?.toUpperCase()}</Badge></td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
                        <Badge variant={lead.wa_sent ? 'success' : 'inactive'}>
                          WA: {lead.wa_sent ? `✓ (${lead.wa_count})` : '×'}
                        </Badge>
                        <Badge variant={lead.email_sent ? 'success' : 'inactive'}>
                          Email: {lead.email_sent ? `✓ (${lead.email_count})` : '×'}
                        </Badge>
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: '0.375rem', justifyContent: 'flex-end' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => { setActiveLead(lead); setIsEditOpen(true); }}>✏️ Edit</button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDeleteOne(lead._id)}>🗑️ Delete</button>
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
              Page {page} of {totalPages} ({total} leads)
            </span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-secondary btn-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</button>
              <button className="btn btn-secondary btn-sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
            </div>
          </div>
        )}
      </div>

      {/* Add Lead Modal */}
      {isAddOpen && (
        <AddLeadModal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} onSuccess={() => { setIsAddOpen(false); loadLeads(); }} />
      )}

      {/* Edit Lead Modal */}
      {isEditOpen && activeLead && (
        <AddLeadModal isOpen={isEditOpen} lead={activeLead} onClose={() => setIsEditOpen(false)} onSuccess={() => { setIsEditOpen(false); loadLeads(); }} />
      )}

      {/* Scrape Maps Modal */}
      {isScrapeOpen && (
        <ScrapeModal isOpen={isScrapeOpen} onClose={() => setIsScrapeOpen(false)} onSuccess={() => { setIsScrapeOpen(false); loadLeads(); }} />
      )}

      {/* Import Excel Modal */}
      {isImportOpen && (
        <ImportExcelModal isOpen={isImportOpen} onClose={() => setIsImportOpen(false)} onSuccess={() => { setIsImportOpen(false); loadLeads(); }} />
      )}

      {/* SSE Progress Overlay */}
      {progressOpen && (
        <ProgressOverlay
          isOpen={progressOpen}
          onClose={() => setProgressOpen(false)}
          title={progressTitle}
          endpoint={progressEndpoint}
          onDone={() => { setProgressOpen(false); loadLeads(); }}
        />
      )}
    </div>
  )
}
