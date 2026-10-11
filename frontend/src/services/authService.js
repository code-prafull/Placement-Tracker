import api from './api';

export const register = (name, email, password) =>
  api.post('/auth/register', { name, email, password }).then((r) => r.data);

export const login = (email, password) =>
  api.post('/auth/login', { email, password }).then((r) => r.data);

export const logout = () => api.post('/auth/logout').then((r) => r.data);

export const me = () => api.get('/auth/me').then((r) => r.data);

export const updateProfile = (payload) =>
  api.put('/auth/profile', payload).then((r) => r.data);
