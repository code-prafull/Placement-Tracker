import api from './api';

export const getToday = () => api.get('/revisions/today').then((r) => r.data);
export const getOverdue = () => api.get('/revisions/overdue').then((r) => r.data);
export const getUpcoming = () => api.get('/revisions/upcoming').then((r) => r.data);
export const getWeak = () => api.get('/revisions/weak').then((r) => r.data);
export const getCounts = () => api.get('/revisions/counts').then((r) => r.data);
export const getQueue = (name, params = {}) =>
  api.get(`/revisions/queues/${name}`, { params }).then((r) => r.data);

export const buildSession = (payload) =>
  api.post('/revisions/session', payload).then((r) => r.data);

export const startRevision = (questionId) =>
  api.post(`/revisions/${questionId}/start`).then((r) => r.data);

export const completeRevision = (questionId, payload) =>
  api.post(`/revisions/${questionId}/complete`, payload).then((r) => r.data);

export const getHistory = (questionId) =>
  api.get(`/revisions/${questionId}/history`).then((r) => r.data);
