import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import useAuth from "../context/useAuth.js";
import "./Login.css";

export default function Login() {
  const { login, session } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [workspaceOptions, setWorkspaceOptions] = useState([]);
  const [workspaceId, setWorkspaceId] = useState("");

  if (session)
    return <Navigate to={location.state?.from || "/dashboard"} replace />;

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(email, password, workspaceId);
      navigate(location.state?.from || "/dashboard", { replace: true });
    } catch (requestError) {
      if (
        requestError.response?.data?.code === "WORKSPACE_SELECTION_REQUIRED"
      ) {
        const options = requestError.response.data.workspaces || [];
        setWorkspaceOptions(options);
        setWorkspaceId(options[0]?.id || "");
        setError("Choose the workspace you want to open, then sign in again.");
        return;
      }
      setError(requestError.response?.data?.error || "Unable to sign in.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-panel">
        <a className="login-brand" href="/" aria-label="Lead Porch home">
          L
        </a>
        <p className="login-eyebrow">Lead Porch</p>
        <h1>Welcome back</h1>
        <p className="login-intro">Sign in to your private growth workspace.</p>
        <form onSubmit={submit}>
          <label>
            Email address
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          {workspaceOptions.length > 1 ? (
            <label>
              Workspace
              <select
                value={workspaceId}
                onChange={(event) => setWorkspaceId(event.target.value)}
                required
              >
                {workspaceOptions.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {error ? (
            <p className="login-error" role="alert">
              {error}
            </p>
          ) : null}
          <button type="submit" disabled={submitting}>
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <small>
          New customers start from the Lead Porch website. Team members join an
          existing workspace by invitation.
        </small>
      </section>
    </main>
  );
}
