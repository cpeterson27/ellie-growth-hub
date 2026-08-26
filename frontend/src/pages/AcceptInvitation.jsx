import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { acceptWorkspaceInvitation, fetchWorkspaceInvitation } from "../services/api.js";
import "./AcceptInvitation.css";
import PersonIdentityFields from "../components/PersonIdentityFields.jsx";
import { personName, personFields } from "../utils/personIdentity.js";

export default function AcceptInvitation() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [invitation, setInvitation] = useState(null), [error, setError] = useState(""), [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", password: "", confirmPassword: "" });
  useEffect(() => { fetchWorkspaceInvitation(token).then((data) => { setInvitation(data); setForm((current) => ({ ...current, ...personFields(data) })); }).catch((err) => setError(err.response?.data?.error || "This invitation is invalid or has expired.")); }, [token]);
  const submit = async (event) => {
    event.preventDefault();
    if (form.password !== form.confirmPassword) return setError("Passwords do not match.");
    try { setSaving(true); setError(""); await acceptWorkspaceInvitation(token, { firstName: form.firstName, lastName: form.lastName, name: personName(form), ...(form.phone.trim() ? { phone: form.phone.trim() } : {}), password: form.password }); navigate("/login", { replace: true, state: { invitationAccepted: true } }); }
    catch (err) { setError(err.response?.data?.error || "Unable to activate this account."); }
    finally { setSaving(false); }
  };
  return <main className="invitation-page"><section className="invitation-card"><p className="invitation-eyebrow">Growth Operator team invitation</p><h1>{invitation ? `Welcome, ${invitation.name}` : "Activate your account"}</h1>{error ? <p className="form-error">{error}</p> : null}{invitation ? <><p>You were invited as <strong>{invitation.email}</strong>. Create your own password to activate workspace access.</p><form onSubmit={submit}><PersonIdentityFields value={form} onChange={setForm} emailReadOnly/><label>Password<input required minLength="12" type="password" autoComplete="new-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })}/><small>Use at least 12 characters.</small></label><label>Confirm password<input required minLength="12" type="password" autoComplete="new-password" value={form.confirmPassword} onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })}/></label><button disabled={saving || form.password.length < 12} type="submit">{saving ? "Activating…" : "Activate account"}</button></form></> : !error ? <p>Checking your secure invitation…</p> : <Link to="/login">Return to login</Link>}</section></main>;
}
