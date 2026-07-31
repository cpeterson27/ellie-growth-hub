import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FiChevronLeft, FiChevronRight, FiEye, FiMail, FiRefreshCw, FiSearch } from "react-icons/fi";
import Button from "../components/Button.jsx";
import DashboardCard from "../components/DashboardCard.jsx";
import Modal from "../components/Modal.jsx";
import {
  approveAllOutreach,
  fetchCampaigns,
  fetchOutreach,
  fetchOutreachPreview,
  generateOutreach,
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
  sent: "Sent",
  replied: "Replied",
  failed: "Failed",
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
  const [approveAllOpen, setApproveAllOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
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
  const filtered = useMemo(
    () =>
      items.filter(
        (item) =>
          (filter === "active"
            ? ["pending", "approved", "failed"].includes(item.status)
            : item.status === filter) &&
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
  const counts = {
    active: items.filter((x) =>
      ["pending", "approved", "failed"].includes(x.status),
    ).length,
    ...Object.fromEntries(
      ["pending", "approved", "sent", "replied", "failed"].map((s) => [
        s,
        items.filter((x) => x.status === s).length,
      ]),
    ),
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
            Refresh all drafts
          </Button>
          <Button
            variant="outline"
            disabled={!counts.pending || saving}
            onClick={() => setApproveAllOpen(true)}
          >
            Approve all pending ({counts.pending || 0})
          </Button>
          <Button loading={saving} onClick={send}>
            <FiMail />
            Send approved ({counts.approved || 0})
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
        {["active", "pending", "approved", "sent", "replied", "failed"].map(
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
          <div><strong>{labels[filter] || "Outreach"}</strong><span>{filtered.length} message{filtered.length === 1 ? "" : "s"} in this view</span></div>
          <label className="outreach-search">
            <span><FiSearch aria-hidden="true" /><input className="select-input" aria-label={`Search ${labels[filter] || "outreach"}`} placeholder={filter === "sent" ? "Search sent mail" : `Search ${String(labels[filter] || "outreach").toLowerCase()}`} value={search} onChange={(e) => setSearch(e.target.value)} /></span>
          </label>
        </div>
        {loading ? (
          <p>Loading outreach…</p>
        ) : filtered.length ? (
          <div className="outreach-mailbox">
            <div className="outreach-mailbox__head" aria-hidden="true">
              <span>Recipient</span><span>Message</span><span>Status</span><span>Actions</span>
            </div>
            <div className="outreach-list">
            {visibleItems.map((item) => (
              <article key={item._id} className="outreach-item">
                <div className="outreach-item__recipient">
                  <strong>{item.contactName || item.contactEmail || "Contact"}</strong>
                  <span>{item.contactEmail || "No email"}</span>
                  <small>{item.organization || "Independent contact"}</small>
                </div>
                <div className="outreach-item__message">
                  <strong>{item.subject || "No subject"}</strong>
                  <span>{item.templateAudienceLabel || "All Deal to Close contacts"}</span>
                  {item.sentAt ? <small>Sent {new Date(item.sentAt).toLocaleString()}</small> : null}
                </div>
                <div className="outreach-item__state">
                  <span className={`outreach-status outreach-status--${item.status}`}>
                    {labels[item.status] || item.status}
                  </span>
                  {item.deliveryStatus ? <small>{item.deliveryStatus}</small> : null}
                </div>
                <div className="outreach-item__actions">
                  <Button
                    variant={item.status === "pending" ? "primary" : "outline"}
                    size="sm"
                    onClick={() => review(item)}
                  >
                    <FiEye />
                    <span>{item.status === "pending" ? "Review & approve" : item.status === "failed" ? "Review issue" : "View email"}</span>
                  </Button>
                  {item.contactEmail && ["sent", "replied"].includes(item.status) ? (
                    <Button
                      variant="outline"
                      size="sm"
                      title="Open conversation"
                      aria-label={`Open conversation with ${item.contactName || item.contactEmail}`}
                      onClick={() =>
                        navigate(
                          "/inbox?contact=" +
                            encodeURIComponent(item.contactEmail),
                        )
                      }
                    >
                      <FiMail />
                      <span>Conversation</span>
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
            {preview?.status === "pending" ? (
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
