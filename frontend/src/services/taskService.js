import api from './api';

export const getTodayTask = () => api.get('/tasks/today').then((r) => r.data);
export const getWeeklyPerformance = () => api.get('/tasks/weekly').then((r) => r.data);
