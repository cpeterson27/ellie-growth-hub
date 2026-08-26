import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchSocialLeads } from "../services/api.js";
import UserAvatar from "../components/UserAvatar.jsx";
import { interactionLabels, leadStage } from "./socialLeadPresentation.js";
import "./SocialLeads.css";

export default function SocialLeads() {
  const [rows, setRows] = useState([]), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [filters, setFilters] = useState({ platform: "", interaction: "", status: "", assignee: "", date: "" });
  useEffect(() => {
    let active = true;
    fetchSocialLeads({ limit: 250 }).then(data => { if (active) setRows(data); }).catch(() => { if (active) setError("Social leads could not be loaded. Please try again."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const set = (key, value) => setFilters(current => ({ ...current, [key]: value }));
  const visible = rows.filter(row => (!filters.platform || row.provider === filters.platform) && (!filters.interaction || row.latestInteraction?.type === filters.interaction) && (!filters.status || leadStage(row) === filters.status) && (!filters.assignee || String(row.conversation?.assignedTo?.id || "unassigned") === filters.assignee) && (!filters.date || new Date(row.lastActivityAt) >= new Date(filters.date)));
  const assignees = [...new Map(rows.filter(row => row.conversation?.assignedTo).map(row => [String(row.conversation.assignedTo.id), row.conversation.assignedTo])).values()];
  return <main className="social-leads"><header><p className="page-eyebrow">Social relationships</p><h1>Social Leads</h1><p>See people who engaged with your social accounts and decide what to do next.</p><nav><Link to="/social/accounts">Connected accounts</Link><Link to="/social/automations">Automations · response rules</Link><Link to="/social/create">Content · create a post</Link></nav></header>
    {error && <p role="alert">{error}</p>}
    <section className="social-leads__summary">{[["New", "New social leads"], ["Needs follow-up", "Needs follow-up"], ["In conversation", "In conversation"], ["Qualified", "Qualified / converted"]].map(([key, label]) => <article key={key}><strong>{loading ? "—" : rows.filter(row => leadStage(row) === key || (key === "Qualified" && leadStage(row) === "Converted")).length}</strong><span>{label}</span></article>)}</section>
    <p className="social-leads__help">Counts and filters cover the latest 250 social identities. Follow-up means an open conversation; qualification and conversion use existing CRM records.</p>
    <div className="social-leads__filters">
      <label>Platform<select value={filters.platform} onChange={e => set("platform", e.target.value)}><option value="">All platforms</option>{["instagram","facebook","linkedin","x","tiktok"].map(p => <option key={p} value={p}>{p}</option>)}</select></label>
      <label>Interaction<select value={filters.interaction} onChange={e => set("interaction",e.target.value)}><option value="">All interactions</option>{Object.entries(interactionLabels).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label>Status<select value={filters.status} onChange={e => set("status",e.target.value)}><option value="">All statuses</option>{[...new Set(rows.map(leadStage))].map(s => <option key={s}>{s}</option>)}</select></label>
      <label>Assigned to<select value={filters.assignee} onChange={e => set("assignee",e.target.value)}><option value="">Anyone</option><option value="unassigned">Unassigned</option>{assignees.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
      <label>Since<input type="date" value={filters.date} onChange={e => set("date",e.target.value)}/></label>
    </div>
    {loading ? <p role="status">Loading social leads…</p> : <section className="social-leads__list" aria-label="Social leads">{visible.map(row => <article key={row._id}>
      <div className="social-leads__identity"><UserAvatar name={row.contactId?.name || row.displayName || row.username}/><div><h2>{row.contactId?.name || row.displayName || row.username || "Social contact"}</h2>{row.username && <span>@{row.username}</span>}<small>{row.provider} · {leadStage(row)}</small></div></div>
      <div className="social-leads__context"><strong>{interactionLabels[row.latestInteraction?.type] || "Social engagement"}</strong>{row.conversation?.preview && <p>{row.conversation.preview}</p>}<small>{row.lastActivityAt ? new Date(row.lastActivityAt).toLocaleString() : "Time not recorded"} · {row.conversation?.assignedTo?.name || "Unassigned"}</small>{row.latestInteraction?.contentBriefId ? <Link to={`/social/content?content=${row.latestInteraction.contentBriefId}`}>View source content</Link> : row.latestInteraction?.hasSourcePost ? <small>Source post recorded with this interaction</small> : null}</div>
      <div className="social-leads__actions">{row.conversation?.id ? <Link to={`/social/inbox?thread=${row.conversation.id}`}>Open conversation</Link> : <span>No conversation recorded yet</span>}<Link to={`/crm/contacts/${row.contactId._id}`}>View CRM contact / update status</Link><small>{row.conversation?.status === "open" ? "Next: review the message and follow up if permitted." : "Next: review contact details and decide on follow-up."}</small></div>
    </article>)}{!visible.length && <div className="social-leads__empty"><h2>{rows.length ? "No leads match these filters" : "Your social conversations start here"}</h2><p>Comments, DMs, mentions, referrals, and supported interactions from connected accounts appear here. Following an account alone does not create a lead or authorize a DM.</p>{rows.length ? <button onClick={() => setFilters({platform:"",interaction:"",status:"",assignee:"",date:""})}>Clear filters</button> : <Link to="/social/accounts">Connect your social accounts</Link>}</div>}</section>}
  </main>;
}
