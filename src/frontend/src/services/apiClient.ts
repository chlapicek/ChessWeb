import axios from 'axios';
import { logger } from './logger';

export const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('chessweb_token');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  logger.debug(`[API REQ] ${config.method?.toUpperCase()} ${config.url}`, config.params || config.data);
  return config;
});

apiClient.interceptors.response.use(
  (response) => {
    logger.debug(`[API RES] ${response.status} ${response.config.url}`);
    return response;
  },
  (error) => {
    logger.warn(`[API ERR] ${error.response?.status || 'Network Error'} ${error.config?.url}`, error.response?.data);
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('chessweb_token');
      localStorage.removeItem('chessweb_user');
    }
    return Promise.reject(error);
  }
);
