import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FiChevronLeft, FiChevronRight, FiEdit2, FiEye, FiMail, FiRefreshCw, FiSearch } from "react-icons/fi";
import Button from "../components/Button.jsx";
import DashboardCard from "../components/DashboardCard.jsx";
import Modal from "../components/Modal.jsx";
import {
  approveAllOutreach,
  fetchCampaigns,
  fetchOutreach,
  fetchOutreachPreview,
  generateOutreach,
  replaceBouncedOutreachEmail,
  sendOutreachTestEmail,
  sendEmails,
  syncGmailOutreachReplies,
  updateOutreach,
} from "../services/api.js";
import "./Outreach.css";
import { useInitiative } from "../context/InitiativeContext.jsx";

const labels = {
  active: "Needs attention",
  pending: "Pending review",
  approved: "Approved",
  processing: "Accepted",
  delayed: "Delayed",
  unconfirmed: "Status unavailable",
  delivered: "Delivered",
  bounced: "Bounced",
  replied: "Replied",
  failed: "Failed",
};
const baseViewStatuses = ["active", "pending", "approved", "processing", "delayed", "delivered", "bounced", "replied"];
const matchesView = (item, view) => {
  if (view === "active") return ["pending", "approved", "failed"].includes(item.status);
  if (view === "processing") return item.status === "sent" && item.deliveryStatus === "accepted";
  if (view === "delayed") return item.status === "sent" && item.deliveryStatus === "delayed";
  if (view === "unconfirmed") return item.status === "sent" && !item.deliveryStatus;
  if (view === "delivered") return item.deliveryStatus === "delivered" && item.status !== "replied";
  if (view === "bounced") return ["bounced", "failed", "suppressed", "complained"].includes(item.deliveryStatus);
  return item.status === view;
};
const deliveryLabel = (item) => {
  if (item.status === "replied") return "Replied";
  if (item.deliveryStatus === "delivered") return "Delivered";
  if (item.deliveryStatus === "bounced") return "Bounced";
  if (item.deliveryStatus === "delayed") return "Delayed";
  if (["failed", "suppressed", "complained"].includes(item.deliveryStatus)) return labels[item.deliveryStatus] || item.deliveryStatus;
  if (item.deliveryStatus === "accepted") return "Accepted by Resend";
  if (item.status === "sent") return "Status unavailable";
  return labels[item.status] || item.status;
};
const viewGuidance = {
  processing: { title: "Accepted by Resend", body: "Resend accepted these messages and is waiting for the recipient’s mail server to confirm delivery. Do not send them again." },
  delayed: { title: "Delivery is taking longer", body: "Resend is still retrying these messages. Ellie will move each one to Delivered or Bounced when the recipient’s server responds." },
  unconfirmed: { title: "Provider status unavailable", body: "Ellie has a sent record but no matching provider result. These are shown separately so they are never mistaken for active delivery." },
  delivered: { title: "Delivered successfully", body: "The recipient’s mail server accepted the email. Wait for a reply; delivery does not guarantee the person opened it." },
  bounced: { title: "Replace the email address", body: "Keep the contact, but do not reuse this address. Open the contact, research a different verified email, and update the record before future outreach." },
};
const htmlToText = (html = "") =>
  String(html)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
export default function Outreach() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { selectedId: initiativeId } = useInitiative();
  const [campaigns, setCampaigns] = useState([]);
  const [selected, setSelected] = useState(null);
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState("active");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [preview, setPreview] = useState(null);
  const [emailCorrection, setEmailCorrection] = useState(null);
  const [emailCorrectionError, setEmailCorrectionError] = useState("");
  const [replacementSendError, setReplacementSendError] = useState("");
  const [approveAllOpen, setApproveAllOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [deliverySyncedAt, setDeliverySyncedAt] = useState(null);
  const loadItems = useCallback(async (campaign) => {
    if (!campaign?._id) {
      setItems([]);
      return;
    }
    await syncGmailOutreachReplies().catch(() => null);
    const existing = await fetchOutreach(campaign._id);
    setItems(Array.isArray(existing) ? existing : existing.outreach || []);
    try {
      await generateOutreach(campaign._id, true);
      const refreshed = await fetchOutreach(campaign._id);
      setItems(Array.isArray(refreshed) ? refreshed : refreshed.outreach || []);
    } catch (err) {
      setError(
        err.response?.data?.error ||
          "Existing outreach loaded, but new drafts could not be prepared.",
      );
    }
  }, []);
  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const data = (await fetchCampaigns()).filter(Boolean);
      setCampaigns(data);
      const campaign =
        data.find(
          (x) =>
            x._id ===
            (params.get("campaignId") ||
              (initiativeId !== "all" ? initiativeId : "")),
        ) ||
        data[0] ||
        null;
      setSelected(campaign);
      await loadItems(campaign);
    } catch (err) {
      setError(err.response?.data?.error || "Unable to load outreach.");
    } finally {
      setLoading(false);
    }
  }, [params, loadItems, initiativeId]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (!selected?._id) return undefined;
    let active = true;
    const refreshDelivery = async () => {
      try {
        const result = await fetchOutreach(selected._id);
        if (!active) return;
        setItems(Array.isArray(result) ? result : result.outreach || []);
        setDeliverySyncedAt(new Date());
      } catch {
        // Keep the last known delivery state; the next poll will retry.
      }
    };
    const interval = window.setInterval(refreshDelivery, 20000);
    const onVisible = () => { if (document.visibilityState === "visible") refreshDelivery(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [selected?._id]);
  const filtered = useMemo(
    () =>
      items.filter(
        (item) =>
          matchesView(item, filter) &&
          (!search ||
            [
              item.organization,
              item.contactName,
              item.contactEmail,
              item.subject,
            ]
              .filter(Boolean)
              .join(" ")
              .toLowerCase()
              .includes(search.toLowerCase())),
      ),
    [items, filter, search],
  );
  const pageSize = 15;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visibleItems = filtered.slice((page - 1) * pageSize, page * pageSize);
  useEffect(() => setPage(1), [filter, search, selected?._id]);
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);
  const review = async (item) => {
    try {
      setSaving(true);
      setError("");
      const rendered = await fetchOutreachPreview(item._id);
      setPreview({ ...item, htmlBody: rendered.html, subject: rendered.subject || item.subject });
    } catch (err) {
      setError(err.response?.data?.error || "Unable to prepare the complete email preview.");
    } finally {
      setSaving(false);
    }
  };
  const hasUnconfirmed = items.some((item) => matchesView(item, "unconfirmed"));
  const viewStatuses = hasUnconfirmed
    ? [...baseViewStatuses.slice(0, 5), "unconfirmed", ...baseViewStatuses.slice(5)]
    : baseViewStatuses;
  const counts = {
    ...Object.fromEntries(viewStatuses.map((status) => [status, items.filter((item) => matchesView(item, status)).length])),
  };
  const generate = async () => {
    if (!selected) return setError("Select a campaign first.");
    try {
      setSaving(true);
      setError("");
      await generateOutreach(selected._id);
      await loadItems(selected);
    } catch (err) {
      setError(err.response?.data?.error || "Unable to generate outreach.");
    } finally {
      setSaving(false);
    }
  };
  const approve = async (item) => {
    try {
      setSaving(true);
      const updated = await updateOutreach(item._id, { status: "approved" });
      setItems((current) =>
        current.map((row) => (row._id === updated._id ? updated : row)),
      );
    } catch {
      setError("Unable to approve outreach.");
    } finally {
      setSaving(false);
    }
  };
  const approveAll = async () => {
    if (!selected || !counts.pending) return;
    try {
      setSaving(true);
      setError("");
      await approveAllOutreach(selected._id);
      setApproveAllOpen(false);
      await loadItems(selected);
    } catch (err) {
      setError(
        err.response?.data?.error || "Unable to approve pending drafts.",
      );
    } finally {
      setSaving(false);
    }
  };
  const sendTest = async () => {
    if (!preview?._id) return;
    try {
      setTestSending(true);
      setError("");
      setNotice("");
      const result = await sendOutreachTestEmail(preview._id);
      setNotice(result.message || "Test email sent to team@elliescoaching.com.");
    } catch (err) {
      setError(err.response?.data?.error || "Unable to send the test email.");
    } finally {
      setTestSending(false);
    }
  };
  const saveReplacementEmail = async () => {
    if (!emailCorrection?._id) return;
    try {
      setSaving(true);
      setEmailCorrectionError("");
      const result = await replaceBouncedOutreachEmail(
        emailCorrection._id,
        emailCorrection.newEmail,
        emailCorrection.confirmDirectSource,
      );
      setEmailCorrection(null);
      await loadItems(selected);
      setPreview({
        ...result.draft,
        replacementDraft: true,
        htmlBody: result.draft?.htmlBody || "",
      });
      setReplacementSendError("");
      setNotice("Address updated. Review the replacement below; nothing has been sent yet.");
    } catch (err) {
      setEmailCorrectionError(err.response?.data?.error || "Unable to replace this email address.");
    } finally {
      setSaving(false);
    }
  };
  const sendReplacement = async () => {
    if (!preview?._id || !preview?.replacementDraft) return;
    try {
      setSaving(true);
      setReplacementSendError("");
      const approved = await updateOutreach(preview._id, { status: "approved" });
      const result = await sendEmails([approved._id]);
      if (result.failedCount) {
        throw new Error(result.failures?.[0]?.message || "The replacement email could not be sent.");
      }
      setPreview(null);
      setNotice(`Replacement sent to ${approved.contactEmail}. Ellie will update its delivery status automatically.`);
      await loadItems(selected);
      setFilter("processing");
    } catch (err) {
      setReplacementSendError(err.response?.data?.error || err.message || "Unable to send the replacement email.");
    } finally {
      setSaving(false);
    }
  };
  const send = async () => {
    const ids = items.filter((x) => x.status === "approved").map((x) => x._id);
    if (!ids.length)
      return setError("Approve one or more drafts before sending.");
    try {
      setSaving(true);
      setError("");
      const result = await sendEmails(ids);
      await loadItems(selected);
      if (result.failedCount)
        setError(
          result.sentCount +
            " sent. " +
            result.failedCount +
            " could not be sent: " +
            ((result.failures &&
              result.failures[0] &&
              result.failures[0].message) ||
              "Review failed records."),
        );
    } catch (err) {
      setError(err.response?.data?.error || "Unable to send approved emails.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="page-dashboard outreach-page">
      <header className="outreach-header">
        <div>
          <p className="outreach-eyebrow">Campaign delivery</p>
          <h1 className="page-title">Outreach</h1>
          <p>
            New qualified campaign contacts are added here automatically. Review
            and approve each message before anything is sent.
          </p>
        </div>
        <div className="outreach-header__actions">
          <Button variant="outline" loading={saving} onClick={generate}>
            <FiRefreshCw />
            Refresh drafts
          </Button>
          <Button
            variant="outline"
            disabled={!counts.pending || saving}
            onClick={() => setApproveAllOpen(true)}
          >
            Approve pending · {counts.pending || 0}
          </Button>
          <Button loading={saving} onClick={send}>
            <FiMail />
            Send approved · {counts.approved || 0}
          </Button>
        </div>
      </header>
      {error ? <p className="form-error">{error}</p> : null}
      {notice ? <p className="outreach-notice">{notice}</p> : null}
      <section className="outreach-controls">
        <label>
          Campaign
          <select
            className="select-input"
            value={selected?._id || ""}
            onChange={async (e) => {
              const next =
                campaigns.find((c) => c._id === e.target.value) || null;
              setSelected(next);
              await loadItems(next);
            }}
          >
            {campaigns.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <p><strong>{selected?.name || "Choose a campaign"}</strong><span>{counts.active || 0} messages need attention</span></p>
      </section>
      <section className="outreach-summary">
        {viewStatuses.map(
          (status) => (
            <button
              key={status}
              className={filter === status ? "is-active" : ""}
              onClick={() => setFilter(status)}
            >
              <span>{labels[status]}</span>
              <strong>{counts[status] || 0}</strong>
            </button>
          ),
        )}
      </section>
      <DashboardCard
        title={selected ? `Messages for ${selected.name}` : "Outreach messages"}
      >
        <div className="outreach-list-tools">
          <div><strong>{labels[filter] || "Outreach"}</strong><span>{filtered.length} message{filtered.length === 1 ? "" : "s"} in this view · Delivery updates automatically{deliverySyncedAt ? ` · Checked ${deliverySyncedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}</span></div>
          <label className="outreach-search">
            <span><FiSearch aria-hidden="true" /><input className="select-input" aria-label={`Search ${labels[filter] || "outreach"}`} placeholder={filter === "sent" ? "Search sent mail" : `Search ${String(labels[filter] || "outreach").toLowerCase()}`} value={search} onChange={(e) => setSearch(e.target.value)} /></span>
          </label>
        </div>
        {viewGuidance[filter] ? <aside className={`outreach-guidance outreach-guidance--${filter}`}><strong>{viewGuidance[filter].title}</strong><span>{viewGuidance[filter].body}</span></aside> : null}
        {loading ? (
          <p>Loading outreach…</p>
        ) : filtered.length ? (
          <div className="outreach-mailbox">
            <div className="outreach-mailbox__head" aria-hidden="true">
              <span>Recipient and message</span><span>Status</span><span>Action</span>
            </div>
            <div className="outreach-list">
            {visibleItems.map((item) => (
              <article key={item._id} className="outreach-item">
                <div className="outreach-item__main">
                  <div className="outreach-item__recipient">
                    <strong>{item.contactName || item.contactEmail || "Contact"}</strong>
                    <span>{item.contactEmail || "No email"}{item.organization && item.organization.toLowerCase() !== String(item.contactName || "").toLowerCase() ? ` · ${item.organization}` : ""}</span>
                  </div>
                  <div className="outreach-item__message">
                    <strong>{item.subject || "No subject"}</strong>
                    {item.sentAt ? <span>Sent {new Date(item.sentAt).toLocaleString()}</span> : null}
                  </div>
                </div>
                <div className="outreach-item__state">
                  <span className={`outreach-status outreach-status--${item.deliveryStatus || item.status}`}>
                    {deliveryLabel(item)}
                  </span>
                  {item.deliveryStatus === "bounced" ? (
                    <small>
                      {item.replacement
                        ? `Replacement ${deliveryLabel(item.replacement).toLowerCase()}`
                        : "Needs a verified replacement"}
                    </small>
                  ) : null}
                </div>
                <div className="outreach-item__actions">
                  <Button
                    variant={item.status === "pending" ? "primary" : "outline"}
                    size="sm"
                    onClick={() => {
                      if (item.deliveryStatus === "bounced") {
                        if (item.replacement) {
                          review(item.replacement);
                          return;
                        }
                        setEmailCorrectionError("");
                        const correctedEmail =
                          item.contactId?.email &&
                          item.contactId.email !== item.contactEmail
                            ? item.contactId.email
                            : "";
                        setEmailCorrection({ ...item, newEmail: correctedEmail, confirmDirectSource: false });
                      } else review(item);
                    }}
                  >
                    {item.deliveryStatus === "bounced" ? <FiEdit2 /> : <FiEye />}
                    <span>{item.deliveryStatus === "bounced" ? (item.replacement ? "View replacement" : "Replace email") : item.status === "pending" ? "Review" : item.status === "failed" ? "Review issue" : "View email"}</span>
                  </Button>
                  {item.contactEmail && ["sent", "replied"].includes(item.status) && item.deliveryStatus !== "bounced" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      title="Open this contact’s inbox conversation"
                      aria-label={`Open conversation with ${item.contactName || item.contactEmail}`}
                      onClick={() =>
                        navigate(
                          "/inbox?contact=" +
                            encodeURIComponent(item.contactEmail),
                        )
                      }
                    >
                      <FiMail />
                      <span>Open inbox</span>
                    </Button>
                  ) : null}
                  {item.status === "failed" && item.errorMessage ? (
                    <span className="outreach-item__error">
                      Delivery error recorded
                    </span>
                  ) : null}
                </div>
              </article>
            ))}
            </div>
            <footer className="outreach-pagination">
              <span>{filtered.length} message{filtered.length === 1 ? "" : "s"} · Page {page} of {pageCount}</span>
              <div>
                <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((value) => value - 1)} aria-label="Previous outreach page"><FiChevronLeft /> Previous</Button>
                <Button variant="outline" size="sm" disabled={page === pageCount} onClick={() => setPage((value) => value + 1)} aria-label="Next outreach page">Next <FiChevronRight /></Button>
              </div>
            </footer>
          </div>
        ) : (
          <div className="table-state table-state--empty">
            No outreach items match this view. Add a qualified contact to the
            campaign, then return here.
          </div>
        )}
      </DashboardCard>
      <Modal
        isOpen={Boolean(emailCorrection)}
        onClose={() => setEmailCorrection(null)}
        title="Replace undeliverable email"
        footer={
          <>
            <Button variant="outline" onClick={() => setEmailCorrection(null)}>Cancel</Button>
            <Button
              loading={saving}
              disabled={
                !emailCorrection?.newEmail ||
                (!(emailCorrection.contactId?.emailStatus === "verified" && emailCorrection.newEmail === emailCorrection.contactId?.email) && !emailCorrection?.confirmDirectSource)
              }
              onClick={saveReplacementEmail}
            >Save &amp; prepare draft</Button>
          </>
        }
      >
        {emailCorrection ? (
          <form className="outreach-email-correction" onSubmit={(event) => { event.preventDefault(); saveReplacementEmail(); }}>
            <div className="outreach-email-correction__audit">
              <span>Original bounced address</span>
              <strong>{emailCorrection.contactEmail}</strong>
              {emailCorrection.bounceMessage ? <p>{emailCorrection.bounceMessage}</p> : <p>Resend reported that this address could not receive the message.</p>}
            </div>
            <label>
              Replacement email address
              <input type="email" autoFocus autoComplete="off" placeholder="name@company.com" value={emailCorrection.newEmail} onChange={(event) => setEmailCorrection((current) => ({ ...current, newEmail: event.target.value }))} />
            </label>
            {emailCorrection.contactId?.emailStatus === "verified" && emailCorrection.newEmail === emailCorrection.contactId?.email ? (
              <p className="outreach-email-correction__note"><strong>Verified correction found:</strong> This contact already has a different verified address in the CRM. Saving will prepare the replacement draft.</p>
            ) : (
              <label>
                <input
                  type="checkbox"
                  checked={Boolean(emailCorrection.confirmDirectSource)}
                  onChange={(event) => setEmailCorrection((current) => ({ ...current, confirmDirectSource: event.target.checked }))}
                />
                I found this exact address on an official company source or received it directly from this person. I did not guess the address pattern.
              </label>
            )}
            {emailCorrectionError ? <p className="form-error">{emailCorrectionError}</p> : null}
            <p className="outreach-email-correction__note"><strong>What happens next:</strong> Ellie updates the contact and creates a new draft for your review. Confirm this address is correct before approving it. The bounced record stays unchanged for an accurate audit trail, and nothing is sent automatically.</p>
          </form>
        ) : null}
      </Modal>
      <Modal
        isOpen={Boolean(preview)}
        onClose={() => setPreview(null)}
        title="Review outreach email"
        footer={
          <>
            <Button
              variant="outline"
              loading={testSending}
              onClick={sendTest}
            >
              Send test to team@elliescoaching.com
            </Button>
            {preview?.replacementDraft ? (
              <Button loading={saving} onClick={sendReplacement}>
                <FiMail />
                Send replacement now
              </Button>
            ) : preview?.status === "pending" ? (
              <Button
                onClick={() => {
                  approve(preview);
                  setPreview(null);
                }}
              >
                Approve draft
              </Button>
            ) : (
              <Button variant="outline" onClick={() => setPreview(null)}>
                Close
              </Button>
            )}
          </>
        }
      >
        {preview ? (
          <div className="outreach-preview">
            {preview.replacementDraft ? (
              <div className="outreach-preview__replacement">
                <strong>Replacement ready</strong>
                <span>This sends only this corrected message. The original bounce remains in delivery history.</span>
              </div>
            ) : null}
            {replacementSendError ? <p className="form-error">{replacementSendError}</p> : null}
            <p>
              <strong>To</strong> {preview.contactName || "Contact"}{" "}
              {preview.contactEmail ? `<${preview.contactEmail}>` : ""}
            </p>
            <p>
              <strong>Subject</strong> {preview.subject || "No subject"}
            </p>
            <p>
              <strong>Audience template</strong>{" "}
              {preview.templateAudienceLabel || "All Deal to Close contacts"}
            </p>
            {preview.htmlBody ? (
              <>
                <iframe
                  className="outreach-preview__frame"
                  title={`Email preview for ${preview.contactName || "contact"}`}
                  srcDoc={preview.htmlBody}
                  sandbox="allow-popups allow-popups-to-escape-sandbox"
                />
              </>
            ) : (
              <div className="outreach-preview__body">
                {preview.emailDraft ||
                  htmlToText(preview.htmlBody) ||
                  "No email body has been stored."}
              </div>
            )}
          </div>
        ) : null}
      </Modal>
      <Modal
        isOpen={approveAllOpen}
        onClose={() => !saving && setApproveAllOpen(false)}
        title="Approve all pending drafts"
        footer={
          <>
            <Button
              variant="outline"
              disabled={saving}
              onClick={() => setApproveAllOpen(false)}
            >
              Cancel
            </Button>
            <Button loading={saving} onClick={approveAll}>
              Approve {counts.pending || 0} drafts
            </Button>
          </>
        }
      >
        <p>
          This approves every pending draft for{" "}
          <strong>{selected?.name || "the selected campaign"}</strong>.
        </p>
        <p>
          Approval does not send email. You will still need to click{" "}
          <strong>Send approved</strong> separately.
        </p>
      </Modal>
    </div>
  );
}
