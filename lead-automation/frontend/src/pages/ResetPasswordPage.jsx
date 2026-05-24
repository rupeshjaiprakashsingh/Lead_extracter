import React, { useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { authAPI } from '../services/api'
import toast from 'react-hot-toast'

export default function ResetPasswordPage() {
  const { token } = useParams()
  const navigate = useNavigate()
  const [form, setForm] = useState({ password: '', confirm: '' })
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [showPass, setShowPass] = useState(false)

  const handleChange = (e) => setForm(f => ({ ...f, [e.target.name]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.password || form.password.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }
    if (form.password !== form.confirm) {
      toast.error('Passwords do not match')
      return
    }
    setLoading(true)
    try {
      await authAPI.resetPassword(token, form.password)
      setDone(true)
      toast.success('Password reset successfully!')
    } catch (err) {
      const msg = err?.response?.data?.message || 'Invalid or expired reset link'
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

        {done ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: 'var(--space-4)' }}>✅</div>
            <h2 style={{ fontSize: '1.375rem', fontWeight: 700, marginBottom: 'var(--space-3)' }}>
              Password Reset!
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: 'var(--space-6)' }}>
              Your password has been successfully reset. You can now log in with your new password.
            </p>
            <button
              className="btn btn-primary btn-xl"
              onClick={() => navigate('/login')}
              style={{ width: '100%' }}
            >
              → Go to Login
            </button>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 'var(--space-6)', textAlign: 'center' }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                New Password
              </h2>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                Choose a strong password for your account
              </p>
            </div>

            <form onSubmit={handleSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <div className="form-group">
                  <label className="form-label">New Password</label>
                  <div style={{ position: 'relative' }}>
                    <span style={{
                      position: 'absolute', left: '0.75rem', top: '50%',
                      transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none'
                    }}>🔒</span>
                    <input
                      name="password"
                      type={showPass ? 'text' : 'password'}
                      className="form-input"
                      placeholder="Min 6 characters"
                      value={form.password}
                      onChange={handleChange}
                      required
                      style={{ paddingLeft: '2.5rem', paddingRight: '2.5rem' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(s => !s)}
                      style={{
                        position: 'absolute', right: '0.75rem', top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none', border: 'none',
                        color: 'var(--text-muted)', cursor: 'pointer'
                      }}
                    >
                      {showPass ? '🙈' : '👁️'}
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Confirm Password</label>
                  <div style={{ position: 'relative' }}>
                    <span style={{
                      position: 'absolute', left: '0.75rem', top: '50%',
                      transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none'
                    }}>🔑</span>
                    <input
                      name="confirm"
                      type={showPass ? 'text' : 'password'}
                      className="form-input"
                      placeholder="Repeat new password"
                      value={form.confirm}
                      onChange={handleChange}
                      required
                      style={{ paddingLeft: '2.5rem' }}
                    />
                  </div>
                  {form.confirm && form.password !== form.confirm && (
                    <span className="form-error">Passwords do not match</span>
                  )}
                </div>

                <button
                  type="submit"
                  className={`btn btn-primary btn-xl ${loading ? 'btn-loading' : ''}`}
                  disabled={loading}
                  style={{ width: '100%', marginTop: 'var(--space-2)' }}
                >
                  {loading ? <><span className="spinner" /> Resetting...</> : '🔑 Reset Password'}
                </button>

                <Link to="/login" style={{ textAlign: 'center', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
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
