import api from './api';

export const listQuestions = (params = {}) =>
  api.get('/questions', { params }).then((r) => r.data);

export const getQuestion = (id) => api.get(`/questions/${id}`).then((r) => r.data);

export const createQuestion = (payload) =>
  api.post('/questions', payload).then((r) => r.data);

export const updateQuestion = (id, payload) =>
  api.put(`/questions/${id}`, payload).then((r) => r.data);

export const deleteQuestion = (id) => api.delete(`/questions/${id}`).then((r) => r.data);

export const markSolved = (id) => api.post(`/questions/${id}/solve`).then((r) => r.data);

export const bulkAction = (action, ids, payload = {}) =>
  api.post('/questions/bulk', { action, ids, payload }).then((r) => r.data);

export const getFacets = () => api.get('/questions/facets').then((r) => r.data);
