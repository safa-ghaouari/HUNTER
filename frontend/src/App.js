import React from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AuthProvider, useAuth } from "./contexts/AuthContext";
import Login from "./pages/Login";
import AdminDashboard from "./pages/admin/Dashboard";
import ClientDashboard from "./pages/client/Dashboard";

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

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<Login />} />
          <Route
            path="/admin/dashboard"
            element={
              <PrivateRoute requiredRole="admin_soc">
                <AdminDashboard />
              </PrivateRoute>
            }
          />
          <Route path="/admin/*" element={<Navigate to="/admin/dashboard" replace />} />
          <Route
            path="/client/dashboard"
            element={
              <PrivateRoute requiredRole="client">
                <ClientDashboard />
              </PrivateRoute>
            }
          />
          <Route path="/client/*" element={<Navigate to="/client/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

