import React, { Suspense, lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useAuth } from './context/AuthContext'
import { ProtectedRoute, SuperAdminRoute, CompanyAdminRoute } from './components/ProtectedRoute'

// ── Layouts ──────────────────────────────────────────────────
import DashboardLayout from './layouts/DashboardLayout'
import SuperAdminLayout from './layouts/SuperAdminLayout'

// ── Auth Pages ───────────────────────────────────────────────
import LoginPage from './pages/LoginPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import ResetPasswordPage from './pages/ResetPasswordPage'

// ── SuperAdmin Pages ─────────────────────────────────────────
import SuperAdminDashboard from './pages/superadmin/SuperAdminDashboard'
import CompaniesPage from './pages/superadmin/CompaniesPage'
import CompanyDetailPage from './pages/superadmin/CompanyDetailPage'
import PlansPage from './pages/superadmin/PlansPage'

// ── Dashboard Pages ──────────────────────────────────────────
import DashboardHome from './pages/dashboard/DashboardHome'
import LeadsPage from './pages/dashboard/LeadsPage'
import FollowupsPage from './pages/dashboard/FollowupsPage'
import CampaignsPage from './pages/dashboard/CampaignsPage'
import SocialPage from './pages/dashboard/SocialPage'
import SocialLeadsPage from './pages/dashboard/SocialLeadsPage'
import SettingsPage from './pages/dashboard/SettingsPage'
import UsersPage from './pages/dashboard/UsersPage'
import SchedulePage from './pages/dashboard/SchedulePage'

// ── Root redirect based on role ──────────────────────────────
function RootRedirect() {
  const { isAuthenticated, isSuperAdmin, loading } = useAuth()
  if (loading) return null
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (isSuperAdmin) return <Navigate to="/superadmin/dashboard" replace />
  return <Navigate to="/dashboard" replace />
}

function App() {
  return (
    <>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: 'var(--bg-card)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-card)',
            borderRadius: '10px',
            boxShadow: 'var(--shadow-lg)',
            fontSize: '0.875rem',
          },
          success: {
            iconTheme: { primary: '#10b981', secondary: 'white' },
          },
          error: {
            iconTheme: { primary: '#ef4444', secondary: 'white' },
          },
        }}
      />
      <Routes>
        {/* Root */}
        <Route path="/" element={<RootRedirect />} />

        {/* Auth */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password/:token" element={<ResetPasswordPage />} />

        {/* SuperAdmin */}
        <Route
          path="/superadmin"
          element={
            <SuperAdminRoute>
              <SuperAdminLayout />
            </SuperAdminRoute>
          }
        >
          <Route index element={<Navigate to="/superadmin/dashboard" replace />} />
          <Route path="dashboard" element={<SuperAdminDashboard />} />
          <Route path="companies" element={<CompaniesPage />} />
          <Route path="companies/:id" element={<CompanyDetailPage />} />
          <Route path="plans" element={<PlansPage />} />
        </Route>

        {/* Company Dashboard */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<DashboardHome />} />
          <Route path="leads" element={<LeadsPage />} />
          <Route path="followups" element={<FollowupsPage />} />
          <Route path="campaigns" element={<CampaignsPage />} />
          <Route path="social" element={<SocialPage />} />
          <Route path="social-leads" element={<SocialLeadsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route
            path="users"
            element={
              <CompanyAdminRoute>
                <UsersPage />
              </CompanyAdminRoute>
            }
          />
          <Route path="schedule" element={<SchedulePage />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}

export default App
