import React, { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Container,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../contexts/AuthContext";

export default function Login() {
  const navigate = useNavigate();
  const { isAuthenticated, role, login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    if (role === "admin_soc") {
      navigate("/admin/dashboard", { replace: true });
      return;
    }

    if (role === "client") {
      navigate("/client/dashboard", { replace: true });
    }
  }, [isAuthenticated, navigate, role]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const user = await login(email, password);
      if (user.role === "admin_soc") {
        navigate("/admin/dashboard", { replace: true });
      } else {
        navigate("/client/dashboard", { replace: true });
      }
    } catch (requestError) {
      setError(
        requestError.response?.data?.detail ?? "Authentication failed. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Container maxWidth="sm" sx={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
      <Paper
        elevation={12}
        sx={{
          width: "100%",
          p: 5,
          borderRadius: 4,
          backgroundColor: "rgba(15, 23, 42, 0.92)",
          border: "1px solid rgba(148, 163, 184, 0.18)",
          backdropFilter: "blur(12px)",
          color: "#e2e8f0",
        }}
      >
        <Stack spacing={3}>
          <Box>
            <Typography variant="overline" sx={{ letterSpacing: 2, color: "#38bdf8" }}>
              HUNTER
            </Typography>
            <Typography variant="h4" fontWeight={700}>
              Sign in to the SOC portal
            </Typography>
            <Typography variant="body2" sx={{ color: "rgba(226, 232, 240, 0.78)" }}>
              Access Phase 1 infrastructure, RBAC, and platform health workflows.
            </Typography>
          </Box>

          {error ? <Alert severity="error">{error}</Alert> : null}

          <Box component="form" onSubmit={handleSubmit}>
            <Stack spacing={2.5}>
              <TextField
                label="Email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                fullWidth
                InputLabelProps={{ shrink: true }}
                autoComplete="email"
                sx={{
                  "& .MuiInputBase-input": { color: "#e2e8f0" },
                  "& .MuiInputLabel-root": { color: "rgba(226, 232, 240, 0.72)" },
                  "& .MuiOutlinedInput-root fieldset": {
                    borderColor: "rgba(148, 163, 184, 0.28)",
                  },
                  "& .MuiOutlinedInput-root:hover fieldset": {
                    borderColor: "#38bdf8",
                  },
                }}
              />
              <TextField
                label="Password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                fullWidth
                InputLabelProps={{ shrink: true }}
                autoComplete="current-password"
                sx={{
                  "& .MuiInputBase-input": { color: "#e2e8f0" },
                  "& .MuiInputLabel-root": { color: "rgba(226, 232, 240, 0.72)" },
                  "& .MuiOutlinedInput-root fieldset": {
                    borderColor: "rgba(148, 163, 184, 0.28)",
                  },
                  "& .MuiOutlinedInput-root:hover fieldset": {
                    borderColor: "#38bdf8",
                  },
                }}
              />
              <Button
                type="submit"
                variant="contained"
                size="large"
                disabled={isSubmitting}
                sx={{
                  py: 1.5,
                  fontWeight: 700,
                  background: "linear-gradient(90deg, #0ea5e9, #0284c7)",
                }}
              >
                {isSubmitting ? "Signing in..." : "Sign in"}
              </Button>
            </Stack>
          </Box>
        </Stack>
      </Paper>
    </Container>
  );
}
