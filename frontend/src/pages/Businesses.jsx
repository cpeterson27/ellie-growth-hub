import { useEffect, useState } from "react";
import {
  createPlatformWorkspace,
  fetchPlatformBusinesses,
  updatePlatformWorkspaceHosts,
} from "../services/api.js";
import useAuth from "../context/useAuth.js";
import "./Businesses.css";

const providerNames = {
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  x: "X",
};
const statusNames = {
  connected: "Connected",
  needs_attention: "Needs attention",
  not_connected: "Not connected",
};
const canonicalHosts = (hosts = []) =>
  hosts.filter((host) => !String(host).toLowerCase().startsWith("www."));

export default function Businesses() {
  const [businesses, setBusinesses] = useState([]),
    [selected, setSelected] = useState(null),
    [error, setError] = useState("");
  const [creating, setCreating] = useState(false),
    [showCreate, setShowCreate] = useState(false),
    [draft, setDraft] = useState({ name: "", slug: "", publicHosts: "" });
  const [editingHosts, setEditingHosts] = useState(null),
    [savingHosts, setSavingHosts] = useState(false),
    [message, setMessage] = useState("");
  const { refreshWorkspaces } = useAuth();
  useEffect(() => {
    fetchPlatformBusinesses()
      .then(setBusinesses)
      .catch((err) =>
        setError(err.response?.data?.error || "Unable to load businesses."),
      );
  }, []);
  const create = async (event) => {
    event.preventDefault();
    setCreating(true);
    setError("");
    try {
      await createPlatformWorkspace({
        ...draft,
        publicHosts: draft.publicHosts
          .split(",")
          .map((host) => host.trim())
          .filter(Boolean),
      });
      setBusinesses(await fetchPlatformBusinesses());
      await refreshWorkspaces();
      setDraft({ name: "", slug: "", publicHosts: "" });
      setShowCreate(false);
    } catch (err) {
      setError(err.response?.data?.error || "Unable to create workspace.");
    } finally {
      setCreating(false);
    }
  };
  const changeName = (name) =>
    setDraft((current) => ({
      ...current,
      name,
      slug:
        current.slug ||
        name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, ""),
    }));
  const saveHosts = async (business) => {
    setSavingHosts(true);
    setError("");
    setMessage("");
    try {
      const publicHosts = String(editingHosts || "")
        .split(",")
        .map((host) => host.trim())
        .filter(Boolean);
      await updatePlatformWorkspaceHosts(business.id, publicHosts);
      setBusinesses(await fetchPlatformBusinesses());
      setEditingHosts(null);
      setMessage(`${business.name} public domains saved successfully.`);
    } catch (err) {
      setError(err.response?.data?.error || "Unable to save public domains.");
    } finally {
      setSavingHosts(false);
    }
  };
  return (
    <main className="businesses-page">
      <header className="businesses-page__header">
        <div>
          <p className="page-eyebrow">Platform administration</p>
          <h1>Businesses</h1>
          <p>
            Workspace membership and connected-account health across Lead Porch.
          </p>
        </div>
        <button type="button" onClick={() => setShowCreate((value) => !value)}>
          Create workspace
        </button>
      </header>
      {showCreate ? (
        <form className="workspace-create" onSubmit={create}>
          <div>
            <h2>Create an empty workspace</h2>
            <p>
              Add the public website domains now so branding and invitations
              work correctly from the start.
            </p>
          </div>
          <label>
            Workspace name
            <input
              required
              minLength="2"
              maxLength="120"
              value={draft.name}
              onChange={(event) => changeName(event.target.value)}
              placeholder="Meta App Review"
            />
          </label>
          <label>
            Workspace slug
            <input
              required
              minLength="2"
              maxLength="80"
              pattern="[a-z0-9-]+"
              value={draft.slug}
              onChange={(event) =>
                setDraft({ ...draft, slug: event.target.value.toLowerCase() })
              }
              placeholder="meta-app-review"
            />
          </label>
          <label>
            Public website domains
            <small>
              Enter the canonical domain. The www alias is added automatically
              for root domains.
            </small>
            <input
              value={draft.publicHosts}
              onChange={(event) =>
                setDraft({ ...draft, publicHosts: event.target.value })
              }
              placeholder="client.com, www.client.com"
            />
          </label>
          <div>
            <button
              type="button"
              disabled={creating}
              onClick={() => setShowCreate(false)}
            >
              Cancel
            </button>
            <button type="submit" disabled={creating}>
              {creating ? "Creating…" : "Create workspace"}
            </button>
          </div>
        </form>
      ) : null}
      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="businesses-message">{message}</p> : null}
      <section className="businesses-list">
        {businesses.map((business) => (
          <article key={business.id} className="business-card">
            <button
              type="button"
              className="business-card__summary"
              onClick={() =>
                setSelected(selected === business.id ? null : business.id)
              }
              aria-expanded={selected === business.id}
            >
              <span>
                <strong>{business.name}</strong>
                <small>
                  {business.owner
                    ? `${business.owner.name || "Owner"} · ${business.owner.email}`
                    : "No active owner found"}
                </small>
              </span>
              <span>
                <b className={`business-status is-${business.status}`}>
                  {business.status}
                </b>
                <small>
                  {business.teamMemberCount} active team member
                  {business.teamMemberCount === 1 ? "" : "s"}
                </small>
              </span>
            </button>
            <div className="business-card__connections">
              <strong>Public domains</strong>
              <small>
                {canonicalHosts(business.publicHosts).length
                  ? canonicalHosts(business.publicHosts).join(", ")
                  : "Not configured"}
              </small>
              {editingHosts === null ? (
                <button
                  type="button"
                  onClick={() => {
                    setSelected(business.id);
                    setEditingHosts(
                      canonicalHosts(business.publicHosts).join(", "),
                    );
                  }}
                >
                  Edit domains
                </button>
              ) : selected === business.id ? (
                <div>
                  <input
                    value={editingHosts}
                    onChange={(event) => setEditingHosts(event.target.value)}
                    placeholder="client.com, www.client.com"
                  />
                  <button
                    type="button"
                    disabled={savingHosts}
                    onClick={() => saveHosts(business)}
                  >
                    {savingHosts ? "Saving…" : "Save domains"}
                  </button>
                  <button
                    type="button"
                    disabled={savingHosts}
                    onClick={() => setEditingHosts(null)}
                  >
                    Cancel
                  </button>
                </div>
              ) : null}
            </div>
            <div className="business-card__connections">
              <strong>Onboarding readiness</strong>
              <small>Domain: {business.readiness?.domain || "unknown"}</small>
              <small>
                Sender email: {business.readiness?.senderEmail || "unknown"}
              </small>
              <small>Website: {business.readiness?.website || "unknown"}</small>
            </div>
            <div className="business-card__connections">
              {business.social.map((social) => (
                <div key={social.provider}>
                  <strong>{providerNames[social.provider]}</strong>
                  <span className={`business-connection is-${social.status}`}>
                    {statusNames[social.status]}
                  </span>
                  {social.accountName ? (
                    <small>{social.accountName}</small>
                  ) : null}
                </div>
              ))}
            </div>
            {selected === business.id ? (
              <div className="business-card__details">
                <span>Workspace: {business.slug}</span>
                <span>
                  Updated:{" "}
                  {business.updatedAt
                    ? new Date(business.updatedAt).toLocaleString()
                    : "Not available"}
                </span>
                {business.social
                  .filter((item) => item.lastVerifiedAt)
                  .map((item) => (
                    <span key={item.provider}>
                      {providerNames[item.provider]} verified:{" "}
                      {new Date(item.lastVerifiedAt).toLocaleString()}
                    </span>
                  ))}
              </div>
            ) : null}
          </article>
        ))}
      </section>
    </main>
  );
}
