import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { approveOAuthConnection, fetchOAuthAuthorizationDetails } from "../services/api.js";
import "./Login.css";

const LABELS = {
  "crm:read": "Read contacts and organizations",
  "crm:write": "Prepare and confirm reversible CRM changes",
  "research:read": "Read prospect lists and research results",
  "research:write": "Create reviewed research jobs and prospect lists",
  "campaigns:read": "Read campaigns and template status",
  "campaigns:write": "Prepare template drafts and confirmed campaign sends",
  "imports:write": "Import owner-provided lead files after confirmation",
  "settings:write": "Add confirmed custom CRM fields",
  offline_access: "Stay connected until you disconnect the app",
  openid: "Confirm your Ellie account identity",
};

export default function OAuthConsent() {
  const { loading: authLoading, session } = useAuth();
  const location = useLocation();
  const [details, setDetails] = useState(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!session) return;
    fetchOAuthAuthorizationDetails(location.search)
      .then(setDetails)
      .catch((requestError) => setError(requestError.response?.data?.error || "This connection request is invalid or expired."));
  }, [location.search, session]);

  if (authLoading) return <div className="auth-loading">Checking your Ellie account…</div>;
  if (!session) return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;

  const decide = async (approved) => {
    try {
      setSubmitting(true);
      const params = Object.fromEntries(new URLSearchParams(location.search));
      const response = await approveOAuthConnection({ ...params, approved });
      window.location.assign(response.redirectUrl);
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Ellie could not complete this connection.");
      setSubmitting(false);
    }
  };

  return <main className="login-page">
    <section className="login-panel oauth-consent-panel">
      <a className="login-brand" href="/" aria-label="Ellie AI home">E</a>
      <p className="login-eyebrow">Secure AI connection</p>
      <h1>Connect {details?.clientName || "this AI assistant"}?</h1>
      <p className="login-intro">This app is requesting access to <strong>{details?.workspaceName || session.workspace?.name}</strong>. It will never receive your Ellie password.</p>
      {details?.scopes?.length ? <div className="oauth-scope-list">{details.scopes.map((scope) => <p key={scope}><span>✓</span>{LABELS[scope] || scope}</p>)}</div> : null}
      <p className="oauth-consent-warning">Campaign sending and permanent deletion are not included. Ellie records connected tool activity, and you can disconnect the app from Settings.</p>
      {error ? <p className="login-error" role="alert">{error}</p> : null}
      <div className="oauth-consent-actions"><button type="button" className="oauth-deny" disabled={submitting} onClick={() => decide(false)}>Cancel</button><button type="button" disabled={submitting || !details} onClick={() => decide(true)}>{submitting ? "Connecting…" : "Allow connection"}</button></div>
    </section>
  </main>;
}
