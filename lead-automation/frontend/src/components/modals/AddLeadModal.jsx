import React, { useEffect, useState } from 'react'
import { leadAPI } from '../../services/api'
import Modal from '../ui/Modal'
import toast from 'react-hot-toast'

export default function AddLeadModal({ isOpen, lead, onClose, onSuccess }) {
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    website: '',
    category: 'General Business',
    city: '',
    address: '',
    rating: '',
    reviews: '',
    status: 'new',
    notes: ''
  })

  useEffect(() => {
    if (lead) {
      setForm({
        name: lead.name || '',
        phone: lead.phone || lead.raw_phone || '',
        email: lead.email || '',
        website: lead.website || '',
        category: lead.category || 'General Business',
        city: lead.city || '',
        address: lead.address || '',
        rating: lead.rating || '',
        reviews: lead.reviews || '',
        status: lead.status || 'new',
        notes: lead.notes || ''
      })
    } else {
      setForm({
        name: '',
        phone: '',
        email: '',
        website: '',
        category: 'General Business',
        city: '',
        address: '',
        rating: '',
        reviews: '',
        status: 'new',
        notes: ''
      })
    }
  }, [lead, isOpen])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) {
      toast.error('Lead Name is required')
      return
    }

    try {
      if (lead) {
        await leadAPI.update(lead._id, form)
        toast.success('Lead updated successfully')
      } else {
        await leadAPI.create(form)
        toast.success('Lead created successfully!')
      }
      onSuccess()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Operation failed')
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={lead ? 'Edit Lead Parameters' : 'Add New Lead Contact'}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit}>Save Contact</button>
        </div>
      }
    >
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">Business / Contact Name *</label>
          <input
            type="text"
            className="form-control"
            value={form.name}
            onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
            required
          />
        </div>

        <div className="grid grid-2">
          <div className="form-group">
            <label className="form-label">Phone Number (with Country Code)</label>
            <input
              type="text"
              className="form-control"
              value={form.phone}
              onChange={(e) => setForm(f => ({ ...f, phone: e.target.value.replace(/\s+/g, '') }))}
              placeholder="e.g., 919876543210"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input
              type="email"
              className="form-control"
              value={form.email}
              onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="e.g., info@business.com"
            />
          </div>
        </div>

        <div className="grid grid-2">
          <div className="form-group">
            <label className="form-label">Website Domain URL</label>
            <input
              type="text"
              className="form-control"
              value={form.website}
              onChange={(e) => setForm(f => ({ ...f, website: e.target.value }))}
              placeholder="https://example.com"
            />
          </div>
          <div className="form-group">
            <label className="form-label">City Location</label>
            <input
              type="text"
              className="form-control"
              value={form.city}
              onChange={(e) => setForm(f => ({ ...f, city: e.target.value }))}
              placeholder="e.g., Mumbai"
            />
          </div>
        </div>

        <div className="grid grid-2">
          <div className="form-group">
            <label className="form-label">Business Category / Tag</label>
            <input
              type="text"
              className="form-control"
              value={form.category}
              onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))}
              placeholder="e.g., Restaurant"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Status</label>
            <select
              className="form-control"
              value={form.status}
              onChange={(e) => setForm(f => ({ ...f, status: e.target.value }))}
            >
              <option value="new">New</option>
              <option value="contacted">Contacted</option>
              <option value="followup">Followup</option>
              <option value="interested">Interested</option>
              <option value="converted">Converted</option>
              <option value="not_interested">Not Interested</option>
              <option value="lost">Lost</option>
            </select>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Address Description</label>
          <input
            type="text"
            className="form-control"
            value={form.address}
            onChange={(e) => setForm(f => ({ ...f, address: e.target.value }))}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Notes & Comments</label>
          <textarea
            className="form-control"
            rows="3"
            value={form.notes}
            onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
          />
        </div>
      </form>
    </Modal>
  )
}
