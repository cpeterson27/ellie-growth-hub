import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { beginPublicInstallmentCheckout, fetchPublicPaymentPlan } from "../services/api.js";
import "./PublicPaymentRequest.css";

const money = (amount, currency = "USD") => new Intl.NumberFormat(undefined, { style: "currency", currency }).format((amount || 0) / 100);
export default function PublicPaymentPlan() {
  const { token } = useParams();
  const [plan, setPlan] = useState(null), [error, setError] = useState(""), [busy, setBusy] = useState(0);
  useEffect(() => { fetchPublicPaymentPlan(token).then(setPlan).catch((e) => setError(e?.response?.data?.error || "This payment plan could not be opened.")); }, [token]);
  const pay = async (number) => { setBusy(number); setError(""); try { const result = await beginPublicInstallmentCheckout(token, number); window.location.assign(result.checkoutUrl); } catch (e) { setError(e?.response?.data?.error || "Secure checkout could not be opened."); setBusy(0); } };
  if (error && !plan) return <main className="public-payment"><section><h1>Payment plan unavailable</h1><p role="alert">{error}</p></section></main>;
  if (!plan) return <main className="public-payment"><section><p>Loading secure payment plan…</p></section></main>;
  return <main className="public-payment"><section><p className="public-payment__eyebrow">Secure program payment plan</p><h1>{plan.programName}</h1><p>Payment to <strong>{plan.businessName}</strong></p><div className="public-payment__summary"><div><span>Original investment</span><strong>{money(plan.originalPriceMinor, plan.currency)}</strong></div><div><span>Remaining</span><strong>{money(plan.remainingBalanceMinor, plan.currency)}</strong></div></div>{error ? <p className="public-payment__error" role="alert">{error}</p> : null}<div className="payment-plan-list">{plan.installments.map((item) => <article key={item.installmentNumber}><div><strong>Payment {item.installmentNumber}</strong><span>{new Date(item.dueAt).toLocaleDateString()}</span></div><div><strong>{money(item.amountMinor, plan.currency)}</strong><span>{item.status.replaceAll("_", " ")}</span></div>{item.canPay ? <button disabled={busy === item.installmentNumber} onClick={() => pay(item.installmentNumber)}>{busy === item.installmentNumber ? "Opening secure checkout…" : "Pay with Square"}</button> : null}</article>)}</div><small>Payments are completed on Square’s secure hosted checkout. Growth Operator waits for Square’s verified confirmation before recording payment.</small></section></main>;
}
