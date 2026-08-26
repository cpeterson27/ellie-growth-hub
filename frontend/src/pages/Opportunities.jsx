import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Button from "../components/Button.jsx";
import { Drawer, PageHeader, StatusBadge, Toolbar } from "../components/WorkspaceUI.jsx";
import { createOpportunity, fetchCompanies, fetchContacts, fetchOpportunities, savePipelineStages, updateOpportunity } from "../services/api.js";
import "./Opportunities.css";

const emptyDraft = { name: "", value: "", organizationId: "", primaryContactId: "", expectedCloseAt: "", nextAction: "", nextActionAt: "" };
const money = (value, currency = "USD") => new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(value || 0);

export default function Opportunities() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [opportunities, setOpportunities] = useState([]);
  const [stages, setStages] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [search, setSearch] = useState("");
  const [mineOnly, setMineOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(searchParams.get("create") === "opportunity");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [stageDrafts, setStageDrafts] = useState([]);
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const result = await fetchOpportunities({ search, owner: mineOnly ? "mine" : "" });
      setOpportunities(result.data || []); setStages(result.stages || []); setError("");
    } catch { setError("Unable to load opportunities."); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => fetchOpportunities({ search, owner: mineOnly ? "mine" : "" }).then((result) => { if (active) { setOpportunities(result.data || []); setStages(result.stages || []); setError(""); } }).catch(() => { if (active) setError("Unable to load opportunities."); }).finally(() => { if (active) setLoading(false); }), 180);
    return () => { active = false; window.clearTimeout(timer); };
  }, [search, mineOnly]);

  useEffect(() => {
    if (!createOpen) return;
    Promise.all([fetchCompanies({ limit: 100 }), fetchContacts({ limit: 100 })]).then(([companyResult, contactResult]) => { setCompanies(companyResult.data || []); setContacts(contactResult.data || []); }).catch(() => setError("Unable to load CRM record choices."));
  }, [createOpen]);

  const totals = useMemo(() => {
    const open = opportunities.filter((item) => !["won", "lost"].includes(stages.find((stage) => stage.key === item.stageKey)?.terminal));
    return { value: open.reduce((sum, item) => sum + (item.value || 0), 0), weighted: open.reduce((sum, item) => sum + (item.value || 0) * (item.probability || 0) / 100, 0), due: open.filter((item) => item.nextActionAt && new Date(item.nextActionAt) <= new Date()).length };
  }, [opportunities, stages]);

  async function moveOpportunity(id, stageKey) {
    const current = opportunities.find((item) => item._id === id);
    if (!current || current.stageKey === stageKey) return;
    const target = stages.find((stage) => stage.key === stageKey);
    const lostReason = target?.terminal === "lost" ? window.prompt("Why was this opportunity lost? This will be saved to its CRM history.", current.lostReason || "") : "";
    if (target?.terminal === "lost" && !lostReason?.trim()) return;
    setOpportunities((items) => items.map((item) => item._id === id ? { ...item, stageKey, probability: target?.probability || 0, lostReason } : item));
    try { await updateOpportunity(id, { stageKey, ...(lostReason ? { lostReason } : {}) }); await load(); }
    catch { setError("The stage change could not be saved."); await load(); }
  }

  async function submitOpportunity(event) {
    event.preventDefault();
    try { setSaving(true); await createOpportunity(draft); setDraft(emptyDraft); setCreateOpen(false); await load(); }
    catch (requestError) { setError(requestError.response?.data?.error || "Unable to create opportunity."); }
    finally { setSaving(false); }
  }

  async function saveOpportunity(event) {
    event.preventDefault();
    try { setSaving(true); await updateOpportunity(selected._id, selected); setSelected(null); await load(); }
    catch (requestError) { setError(requestError.response?.data?.error || "Unable to update opportunity."); }
    finally { setSaving(false); }
  }

  async function saveStages() {
    try { setSaving(true); const result = await savePipelineStages(stageDrafts); setStages(result.data || []); setSettingsOpen(false); await load(); }
    catch (requestError) { setError(requestError.response?.data?.error || "Unable to save stages."); }
    finally { setSaving(false); }
  }

  return <div className="page-dashboard opportunities-page">
    <PageHeader eyebrow="Revenue CRM" title="Sales Pipeline" description="Track qualified prospects as they move toward a purchase. Program applications can create opportunities here; existing contacts stay linked." actions={<><Button variant="outline" onClick={() => { setStageDrafts(stages.map((stage) => ({ ...stage }))); setSettingsOpen(true); }}>Configure stages</Button><Button onClick={() => setCreateOpen(true)}>New opportunity</Button></>} />
    <section className="pipeline-summary"><div><span>Open pipeline</span><strong>{money(totals.value)}</strong></div><div><span>Weighted forecast</span><strong>{money(totals.weighted)}</strong></div><div><span>Open opportunities</span><strong>{opportunities.filter((item) => !["won", "lost"].includes(stages.find((stage) => stage.key === item.stageKey)?.terminal)).length}</strong></div><div className={totals.due ? "needs-attention" : ""}><span>Actions due</span><strong>{totals.due}</strong></div></section>
    <Toolbar search={<input aria-label="Search opportunities" placeholder="Search opportunities" value={search} onChange={(event) => setSearch(event.target.value)} />} filters={<label><input type="checkbox" checked={mineOnly} onChange={(event) => setMineOnly(event.target.checked)} /> My opportunities</label>} results={loading ? "Loading pipeline" : `${opportunities.length} opportunities`} actions={<Button variant="outline" onClick={() => navigate("/crm/companies")}>Companies</Button>} />
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    {!loading && !opportunities.length && <p className="pipeline-empty">No sales opportunities match this view. New program applications can enter this pipeline automatically. You can also use New opportunity to link an existing qualified contact.</p>}
    {!loading ? <section className="opportunity-board" aria-label="Opportunity pipeline">{stages.map((stage) => {
      const items = opportunities.filter((item) => item.stageKey === stage.key);
      return <div className="opportunity-column" key={stage.key} onDragOver={(event) => event.preventDefault()} onDrop={(event) => moveOpportunity(event.dataTransfer.getData("text/opportunity-id"), stage.key)}>
        <header><div><StatusBadge tone={stage.color}>{stage.label}</StatusBadge><small>{stage.probability}% probability</small></div><strong>{money(items.reduce((sum, item) => sum + (item.value || 0), 0))}</strong><span>{items.length}</span></header>
        <div>{items.length ? items.map((item) => <article key={item._id} draggable role="button" tabIndex="0" aria-label={`Open ${item.name}`} onDragStart={(event) => event.dataTransfer.setData("text/opportunity-id", item._id)} onClick={() => setSelected({ ...item })} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelected({ ...item }); } }}>
          <strong>{item.name}</strong><span>{item.organizationId?.name || item.primaryContactId?.name || "Unlinked opportunity"}</span><b>{money(item.value, item.currency)}</b>{item.nextAction ? <p>{item.nextAction}</p> : <p className="muted">Next action needed</p>}<footer><small>{item.expectedCloseAt ? `Close ${new Date(item.expectedCloseAt).toLocaleDateString()}` : "No close date"}</small><em>{item.ownerId?.name || item.ownerId?.email || "You"}</em></footer>
          <label onClick={(event) => event.stopPropagation()}>Move<select value={item.stageKey} onChange={(event) => moveOpportunity(item._id, event.target.value)}>{stages.map((option) => <option value={option.key} key={option.key}>{option.label}</option>)}</select></label>
        </article>) : <p>Drop opportunities here</p>}</div>
      </div>;
    })}</section> : null}

    <Drawer isOpen={createOpen} onClose={() => setCreateOpen(false)} title="New opportunity" description="Connect revenue work to real CRM relationships."><OpportunityForm draft={draft} setDraft={setDraft} companies={companies} contacts={contacts} stages={stages} onSubmit={submitOpportunity} saving={saving} submitLabel="Create opportunity" /></Drawer>
    <Drawer isOpen={Boolean(selected)} onClose={() => setSelected(null)} title={selected?.name || "Opportunity"} description={selected?.organizationId?.name || selected?.primaryContactId?.name || "Revenue opportunity"}>{selected ? <OpportunityForm draft={selected} setDraft={setSelected} stages={stages} onSubmit={saveOpportunity} saving={saving} submitLabel="Save changes" editing /> : null}</Drawer>
    <Drawer isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} title="Pipeline stages" description="Rename, reorder, and tune forecast probability."><div className="stage-settings">{stageDrafts.map((stage, index) => <div key={stage.key}><span>{index + 1}</span><input aria-label={`Stage ${index + 1} name`} value={stage.label} onChange={(event) => setStageDrafts((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item))} /><label>Probability<input type="number" min="0" max="100" value={stage.probability} onChange={(event) => setStageDrafts((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, probability: event.target.value } : item))} /></label><Button size="sm" variant="ghost" disabled={index === 0} onClick={() => setStageDrafts((items) => { const copy = [...items]; [copy[index - 1], copy[index]] = [copy[index], copy[index - 1]]; return copy; })}>↑</Button><Button size="sm" variant="ghost" disabled={index === stageDrafts.length - 1} onClick={() => setStageDrafts((items) => { const copy = [...items]; [copy[index + 1], copy[index]] = [copy[index], copy[index + 1]]; return copy; })}>↓</Button></div>)}<Button loading={saving} onClick={saveStages}>Save pipeline</Button></div></Drawer>
  </div>;
}

function OpportunityForm({ draft, setDraft, companies = [], contacts = [], stages, onSubmit, saving, submitLabel, editing = false }) {
  return <form className="opportunity-form" onSubmit={onSubmit}>
    <label className="span-2">Opportunity name<input required maxLength="180" value={draft.name || ""} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
    <label>Stage<select value={draft.stageKey || stages[0]?.key || ""} onChange={(event) => setDraft({ ...draft, stageKey: event.target.value })}>{stages.map((stage) => <option value={stage.key} key={stage.key}>{stage.label}</option>)}</select></label>
    <label>Value<input type="number" min="0" step="1" value={draft.value || ""} onChange={(event) => setDraft({ ...draft, value: event.target.value })} /></label>
    {!editing ? <><label>Company<select value={draft.organizationId || ""} onChange={(event) => setDraft({ ...draft, organizationId: event.target.value })}><option value="">No company selected</option>{companies.map((company) => <option value={company._id} key={company._id}>{company.name}</option>)}</select></label><label>Primary contact<select value={draft.primaryContactId || ""} onChange={(event) => setDraft({ ...draft, primaryContactId: event.target.value })}><option value="">No contact selected</option>{contacts.map((contact) => <option value={contact._id} key={contact._id}>{contact.name} · {contact.company || "No company"}</option>)}</select></label></> : null}
    <label>Expected close<input type="date" value={draft.expectedCloseAt?.slice?.(0, 10) || ""} onChange={(event) => setDraft({ ...draft, expectedCloseAt: event.target.value })} /></label>
    <label>Next-action date<input type="date" value={draft.nextActionAt?.slice?.(0, 10) || ""} onChange={(event) => setDraft({ ...draft, nextActionAt: event.target.value })} /></label>
    <label className="span-2">Next action<input maxLength="500" value={draft.nextAction || ""} onChange={(event) => setDraft({ ...draft, nextAction: event.target.value })} placeholder="Specific owner action, not a vague reminder" /></label>
    {editing && stages.find((stage) => stage.key === draft.stageKey)?.terminal === "lost" ? <label className="span-2">Loss reason<textarea required rows="3" value={draft.lostReason || ""} onChange={(event) => setDraft({ ...draft, lostReason: event.target.value })} /></label> : null}
    <label className="span-2">Notes<textarea rows="4" maxLength="5000" value={draft.notes || ""} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label>
    <Button loading={saving}>{submitLabel}</Button>
  </form>;
}
