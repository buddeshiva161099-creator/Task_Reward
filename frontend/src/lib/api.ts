import axios from 'axios';

const apiUrl = process.env.NEXT_PUBLIC_API_URL;
const API_BASE_URL = apiUrl && apiUrl.length > 0 ? apiUrl : '';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

// Request interceptor - attach active business unit header
api.interceptors.request.use(
  (config) => {
    if (typeof window !== 'undefined') {
      const activeBuId = localStorage.getItem('active_business_unit_id');
      if (activeBuId) {
        config.headers['X-Active-Business-Unit-Id'] = activeBuId;
      } else {
        if (config.headers && 'X-Active-Business-Unit-Id' in config.headers) {
          delete (config.headers as Record<string, unknown>)['X-Active-Business-Unit-Id'];
        }
      }
      const activeCompanyId = localStorage.getItem('active_company_id');
      if (activeCompanyId) {
        config.headers['X-Active-Company-Id'] = activeCompanyId;
      } else {
        if (config.headers && 'X-Active-Company-Id' in config.headers) {
          delete (config.headers as Record<string, unknown>)['X-Active-Company-Id'];
        }
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - handle 401
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (
      error.response?.status === 401 &&
      typeof window !== 'undefined' &&
      !window.location.pathname.startsWith('/owner') &&
      window.location.pathname !== '/login' &&
      window.location.pathname !== '/register' &&
      window.location.pathname !== '/'
    ) {
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
