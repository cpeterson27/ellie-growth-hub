import { useEffect, useState } from "react";
import Button from "./Button.jsx";
import { StatusBadge } from "./WorkspaceUI.jsx";
import { createCrmActivity, fetchCrmActivities } from "../services/api.js";
import "./ActivityTimeline.css";

const activityLabels = { note: "Note", call: "Call", meeting: "Meeting", task: "Task", status_change: "Status change" };

function activityTone(item) {
  if (item.type === "task") return "warning";
  if (item.type === "email" || item.type === "campaign") return "info";
  if (item.type === "meeting" || item.type === "call") return "success";
  return "draft";
}

export default function ActivityTimeline({ contactId, organizationId }) {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [composerOpen, setComposerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState({ type: "note", title: "", body: "", occurredAt: "" });

  async function loadActivity() {
    try {
      const result = await fetchCrmActivities({ contactId, organizationId });
      setActivities(result.data || []);
      setError("");
    } catch {
      setError("Unable to load CRM activity.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    fetchCrmActivities({ contactId, organizationId })
      .then((result) => { if (active) { setActivities(result.data || []); setError(""); } })
      .catch(() => { if (active) setError("Unable to load CRM activity."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [contactId, organizationId]);

  async function saveActivity(event) {
    event.preventDefault();
    if (!draft.title.trim()) return;
    try {
      setSaving(true);
      await createCrmActivity({ contactId, organizationId, ...draft, occurredAt: draft.occurredAt || undefined });
      setDraft({ type: "note", title: "", body: "", occurredAt: "" });
      setComposerOpen(false);
      await loadActivity();
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Unable to record activity.");
    } finally {
      setSaving(false);
    }
  }

  return <section className="crm-activity" aria-label="CRM activity timeline">
    <header><div><strong>Activity timeline</strong><span>{activities.length} recorded events</span></div><Button size="sm" onClick={() => setComposerOpen((open) => !open)}>{composerOpen ? "Cancel" : "Log activity"}</Button></header>
    {composerOpen ? <form className="crm-activity__composer" onSubmit={saveActivity}>
      <label>Activity type<select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value })}>{Object.entries(activityLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      <label>Title<input maxLength="180" required value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="What happened or what is next?" /></label>
      <label>{draft.type === "task" ? "Due date and time" : "Date and time"}<input type="datetime-local" value={draft.occurredAt} onChange={(event) => setDraft({ ...draft, occurredAt: event.target.value })} /></label>
      <label className="span-2">Details<textarea maxLength="5000" rows="3" value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} placeholder="Add useful context, outcome, or next step" /></label>
      <Button size="sm" loading={saving}>Save activity</Button>
    </form> : null}
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    {loading ? <p>Loading activity…</p> : activities.length ? <div className="crm-activity__list">{activities.map((item) => <article key={item._id}>
      <time>{new Date(item.occurredAt).toLocaleString()}</time>
      <div><div><strong>{item.title}</strong><StatusBadge tone={activityTone(item)}>{item.type.replaceAll("_", " ")}</StatusBadge></div>{item.body ? <p>{item.body}</p> : null}<small>{item.derived ? "Existing CRM history" : "CRM activity"}{item.metadata?.campaignName ? ` · ${item.metadata.campaignName}` : ""}</small></div>
    </article>)}</div> : <div className="crm-activity__empty"><strong>No activity yet</strong><p>Log a note, call, meeting, task, or relationship change.</p></div>}
  </section>;
}
