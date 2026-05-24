import React, { useState } from 'react'
import { leadAPI } from '../../services/api'
import Modal from '../ui/Modal'
import toast from 'react-hot-toast'

export default function ScrapeModal({ isOpen, onClose, onSuccess }) {
  const [form, setForm] = useState({
    keyword: '',
    city: '',
    max: 50,
    category: ''
  })

  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.keyword.trim() || !form.city.trim()) {
      toast.error('Keyword and City are required')
      return
    }

    setLoading(true)
    try {
      await leadAPI.scrape({
        keyword: form.keyword.trim(),
        city: form.city.trim(),
        max: parseInt(form.max) || 50,
        category: form.category.trim()
      })
      toast.success('Maps scraping job started on server!')
      onSuccess()
      setForm({ keyword: '', city: '', max: 50, category: '' })
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to start scraping')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Launch Google Maps Lead Scraper"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
          <button className="btn btn-secondary" onClick={onClose} disabled={loading}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={loading}>
            {loading ? 'Starting...' : '⚡ Launch Scraper'}
          </button>
        </div>
      }
    >
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">Search Keyword *</label>
          <input
            type="text"
            className="form-control"
            value={form.keyword}
            onChange={(e) => setForm(f => ({ ...f, keyword: e.target.value }))}
            placeholder="e.g., Dentist, Software Company, Spa"
            required
          />
        </div>

        <div className="form-group">
          <label className="form-label">Target City / Town *</label>
          <input
            type="text"
            className="form-control"
            value={form.city}
            onChange={(e) => setForm(f => ({ ...f, city: e.target.value }))}
            placeholder="e.g., Mumbai, New York"
            required
          />
        </div>

        <div className="grid grid-2">
          <div className="form-group">
            <label className="form-label">Max Results to Scrape</label>
            <input
              type="number"
              className="form-control"
              value={form.max}
              onChange={(e) => setForm(f => ({ ...f, max: parseInt(e.target.value) || 0 }))}
              placeholder="e.g., 50"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Override Category Tag (Optional)</label>
            <input
              type="text"
              className="form-control"
              value={form.category}
              onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))}
              placeholder="e.g., Healthcare"
            />
          </div>
        </div>
      </form>
    </Modal>
  )
}
