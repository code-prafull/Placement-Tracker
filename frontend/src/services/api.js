import axios from 'axios';

// Dev server hits the API directly; a production build defaults to same-origin
// `/api` so one Render service can serve the API + the SPA (set VITE_API_URL to
// override when the API lives on its own domain).
export const API_URL =
  import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5000/api' : '/api');

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// Send the browser timezone so every day boundary (due today, heatmap,
// streak) is computed in the user's local day on the server.
api.interceptors.request.use((config) => {
  config.headers['X-Tz-Offset'] = String(new Date().getTimezoneOffset());
  return config;
});

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => {
  onUnauthorized = fn;
};

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err.response?.status;
    const url = err.config?.url || '';
    const isAuthCall = url.includes('/auth/login') || url.includes('/auth/register') || url.includes('/auth/me');
    if (status === 401 && !isAuthCall) onUnauthorized();
    const message =
      err.response?.data?.message ||
      (err.code === 'ERR_NETWORK' ? 'Cannot reach the API server — is the backend running?' : 'Something went wrong');
    return Promise.reject(Object.assign(err, { friendlyMessage: message }));
  }
);

export default api;
