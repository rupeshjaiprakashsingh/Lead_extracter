import axios from 'axios'

// ── Axios Instance ──────────────────────────────────────────
const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' }
})

// ── Request Interceptor: Attach JWT ─────────────────────────
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('crm_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// ── Response Interceptor: Handle 401 ────────────────────────
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('crm_token')
      // Only redirect if not already on login page
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

// ═══════════════════════════════════════════════════════════
//  AUTH API
// ═══════════════════════════════════════════════════════════
export const authAPI = {
  login: (credentials) => api.post('/auth/login', credentials),
  logout: () => api.post('/auth/logout'),
  getMe: () => api.get('/auth/me'),
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }),
  resetPassword: (token, password) => api.post('/auth/reset-password', { token, password }),
  changePassword: (data) => api.post('/auth/change-password', data),
}

// ═══════════════════════════════════════════════════════════
//  COMPANY API  (SuperAdmin)
// ═══════════════════════════════════════════════════════════
export const companyAPI = {
  getAll: (params) => api.get('/admin/companies', { params }),
  getById: (id) => api.get(`/admin/companies/${id}`),
  create: (data) => api.post('/admin/companies', data),
  update: (id, data) => api.put(`/admin/companies/${id}`, data),
  delete: (id) => api.delete(`/admin/companies/${id}`),
  activate: (id) => api.post(`/admin/companies/${id}/activate`),
  deactivate: (id) => api.post(`/admin/companies/${id}/deactivate`),
  assignPlan: (id, data) => api.post(`/admin/companies/${id}/plan`, data),
  resetData: (id) => api.post(`/admin/companies/${id}/reset`),
  getStats: () => api.get('/admin/stats'),
  getActivity: () => api.get('/admin/activity'),
}

// ═══════════════════════════════════════════════════════════
//  USER API  (Company Admin)
// ═══════════════════════════════════════════════════════════
export const userAPI = {
  getAll: (params) => api.get('/users', { params }),
  getById: (id) => api.get(`/users/${id}`),
  create: (data) => api.post('/users', data),
  update: (id, data) => api.put(`/users/${id}`, data),
  delete: (id) => api.delete(`/users/${id}`),
  resetPassword: (id, data) => api.post(`/users/${id}/reset-password`, data),
  toggleStatus: (id) => api.post(`/users/${id}/toggle-status`),
}

// ═══════════════════════════════════════════════════════════
//  LEAD API
// ═══════════════════════════════════════════════════════════
export const leadAPI = {
  getAll: (params) => api.get('/leads', { params }),
  getById: (id) => api.get(`/leads/${id}`),
  create: (data) => api.post('/leads', data),
  update: (id, data) => api.put(`/leads/${id}`, data),
  delete: (id) => api.delete(`/leads/${id}`),
  deleteMany: (ids) => api.post('/leads/delete-many', { ids }),
  getStats: () => api.get('/leads/stats'),
  importExcel: (formData) =>
    api.post('/leads/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  exportExcel: (params) =>
    api.get('/leads/export', { params, responseType: 'blob' }),
  extractEmails: (ids) => api.post('/leads/extract-emails', { ids }),
  sendWA: (data) => api.post('/leads/send-wa', data),
  sendWABulk: (ids, template) => api.post('/leads/send-wa-bulk', { ids, template }),
  sendEmail: (data) => api.post('/leads/send-email', data),
  sendEmailBulk: (ids, data) => api.post('/leads/send-email-bulk', { ids, ...data }),
  scrape: (data) => api.post('/leads/scrape', data),
  addToFollowup: (ids) => api.post('/leads/followup', { ids }),
  removeFromFollowup: (ids) => api.post('/leads/followup/remove', { ids }),
  getCategories: () => api.get('/leads/categories'),
  getCities: () => api.get('/leads/cities'),
}

// ═══════════════════════════════════════════════════════════
//  SETTINGS API
// ═══════════════════════════════════════════════════════════
export const settingsAPI = {
  get: () => api.get('/settings'),
  save: (data) => api.post('/settings', data),
  testSMTP: (data) => api.post('/settings/test-smtp', data),
  testWA: (data) => api.post('/settings/test-wa', data),
  getProfile: () => api.get('/settings/profile'),
  saveProfile: (data) => api.put('/settings/profile', data),
  getTemplates: () => api.get('/settings/templates'),
  saveTemplates: (data) => api.post('/settings/templates', data),
}

// ═══════════════════════════════════════════════════════════
//  SCHEDULE API
// ═══════════════════════════════════════════════════════════
export const scheduleAPI = {
  get: () => api.get('/schedule'),
  save: (data) => api.post('/schedule', data),
  runNow: () => api.post('/schedule/run-now'),
  getStatus: () => api.get('/schedule/status'),
  getTodayStats: () => api.get('/schedule/today-stats'),
}

// ═══════════════════════════════════════════════════════════
//  SOCIAL API
// ═══════════════════════════════════════════════════════════
export const socialAPI = {
  getSettings: () => api.get('/social/settings'),
  saveSettings: (data) => api.post('/social/settings', data),
  getPosts: (params) => api.get('/social/posts', { params }),
  generatePreview: (data) => api.post('/social/preview', data),
  postNow: (data) => api.post('/social/post', data),
}

// ═══════════════════════════════════════════════════════════
//  FOLLOWUP API
// ═══════════════════════════════════════════════════════════
export const followupAPI = {
  getAll: (params) => api.get('/followups', { params }),
  sendWA: (id, data) => api.post(`/followups/${id}/send-wa`, data),
  sendEmail: (id, data) => api.post(`/followups/${id}/send-email`, data),
  sendWABulk: (ids, template) => api.post('/followups/send-wa-bulk', { ids, template }),
  sendEmailBulk: (ids, data) => api.post('/followups/send-email-bulk', { ids, ...data }),
  remove: (ids) => api.post('/followups/remove', { ids }),
  getStats: () => api.get('/followups/stats'),
}

// ═══════════════════════════════════════════════════════════
//  CAMPAIGN API
// ═══════════════════════════════════════════════════════════
export const campaignAPI = {
  getAll: (params) => api.get('/campaigns', { params }),
  getStats: () => api.get('/campaigns/stats'),
  getByKeyword: (keyword) => api.get(`/campaigns/keyword/${keyword}`),
}

export default api
