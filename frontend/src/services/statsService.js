import api from './api';

export const getDashboard = () => api.get('/dashboard').then((r) => r.data);
export const getAnalytics = () => api.get('/analytics').then((r) => r.data);

export const getHeatmap = (weeks = 26) =>
  api.get('/activity/heatmap', { params: { weeks } }).then((r) => r.data);

export const getDayDetail = (date) =>
  api.get('/activity/day', { params: { date } }).then((r) => r.data);

export const getStreak = () => api.get('/activity/streak').then((r) => r.data);
export const getTodayActivity = () => api.get('/activity/today').then((r) => r.data);

export const getTopics = () => api.get('/topics').then((r) => r.data);
export const getWeakTopics = () => api.get('/topics/weak').then((r) => r.data);

export const getTopicQuestions = (name, params = {}) =>
  api.get(`/topics/${encodeURIComponent(name)}/questions`, { params }).then((r) => r.data);
