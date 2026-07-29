import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FiEye, FiMail, FiRefreshCw } from "react-icons/fi";
import Button from "../components/Button.jsx";
import DashboardCard from "../components/DashboardCard.jsx";
import Modal from "../components/Modal.jsx";
import {
  approveAllOutreach,
  fetchCampaigns,
  fetchOutreach,
  generateOutreach,
  sendEmails,
  syncGmailOutreachReplies,
  updateOutreach,
} from "../services/api.js";
import "./Outreach.css";
import { useInitiative } from "../context/InitiativeContext.jsx";

const labels = {
  active: "To do",
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
  const [preview, setPreview] = useState(null);
  const [approveAllOpen, setApproveAllOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
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
        <input
          className="select-input"
          placeholder="Search contacts, companies, or subjects"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
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
        {loading ? (
          <p>Loading outreach…</p>
        ) : filtered.length ? (
          <div className="outreach-list">
            {filtered.map((item) => (
              <article key={item._id} className="outreach-item">
                <div className="outreach-item__top">
                  <div>
                    <p className="outreach-item__company">
                      {item.organization || "Independent contact"}
                    </p>
                    <h3>
                      {item.contactName || item.contactEmail || "Contact"}
                    </h3>
                    <p>{item.contactEmail || "No email"}</p>
                  </div>
                  <span
                    className={`outreach-status outreach-status--${item.status}`}
                  >
                    {labels[item.status] || item.status}
                  </span>
                </div>
                <p className="outreach-item__subject">
                  {item.subject || "No subject"}
                </p>
                <div className="outreach-item__actions">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPreview(item)}
                  >
                    <FiEye />
                    Review
                  </Button>
                  {item.contactEmail ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        navigate(
                          "/inbox?contact=" +
                            encodeURIComponent(item.contactEmail),
                        )
                      }
                    >
                      <FiMail />
                      Conversation
                    </Button>
                  ) : null}
                  {item.status === "pending" ? (
                    <Button
                      size="sm"
                      loading={saving}
                      onClick={() => approve(item)}
                    >
                      Approve
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
          preview?.status === "pending" ? (
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
          )
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
            {preview.htmlBody ? (
              <iframe
                className="outreach-preview__frame"
                title={`Email preview for ${preview.contactName || "contact"}`}
                srcDoc={preview.htmlBody}
                sandbox="allow-popups allow-popups-to-escape-sandbox"
              />
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
