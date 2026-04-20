import React, { createContext, useContext, useEffect, useState } from "react";

import api, { AUTH_STORAGE_KEY, registerLogoutHandler } from "../services/api";

const AuthContext = createContext(null);

const EMPTY_AUTH_STATE = {
  token: null,
  user: null,
};

function getStoredAuthState() {
  if (typeof window === "undefined") {
    return EMPTY_AUTH_STATE;
  }

  try {
    const storedValue = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!storedValue) {
      return EMPTY_AUTH_STATE;
    }

    const parsedValue = JSON.parse(storedValue);
    return {
      token: parsedValue.token ?? null,
      user: parsedValue.user ?? null,
    };
  } catch (error) {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    return EMPTY_AUTH_STATE;
  }
}

export function AuthProvider({ children }) {
  const [authState, setAuthState] = useState(getStoredAuthState);

  function persistAuthState(nextState) {
    setAuthState(nextState);
    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextState));
  }

  function clearAuthState() {
    setAuthState(EMPTY_AUTH_STATE);
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
  }

  async function login(email, password) {
    const response = await api.post("/auth/login", {
      email,
      password,
    });

    const nextState = {
      token: response.data.access_token,
      user: response.data.user,
    };

    persistAuthState(nextState);
    return response.data.user;
  }

  function logout() {
    clearAuthState();
    window.location.assign("/login");
  }

  useEffect(() => {
    registerLogoutHandler(() => {
      clearAuthState();
      window.location.assign("/login");
    });

    return () => registerLogoutHandler(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        token: authState.token,
        user: authState.user,
        isAuthenticated: Boolean(authState.token),
        role: authState.user?.role ?? "",
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider.");
  }
  return context;
}

