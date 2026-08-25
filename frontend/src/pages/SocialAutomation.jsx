import { useEffect, useMemo, useState } from "react";
import { createSocialAutomation, fetchSocialAutomationOverview, fetchSocialAutomations, fetchSocialLeads, updateSocialAutomation } from "../services/api.js";
import "./SocialAutomation.css";

const EMPTY = { name: "", provider: "instagram", assetId: "", contentId: "", triggerType: "comment_keyword", keywords: "", responseTemplate: "", ctaLabel: "", ctaDestination: "", campaignId: "", tags: "", qualification: "", enabled: false };

export default function SocialAutomation() {
  const [overview, setOverview] = useState(null);
  const [automations, setAutomations] = useState([]);
  const [leads, setLeads] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [nextOverview, nextAutomations, nextLeads] = await Promise.all([fetchSocialAutomationOverview(), fetchSocialAutomations(), fetchSocialLeads()]);
      setOverview(nextOverview); setAutomations(nextAutomations); setLeads(nextLeads);
    } catch (error) { setMessage(error.response?.data?.error || "Social Automation could not be loaded."); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    let active = true;
    Promise.all([fetchSocialAutomationOverview(), fetchSocialAutomations(), fetchSocialLeads()])
      .then(([nextOverview, nextAutomations, nextLeads]) => { if (active) { setOverview(nextOverview); setAutomations(nextAutomations); setLeads(nextLeads); } })
      .catch((error) => { if (active) setMessage(error.response?.data?.error || "Social Automation could not be loaded."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const assets = useMemo(() => (overview?.connections || []).flatMap((connection) => (connection.assets || []).filter((asset) => (connection.selectedAssetIds || []).includes(asset.id))), [overview]);
  const save = async (event) => {
    event.preventDefault(); setMessage("");
    try {
      await createSocialAutomation({ ...form, keywords: form.keywords.split(","), tags: form.tags.split(","), qualification: form.qualification.split(","), cta: { label: form.ctaLabel, destination: form.ctaDestination }, campaignId: form.campaignId || null });
      setForm(EMPTY); setMessage("Social automation saved."); await load();
    } catch (error) { setMessage(error.response?.data?.error || "Automation could not be saved."); }
  };
  const toggle = async (item) => { await updateSocialAutomation(item._id, { enabled: !item.enabled }); await load(); };

  if (loading) return <main className="social-automation"><p>Loading Social Automation…</p></main>;
  return <main className="social-automation">
    <header><div><p className="eyebrow">Growth Operator</p><h1>Social Automation</h1><p>Turn supported social conversations and comments into canonical CRM leads without creating another inbox.</p></div><span className="native-badge">Native Meta · ManyChat not required</span></header>
    {message ? <div className="social-notice" role="status">{message}</div> : null}
    <section className="social-grid social-grid--metrics">
      <article><strong>{overview?.counts?.socialLeads || 0}</strong><span>Social leads</span></article>
      <article><strong>{overview?.counts?.automations || 0}</strong><span>Automations</span></article>
      <article><strong>{assets.length}</strong><span>Selected Meta assets</span></article>
    </section>
    <section className="social-panel"><h2>Platform capabilities</h2><div className="capability-grid">{Object.entries(overview?.capabilities || {}).map(([provider, capability]) => <article key={provider}><h3>{provider}</h3><p>{capability.connection.replaceAll("_", " ")}</p><ul><li>{capability.inboundDm ? "Inbound DMs supported" : "No general inbound DM integration"}</li><li>{capability.commentKeyword ? "Comment keywords supported" : "No comment-keyword automation"}</li><li>{capability.followToDm ? "Follow-to-DM supported" : "Follow-to-DM unavailable"}</li><li>{capability.likesViewsSaves ? "Engagement automation supported" : "Likes/views/saves never trigger DMs"}</li></ul></article>)}</div></section>
    <section className="social-grid">
      <form className="social-panel" onSubmit={save}><h2>New supported trigger</h2>
        <label>Name<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <label>Platform<select value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value, triggerType: e.target.value === "instagram" ? "comment_keyword" : "comment_keyword" })}><option value="instagram">Instagram</option><option value="facebook">Facebook</option></select></label>
        <label>Connected asset<select required value={form.assetId} onChange={(e) => setForm({ ...form, assetId: e.target.value })}><option value="">Select an account/page</option>{assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name || asset.username || asset.id}</option>)}</select></label>
        <label>Trigger<select value={form.triggerType} onChange={(e) => setForm({ ...form, triggerType: e.target.value })}><option value="comment_keyword">Comment contains keyword</option><option value="comment_any">Any comment</option><option value="dm_keyword">DM contains keyword</option>{form.provider === "instagram" ? <option value="story_reply">Story reply</option> : null}</select></label>
        <label>Content/post ID <small>(blank means any content)</small><input value={form.contentId} onChange={(e) => setForm({ ...form, contentId: e.target.value })} /></label>
        <label>Keywords <small>(comma separated)</small><input value={form.keywords} onChange={(e) => setForm({ ...form, keywords: e.target.value })} disabled={form.triggerType !== "comment_keyword" && form.triggerType !== "dm_keyword"} /></label>
        <label>Initial response<textarea rows="4" value={form.responseTemplate} onChange={(e) => setForm({ ...form, responseTemplate: e.target.value })} /></label>
        <label>CTA/video label<input value={form.ctaLabel} onChange={(e) => setForm({ ...form, ctaLabel: e.target.value })} placeholder="Watch the underwriting video" /></label>
        <label>CTA destination<input type="url" value={form.ctaDestination} onChange={(e) => setForm({ ...form, ctaDestination: e.target.value })} placeholder="https://elliescoaching.com/apply" /></label>
        <label>Campaign ID <small>(optional existing CRM Campaign)</small><input value={form.campaignId} onChange={(e) => setForm({ ...form, campaignId: e.target.value })} /></label>
        <label>CRM tags<input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} /></label>
        <label>Qualification labels<input value={form.qualification} onChange={(e) => setForm({ ...form, qualification: e.target.value })} placeholder="requested coaching, underwriting" /></label>
        <label className="checkbox"><input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} /> Enable after saving</label>
        <button type="submit">Save automation</button>
      </form>
      <section className="social-panel"><h2>Configured automations</h2>{automations.length ? automations.map((item) => <article className="automation-row" key={item._id}><div><strong>{item.name}</strong><span>{item.provider} · {item.triggerType.replaceAll("_", " ")}{item.contentId ? ` · ${item.contentId}` : " · any content"}</span></div><button type="button" className={item.enabled ? "enabled" : ""} onClick={() => toggle(item)}>{item.enabled ? "Enabled" : "Disabled"}</button></article>) : <p>No social automation is configured. Normal social posts remain unaffected.</p>}</section>
    </section>
    <section className="social-panel"><h2>Recent social leads</h2>{leads.length ? <div className="lead-table">{leads.map((identity) => <article key={identity._id}><div><strong>{identity.contactId?.name || identity.displayName || identity.username}</strong><span>{identity.provider}{identity.username ? ` · @${identity.username}` : ""}</span></div><div><span>{identity.contactId?.socialAttribution?.latest?.contentId || "No content ID"}</span><small>{new Date(identity.lastActivityAt).toLocaleString()}</small></div></article>)}</div> : <p>No social leads yet. Provider webhook fixtures can verify this locally without sending a message.</p>}</section>
    <aside className="social-warning"><strong>Platform limits:</strong> no automation runs from likes, views, saves, shares, reactions, or followers. LinkedIn is human-assisted; TikTok is lead-form-only until an approved connection is configured.</aside>
  </main>;
}
