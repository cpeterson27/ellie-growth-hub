import { useEffect, useMemo, useState } from "react";
import { cancelPaymentPlan, createApplicationPaymentPlan, fetchManagedApplications, fetchPaymentPlanShareLink, fetchPaymentPlans } from "../services/api.js";
import "./PaymentPlanPanel.css";

const money = (amount, currency = "USD") => new Intl.NumberFormat(undefined, { style: "currency", currency }).format((amount || 0) / 100);
const dateValue = (date) => date.toISOString().slice(0, 10);
const equalAmounts = (total, count) => { const base = Math.floor(total / count), remainder = total % count; return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0)); };

export default function PaymentPlanPanel({ canManage, connectionStatus, busy, runAction }) {
  const [applications, setApplications] = useState([]);
  const [plans, setPlans] = useState([]);
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState({ applicationId: "", mode: "equal", installmentCount: 4, firstDueAt: dateValue(new Date()), customAmounts: {}, customDates: {} });
  const load = async () => { const [applicationItems, planItems] = await Promise.all([fetchManagedApplications(), fetchPaymentPlans()]); setApplications(applicationItems.filter((item) => ["submitted", "reviewing", "qualified"].includes(item.status) && item.coachingProgramId)); setPlans(planItems); };

  useEffect(() => { let active = true; if (canManage) Promise.all([fetchManagedApplications(), fetchPaymentPlans()]).then(([applicationItems, planItems]) => { if (!active) return; setApplications(applicationItems.filter((item) => ["submitted", "reviewing", "qualified"].includes(item.status) && item.coachingProgramId)); setPlans(planItems); }).catch(() => {}); return () => { active = false; }; }, [canManage]);

  const selectedApplication = applications.find((item) => item._id === form.applicationId);
  const totalMinor = Math.round(Number(selectedApplication?.coachingProgramId?.defaultPrice?.amount || 0) * 100);
  const schedule = useMemo(() => {
    const count = Number(form.installmentCount), equal = equalAmounts(totalMinor, count), start = new Date(`${form.firstDueAt}T12:00:00`);
    return Array.from({ length: count }, (_, index) => {
      const defaultDate = new Date(start.getFullYear(), start.getMonth() + index, start.getDate());
      return { amountMinor: form.mode === "equal" ? equal[index] : Math.round(Number(form.customAmounts[index] || 0) * 100), dueAt: form.customDates[index] || dateValue(defaultDate) };
    });
  }, [form, totalMinor]);

  if (!canManage) return null;
  const create = (event) => { event.preventDefault(); runAction(async () => { const result = await createApplicationPaymentPlan(form.applicationId, { mode: form.mode, installmentCount: Number(form.installmentCount), installments: schedule.map((item) => ({ amountMinor: item.amountMinor, dueAt: new Date(`${item.dueAt}T12:00:00`).toISOString() })) }); setLink(result.publicPaymentPlanUrl); setCopied(false); await load(); }, "Application accepted and secure payment plan created."); };

  return <>
    <form className="payment-panel" onSubmit={create}>
      <div className="payment-panel__heading"><div><h3>Create a split payment plan</h3><p>The total always comes from the published program price. Choose equal payments or an approved custom split.</p></div></div>
      <label>Applicant<select required value={form.applicationId} onChange={(event) => setForm({ ...form, applicationId: event.target.value })}><option value="">Select a pending application</option>{applications.map((item) => <option key={item._id} value={item._id}>{item.contactId?.name || item.contactId?.email} · {item.coachingProgramId?.name} · {money(Math.round(Number(item.coachingProgramId?.defaultPrice?.amount || 0) * 100))}</option>)}</select></label>
      <div className="payment-form-row"><label>Schedule type<select value={form.mode} onChange={(event) => setForm({ ...form, mode: event.target.value })}><option value="equal">Equal payments</option><option value="custom">Custom amounts</option></select></label><label>Number of payments<select value={form.installmentCount} onChange={(event) => setForm({ ...form, installmentCount: event.target.value })}>{Array.from({ length: 11 }, (_, index) => index + 2).map((count) => <option key={count}>{count}</option>)}</select></label></div>
      <label>First payment due<input type="date" required value={form.firstDueAt} onChange={(event) => setForm({ ...form, firstDueAt: event.target.value })} /></label>
      {selectedApplication ? <div className="payment-schedule" aria-label="Installment schedule"><div className="payment-schedule__summary"><strong>Payment schedule</strong><span>Program total: {money(totalMinor)}</span></div>{schedule.map((item, index) => <div className="payment-schedule__row" key={index}><span>Payment {index + 1}</span><label>Amount<input aria-label={`Payment ${index + 1} amount`} disabled={form.mode === "equal"} min="0.01" step="0.01" type="number" value={form.mode === "equal" ? (item.amountMinor / 100).toFixed(2) : form.customAmounts[index] || ""} onChange={(event) => setForm({ ...form, customAmounts: { ...form.customAmounts, [index]: event.target.value } })} /></label><label>Due date<input aria-label={`Payment ${index + 1} due date`} required type="date" value={item.dueAt} onChange={(event) => setForm({ ...form, customDates: { ...form.customDates, [index]: event.target.value } })} /></label></div>)}</div> : null}
      <button className="btn btn-primary" disabled={busy || connectionStatus !== "connected"}>Accept &amp; create payment plan</button>
      {link ? <div className="payment-request-link" aria-live="polite"><label>Applicant payment plan link<input readOnly value={link} /></label><button type="button" className="btn btn-secondary" onClick={async () => { await navigator.clipboard.writeText(link); setCopied(true); }}>{copied ? "Copied" : "Copy link"}</button></div> : null}
    </form>
    {plans.length ? <section className="payment-panel payment-activity"><div className="payment-panel__heading"><div><h3>Payment plans</h3><p>Verified installment progress for this workspace.</p></div></div><div className="payment-table-wrap"><table><thead><tr><th>Applicant</th><th>Program</th><th>Progress</th><th>Status</th><th>Actions</th></tr></thead><tbody>{plans.map((plan) => <tr key={plan._id}><td>{plan.contactId?.name || plan.contactId?.email}</td><td>{plan.coachingProgramId?.name}</td><td>{money(plan.paidAmountMinor, plan.currency)} of {money(plan.totalAmountMinor, plan.currency)}</td><td><span className={`payment-status payment-status--${plan.status}`}>{plan.status.replaceAll("_", " ")}</span></td><td>{!["canceled", "paid", "refunded"].includes(plan.status) ? <><button className="payment-link-button" onClick={async () => { const url = await fetchPaymentPlanShareLink(plan._id); await navigator.clipboard.writeText(url); }}>Copy link</button><button className="payment-link-button" onClick={() => runAction(async () => { await cancelPaymentPlan(plan._id); await load(); }, "Payment plan canceled.")}>Cancel</button></> : null}</td></tr>)}</tbody></table></div></section> : null}
  </>;
}
