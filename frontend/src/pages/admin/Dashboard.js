import React from "react";
import { Box, Button, Container, Paper, Stack, Typography } from "@mui/material";
import { Navigate } from "react-router-dom";

import { useAuth } from "../../contexts/AuthContext";

export default function AdminDashboard() {
  const { role, user, logout } = useAuth();

  if (role !== "admin_soc") {
    return <Navigate to="/login" replace />;
  }

  return (
    <Container maxWidth="md" sx={{ py: 8 }}>
      <Paper
        elevation={10}
        sx={{
          p: 5,
          borderRadius: 4,
          backgroundColor: "rgba(15, 23, 42, 0.92)",
          border: "1px solid rgba(56, 189, 248, 0.18)",
          color: "#e2e8f0",
        }}
      >
        <Stack spacing={3}>
          <Box>
            <Typography variant="overline" sx={{ letterSpacing: 2, color: "#38bdf8" }}>
              Admin Portal
            </Typography>
            <Typography variant="h3" fontWeight={700}>
              SOC Admin Dashboard — Phase 1 complete
            </Typography>
          </Box>
          <Typography variant="body1">
            Logged-in user: <strong>{user?.email}</strong>
          </Typography>
          <Button
            variant="outlined"
            onClick={logout}
            sx={{ alignSelf: "flex-start", borderColor: "#38bdf8", color: "#e2e8f0" }}
          >
            Logout
          </Button>
        </Stack>
      </Paper>
    </Container>
  );
}
