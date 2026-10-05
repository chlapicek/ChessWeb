import axios from 'axios';
import { logger } from './logger';

export const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
});

interface CsrfTokenResponse {
  requestToken: string;
}

let csrfToken: string | null = null;
let csrfTokenRequest: Promise<string> | null = null;

const getCsrfToken = (): Promise<string> => {
  if (csrfToken) return Promise.resolve(csrfToken);
  if (!csrfTokenRequest) {
    csrfTokenRequest = apiClient.get<CsrfTokenResponse>('/csrf/token', { withCredentials: true })
      .then(({ data }) => {
        csrfToken = data.requestToken;
        return csrfToken;
      })
      .finally(() => {
        csrfTokenRequest = null;
      });
  }
  return csrfTokenRequest;
};

const unsafeMethods = new Set(['post', 'put', 'patch', 'delete']);
const logPath = (url?: string) => url?.split(/[?#]/, 1)[0] ?? '';

apiClient.interceptors.request.use(async (config) => {
  const token = localStorage.getItem('chessweb_token');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  if (config.method && unsafeMethods.has(config.method.toLowerCase())) {
    config.withCredentials = true;
    config.headers['X-CSRF-TOKEN'] = await getCsrfToken();
  }

  logger.debug(`[API REQ] ${config.method?.toUpperCase()} ${logPath(config.url)}`);
  return config;
});

apiClient.interceptors.response.use(
  (response) => {
    logger.debug(`[API RES] ${response.status} ${logPath(response.config.url)}`);
    return response;
  },
  (error) => {
    logger.warn(`[API ERR] ${error.response?.status || 'Network Error'} ${logPath(error.config?.url)}`);
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('chessweb_token');
      localStorage.removeItem('chessweb_user');
    }
    return Promise.reject(error);
  }
);
