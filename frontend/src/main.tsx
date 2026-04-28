import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import axios from 'axios';
import App from './App';
import './styles/index.css';

axios.interceptors.request.use((config) => {
  const token = localStorage.getItem('guri_token');
  const rawUser = localStorage.getItem('guri_user');
  let tenantId: string | undefined;
  try { tenantId = rawUser ? JSON.parse(rawUser)?.tenantId : undefined; } catch {}

  config.headers = config.headers || {};
  if (token) (config.headers as any).Authorization = `Bearer ${token}`;
  (config.headers as any)['x-tenant-id'] = tenantId?.trim() || 'public';
  return config;
});

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);

