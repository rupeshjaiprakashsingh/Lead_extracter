import React, { useState } from 'react'
import { leadAPI } from '../../services/api'
import Modal from '../ui/Modal'
import toast from 'react-hot-toast'

export default function ImportExcelModal({ isOpen, onClose, onSuccess }) {
  const [file, setFile] = useState(null)
  const [category, setCategory] = useState('Excel Import')
  const [loading, setLoading] = useState(false)
  const [previewData, setPreviewData] = useState(null)

  const handleFileChange = async (e) => {
    const selectedFile = e.target.files[0]
    if (!selectedFile) return

    setFile(selectedFile)
    setPreviewData(null)

    // Run preview check
    const formData = new FormData()
    formData.append('file', selectedFile)

    try {
      const res = await leadAPI.importExcelPreview || (() => {
        // Fallback or custom endpoint post
        const axios = require('axios')
        return axios.post('/api/leads/import-excel/preview', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
            'Authorization': `Bearer ${localStorage.getItem('crm_token')}`
          }
        })
      })()
      setPreviewData(res.data?.data?.rows || [])
    } catch (err) {
      toast.error('Failed to parse file preview')
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!file) {
      toast.error('Please select an Excel sheet first')
      return
    }

    setLoading(true)
    const formData = new FormData()
    formData.append('file', file)
    formData.append('category', category)

    try {
      // Use leadAPI import
      const res = await leadAPI.importExcel || (() => {
        const axios = require('axios')
        return axios.post('/api/leads/import-excel', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
            'Authorization': `Bearer ${localStorage.getItem('crm_token')}`
          }
        })
      })()
      
      const stats = res.data?.data || {}
      toast.success(`Successfully imported: ${stats.added || 0} added, ${stats.dupes || 0} duplicates skipped.`)
      onSuccess()
      setFile(null)
      setPreviewData(null)
    } catch (err) {
      toast.error(err.response?.data?.error || 'Excel import failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Upload Leads Spreadsheet (.xlsx, .csv)"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
          <button className="btn btn-secondary" onClick={onClose} disabled={loading}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={loading || !file}>
            {loading ? 'Uploading...' : '📥 Start Import'}
          </button>
        </div>
      }
    >
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">Excel / CSV File</label>
          <input
            type="file"
            accept=".xlsx, .xls, .csv"
            className="form-control"
            onChange={handleFileChange}
            required
          />
        </div>

        <div className="form-group">
          <label className="form-label">Assign Category Label (For segmentation)</label>
          <input
            type="text"
            className="form-control"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="e.g., Cold Leads May"
          />
        </div>

        {previewData && (
          <div style={{ marginTop: '1.25rem' }}>
            <h3 style={{ fontSize: '0.875rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
              Parsing Preview (Parsed {previewData.length} row(s))
            </h3>
            <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', fontSize: '0.75rem', background: 'rgba(255,255,255,0.01)' }}>
              <table className="table" style={{ margin: 0 }}>
                <thead>
                  <tr>
                    <th>Business Name</th>
                    <th>Phone</th>
                    <th>Email</th>
                    <th>Location</th>
                  </tr>
                </thead>
                <tbody>
                  {previewData.slice(0, 5).map((row, idx) => (
                    <tr key={idx}>
                      <td style={{ fontWeight: 600 }}>{row.name}</td>
                      <td>{row.phone || row.raw_phone}</td>
                      <td>{row.email || '-'}</td>
                      <td>{row.city || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {previewData.length > 5 && (
                <div style={{ padding: '0.5rem', textAlign: 'center', color: 'var(--text-muted)', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  And {previewData.length - 5} more row(s)...
                </div>
              )}
            </div>
          </div>
        )}
      </form>
    </Modal>
  )
}
