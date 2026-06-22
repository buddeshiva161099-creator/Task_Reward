import axios from 'axios';

const apiUrl = process.env.NEXT_PUBLIC_API_URL;
const API_BASE_URL = apiUrl && apiUrl.length > 0 ? apiUrl : '';

const ownerApi = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

ownerApi.interceptors.request.use(
  (config) => {
    return config;
  },
  (error) => Promise.reject(error)
);

ownerApi.interceptors.response.use(
  (response) => response,
  (error) => {
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
