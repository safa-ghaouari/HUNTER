import React from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AuthProvider, useAuth } from "./contexts/AuthContext";
import Login from "./pages/Login";
import AdminPortal from "./pages/admin/Portal";
import ClientPortal from "./pages/client/Portal";

function PrivateRoute({ requiredRole, children }) {
  const { isAuthenticated, role } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (role !== requiredRole) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

function RoleRedirect() {
  const { isAuthenticated, role } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (role === "admin_soc") {
    return <Navigate to="/admin/dashboard" replace />;
  }

  if (role === "client") {
    return <Navigate to="/client/dashboard" replace />;
  }

  return <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<RoleRedirect />} />
          <Route path="/login" element={<Login />} />
          <Route
            path="/admin/:section"
            element={
              <PrivateRoute requiredRole="admin_soc">
                <AdminPortal />
              </PrivateRoute>
            }
          />
          <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
          <Route
            path="/client/:section"
            element={
              <PrivateRoute requiredRole="client">
                <ClientPortal />
              </PrivateRoute>
            }
          />
          <Route path="/client" element={<Navigate to="/client/dashboard" replace />} />
          <Route path="*" element={<RoleRedirect />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
