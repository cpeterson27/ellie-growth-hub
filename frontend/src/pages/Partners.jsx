import { useEffect, useMemo, useState } from "react";
import Button from "../components/Button.jsx";
import DashboardCard from "../components/DashboardCard.jsx";
import Modal from "../components/Modal.jsx";
import Table from "../components/Table.jsx";
import { configureEventbriteWebhook, createEventbriteAffiliateLink, fetchEventbriteAffiliateSales, fetchEventbriteWebhookStatus, fetchEvents, fetchPartners, syncEventbriteAffiliate, updatePartner } from "../services/api.js";
import "./Partners.css";

const blank = { name: "", company: "", email: "", phone: "", type: "affiliate", referralCode: "", referralLink: "", localEventId: "", commissionRate: "", notes: "" };
const slug = (value) => String(value || "").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

export default function Partners() {
  const [partners, setPartners] = useState([]);
  const [events, setEvents] = useState([]);
  const [form, setForm] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const [syncingId, setSyncingId] = useState("");
  const [sales, setSales] = useState([]);
  const [webhookStatus, setWebhookStatus] = useState(null);
  const [automationBusy, setAutomationBusy] = useState(false);

  const connectedEvents = useMemo(() => events.filter((event) => event.integrations?.eventbrite?.eventId && event.integrations?.eventbrite?.url), [events]);
  const load = async () => {
    try {
      const [partnerData, eventData, saleData, webhookData] = await Promise.all([fetchPartners(), fetchEvents(), fetchEventbriteAffiliateSales().catch(() => []), fetchEventbriteWebhookStatus().catch(() => null)]);
      setPartners(Array.isArray(partnerData) ? partnerData : []);
      setEvents(Array.isArray(eventData) ? eventData : []);
      setSales(Array.isArray(saleData) ? saleData : []);
      setWebhookStatus(webhookData);
    } catch { setError("Unable to load affiliate links."); }
  };
  useEffect(() => {
    load();
    const timer = window.setInterval(load, 30000);
    return () => window.clearInterval(timer);
  }, []);

  const openNew = () => {
    setError(""); setSuccess("");
    setForm({ ...blank, localEventId: String(connectedEvents[0]?._id || "") });
  };
  const save = async () => {
    try {
      setSaving(true); setError(""); setSuccess("");
      if (!form.name.trim()) return setError("Partner name is required.");
      if (form._id) await updatePartner(form._id, { name: form.name, company: form.company, email: form.email, phone: form.phone, commissionRate: form.commissionRate, notes: form.notes });
      else {
        if (!form.localEventId) return setError("Choose the Eventbrite bootcamp event.");
        const created = await createEventbriteAffiliateLink({ ...form, referralCode: form.referralCode || slug(form.name) });
        let copied = false;
        try { await navigator.clipboard.writeText(created.referralLink); copied = true; } catch (_error) {}
        let automatic = false;
        try { const status = await configureEventbriteWebhook(); setWebhookStatus(status); automatic = Boolean(status.configured); } catch (_error) {}
        setSuccess(`Affiliate link created for ${created.name}${copied ? " and copied to your clipboard" : ". Use Copy link in the table to copy it"}. ${automatic ? "Automatic Eventbrite sale updates are on." : "Automatic updates still need setup; use Turn on automatic updates below."}`);
      }
      setForm(null);
      await load();
    } catch (err) { setError(err.response?.data?.message || "Unable to save the affiliate link."); }
    finally { setSaving(false); }
  };
  const copyLink = async (partner) => {
    try { await navigator.clipboard.writeText(partner.referralLink); setSuccess(`${partner.name}’s affiliate link was copied.`); }
    catch { setError("Your browser blocked copying. Open Edit and copy the link manually."); }
  };
  const syncPartner = async (partner) => {
    try {
      setSyncingId(partner._id); setError(""); setSuccess("");
      await syncEventbriteAffiliate(partner._id);
      await load();
      setSuccess(`Eventbrite sales refreshed for ${partner.name}.`);
    } catch (err) { setError(err.response?.data?.message || "Unable to refresh Eventbrite affiliate sales."); }
    finally { setSyncingId(""); }
  };
  const enableAutomation = async () => {
    try {
      setAutomationBusy(true); setError(""); setSuccess("");
      const status = await configureEventbriteWebhook();
      setWebhookStatus(status);
      setSuccess("Automatic Eventbrite affiliate-sale updates are on.");
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || "Automatic Eventbrite updates could not be enabled. Refresh now remains available as a backup.");
      setWebhookStatus(err.response?.data || { configured: false });
    } finally { setAutomationBusy(false); }
  };

  const columns = [
    { header: "Affiliate", render: (row) => <div className="partner-identity"><strong>{row.name}</strong><small>{row.company || row.email || "Independent partner"}</small></div> },
    { header: "Event", render: (row) => row.eventName || "Not linked" },
    { header: "Code", accessor: "referralCode" },
    { header: "Commission", render: (row) => `${row.commissionRate || 0}%` },
    { header: "Tickets", accessor: "ticketsSold" },
    { header: "Revenue", render: (row) => <div className="partner-identity"><strong>{row.revenue || "$0"}</strong><small>{row.lastSyncedAt ? `Synced ${new Date(row.lastSyncedAt).toLocaleString()}` : "Not synced yet"}</small></div> },
    { header: "Commission due", render: (row) => new Intl.NumberFormat("en-US", { style: "currency", currency: row.currency || "USD" }).format(Number(row.grossRevenue || 0) * Number(row.commissionRate || 0) / 100) },
    { header: "Actions", render: (row) => <div className="partner-actions">{row.referralLink ? <Button size="sm" onClick={() => copyLink(row)}>Copy link</Button> : null}{row.trackingProvider === "eventbrite" ? <Button size="sm" variant="outline" loading={syncingId === row._id} onClick={() => syncPartner(row)}>Refresh now</Button> : null}<Button size="sm" variant="outline" onClick={() => { setError(""); setForm({ ...row, localEventId: String(row.localEventId || "") }); }}>Edit</Button></div> },
  ];

  return <div className="page-dashboard partners-page">
    <div className="page-header"><div><h1 className="page-title">Affiliate links</h1><p className="page-subtitle">Create Eventbrite-compatible partner links and synchronize attributed tickets and revenue.</p></div><Button onClick={openNew}>+ Create affiliate link</Button></div>
    {error ? <p className="form-error">{error}</p> : null}{success ? <p className="partner-success">{success}</p> : null}
    <section className={`affiliate-automation ${webhookStatus?.configured ? "is-on" : "is-off"}`}><div><span>Automatic sale tracking</span><strong>{webhookStatus?.configured ? "On" : "Needs setup"}</strong><p>{webhookStatus?.configured ? `Eventbrite sends new orders to Growth Operator automatically${webhookStatus.lastReceivedAt ? ` · Last update ${new Date(webhookStatus.lastReceivedAt).toLocaleString()}` : ""}.` : "Turn this on once. After that, purchases update the affiliate ledger without pressing Refresh now."}</p></div>{!webhookStatus?.configured ? <Button loading={automationBusy} onClick={enableAutomation}>Turn on automatic updates</Button> : <span className="automation-live">● Listening for Eventbrite orders</span>}</section>
    <section className="affiliate-summary"><div><span>Active affiliate links</span><strong>{partners.filter((partner) => partner.trackingProvider === "eventbrite").length}</strong></div><div><span>Attributed tickets</span><strong>{partners.reduce((sum, partner) => sum + Number(partner.ticketsSold || 0), 0)}</strong></div><div><span>Connected Eventbrite events</span><strong>{connectedEvents.length}</strong></div></section>
    <div className="affiliate-explainer"><strong>How this works</strong><span>Growth Operator creates a unique Eventbrite URL containing the partner’s affiliate code. With automatic tracking on, Eventbrite notifies Growth Operator after an order and the ticket, revenue, buyer, refund status, and commission are recorded here. Refresh now is only a backup. Commission payments remain under your approval.</span></div>
    <DashboardCard title="Affiliate performance"><Table columns={columns} data={partners} emptyMessage="Create your first Eventbrite affiliate link." /></DashboardCard>
    <DashboardCard title="Recent affiliate purchases">{sales.length ? <div className="affiliate-sales-list">{sales.map((sale) => <article key={sale._id}><div><strong>{sale.partnerId?.name || sale.affiliateCode}</strong><span>{sale.buyerName || sale.buyerEmail || "Eventbrite attendee"}</span></div><div><strong>{new Intl.NumberFormat("en-US", { style: "currency", currency: sale.currency || "USD" }).format(Number(sale.grossRevenue || 0))}</strong><span>{sale.ticketClassName || "Ticket"} · {sale.status}</span></div><time>{sale.purchasedAt ? new Date(sale.purchasedAt).toLocaleString() : "Synced from Eventbrite"}</time></article>)}</div> : <div className="table-state table-state--empty">No affiliate purchases have been attributed yet. New purchases will appear here automatically when tracking is on.</div>}</DashboardCard>
    <Modal isOpen={Boolean(form)} onClose={() => setForm(null)} title={form?._id ? "Edit affiliate" : "Create Eventbrite affiliate link"} footer={<><Button variant="outline" onClick={() => setForm(null)}>Cancel</Button><Button onClick={save} loading={saving}>{form?._id ? "Save changes" : "Create and copy link"}</Button></>}>
      {form ? <div className="affiliate-form">{error ? <p className="form-error">{error}</p> : null}
        {!form._id ? <label><span>Bootcamp event</span><select value={form.localEventId} onChange={(event) => setForm({ ...form, localEventId: event.target.value })}><option value="">Choose an Eventbrite event</option>{connectedEvents.map((event) => <option key={event._id} value={event._id}>{event.name}</option>)}</select><small>{connectedEvents.length ? "Only events already connected to Eventbrite appear here." : "Connect or import the bootcamp event on the Events page first."}</small></label> : <div className="affiliate-readonly"><span>Event</span><strong>{form.eventName || "Eventbrite event"}</strong></div>}
        <div className="affiliate-form-grid"><label><span>Affiliate name</span><input value={form.name || ""} onChange={(event) => setForm({ ...form, name: event.target.value, ...(!form.referralCode && !form._id ? { referralCode: slug(event.target.value) } : {}) })} /></label><label><span>Company</span><input value={form.company || ""} onChange={(event) => setForm({ ...form, company: event.target.value })} /></label><label><span>Email</span><input type="email" value={form.email || ""} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label><label><span>Commission %</span><input type="number" min="0" max="100" step="0.1" value={form.commissionRate ?? ""} onChange={(event) => setForm({ ...form, commissionRate: event.target.value })} /></label></div>
        {!form._id ? <label><span>Affiliate tracking code</span><input value={form.referralCode || ""} onChange={(event) => setForm({ ...form, referralCode: slug(event.target.value) })} /><small>Use a unique code for this partner. Growth Operator will generate the full link.</small></label> : <div className="affiliate-readonly"><span>Tracking code</span><strong>{form.referralCode}</strong></div>}
        {form.referralLink ? <label><span>Affiliate link</span><textarea readOnly value={form.referralLink} /></label> : null}
        <label><span>Internal notes</span><textarea value={form.notes || ""} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
      </div> : null}
    </Modal>
  </div>;
}
