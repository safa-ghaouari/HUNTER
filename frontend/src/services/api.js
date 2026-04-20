import axios from "axios";

export const AUTH_STORAGE_KEY = "hunter_auth_state";

let logoutHandler = null;

export function registerLogoutHandler(handler) {
  logoutHandler = handler;
}

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use(
  (config) => {
    const storedAuth = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (storedAuth) {
      try {
        const parsedAuth = JSON.parse(storedAuth);
        if (parsedAuth.token) {
          config.headers.Authorization = `Bearer ${parsedAuth.token}`;
        }
      } catch (error) {
        window.localStorage.removeItem(AUTH_STORAGE_KEY);
      }
    }

    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof logoutHandler === "function") {
      logoutHandler();
    }
    return Promise.reject(error);
  }
);

export default api;
