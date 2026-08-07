import axios from 'axios';
import { getToken } from './token';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL + '/api',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// Attach the stored token as Authorization header
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = getToken();
    if (token) {
      config.headers = config.headers ?? {};
      (config.headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
    }
  }
  return config;
});

/**
 * Routes that are legitimately used while signed out. A 401 on these is the
 * expected state, not a session expiry, so the interceptor must not bounce.
 *
 * Onboarding is the reason this exists: the whole funnel runs before an account
 * exists and still talks to the API, so a blanket redirect would throw the user
 * out of signup the moment anything 401s.
 */
const PUBLIC_ROUTES = ['/login', '/onboarding', '/welcome', '/kitchen-sink'];

const isPublicRoute = (path: string) =>
  PUBLIC_ROUTES.some((r) => path === r || path.startsWith(`${r}/`));

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      if (!isPublicRoute(window.location.pathname)) window.location.href = '/login';
    }
    return Promise.reject(err);
  },
);

// ─── Auth ────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),
  /** Signup at the end of the onboarding funnel — the whole payload in one call. */
  register: (payload: Record<string, unknown>) => api.post('/auth/register', payload),
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
  startSession: (workoutType: string, workoutPlanId?: number, plan?: unknown) =>
    api.post('/workouts/sessions', { workoutType, workoutPlanId, plan }),
  /** Build a session (SPEC §5.1). Reads and writes nothing until Start Workout. */
  generate: (params: {
    durationMin?: number;
    difficulty?: string;
    equipment?: string;
    muscles?: string;
  }) => api.get('/workouts/generate', { params }),
  /** Last session's actual sets for one exercise — the tracker's PREV column. */
  getPrevious: (exerciseId: string) => api.get(`/workouts/previous/${encodeURIComponent(exerciseId)}`),
  getSessions: () => api.get('/workouts/sessions'),
  getSessionHistory: () => api.get('/workouts/sessions/history'),
  getSession: (id: number) => api.get(`/workouts/sessions/${id}`),
  getSessionSummary: (id: number) => api.get(`/workouts/sessions/${id}/summary`),
  getExercises: () => api.get('/workouts/exercises'),
  getExerciseHistory: (name: string) => api.get('/workouts/exercises/history', { params: { name } }),
  completeSession: (id: number, finish?: object) =>
    api.patch(`/workouts/sessions/${id}/complete`, finish ?? {}),
  resetSession: (id: number) =>
    api.delete(`/workouts/sessions/${id}`),
  logSet: (sessionId: number, data: any) =>
    api.post(`/workouts/sessions/${sessionId}/sets`, data),
  deleteSet: (id: number) => api.delete(`/workouts/sets/${id}`),
  getHeatmap: (year?: number) =>
    api.get('/workouts/heatmap', { params: { year } }),
  getPRs: () => api.get('/workouts/prs'),
  createPR: (data: any) => api.post('/workouts/prs', data),
  getLastValues: (workoutType: string) =>
    api.get(`/workouts/last-values/${encodeURIComponent(workoutType)}`),
};

// ─── Body Weight ──────────────────────────────────────────────────────────────
export const bodyWeightApi = {
  log: (weightKg: number, note?: string, date?: string) =>
    api.post('/body-weight', { weightKg, note, date }),
  getHistory: (days?: number) =>
    api.get('/body-weight/history', { params: { days } }),
  getLatest: () => api.get('/body-weight/latest'),
  deleteEntry: (id: number) => api.delete(`/body-weight/${id}`),
};

// ─── Goals ────────────────────────────────────────────────────────────────────
export const goalsApi = {
  list: () => api.get('/goals'),
  create: (data: { type: 'bodyweight' | 'lift'; exerciseName?: string; targetValue: number }) =>
    api.post('/goals', data),
  remove: (id: number) => api.delete(`/goals/${id}`),
};

// ─── Creatine ─────────────────────────────────────────────────────────────────
export const creatineApi = {
  logDose: (amountGrams: number, note?: string, date?: string) =>
    api.post('/creatine', { amountGrams, note, date }),
  getToday: () => api.get('/creatine/today'),
  getByDate: (date: string) => api.get('/creatine/by-date', { params: { date } }),
  getHistory: (days?: number) =>
    api.get('/creatine/history', { params: { days } }),
  deleteLog: (id: number) => api.delete(`/creatine/${id}`),
};

// ─── Supplements ──────────────────────────────────────────────────────────────
export const supplementsApi = {
  list: () => api.get('/supplements'),
  add: (data: { name: string; unit?: string; defaultDose?: number; dailyTarget?: number; color?: string }) =>
    api.post('/supplements', data),
  update: (id: number, data: { name?: string; unit?: string; defaultDose?: number; dailyTarget?: number; color?: string }) =>
    api.patch(`/supplements/${id}`, data),
  remove: (id: number) => api.delete(`/supplements/${id}`),
  getToday: () => api.get('/supplements/today'),
  getByDate: (date: string) => api.get('/supplements/by-date', { params: { date } }),
  logDose: (id: number, amount: number, date?: string) => api.post(`/supplements/${id}/log`, { amount, date }),
  updateLog: (logId: number, amount: number) => api.patch(`/supplements/log/${logId}`, { amount }),
  deleteLog: (logId: number) => api.delete(`/supplements/log/${logId}`),
  getHeatmap: (year?: number) => api.get('/supplements/heatmap', { params: { year } }),
};

// ─── Exercises ────────────────────────────────────────────────────────────────
export const exercisesApi = {
  /** The 873-exercise catalog. Public, and cached by the picker. */
  catalog: (params?: { q?: string; muscle?: string; equipment?: string }) =>
    api.get('/exercises/catalog', { params }),
  catalogExercise: (id: string) => api.get(`/exercises/catalog/${encodeURIComponent(id)}`),
  getMyPlans: () => api.get('/exercises/my-plans'),
  getAllPlans: () => api.get('/exercises/plans'),
  getPlan: (id: number) => api.get(`/exercises/plans/${id}`),
  updateWeights: (planId: number, customWeights: Record<string, number>) =>
    api.patch(`/exercises/my-plans/${planId}/weights`, { customWeights }),
};

// ─── Home ─────────────────────────────────────────────────────────────────────
export const homeApi = {
  /** Everything the Home tab renders, in one call. */
  summary: () => api.get('/home/summary'),
};

// ─── Ranks ────────────────────────────────────────────────────────────────────
export const ranksApi = {
  me: () => api.get('/ranks/me'),
  exercises: () => api.get('/ranks/exercises'),
  bodygraph: () => api.get('/ranks/bodygraph'),
  exercise: (id: string) => api.get(`/ranks/exercise/${encodeURIComponent(id)}`),
  leagues: () => api.get('/ranks/leagues'),
  /** Calculator's `Save Rank` — logs the lift, because ranks derive from sets. */
  record: (body: { exerciseId: string; weightKg: number; reps: number }) =>
    api.post('/ranks/record', body),
  /** Public — onboarding ranks a lift before the account exists. */
  calculate: (body: {
    exerciseId: string;
    weightKg: number;
    reps: number;
    bodyweightKg: number;
    sex?: string;
    age?: number;
  }) => api.post('/ranks/calculate', body),
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

// ─── Push notifications ───────────────────────────────────────────────────────
export const pushApi = {
  getVapid: () => api.get('/push/vapid'),
  getStatus: () => api.get('/push/status'),
  subscribe: (subscription: any) => api.post('/push/subscribe', { subscription }),
  unsubscribe: (endpoint: string) => api.post('/push/unsubscribe', { endpoint }),
  test: () => api.post('/push/test'),
};

// ─── Admin ────────────────────────────────────────────────────────────────────
export const adminApi = {
  getStats: () => api.get('/admin/stats'),
  getActivity: () => api.get('/admin/activity'),
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
