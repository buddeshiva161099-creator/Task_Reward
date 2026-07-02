import axios from 'axios';

const apiUrl = process.env.NEXT_PUBLIC_API_URL;
const API_BASE_URL = apiUrl && apiUrl.length > 0 ? apiUrl : '';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    'X-API-Request': 'true',
  },
  timeout: 60000,
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

const pollHealthEndpoint = async (baseUrl: string): Promise<boolean> => {
  const pollUrl = baseUrl ? (baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`) : '/health';
  const maxAttempts = 15;
  const delay = 4000;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await window.fetch(pollUrl, { cache: 'no-store' });
      if (res.status < 500) {
        return true;
      }
    } catch {
      // Keep trying
    }
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  return false;
};

// Response interceptor - handle 401 and wake-up retries
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const isGatewayError = error.response && [502, 503, 504].includes(error.response.status);
    const isNetworkError = !error.response || error.code === 'ERR_NETWORK';

    if ((isGatewayError || isNetworkError) && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true;

      if (typeof window !== 'undefined') {
        try {
          const isOnline = await pollHealthEndpoint(API_BASE_URL);
          if (isOnline) {
            return api(originalRequest);
          }
        } catch (pollErr) {
          // Silently fail and reject
        }
      }
    }

    if (
      error.response?.status === 401 &&
      typeof window !== 'undefined' &&
      !window.location.pathname.startsWith('/owner') &&
      window.location.pathname !== '/login' &&
      window.location.pathname !== '/register' &&
      window.location.pathname !== '/'
    ) {
      localStorage.removeItem('user');
      localStorage.removeItem('access_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
