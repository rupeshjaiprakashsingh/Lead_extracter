import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { authAPI } from '../services/api'
import toast from 'react-hot-toast'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true)
    try {
      await authAPI.forgotPassword(email.trim())
      setSent(true)
      toast.success('Reset link sent! Check your email.')
    } catch (err) {
      const msg = err?.response?.data?.message || 'Failed to send reset link'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-orb login-orb-1" />
      <div className="login-orb login-orb-2" />

      <div className="login-card">
        <div className="login-logo" style={{ marginBottom: 'var(--space-6)' }}>
          <div className="login-logo-icon">🚀</div>
          <div className="login-logo-text">
            <h1>LeadFlow</h1>
            <p>CRM Platform</p>
          </div>
        </div>

        {sent ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: 'var(--space-4)' }}>📧</div>
            <h2 style={{ fontSize: '1.375rem', fontWeight: 700, marginBottom: 'var(--space-3)' }}>
              Check your email
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', lineHeight: 1.6, marginBottom: 'var(--space-6)' }}>
              We've sent a password reset link to <strong style={{ color: 'var(--text-primary)' }}>{email}</strong>.
              Check your inbox and follow the instructions.
            </p>
            <Link to="/login" className="btn btn-secondary" style={{ width: '100%' }}>
              ← Back to Login
            </Link>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 'var(--space-6)', textAlign: 'center' }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                Reset Password
              </h2>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                Enter your email to receive a reset link
              </p>
            </div>

            <form onSubmit={handleSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
                <div className="form-group">
                  <label className="form-label" htmlFor="email">Email Address</label>
                  <div className="input-group">
                    <span className="input-icon">📧</span>
                    <input
                      id="email"
                      type="email"
                      className="form-input"
                      placeholder="your@email.com"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      autoFocus
                      required
                      style={{ paddingLeft: '2.5rem' }}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className={`btn btn-primary btn-xl ${loading ? 'btn-loading' : ''}`}
                  disabled={loading}
                  style={{ width: '100%' }}
                >
                  {loading ? <><span className="spinner" /> Sending...</> : '📧 Send Reset Link'}
                </button>

                <Link
                  to="/login"
                  style={{
                    textAlign: 'center',
                    fontSize: '0.875rem',
                    color: 'var(--text-muted)',
                  }}
                >
                  ← Back to Login
                </Link>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
