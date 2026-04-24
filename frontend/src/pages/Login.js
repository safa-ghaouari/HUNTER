import React, { useEffect, useState } from "react";
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
    <div className="login-screen">
      <div className="login-screen__hero">
        <div className="login-screen__halo" />
        <div className="login-screen__content">
          <div className="login-screen__brand-mark">H</div>
          <div className="portal-eyebrow">Threat Intelligence Operations</div>
          <h1>HUNTER</h1>
          <p>
            Multi-tenant SOC workspace for collection, hunting, correlation, alerting, and client reporting.
          </p>

          <div className="login-screen__stats">
            <div>
              <strong>24/7</strong>
              <span>Coverage</span>
            </div>
            <div>
              <strong>RBAC</strong>
              <span>Scoped Access</span>
            </div>
            <div>
              <strong>Live</strong>
              <span>Ops Portal</span>
            </div>
          </div>
        </div>
      </div>

      <div className="login-screen__panel">
        <div className="login-card">
          <div className="portal-eyebrow">Secure Access</div>
          <h2>Sign in</h2>
          <p className="login-card__subtitle">
            Use your real HUNTER account. This login now keeps the project’s backend authentication flow instead of the prototype’s mock credentials.
          </p>

          {error ? <div className="login-error">{error}</div> : null}

          <form className="login-form" onSubmit={handleSubmit}>
            <label>
              <span>Email address</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
              />
            </label>

            <label>
              <span>Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </label>

            <button className="portal-button portal-button--primary login-submit" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
