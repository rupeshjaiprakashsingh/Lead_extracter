import React, { useState } from 'react'
import { companyAPI } from '../../services/api'
import Modal from '../ui/Modal'
import toast from 'react-hot-toast'

export default function AddCompanyModal({ isOpen, onClose, onSuccess }) {
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    adminUsername: '',
    adminEmail: '',
    adminPassword: '',
    planType: 'trial',
    trialDays: 14
  })

  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim() || !form.adminUsername.trim() || !form.adminPassword) {
      toast.error('Company Name, Admin Username and Password are required')
      return
    }

    setLoading(true)
    try {
      await companyAPI.create({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        adminUsername: form.adminUsername.toLowerCase().trim(),
        adminEmail: form.adminEmail.toLowerCase().trim() || form.email.trim(),
        adminPassword: form.adminPassword,
        planType: form.planType,
        trialDays: form.trialDays
      })
      toast.success('Company and Administrator created successfully!')
      onSuccess()
      setForm({
        name: '',
        email: '',
        phone: '',
        adminUsername: '',
        adminEmail: '',
        adminPassword: '',
        planType: 'trial',
        trialDays: 14
      })
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create organization')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Register New Tenant Organization"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
          <button className="btn btn-secondary" onClick={onClose} disabled={loading}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={loading}>
            {loading ? 'Creating...' : 'Register Company'}
          </button>
        </div>
      }
    >
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">Company Name *</label>
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
            <label className="form-label">Company Billing Email</label>
            <input
              type="email"
              className="form-control"
              value={form.email}
              onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Company Contact Phone</label>
            <input
              type="text"
              className="form-control"
              value={form.phone}
              onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))}
            />
          </div>
        </div>

        <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', margin: '1.25rem 0', paddingTop: '1.25rem' }}>
          <h3 style={{ fontSize: '0.875rem', fontWeight: 700, marginBottom: '0.75rem', color: 'var(--text-primary)' }}>
            Company Administrator Account Config
          </h3>
          
          <div className="form-group">
            <label className="form-label">Admin Username *</label>
            <input
              type="text"
              className="form-control"
              value={form.adminUsername}
              onChange={(e) => setForm(f => ({ ...f, adminUsername: e.target.value }))}
              required
            />
          </div>

          <div className="grid grid-2">
            <div className="form-group">
              <label className="form-label">Admin Email (Defaults to Billing)</label>
              <input
                type="email"
                className="form-control"
                value={form.adminEmail}
                onChange={(e) => setForm(f => ({ ...f, adminEmail: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Admin Password *</label>
              <input
                type="password"
                className="form-control"
                value={form.adminPassword}
                onChange={(e) => setForm(f => ({ ...f, adminPassword: e.target.value }))}
                required
              />
            </div>
          </div>
        </div>

        <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', margin: '1.25rem 0', paddingTop: '1.25rem' }}>
          <div className="grid grid-2">
            <div className="form-group">
              <label className="form-label">Initial Subscription Package</label>
              <select
                className="form-control"
                value={form.planType}
                onChange={(e) => setForm(f => ({ ...f, planType: e.target.value }))}
              >
                <option value="trial">Trial Package</option>
                <option value="starter">Starter Package</option>
                <option value="business">Business Package</option>
                <option value="agency">Agency Package</option>
              </select>
            </div>
            {form.planType === 'trial' && (
              <div className="form-group">
                <label className="form-label">Trial Duration (Days)</label>
                <input
                  type="number"
                  className="form-control"
                  value={form.trialDays}
                  onChange={(e) => setForm(f => ({ ...f, trialDays: parseInt(e.target.value) || 14 }))}
                />
              </div>
            )}
          </div>
        </div>
      </form>
    </Modal>
  )
}
