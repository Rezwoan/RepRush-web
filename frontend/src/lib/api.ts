import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL + '/api',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// Attach per-tab sessionStorage token as Authorization header
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = sessionStorage.getItem('reprush_token');
    if (token) {
      config.headers = config.headers ?? {};
      (config.headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
    }
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      const isLoginPage = window.location.pathname === '/login';
      if (!isLoginPage) window.location.href = '/login';
    }
    return Promise.reject(err);
  },
);

// ─── Auth ────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),
  activate: (token: string, newPassword: string) =>
    api.post('/auth/activate', { token, newPassword }),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
  changePassword: (oldPassword: string, newPassword: string) =>
    api.post('/auth/change-password', { oldPassword, newPassword }),
};

// ─── Users ───────────────────────────────────────────────────────────────────
export const usersApi = {
  getProfile: () => api.get('/users/profile'),
  updateProfile: (data: any) => api.patch('/users/profile', data),
  uploadImage: (imageBase64: string) =>
    api.post('/users/profile/image', { imageBase64 }),
  getOnboarding: () => api.get('/users/onboarding'),
  dismissOnboarding: () => api.patch('/users/onboarding/dismiss'),
};

// ─── Workouts ─────────────────────────────────────────────────────────────────
export const workoutsApi = {
  startSession: (workoutType: string, workoutPlanId?: number) =>
    api.post('/workouts/sessions', { workoutType, workoutPlanId }),
  getSessions: () => api.get('/workouts/sessions'),
  getSession: (id: number) => api.get(`/workouts/sessions/${id}`),
  completeSession: (id: number, notes?: string) =>
    api.patch(`/workouts/sessions/${id}/complete`, { notes }),
  resetSession: (id: number) =>
    api.delete(`/workouts/sessions/${id}`),
  logSet: (sessionId: number, data: any) =>
    api.post(`/workouts/sessions/${sessionId}/sets`, data),
  deleteSet: (id: number) => api.delete(`/workouts/sets/${id}`),
  getHeatmap: (year?: number) =>
    api.get('/workouts/heatmap', { params: { year } }),
  getPRs: () => api.get('/workouts/prs'),
  createPR: (data: any) => api.post('/workouts/prs', data),
  getSuggestion: (workoutType: string) =>
    api.get(`/workouts/suggest/${encodeURIComponent(workoutType)}`),
};

// ─── Body Weight ──────────────────────────────────────────────────────────────
export const bodyWeightApi = {
  log: (weightKg: number, note?: string) =>
    api.post('/body-weight', { weightKg, note }),
  getHistory: (days?: number) =>
    api.get('/body-weight/history', { params: { days } }),
  getLatest: () => api.get('/body-weight/latest'),
};

// ─── Creatine ─────────────────────────────────────────────────────────────────
export const creatineApi = {
  logDose: (amountGrams: number, note?: string) =>
    api.post('/creatine', { amountGrams, note }),
  getToday: () => api.get('/creatine/today'),
  getHistory: (days?: number) =>
    api.get('/creatine/history', { params: { days } }),
  deleteLog: (id: number) => api.delete(`/creatine/${id}`),
};

// ─── Exercises ────────────────────────────────────────────────────────────────
export const exercisesApi = {
  getMyPlans: () => api.get('/exercises/my-plans'),
  getAllPlans: () => api.get('/exercises/plans'),
  getPlan: (id: number) => api.get(`/exercises/plans/${id}`),
  updateWeights: (planId: number, customWeights: Record<string, number>) =>
    api.patch(`/exercises/my-plans/${planId}/weights`, { customWeights }),
};

// ─── Leaderboard ──────────────────────────────────────────────────────────────
export const leaderboardApi = {
  getRelativeStrength: () => api.get('/leaderboard/relative-strength'),
  getWilks: () => api.get('/leaderboard/wilks'),
  getProgressRate: () => api.get('/leaderboard/progress-rate'),
};

// ─── Achievements ─────────────────────────────────────────────────────────────
export const achievementsApi = {
  getAchievements: () => api.get('/achievements'),
};

// ─── Admin ────────────────────────────────────────────────────────────────────
export const adminApi = {
  getStats: () => api.get('/admin/stats'),
  getUsers: () => api.get('/admin/users'),
  getUserDetail: (id: number) => api.get(`/admin/users/${id}`),
  inviteUser: (email: string, name: string) =>
    api.post('/admin/users/invite', { email, name }),
  resendInvite: (id: number) => api.post(`/admin/users/${id}/resend-invite`),
  resetPassword: (id: number) => api.post(`/admin/users/${id}/reset-password`),
  deleteUser: (id: number) => api.delete(`/admin/users/${id}`),
  compare: (userIds: number[]) =>
    api.get('/admin/compare', { params: { users: userIds.join(',') } }),
  getUserReport: (id: number, period: 'weekly' | 'monthly') =>
    api.get(`/admin/users/${id}/report`, { params: { period } }),
  sendUserReport: (id: number, period: 'weekly' | 'monthly') =>
    api.post(`/admin/users/${id}/report/send`, { period }),
  // Exercise plans
  createPlan: (name: string, exercises: any) =>
    api.post('/exercises/plans', { name, exercises }),
  updatePlan: (id: number, data: any) => api.patch(`/exercises/plans/${id}`, data),
  deletePlan: (id: number) => api.delete(`/exercises/plans/${id}`),
  assignPlan: (planId: number, userId: number, customWeights?: any) =>
    api.post(`/exercises/plans/${planId}/assign/${userId}`, { customWeights }),
  assignPlanToAll: (planId: number, userIds: number[]) =>
    api.post(`/exercises/plans/${planId}/assign`, { userIds }),
};

export default api;
