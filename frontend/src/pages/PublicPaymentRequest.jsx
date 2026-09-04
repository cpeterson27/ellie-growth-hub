import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { beginPublicPaymentCheckout, fetchPublicPaymentRequest } from "../services/api.js";
import "./PublicPaymentRequest.css";

const money = (amount, currency) => new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "USD" }).format((amount || 0) / 100);
const labels = { full: "Full program payment", deposit: "Program deposit", recurring: "Payment plan" };

export default function PublicPaymentRequest() {
  const { token } = useParams(); const [query] = useSearchParams();
  const [request, setRequest] = useState(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const load = () => fetchPublicPaymentRequest(token).then(setRequest).catch((e) => setError(e?.response?.data?.error || "This payment request could not be opened."));
  useEffect(() => { load(); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps
  const continueToSquare = async () => { setBusy(true); setError(""); try { const result = await beginPublicPaymentCheckout(token); window.location.assign(result.checkoutUrl); } catch (e) { setError(e?.response?.data?.error || "Secure checkout could not be opened."); setBusy(false); } };
  if (error && !request) return <main className="public-payment"><section><p className="public-payment__eyebrow">Payment request</p><h1>We couldn’t open this request</h1><p>{error}</p></section></main>;
  if (!request) return <main className="public-payment"><section><p>Loading secure payment request…</p></section></main>;
  const terminal = ["paid", "refunded", "partially_refunded", "canceled", "failed", "expired"].includes(request.status);
  return <main className="public-payment"><section>
    <p className="public-payment__eyebrow">{request.businessName}</p><h1>{request.programName}</h1>
    <div className="public-payment__summary"><div><span>Payment</span><strong>{labels[request.paymentType] || "Program payment"}</strong></div><div><span>Amount due now</span><strong>{money(request.amountMinor, request.currency)}</strong></div></div>
    {query.get("returned") ? <p className="public-payment__notice">Square is confirming your payment. This page changes to Paid only after Lead Porch receives Square’s verified confirmation.</p> : null}
    <p className={`public-payment__status public-payment__status--${request.status}`}>Status: {request.status.replaceAll("_", " ")}</p>
    {error ? <p className="public-payment__error" role="alert">{error}</p> : null}
    {request.canContinue ? <button type="button" onClick={continueToSquare} disabled={busy}>{busy ? "Opening Square…" : "Continue to secure Square checkout"}</button> : null}
    {terminal ? <p>No further payment action is available for this request. Contact {request.businessName} if you need help.</p> : null}
    <small>Card details are entered only on Square’s hosted checkout. Lead Porch does not receive your card number.</small>
  </section></main>;
}
