import axios from 'axios';
import { getLanguage } from '../language';

/** Shared client — auth, tenant (AI service requires x-tenant-id), language */
export const api = axios.create({
  baseURL: '/api/v1',
  timeout: 120_000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('guri_token');
  const rawUser = localStorage.getItem('guri_user');
  let tenantId: string | undefined;
  try {
    tenantId = rawUser ? JSON.parse(rawUser)?.tenantId : undefined;
  } catch {
    /* ignore */
  }
  config.headers = config.headers || {};
  if (token) (config.headers as Record<string, string>).Authorization = `Bearer ${token}`;
  /* AI microservice returns 400 without this; monolith ignores unknown tenants safely */
  (config.headers as Record<string, string>)['x-tenant-id'] = tenantId?.trim() || 'public';
  (config.headers as Record<string, string>)['x-lang'] = getLanguage();
  return config;
});
