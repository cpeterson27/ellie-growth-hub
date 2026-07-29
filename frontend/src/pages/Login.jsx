import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "./Login.css";

export default function Login() {
  const { login, session } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (session) return <Navigate to="/dashboard" replace />;

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(email, password);
      navigate(location.state?.from || "/dashboard", { replace: true });
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Unable to sign in.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-panel">
        <a className="login-brand" href="/" aria-label="Ellie AI home">E</a>
        <p className="login-eyebrow">Ellie AI</p>
        <h1>Welcome back</h1>
        <p className="login-intro">Sign in to your private growth workspace.</p>
        <form onSubmit={submit}>
          <label>
            Email address
            <input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <label>
            Password
            <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          </label>
          {error ? <p className="login-error" role="alert">{error}</p> : null}
          <button type="submit" disabled={submitting}>{submitting ? "Signing in…" : "Sign in"}</button>
        </form>
        <small>New customers start from the Ellie AI website. Team members join an existing workspace by invitation.</small>
      </section>
    </main>
  );
}
