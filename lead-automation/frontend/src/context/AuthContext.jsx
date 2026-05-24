import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { authAPI } from '../services/api'
import toast from 'react-hot-toast'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(() => localStorage.getItem('crm_token'))
  const [loading, setLoading] = useState(true)

  // Bootstrap: verify token on mount
  useEffect(() => {
    const init = async () => {
      const storedToken = localStorage.getItem('crm_token')
      if (!storedToken) {
        setLoading(false)
        return
      }
      try {
        const res = await authAPI.getMe()
        setUser(res.data.user)
        setToken(storedToken)
      } catch {
        localStorage.removeItem('crm_token')
        setToken(null)
        setUser(null)
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

  const login = useCallback(async (credentials) => {
    const res = await authAPI.login(credentials)
    const { token: newToken, user: newUser } = res.data
    localStorage.setItem('crm_token', newToken)
    setToken(newToken)
    setUser(newUser)
    return newUser
  }, [])

  const logout = useCallback(async () => {
    try {
      await authAPI.logout()
    } catch { /* ignore */ }
    localStorage.removeItem('crm_token')
    setToken(null)
    setUser(null)
  }, [])

  const refreshUser = useCallback(async () => {
    try {
      const res = await authAPI.getMe()
      setUser(res.data.user)
    } catch { /* ignore */ }
  }, [])

  const value = {
    user,
    token,
    loading,
    login,
    logout,
    refreshUser,
    isAuthenticated: !!token && !!user,
    isSuperAdmin: user?.role === 'superadmin',
    isCompanyAdmin: user?.role === 'company_admin',
    isEmployee: user?.role === 'employee',
    companyId: user?.company_id || null,
    companyName: user?.company_name || '',
    planName: user?.plan_name || 'trial',
    planLeadsLimit: user?.leads_limit || 100,
    totalLeads: user?.total_leads || 0,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export default AuthContext
