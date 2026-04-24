import axios from "axios";

export const AUTH_STORAGE_KEY = "hunter_auth_state";

let logoutHandler = null;
export function registerLogoutHandler(handler) { logoutHandler = handler; }

function resolveApiBaseUrl() {
  const configuredBaseUrl = process.env.REACT_APP_API_URL || "/api";

  if (typeof window === "undefined") {
    return configuredBaseUrl;
  }

  if (/^https?:\/\//i.test(configuredBaseUrl)) {
    return configuredBaseUrl;
  }

  if (window.location.port === "3000" && configuredBaseUrl.startsWith("/")) {
    return `${window.location.protocol}//${window.location.hostname}${configuredBaseUrl}`;
  }

  return configuredBaseUrl;
}

const api = axios.create({
  baseURL: resolveApiBaseUrl(),
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const stored = window.localStorage.getItem(AUTH_STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (parsed.token) config.headers.Authorization = `Bearer ${parsed.token}`;
    } catch { window.localStorage.removeItem(AUTH_STORAGE_KEY); }
  }
  return config;
}, (err) => Promise.reject(err));

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && typeof logoutHandler === "function") logoutHandler();
    return Promise.reject(err);
  }
);

export const auth = {
  login: (email, password) => api.post("/auth/login", { email, password }),
};

export const clients = {
  list: () => api.get("/admin/clients"),
  get: (id) => api.get(`/admin/clients/${id}`),
  create: (data) => api.post("/admin/clients", data),
  update: (id, data) => api.patch(`/admin/clients/${id}`, data),
  delete: (id) => api.delete(`/admin/clients/${id}`),
  users: (id) => api.get(`/admin/clients/${id}/users`),
  createUser: (id, data) => api.post(`/admin/clients/${id}/users`, data),
  testConnection: (id) => api.post(`/admin/clients/${id}/test-connection`),
  triggerCollection: (id, data) => api.post(`/admin/clients/${id}/logs/collect`, data || {}),
};

export const sources = {
  list: () => api.get("/admin/sources"),
  get: (id) => api.get(`/admin/sources/${id}`),
  create: (data) => api.post("/admin/sources", data),
  update: (id, data) => api.patch(`/admin/sources/${id}`, data),
  delete: (id) => api.delete(`/admin/sources/${id}`),
};

export const collections = {
  list: () => api.get("/admin/collections"),
  get: (id) => api.get(`/admin/collections/${id}`),
  create: (data) => api.post("/admin/collections", data),
};

export const hunting = {
  list: (params) => api.get("/admin/hunting", { params }),
  get: (id) => api.get(`/admin/hunting/${id}`),
  create: (data) => api.post("/admin/hunting", data),
  cancel: (id) => api.patch(`/admin/hunting/${id}`),
};

export const alerts = {
  list: (params) => api.get("/admin/alerts", { params }),
  get: (id) => api.get(`/admin/alerts/${id}`),
  updateStatus: (id, alertStatus) => api.patch(`/admin/alerts/${id}`, { status: alertStatus }),
  clientList: (params) => api.get("/client/alerts", { params }),
  clientGet: (id) => api.get(`/client/alerts/${id}`),
};

export const iocs = {
  list: (params) => api.get("/admin/iocs", { params }),
  get: (id) => api.get(`/admin/iocs/${id}`),
  enrich: (id) => api.post(`/admin/iocs/${id}/enrich`),
};

export const reports = {
  list: (params) => api.get("/admin/reports", { params }),
  get: (id) => api.get(`/admin/reports/${id}`),
  download: (id) => api.get(`/admin/reports/${id}/download`),
  clientList: (params) => api.get("/client/reports", { params }),
  clientGet: (id) => api.get(`/client/reports/${id}`),
  clientDownload: (id) => api.get(`/client/reports/${id}/download`),
};

export default api;
