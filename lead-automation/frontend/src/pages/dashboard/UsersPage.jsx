import React, { useEffect, useState } from 'react'
import { userAPI } from '../../services/api'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import toast from 'react-hot-toast'

export default function UsersPage() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [isResetOpen, setIsResetOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState(null)
  
  const [form, setForm] = useState({
    username: '',
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    role: 'employee'
  })

  const [newPassword, setNewPassword] = useState('')

  useEffect(() => {
    loadUsers()
  }, [])

  const loadUsers = async () => {
    setLoading(true)
    try {
      const res = await userAPI.getAll()
      setUsers(res.data?.users || [])
    } catch (err) {
      toast.error('Failed to load users list')
    } finally {
      setLoading(false)
    }
  }

  const handleToggleStatus = async (user) => {
    try {
      await userAPI.update(user._id, { isActive: !user.isActive })
      toast.success(`${user.username} account status updated`)
      loadUsers()
    } catch (err) {
      toast.error('Status change failed')
    }
  }

  const handleCreateUser = async (e) => {
    e.preventDefault()
    if (!form.username.trim() || !form.password) {
      toast.error('Username and password are required')
      return
    }
    try {
      await userAPI.create(form)
      toast.success('User account created successfully!')
      setIsAddOpen(false)
      loadUsers()
      setForm({ username: '', email: '', password: '', firstName: '', lastName: '', role: 'employee' })
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create user account')
    }
  }

  const handleResetPassword = async (e) => {
    e.preventDefault()
    if (!newPassword.trim()) return
    try {
      await userAPI.resetPassword(selectedUser._id, { password: newPassword })
      toast.success(`Password updated for ${selectedUser.username}!`)
      setIsResetOpen(false)
      setNewPassword('')
    } catch (err) {
      toast.error('Failed to update password')
    }
  }

  const handleDeleteUser = async (id) => {
    if (!window.confirm('Are you sure you want to delete this user?')) return
    try {
      await userAPI.delete(id)
      toast.success('User account deleted')
      loadUsers()
    } catch (err) {
      toast.error('Delete failed')
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Team Configuration</h1>
          <p className="page-subtitle">Add and configure employee accounts and roles</p>
        </div>
        <button className="btn btn-primary" onClick={() => setIsAddOpen(true)}>
          ➕ Create User Account
        </button>
      </div>

      <div className="card">
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Full Name</th>
                <th>Role</th>
                <th>Status</th>
                <th>Last Login</th>
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
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '3rem' }}>
                    No users found.
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user._id}>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{user.username}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{user.email || 'No email registered'}</div>
                    </td>
                    <td>{user.firstName ? `${user.firstName} ${user.lastName || ''}` : '-'}</td>
                    <td>
                      <Badge variant={user.role}>{user.role?.toUpperCase()}</Badge>
                    </td>
                    <td>
                      <Badge variant={user.isActive ? 'active' : 'inactive'}>
                        {user.isActive ? 'Active' : 'Suspended'}
                      </Badge>
                    </td>
                    <td>{user.lastLogin ? new Date(user.lastLogin).toLocaleDateString() : 'Never logged in'}</td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '0.375rem', justifyContent: 'flex-end' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => { setSelectedUser(user); setIsResetOpen(true); }}>🗝️ Password</button>
                        <button 
                          className={`btn ${user.isActive ? 'btn-danger' : 'btn-primary'} btn-sm`}
                          onClick={() => handleToggleStatus(user)}
                        >
                          {user.isActive ? 'Suspend' : 'Activate'}
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDeleteUser(user._id)}>🗑️ Delete</button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add User Modal */}
      <Modal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        title="Create Team Member Account"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <button className="btn btn-secondary" onClick={() => setIsAddOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleCreateUser}>Save User Account</button>
          </div>
        }
      >
        <form onSubmit={handleCreateUser}>
          <div className="grid grid-2">
            <div className="form-group">
              <label className="form-label">First Name</label>
              <input
                type="text"
                className="form-control"
                value={form.firstName}
                onChange={(e) => setForm(f => ({ ...f, firstName: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Last Name</label>
              <input
                type="text"
                className="form-control"
                value={form.lastName}
                onChange={(e) => setForm(f => ({ ...f, lastName: e.target.value }))}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Username (lowercase, alphanumeric)</label>
            <input
              type="text"
              className="form-control"
              value={form.username}
              onChange={(e) => setForm(f => ({ ...f, username: e.target.value.toLowerCase().replace(/\s+/g, '') }))}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input
              type="email"
              className="form-control"
              value={form.email}
              onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              type="password"
              className="form-control"
              value={form.password}
              onChange={(e) => setForm(f => ({ ...f, password: e.target.value }))}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Workspace Role Permissions</label>
            <select
              className="form-control"
              value={form.role}
              onChange={(e) => setForm(f => ({ ...f, role: e.target.value }))}
            >
              <option value="employee">Employee (View-only / Outreach only)</option>
              <option value="company_admin">Company Admin (Full permissions)</option>
            </select>
          </div>
        </form>
      </Modal>

      {/* Reset Password Modal */}
      <Modal
        isOpen={isResetOpen}
        onClose={() => setIsResetOpen(false)}
        title={`Reset Password: ${selectedUser?.username}`}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <button className="btn btn-secondary" onClick={() => setIsResetOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleResetPassword}>Save Password</button>
          </div>
        }
      >
        <form onSubmit={handleResetPassword}>
          <div className="form-group">
            <label className="form-label">New Password</label>
            <input
              type="password"
              className="form-control"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Min 6 characters"
              required
            />
          </div>
        </form>
      </Modal>
    </div>
  )
}
