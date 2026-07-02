import axios from 'axios';

const apiUrl = process.env.NEXT_PUBLIC_API_URL;
const API_BASE_URL = apiUrl && apiUrl.length > 0 ? apiUrl : '';

const ownerApi = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    'X-API-Request': 'true',
  },
  timeout: 60000,
  withCredentials: true,
});

ownerApi.interceptors.request.use(
  (config) => {
    return config;
  },
  (error) => Promise.reject(error)
);

const pollHealthEndpoint = async (baseUrl: string): Promise<boolean> => {
  const pollUrl = baseUrl || '/';
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

ownerApi.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const isGatewayError = error.response && [502, 503, 504].includes(error.response.status);
    const isNetworkError = !error.response || error.code === 'ERR_NETWORK';

    if ((isGatewayError || isNetworkError) && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true;

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('server-waking-up', { detail: { waking: true } }));
        
        try {
          const isOnline = await pollHealthEndpoint(API_BASE_URL);
          window.dispatchEvent(new CustomEvent('server-waking-up', { detail: { waking: false } }));
          
          if (isOnline) {
            return ownerApi(originalRequest);
          }
        } catch (pollErr) {
          window.dispatchEvent(new CustomEvent('server-waking-up', { detail: { waking: false } }));
        }
      }
    }

    if (
      error.response?.status === 401 &&
      typeof window !== 'undefined' &&
      window.location.pathname.startsWith('/owner') &&
      window.location.pathname !== '/owner/login'
    ) {
      localStorage.removeItem('platform_owner');
      window.location.href = '/owner/login';
    }
    return Promise.reject(error);
  }
);

export default ownerApi;
