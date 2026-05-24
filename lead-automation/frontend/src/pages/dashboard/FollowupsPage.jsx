import React, { useEffect, useState } from 'react'
import { followupAPI } from '../../services/api'
import Badge from '../../components/ui/Badge'
import ProgressOverlay from '../../components/ui/ProgressOverlay'
import toast from 'react-hot-toast'

export default function FollowupsPage() {
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')

  // Selection
  const [selectedIds, setSelectedIds] = useState([])

  // Progress modal
  const [progressOpen, setProgressOpen] = useState(false)
  const [progressTitle, setProgressTitle] = useState('')
  const [progressEndpoint, setProgressEndpoint] = useState('')

  useEffect(() => {
    loadFollowups()
  }, [search, status])

  const loadFollowups = async () => {
    setLoading(true)
    try {
      const res = await followupAPI.getAll({ search, status })
      setLeads(res.data || [])
      setSelectedIds([])
    } catch (err) {
      toast.error('Failed to load follow-up queue')
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

  const handleRemoveFollowup = async (id) => {
    try {
      await followupAPI.remove([id])
      toast.success('Removed from follow-up queue')
      loadFollowups()
    } catch (err) {
      toast.error('Failed to remove lead')
    }
  }

  const handleBulkRemove = async () => {
    if (!selectedIds.length) return
    try {
      await followupAPI.remove(selectedIds)
      toast.success('Removed selected leads from follow-up queue')
      loadFollowups()
    } catch (err) {
      toast.error('Bulk removal failed')
    }
  }

  const handleSendWA = async (id) => {
    try {
      await followupAPI.sendWA(id)
      toast.success('Follow-up WhatsApp draft opened')
      loadFollowups()
    } catch (err) {
      toast.error('Failed to start WhatsApp')
    }
  }

  const handleSendEmail = async (id) => {
    try {
      await followupAPI.sendEmail(id)
      toast.success('Follow-up email sent successfully')
      loadFollowups()
    } catch (err) {
      toast.error('Failed to send email')
    }
  }

  const handleBulkSendWA = async () => {
    if (!selectedIds.length) return
    try {
      await followupAPI.sendWABulk(selectedIds)
      toast.success('Bulk follow-up WA draft started')
      loadFollowups()
    } catch (err) {
      toast.error('Failed to start bulk WhatsApp')
    }
  }

  const handleBulkSendEmail = async () => {
    if (!selectedIds.length) return
    try {
      await followupAPI.sendEmailBulk(selectedIds)
      setProgressTitle('Follow-up Email Broadcast')
      setProgressEndpoint('/followups/send-email-bulk')
      setProgressOpen(true)
    } catch (err) {
      toast.error('Failed to start bulk emails')
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Follow-up Outreach Queue</h1>
          <p className="page-subtitle">Schedule, track and trigger follow-up outreach for warm leads</p>
        </div>
      </div>

      {/* Filter card */}
      <div className="card" style={{ marginBottom: 'var(--space-5)' }}>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <input
            type="text"
            placeholder="🔍 Search follow-ups by name, phone..."
            className="form-control"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: '400px' }}
          />

          <select
            className="form-control"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            style={{ maxWidth: '200px' }}
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
            Selected: {selectedIds.length} follow-up lead(s)
          </span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-secondary btn-sm" onClick={handleBulkSendWA}>📱 Send WA Drafts</button>
            <button className="btn btn-secondary btn-sm" onClick={handleBulkSendEmail}>📧 Send Followup Emails</button>
            <button className="btn btn-danger btn-sm" onClick={handleBulkRemove}>🗑️ Remove from Queue</button>
          </div>
        </div>
      )}

      {/* Followups Table */}
      <div className="card">
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}>
                  <input type="checkbox" checked={leads.length > 0 && selectedIds.length === leads.length} onChange={handleSelectAll} />
                </th>
                <th>Name</th>
                <th>Scheduled Date</th>
                <th>Notes</th>
                <th>Previous Touches</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '3rem' }}>
                    <div className="loading-spinner" style={{ margin: '0 auto' }} />
                  </td>
                </tr>
              ) : leads.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '3rem' }}>
                    No follow-up tasks registered or scheduled.
                  </td>
                </tr>
              ) : (
                leads.map((lead) => (
                  <tr key={lead._id}>
                    <td>
                      <input 
                        type="checkbox" 
                        checked={selectedIds.includes(lead._id)} 
                        onChange={() => handleSelectOne(lead._id)} 
                      />
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{lead.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {lead.phone || lead.raw_phone || lead.email || '-'}
                      </div>
                    </td>
                    <td>
                      <span style={{ fontWeight: 500, color: new Date(lead.followup_scheduled_at) <= new Date() ? 'var(--color-danger)' : 'var(--text-primary)' }}>
                        {new Date(lead.followup_scheduled_at).toLocaleDateString()} at {new Date(lead.followup_scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </td>
                    <td>
                      <div style={{ maxWidth: '250px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={lead.followup_note}>
                        {lead.followup_note || '-'}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.25rem' }}>
                        <Badge variant="starter">WA: {lead.wa_count || 0}</Badge>
                        <Badge variant="starter">Mail: {lead.email_count || 0}</Badge>
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '0.375rem', justifyContent: 'flex-end' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => handleSendWA(lead._id)}>📱 WA Draft</button>
                        <button className="btn btn-secondary btn-sm" onClick={() => handleSendEmail(lead._id)}>📧 Send Mail</button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleRemoveFollowup(lead._id)}>✕ Remove</button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {progressOpen && (
        <ProgressOverlay
          isOpen={progressOpen}
          onClose={() => setProgressOpen(false)}
          title={progressTitle}
          endpoint={progressEndpoint}
          onDone={() => { setProgressOpen(false); loadFollowups(); }}
        />
      )}
    </div>
  )
}
