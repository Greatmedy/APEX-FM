import axios from 'axios';

export const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const api = axios.create({ baseURL: API_URL + '/api', timeout: 20000 });

api.interceptors.request.use((c) => {
  const t = localStorage.getItem('apex_token');
  if (t) c.headers.Authorization = 'Bearer ' + t;
  return c;
});
api.interceptors.response.use((r) => r, (e) => {
  if (e.response?.status === 401 && localStorage.getItem('apex_token') && !e.config.url.includes('/auth/')) {
    localStorage.removeItem('apex_token');
    window.dispatchEvent(new Event('apex-logout'));
  }
  return Promise.reject(e);
});

export const errMsg = (e) => e?.response?.data?.error || (e?.code === 'ERR_NETWORK' ? 'Cannot reach the server. Check your connection and try again.' : e?.message || 'Something went wrong.');
export default api;
