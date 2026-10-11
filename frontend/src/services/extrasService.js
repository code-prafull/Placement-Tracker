import api from './api';

export const importCsv = (content, defaultStatus = 'solved') =>
  api.post('/import/csv', { content, defaultStatus }).then((r) => r.data);

export const importJson = (content, defaultStatus = 'solved') =>
  api.post('/import/json', { content, defaultStatus }).then((r) => r.data);

export const templateUrl = `${api.defaults.baseURL}/import/template`;

export const startInterview = (payload = {}) =>
  api.post('/interview/start', payload).then((r) => r.data);

export const getInterview = (id) => api.get(`/interview/${id}`).then((r) => r.data);

export const completeInterview = (id, answers) =>
  api.post(`/interview/${id}/complete`, { answers }).then((r) => r.data);

export const listInterviews = () => api.get('/interview').then((r) => r.data);
