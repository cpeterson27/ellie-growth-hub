import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Papa from "papaparse";
import { FiMoreHorizontal } from "react-icons/fi";
import "./Contacts.css";
import "./ContactVerification.css";
import "./ContactDashboard.css";

import Button from "../components/Button.jsx";
import DashboardCard from "../components/DashboardCard.jsx";
import Modal from "../components/Modal.jsx";
import { getWorkspaceSettings } from "../utils/workspaceSettings.js";
import {
  fetchContacts,
  fetchContactOverview,
  fetchCampaigns,
  importContactsFromApollo,
  ingestContacts,
  archiveContact,
  deleteContact,
  updateContact,
  bulkAssignContactsToCampaign,
  searchApolloLeads,
  createEmailVerificationBatch,
  fetchEmailVerificationBatch,
} from "../services/api.js";
import { useInitiative } from "../context/InitiativeContext.jsx";

const recognizedImportHeaders = ["Name", "First Name", "Last Name", "Title", "Company Name", "Email", "Email Status", "Phone", "Work Direct Phone", "Person Linkedin Url", "Website", "City", "State", "Country", "# Employees", "Industry", "Seniority", "Departments", "Keywords", "Lists", "Stage", "Qualify Contact", "Tags", "Notes", "Apollo Contact Id", "Apollo Record Id"];

const importCopy = {
  apollo: {
    title: "Import Contacts from Apollo?",
    body: "This will use Apollo API credits to pull contacts into Ellie AI. Do you want to continue?",
  },
};

function contactNameParts(contact = {}) {
  const firstName = String(contact.firstName || "").trim();
  const lastName = String(contact.lastName || "").trim();
  if (firstName || lastName) return { firstName, lastName };

  const parts = String(contact.name || "").trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts.shift() || "",
    lastName: parts.join(" "),
  };
}

function fullContactName(contact = {}) {
  return [contact.firstName, contact.lastName]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(" ");
}

const contactDetailGroups = [
  ["Contact", [["name", "Name"], ["email", "Email"], ["phone", "Phone"], ["title", "Job title"], ["linkedin", "LinkedIn"]]],
  ["Company", [["company", "Company"], ["industry", "Industry"], ["website", "Website"], ["employeeCount", "Company size"]]],
  ["CRM", [["stage", "Lifecycle stage"], ["type", "Relationship type"], ["audienceProfiles", "Audience / interests"], ["tags", "Tags"], ["lists", "Lists"], ["sources", "Source"]]],
  ["History", [["lastContacted", "Last contacted"], ["notes", "Notes"]]],
];

function detailValue(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join(", ");
  if (value instanceof Date) return value.toLocaleDateString();
  return String(value ?? "").trim();
}

function hasAudienceSignals(contact = {}) {
  return Boolean(
    contact.audienceProfiles?.length ||
    contact.audienceSignals?.some((signal) => signal?.profile) ||
    contact.title ||
    contact.industry ||
    contact.company ||
    contact.seniority ||
    contact.keywords?.length ||
    contact.lists?.length
  );
}

function contactWorkflowState(contact = {}) {
  if (contact.emailStatus !== "verified" || !contact.email) {
    return {
      key: "email",
      label: "Review email",
      detail: "Confirm or correct the email before outreach.",
    };
  }
  if (!hasAudienceSignals(contact)) {
    return {
      key: "audience",
      label: "Add audience info",
      detail: "Tell Ellie what this person is interested in.",
    };
  }
  if (contact.campaignIds?.length) {
    return {
      key: "assigned",
      label: "Manage assignment",
      detail: "This contact is already assigned to a campaign.",
    };
  }
  return {
    key: "ready",
    label: "Assign campaign",
    detail: "Verified and ready for a campaign decision.",
  };
}

export default function Contacts() {
  const navigate = useNavigate();
  const { selectedId: initiativeId } = useInitiative();
  const workspaceSettings = getWorkspaceSettings();
  const [contacts, setContacts] = useState([]);
  const [contactOverview, setContactOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [selectedSource, setSelectedSource] = useState(null);
  const [isConfirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState("");
  const [campaigns, setCampaigns] = useState([]);
  const [campaignId, setCampaignId] = useState(() => initiativeId === "all" ? "" : initiativeId);
  const [filters, setFilters] = useState({ title: "", location: "", industry: "", employeeSize: "" });
  const [apolloResults, setApolloResults] = useState([]);
  const [selectedLeads, setSelectedLeads] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchMessage, setSearchMessage] = useState("");
  const [importSummary, setImportSummary] = useState(null);
  const [isContactFormOpen, setContactFormOpen] = useState(false);
  const [isUploadOpen, setUploadOpen] = useState(false);
  const [manualContact, setManualContact] = useState({ firstName: "", lastName: "", email: "", phone: "", company: "", title: "", notes: "", linkedin: "", location: "", tags: "", audienceProfiles: "", confirmEmailManually: false });
  const [importRows, setImportRows] = useState([]);
  const [importHeaders, setImportHeaders] = useState([]);
  const [importCampaignId, setImportCampaignId] = useState("");
  const [savingContact, setSavingContact] = useState(false);
  const [contactTab, setContactTab] = useState("all");
  const [importMenuOpen, setImportMenuOpen] = useState(false);
  const [actionMenu, setActionMenu] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [previewStats, setPreviewStats] = useState(null);
  const [detailContact, setDetailContact] = useState(null);
  const [editingContact, setEditingContact] = useState(null);
  const [contactEditMode, setContactEditMode] = useState("full");
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [verifyingEmails, setVerifyingEmails] = useState(false);
  const [verificationProgress, setVerificationProgress] = useState(null);
  const [verificationResults, setVerificationResults] = useState({});
  const [importError, setImportError] = useState("");
  const [existingBatchId, setExistingBatchId] = useState(() => localStorage.getItem("ellie-email-verification-batch") || "");
  const [selectedContactIds, setSelectedContactIds] = useState([]);
  const [bulkCampaignId, setBulkCampaignId] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkNotice, setBulkNotice] = useState("");
  const pageSize = 15;

  async function loadContacts() {
    try {
      setLoading(true);
      const query = { limit: 500, ...(contactTab === "archived" ? { status: "archived" } : {}) };
      const response = await fetchContacts(query);
      const items = (response.data || []).filter((contact) => {
        const workflow = contactWorkflowState(contact);
        const tabMatches = contactTab === "attention"
          ? workflow.key === "email" || workflow.key === "audience"
          : contactTab === "ready"
            ? workflow.key === "ready"
            : contactTab === "assigned"
              ? workflow.key === "assigned"
              : true;
        return tabMatches &&
          (!campaignId || contact.campaignIds?.some((id) => String(id) === campaignId)) &&
          (!searchTerm || [contact.name, contact.company, contact.email, contact.title].join(" ").toLowerCase().includes(searchTerm.toLowerCase()));
      });
      setContacts(items);
      setSelectedContactIds((current) => current.filter((id) => items.some((contact) => contact._id === id)));
      if (contactTab !== "archived") {
        const overview = await fetchContactOverview();
        setContactOverview(overview.data);
      }
    } catch (err) {
      setError(err.response?.data?.message || "Unable to load contacts");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadContacts();
  }, [contactTab, campaignId, searchTerm]);

  useEffect(() => {
    setCurrentPage(1);
  }, [contactTab, campaignId, searchTerm]);

  useEffect(() => {
    fetchCampaigns().then((items) => {
      setCampaigns(items);
    }).catch(() => setError("Unable to load campaigns"));
  }, []);

  useEffect(() => {
    setCampaignId(initiativeId === "all" ? "" : initiativeId);
  }, [initiativeId]);

  function openImportConfirmation(source) {
    setError("");
    setSelectedSource(source);
    setConfirmOpen(true);
  }

  async function assignSelectedContacts() {
    if (!selectedContactIds.length) return setError("Select at least one contact.");
    if (!bulkCampaignId) return setError("Choose the campaign or event first.");
    try {
      setBulkSaving(true);
      setError("");
      setBulkNotice("");
      const response = await bulkAssignContactsToCampaign(selectedContactIds, bulkCampaignId);
      setBulkNotice(`${response.data?.assigned || 0} selected contact${response.data?.assigned === 1 ? "" : "s"} qualified and assigned to ${response.data?.campaignName || "the campaign"}.${response.data?.skipped ? ` ${response.data.skipped} skipped because a verified name and email were unavailable.` : ""} No emails were sent.`);
      setSelectedContactIds([]);
      await loadContacts();
    } catch (err) {
      setError(err.response?.data?.message || "Unable to assign selected contacts");
    } finally {
      setBulkSaving(false);
    }
  }

  function closeImportConfirmation() {
    if (importing) return;
    setConfirmOpen(false);
    setSelectedSource(null);
  }

  async function confirmImport() {
    if (!selectedSource) return;

    try {
      setImporting(true);
      setError("");

      const response = await importContactsFromApollo({ campaignId, leads: selectedLeads });
      setImportSummary(response.data);

      setConfirmOpen(false);
      setSelectedSource(null);
      await loadContacts();
    } catch (err) {
      setError(err.response?.data?.message || "Unable to import contacts");
    } finally {
      setImporting(false);
    }
  }

  const selectedCopy = selectedSource ? importCopy[selectedSource] : null;

  async function searchApollo() {
    try {
      setSearching(true); setError(""); setSearchMessage(""); setImportSummary(null);
      const response = await searchApolloLeads({
        titles: filters.title ? [filters.title] : [],
        locations: filters.location ? [filters.location] : [],
        keywords: [filters.industry, filters.employeeSize].filter(Boolean),
      });
      setApolloResults(response.data?.results || []);
      setSelectedLeads([]);
      setSearchMessage(response.message || "No Apollo leads matched these filters.");
    } catch (err) {
      setApolloResults([]);
      setSelectedLeads([]);
      setError(err.response?.data?.message || "Apollo search failed. Please try again.");
    }
    finally { setSearching(false); }
  }

  function toggleLead(lead) {
    const id = lead.apolloPersonId || lead.email || lead.linkedinUrl;
    setSelectedLeads((current) => current.some((item) => (item.apolloPersonId || item.email || item.linkedinUrl) === id)
      ? current.filter((item) => (item.apolloPersonId || item.email || item.linkedinUrl) !== id)
      : [...current, lead]);
  }

  function prepareImport(text) {
    Papa.parse(String(text || ""), { header: true, skipEmptyLines: "greedy", delimiter: String(text || "").includes("\t") ? "\t" : "", transformHeader: (header) => header.replace(/^\uFEFF/, "").trim(), complete: ({ data, meta, errors }) => {
      const rows = data.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => {
        const cleaned = String(value ?? "").trim();
        if (key === "Title" && /^[+()\d\s.-]{7,}$/.test(cleaned) && cleaned.replace(/\D/g, "").length >= 7) return [key, ""];
        if (cleaned.toLowerCase() !== "stage = needs research") return [key, cleaned];
        if (key === "Stage") return [key, "Needs Research"];
        if (key === "Qualify Contact") return [key, "no"];
        if (key === "Tags") return [key, "needs-research"];
        return [key, ""];
      })));
      const valid = rows.filter((row) => row.Name || row["First Name"] || row["Last Name"]).length;
      const emails = rows.filter((row) => !row.Email).length;
      setImportHeaders(meta.fields || []); setImportRows(rows); setVerificationResults({}); setVerificationProgress(null); setPreviewStats({ parsed: rows.length, valid, missingName: rows.length - valid, missingEmail: emails, malformed: errors.length }); setImportError(errors.length ? "Some rows have malformed column counts." : ""); setError(""); setUploadOpen(true);
    }, error: () => setImportError("Unable to parse contact file.") });
  }

  async function saveIngestion(contactsToSave, source, selectedCampaignId) {
    try {
      setSavingContact(true); setError("");
      const response = await ingestContacts({ contacts: contactsToSave, source, campaignId: selectedCampaignId || null });
      setImportSummary(response.data); await loadContacts(); return true;
    } catch (err) { setError(err.response?.data?.message || "Unable to save contacts"); return false; }
    finally { setSavingContact(false); }
  }

  async function saveManualContact() {
    const name = fullContactName(manualContact);
    if (!name) { setError("Enter a first or last name to save this contact."); return; }
    const saved = await saveIngestion([{
      ...manualContact,
      name,
      city: manualContact.location,
      tags: manualContact.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
      audienceProfiles: manualContact.audienceProfiles.split(",").map((profile) => profile.trim()).filter(Boolean),
    }], "manual", importCampaignId);
    if (saved) { setContactFormOpen(false); setManualContact({ firstName: "", lastName: "", email: "", phone: "", company: "", title: "", notes: "", linkedin: "", location: "", tags: "", audienceProfiles: "", confirmEmailManually: false }); }
  }

  async function saveUploadedContacts() {
    const pending = importRows.some((row) => row.Email && !verificationResults[row.Email.toLowerCase()]);
    if (pending) { setError("Verify the email addresses before importing."); return; }
    const sanitizedRows = importRows.map((row) => {
      const email = String(row.Email || "").trim();
      if (!email) return row;
      const result = verificationResults[email.toLowerCase()];
      if (result?.state === "deliverable") {
        return { ...row, Email: email, "Email Status": "verified" };
      }
      const tags = [...new Set(
        [String(row.Tags || "").split(","), ["needs-email-verification"]]
          .flat()
          .map((tag) => tag.trim())
          .filter(Boolean),
      )].join(",");
      return { ...row, Email: "", "Email Status": result?.state || "unverified", Tags: tags };
    });
    const saved = await saveIngestion(sanitizedRows, "csv", null);
    if (saved) { setUploadOpen(false); setImportRows([]); setImportHeaders([]); setVerificationResults({}); setVerificationProgress(null); }
  }

  async function saveUploadedContactsWithoutEmails() {
    const contactsWithoutEmails = importRows.map((row) => {
      const tags = [...new Set(
        [String(row.Tags || "").split(","), ["needs-email-verification"]]
          .flat()
          .map((tag) => tag.trim())
          .filter(Boolean),
      )].join(",");

      return {
        ...row,
        Email: "",
        "Email Status": "unverified",
        Tags: tags,
      };
    });

    const saved = await saveIngestion(contactsWithoutEmails, "csv", null);
    if (saved) {
      setUploadOpen(false);
      setImportRows([]);
      setImportHeaders([]);
      setVerificationResults({});
      setVerificationProgress(null);
    }
  }

  const emailsToVerify = [...new Set(importRows.map((row) => String(row.Email || "").trim().toLowerCase()).filter(Boolean))];
  const pendingEmailCount = emailsToVerify.filter((email) => !verificationResults[email]).length;
  const verificationCounts = Object.values(verificationResults).reduce((counts, result) => {
    const state = result.state || "unknown";
    counts[state] = (counts[state] || 0) + 1;
    return counts;
  }, {});

  function getLocalInvalidResults() {
    return Object.fromEntries(
      emailsToVerify
        .filter((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        .map((email) => [email, { email, state: "undeliverable", reason: "invalid_format" }]),
    );
  }

  async function pollEmailVerificationBatch(batchId, invalidResults) {
    for (let attempt = 0; attempt < 90; attempt += 1) {
      if (attempt) await new Promise((resolve) => setTimeout(resolve, 2000));
      const response = await fetchEmailVerificationBatch(batchId);
      const batch = response.data || {};
      setVerificationProgress({ processed: (batch.processed || 0) + Object.keys(invalidResults).length, total: emailsToVerify.length });
      const returnedResults = Array.isArray(batch.results)
        ? Object.fromEntries(batch.results.map((result) => [result.email, result]))
        : {};
      if (Array.isArray(batch.results) && batch.results.length) {
        setVerificationResults({ ...invalidResults, ...returnedResults });
      }
      if (batch.complete) {
        const completedResults = { ...invalidResults, ...returnedResults };
        emailsToVerify.forEach((email) => {
          if (!completedResults[email]) {
            completedResults[email] = {
              email,
              state: "unknown",
              reason: "provider_result_missing",
            };
          }
        });
        setVerificationResults(completedResults);
        setVerificationProgress({ processed: emailsToVerify.length, total: emailsToVerify.length });
        return;
      }
    }
    throw new Error("Email verification is taking longer than expected. Resume this batch again shortly.");
  }

  async function verifyImportedEmails() {
    if (!emailsToVerify.length) return;
    try {
      setVerifyingEmails(true);
      setImportError("");
      const plausibleEmails = emailsToVerify.filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
      const invalidResults = getLocalInvalidResults();
      setVerificationResults(invalidResults);
      setVerificationProgress({ processed: 0, total: emailsToVerify.length });
      if (!plausibleEmails.length) {
        setVerificationProgress({ processed: emailsToVerify.length, total: emailsToVerify.length });
        return;
      }
      const created = await createEmailVerificationBatch(plausibleEmails);
      const batchId = created.data?.id;
      if (!batchId) throw new Error("Emailable did not return a batch ID");
      setExistingBatchId(batchId);
      localStorage.setItem("ellie-email-verification-batch", batchId);
      await pollEmailVerificationBatch(batchId, invalidResults);
    } catch (err) {
      setVerificationProgress(null);
      setImportError(err.response?.data?.message || err.message || "Unable to verify emails");
    } finally {
      setVerifyingEmails(false);
    }
  }

  async function resumeImportedEmailVerification() {
    const batchId = existingBatchId.trim();
    if (!batchId) {
      setImportError("Paste the batch ID from the original verification request.");
      return;
    }
    try {
      setVerifyingEmails(true);
      setImportError("");
      localStorage.setItem("ellie-email-verification-batch", batchId);
      const invalidResults = getLocalInvalidResults();
      setVerificationResults(invalidResults);
      setVerificationProgress({ processed: 0, total: emailsToVerify.length });
      await pollEmailVerificationBatch(batchId, invalidResults);
    } catch (err) {
      setVerificationProgress(null);
      setImportError(err.response?.data?.message || err.message || "Unable to resume this verification batch.");
    } finally {
      setVerifyingEmails(false);
    }
  }

  return (
    <div className="page-dashboard contacts-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">CRM</h1>
          <p className="page-subtitle">Keep every relationship organized, understand the next action, and move the right people into campaigns.</p>
        </div>
        <div className="crm-header-actions">
          <Button onClick={() => { setError(""); setContactFormOpen(true); }}>+ New Contact</Button>
          <Button variant="outline" onClick={() => navigate("/contacts/fields")}>Customize fields</Button>
          <div className="crm-menu-wrap">
            <Button variant="outline" onClick={() => setImportMenuOpen((open) => !open)}>Import ▾</Button>
            {importMenuOpen ? <div className="crm-menu crm-import-menu"><button onClick={() => { setUploadOpen(true); setImportMenuOpen(false); }}>Apollo CSV</button><button onClick={() => { setUploadOpen(true); setImportMenuOpen(false); }}>Standard CSV</button><button onClick={() => { navigate("/discovery"); setImportMenuOpen(false); }}>Organization Discovery</button></div> : null}
          </div>
          <Button variant="outline" onClick={() => navigate("/discovery")}>Discover New Prospects</Button>
        </div>
      </div>

      <section className="crm-mode-banner" aria-label="CRM connection options">
        <div>
          <span className="crm-mode-banner__eyebrow">Your contact system</span>
          <strong>Ellie CRM is active.</strong>
          <p>
            Use this CRM on its own, or connect another CRM and keep the same
            review, audience, and campaign workflow.
          </p>
        </div>
        <Button variant="secondary" onClick={() => navigate("/integrations")}>
          Manage CRM options
        </Button>
      </section>

      <DashboardCard title="Contacts">
        {error ? <p className="form-error">{error}</p> : null}
        {importSummary ? <div className={importSummary.failed ? "form-error" : "contact-modal-intro"}>
          <p>MongoDB: {importSummary.mongoCreated} created, {importSummary.mongoUpdated} updated, {importSummary.failed || 0} failed.</p>
          {importSummary.failed && importSummary.errors?.[0]?.message ? <p>First failure: {importSummary.errors[0].message}</p> : null}
        </div> : null}
        {contactOverview ? <section className="contact-overview contact-overview--workflow" aria-label="CRM workflow overview">
          <button onClick={() => setContactTab("all")}><span>All relationships</span><strong>{contactOverview.total}</strong><small>Everyone stored in your CRM</small></button>
          <button className="is-warning" onClick={() => setContactTab("attention")}><span>Needs attention</span><strong>{contactOverview.needsAttention || 0}</strong><small>Email or audience information needs a decision</small></button>
          <button className="is-safe" onClick={() => setContactTab("ready")}><span>Ready to assign</span><strong>{contactOverview.readyToAssign || 0}</strong><small>Verified contacts not yet assigned</small></button>
          <button className="is-safe" onClick={() => setContactTab("assigned")}><span>Campaign assigned</span><strong>{contactOverview.campaignAssigned || 0}</strong><small>Contacts already connected to an offer or event</small></button>
        </section> : null}
        {contactOverview ? <p className="contact-guidance">
          <strong>How this CRM works:</strong> Imported contacts appear here immediately. Open <strong>Needs attention</strong> to correct an email or add an audience profile. When a verified contact is a fit, assign them to a campaign here. Discovery is only for finding new prospects you do not already have.
        </p> : null}
        <div className="crm-toolbar"><label>Campaign <select value={campaignId} onChange={(event) => setCampaignId(event.target.value)}><option value="">All Contacts</option>{campaigns.map((campaign) => <option key={campaign._id} value={campaign._id}>{campaign.name}</option>)}</select></label><input className="select-input" placeholder="Search contacts" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} /></div>
        <div className="crm-tabs crm-tabs--simple">{[["all", "All contacts"], ["attention", "Needs attention"], ["ready", "Ready to assign"], ["assigned", "Campaign assigned"], ["archived", "Archived"]].map(([value, label]) => <button key={value} className={contactTab === value ? "active" : ""} onClick={() => setContactTab(value)}>{label}</button>)}</div>
        {contacts.length && contactTab !== "archived" ? <section className="contact-bulk-actions" aria-label="Bulk contact actions">
          <label className="contact-select-all">
            <input type="checkbox" checked={contacts.some((contact) => contact.emailStatus === "verified") && contacts.filter((contact) => contact.emailStatus === "verified").every((contact) => selectedContactIds.includes(contact._id))} onChange={(event) => setSelectedContactIds(event.target.checked ? contacts.filter((contact) => contact.emailStatus === "verified").map((contact) => contact._id) : [])} />
            <span>Select all verified contacts in this view</span>
          </label>
          <strong>{selectedContactIds.length} selected</strong>
          <select className="select-input" value={bulkCampaignId} onChange={(event) => setBulkCampaignId(event.target.value)}>
            <option value="">Choose campaign or event</option>
            {campaigns.map((campaign) => <option key={campaign._id} value={campaign._id}>{campaign.name}</option>)}
          </select>
          <Button loading={bulkSaving} disabled={!selectedContactIds.length || !bulkCampaignId} onClick={assignSelectedContacts}>Qualify & assign selected</Button>
          <small>This assigns the audience only. It does not generate or send emails.</small>
        </section> : null}
        {bulkNotice ? <p className="contact-bulk-notice">{bulkNotice}</p> : null}
        {!loading && contacts.length ? <div className="crm-results-summary">
          <span>Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, contacts.length)} of {contacts.length} contacts</span>
          <span>Page {currentPage} of {Math.max(1, Math.ceil(contacts.length / pageSize))}</span>
        </div> : null}
        {!loading && contacts.length > pageSize ? <nav className="crm-pagination crm-pagination--top" aria-label="Contact pages above results">
          <Button variant="outline" disabled={currentPage === 1} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}>Previous</Button>
          <span>Page {currentPage} of {Math.ceil(contacts.length / pageSize)}</span>
          <Button variant="outline" disabled={currentPage >= Math.ceil(contacts.length / pageSize)} onClick={() => setCurrentPage((page) => page + 1)}>Next</Button>
        </nav> : null}
        {loading ? <div className="table-state">Loading contacts…</div> : contacts.length ? <div className="contact-record-list contact-record-list--compact">
          {contacts.slice((currentPage - 1) * pageSize, currentPage * pageSize).map((contact) => {
            const workflow = contactWorkflowState(contact);
            return <article className="contact-record" key={contact._id} onClick={() => setDetailContact(contact)}>
            <header>
              <div className="contact-record__identity">
                <input type="checkbox" aria-label={`Select ${contact.name}`} disabled={contact.emailStatus !== "verified"} checked={selectedContactIds.includes(contact._id)} onClick={(event) => event.stopPropagation()} onChange={(event) => setSelectedContactIds((current) => event.target.checked ? [...new Set([...current, contact._id])] : current.filter((id) => id !== contact._id))} />
                <div>
                <h3>{contact.name}</h3>
                <p>{contact.title || "Title missing"}{contact.company ? ` · ${contact.company}` : " · Company missing"}</p>
                </div>
              </div>
              <div className="contact-record__top-actions">
                <span className={`contact-status-badge contact-status-badge--${contact.emailStatus || "missing"}`}>{contact.emailStatus === "verified" ? "Verified email" : contact.emailStatus === "risky" ? "Risky — withheld" : contact.emailStatus === "undeliverable" ? "Undeliverable — withheld" : "No verified email"}</span>
                {!hasAudienceSignals(contact) ? (
                  <span
                    className="contact-status-badge contact-status-badge--unknown"
                    title="Ellie has only identity information and will not guess this person’s interests."
                  >
                    Audience unknown
                  </span>
                ) : null}
                <button className={`contact-next-action contact-next-action--${workflow.key}`} onClick={(event) => {
                  event.stopPropagation();
                  setContactEditMode(workflow.key === "audience" ? "audience" : "full");
                  setEditingContact({ ...contact, ...contactNameParts(contact) });
                }}>{workflow.label}</button>
                <div className="crm-menu-wrap" onClick={(event) => event.stopPropagation()}>
                  <button className="crm-overflow" aria-label={`Actions for ${contact.name}`} onClick={() => setActionMenu(actionMenu === contact._id ? null : contact._id)}>
                    <FiMoreHorizontal aria-hidden="true" />
                  </button>
                  {actionMenu === contact._id ? <div className="crm-menu"><button onClick={() => setDetailContact(contact)}>View details</button><button onClick={() => { setContactEditMode("full"); setEditingContact({ ...contact, ...contactNameParts(contact) }); }}>Edit contact & campaign</button><button onClick={() => archiveContact(contact._id).then(loadContacts)}>Archive</button><button className="danger" onClick={() => setDeleteTarget(contact)}>Delete permanently</button></div> : null}
                </div>
              </div>
            </header>
            <div className="contact-record__details">
              <div><span>Email</span><strong>{contact.email || "Withheld or unavailable"}</strong></div>
              <div><span>Audience</span><strong>{contact.audienceProfiles?.join(", ") || contact.industry || contact.title || "Unknown"}</strong></div>
              <div><span>Campaign</span><strong>{contact.campaignIds?.length ? "Assigned" : "Not assigned"}</strong></div>
              <div><span>Next action</span><strong>{workflow.detail}</strong></div>
            </div>
          </article>;
          })}
          <nav className="crm-pagination" aria-label="Contact pages">
            <Button variant="outline" disabled={currentPage === 1} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}>Previous</Button>
            <span>Page {currentPage} of {Math.ceil(contacts.length / pageSize)}</span>
            <Button variant="outline" disabled={currentPage >= Math.ceil(contacts.length / pageSize)} onClick={() => setCurrentPage((page) => page + 1)}>Next</Button>
          </nav>
        </div> : <div className="table-state table-state--empty">
          {contactTab === "ready"
            ? "No verified contacts are waiting for a campaign assignment."
            : contactTab === "attention"
              ? "Nothing needs attention right now."
              : "No contacts match this view."}
        </div>}
      </DashboardCard>

      {false ? <DashboardCard title="Find Leads">
        <div className="apollo-locked"><p>🔒 Apollo prospect search requires a paid Apollo plan. Export your contacts from Apollo and import the CSV here.</p><p><small>Apollo connection: configured · Plan: Free · People search: unavailable · Credits: no people-search API access.</small></p><Button onClick={() => setUploadOpen(true)}>Import Apollo CSV</Button><Button variant="outline" onClick={() => navigate("/marketing")}>Open Organization Discovery</Button><small>Direct Apollo people search can be enabled later when the account has API access.</small></div>
        <div style={{ display: "none" }}>
          <select value={campaignId} onChange={(event) => setCampaignId(event.target.value)} className="select-input">
            <option value="">Select campaign</option>
            {campaigns.map((campaign) => <option key={campaign._id} value={campaign._id}>{campaign.name}</option>)}
          </select>
          {[["title", "Job title"], ["location", "Location"], ["industry", "Industry"], ["employeeSize", "Company employee size"]].map(([key, label]) => (
            <input key={key} className="select-input" placeholder={label} value={filters[key]} onChange={(event) => setFilters({ ...filters, [key]: event.target.value })} />
          ))}
          <Button loading={searching} onClick={searchApollo}>Search Leads</Button>
        </div>
        {searchMessage ? <p>{searchMessage}</p> : null}
        {apolloResults.length ? <>
          <p>{selectedLeads.length} selected</p>
          <Button variant="outline" onClick={() => setSelectedLeads(selectedLeads.length === apolloResults.length ? [] : apolloResults)}>Select all / Clear all</Button>
          <div style={{ overflowX: "auto", marginTop: "1rem" }}><table><thead><tr><th>Select</th><th>Name</th><th>Role</th><th>Company</th><th>Email</th><th>Location</th><th>LinkedIn</th></tr></thead><tbody>{apolloResults.map((lead) => { const id = lead.apolloPersonId || lead.email || lead.linkedinUrl; const selected = selectedLeads.some((item) => (item.apolloPersonId || item.email || item.linkedinUrl) === id); return <tr key={id}><td><input type="checkbox" checked={selected} onChange={() => toggleLead(lead)} /></td><td>{lead.name}</td><td>{lead.title}</td><td>{lead.company}</td><td>{lead.email || "Unavailable"}</td><td>{lead.location}</td><td>{lead.linkedinUrl ? <a href={lead.linkedinUrl} target="_blank" rel="noreferrer">Open</a> : "—"}</td></tr>; })}</tbody></table></div>
          <Button variant="primary" disabled={!selectedLeads.length} onClick={() => {
            if (!campaignId) return setError("Select a campaign before importing selected leads.");
            openImportConfirmation("apollo");
          }}>Import to Ellie AI{campaignId ? " and Add to Selected Campaign" : ""}</Button>
        </> : <p>Search Apollo to review leads before importing.</p>}
        {importSummary ? <p>MongoDB: {importSummary.mongoCreated} created, {importSummary.mongoUpdated} updated, {importSummary.failed || 0} failed.</p> : null}
      </DashboardCard> : null}

      <Modal
        isOpen={isConfirmOpen}
        onClose={closeImportConfirmation}
        title={selectedCopy?.title || "Import Contacts"}
        footer={(
          <>
            <Button
              variant="outline"
              onClick={closeImportConfirmation}
              disabled={importing}
            >
              Cancel
            </Button>
            <Button loading={importing} onClick={confirmImport}>
              Confirm Import
            </Button>
          </>
        )}
      >
        <p>{selectedCopy?.body}</p>
      </Modal>

      <Modal
        isOpen={isContactFormOpen}
        onClose={() => !savingContact && setContactFormOpen(false)}
        title="New Contact"
        footer={<><Button variant="outline" disabled={savingContact} onClick={() => setContactFormOpen(false)}>Cancel</Button><Button loading={savingContact} onClick={saveManualContact}>Save Contact</Button></>}
      >
        <p className="contact-modal-intro">Only a usable name is required. Ellie AI saves this contact directly to MongoDB.</p>
        <div className="contact-form-grid">
          {[["firstName", "First Name *"], ["lastName", "Last Name"], ["email", "Email"], ["phone", "Phone"], ["company", "Company"], ["title", "Title"], ["linkedin", "LinkedIn"], ["location", "Location"], ["tags", "Tags (comma-separated)"], ["audienceProfiles", "Audience & interests (comma-separated)"]].map(([key, label]) => <label className="form-field" key={key}><span>{label}</span><input className="select-input" value={manualContact[key]} onChange={(event) => setManualContact({ ...manualContact, [key]: event.target.value })} /></label>)}
          <label className="form-field"><span>Campaign</span><select className="select-input" value={importCampaignId} onChange={(event) => setImportCampaignId(event.target.value)}><option value="">No campaign</option>{campaigns.map((campaign) => <option key={campaign._id} value={campaign._id}>{campaign.name}</option>)}</select></label>
          {manualContact.email ? <label className="contact-qualify-choice span-2">
            <input type="checkbox" checked={manualContact.confirmEmailManually} onChange={(event) => setManualContact({ ...manualContact, confirmEmailManually: event.target.checked })} />
            <span><strong>I personally confirmed this email address</strong><small>Use this only when the person gave you the address directly or you already confirmed it. Ellie records this as owner-confirmed, not Emailable-verified.</small></span>
          </label> : null}
        </div>
        <label className="form-field contact-notes"><span>Notes</span><textarea className="select-input" value={manualContact.notes} onChange={(event) => setManualContact({ ...manualContact, notes: event.target.value })} /></label>
      </Modal>

      <Modal
        isOpen={isUploadOpen}
        onClose={() => !savingContact && !verifyingEmails && setUploadOpen(false)}
        title="Import Contacts"
        footer={<><Button variant="outline" disabled={savingContact || verifyingEmails} onClick={() => setUploadOpen(false)}>Cancel</Button>{importRows.length && pendingEmailCount > 0 ? <Button variant="outline" loading={savingContact} disabled={verifyingEmails} onClick={saveUploadedContactsWithoutEmails}>Save people without emails</Button> : null}<Button loading={savingContact} disabled={!importRows.length || verifyingEmails || pendingEmailCount > 0} onClick={saveUploadedContacts}>Import verified contacts</Button></>}
      >
        {importError ? <p className="form-error" role="alert">{importError}</p> : null}
        {!importRows.length ? <div className="crm-import-start">
          <div className="crm-import-steps">
            <div className="active"><span>1</span><strong>Choose CSV</strong><small>Upload your contact file</small></div>
            <div><span>2</span><strong>Verify emails</strong><small>Review deliverability before saving</small></div>
            <div><span>3</span><strong>Save to CRM</strong><small>Contacts appear here immediately</small></div>
          </div>
          <p>Select a CSV exported from a spreadsheet, Apollo, or another CRM. Ellie recognizes common contact columns automatically.</p>
          <label className="crm-file-drop">
            <input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={(event) => { const file = event.target.files?.[0]; if (file) { const reader = new FileReader(); reader.onload = () => prepareImport(reader.result); reader.readAsText(file); } }} />
            <strong>Choose a CSV file</strong>
            <span>or drag a file here</span>
          </label>
          <details className="crm-paste-option"><summary>Paste rows instead</summary><textarea className="select-input" placeholder="Paste the header row and contacts here" onChange={(event) => { if (event.target.value.includes("\n")) prepareImport(event.target.value); }} /></details>
        </div> : <>
          <div className="crm-import-steps">
            <div><span>✓</span><strong>CSV loaded</strong><small>{importRows.length} contacts found</small></div>
            <div className="active"><span>2</span><strong>Verify emails</strong><small>Use Emailable only when needed</small></div>
            <div><span>3</span><strong>Save to CRM</strong><small>No Discovery approval required</small></div>
          </div>
          <p>Rows parsed: {previewStats?.parsed || 0}; valid: {previewStats?.valid || 0}; missing usable name: {previewStats?.missingName || 0}; missing email: {previewStats?.missingEmail || 0}; malformed: {previewStats?.malformed || 0}.</p><p>Duplicate candidates are checked by the shared ingestion service during import.</p>
          <p>Detected headers: {importHeaders.join(", ")}</p>
          <p>Recognized: {importHeaders.filter((header) => recognizedImportHeaders.includes(header)).join(", ") || "none"}</p>
          <p>Unrecognized columns: {importHeaders.filter((header) => !recognizedImportHeaders.includes(header)).join(", ") || "none"}</p>
          <p className="contact-modal-intro"><strong>What happens next:</strong> These contacts will be saved directly to your CRM. Nothing is emailed and no campaign is assigned during import. Each contact will show its next recommended action afterward.</p>
          {pendingEmailCount > 0 ? <p className="contact-modal-intro"><strong>No-credit option:</strong> Save people without emails keeps every contact and removes every email address from the MongoDB import. Each record is tagged needs-email-verification.</p> : null}
          {emailsToVerify.length ? <div className="email-verification-panel">
            <div>
              <strong>Email safety check</strong>
              <p>Verify {emailsToVerify.length} unique email{emailsToVerify.length === 1 ? "" : "s"} with Emailable before import. This uses live credits only when you click the button.</p>
            </div>
            <Button variant="outline" loading={verifyingEmails} disabled={verifyingEmails} onClick={verifyImportedEmails}>
              {pendingEmailCount ? `Verify ${emailsToVerify.length} emails` : "Verify again"}
            </Button>
            <div className="verification-resume">
              <input className="select-input" value={existingBatchId} onChange={(event) => setExistingBatchId(event.target.value)} placeholder="Existing Emailable batch ID" />
              <Button variant="outline" disabled={verifyingEmails || !existingBatchId.trim()} onClick={resumeImportedEmailVerification}>Resume paid batch</Button>
              <small>This retrieves existing results and does not start a new paid verification.</small>
            </div>
            {verificationProgress ? <div className="verification-progress">
              <span style={{ width: `${Math.min(100, Math.round((verificationProgress.processed / Math.max(1, verificationProgress.total)) * 100))}%` }} />
            </div> : null}
            {Object.keys(verificationResults).length ? <p className="verification-summary">
              Deliverable: {verificationCounts.deliverable || 0} · Risky: {verificationCounts.risky || 0} · Undeliverable: {verificationCounts.undeliverable || 0} · Unknown: {verificationCounts.unknown || 0} · Pending: {pendingEmailCount}
            </p> : null}
          </div> : null}
          <p className="contact-modal-intro">Showing the first {Math.min(5, importRows.length)} rows as a preview. Verification applies to all {importRows.length} rows.</p>
          <div style={{ overflowX: "auto", marginTop: "0.75rem" }}><table><thead><tr>{["Name", "Email", "Phone", "Company", "Title", "City/State", "Source"].map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{importRows.slice(0, 5).map((row, index) => { const result = verificationResults[String(row.Email || "").toLowerCase()]; return <tr key={index}><td>{row.Name || `${row["First Name"] || ""} ${row["Last Name"] || ""}`.trim()}</td><td>{row.Email || "—"}{row.Email ? <><span className={`verification-badge ${result?.state || "pending"}`}>{result?.state || "not verified"}</span>{result?.didYouMean ? <small className="email-suggestion">Did you mean {result.didYouMean}?</small> : null}</> : null}</td><td>{row["Work Direct Phone"] || row.Phone}</td><td>{row["Company Name"] || row.Company}</td><td>{row.Title}</td><td>{[row.City, row.State].filter(Boolean).join(", ")}</td><td>CSV import</td></tr>; })}</tbody></table></div>
          <p>{importRows.length} rows ready. Deliverable emails are saved. Risky, unknown, and undeliverable addresses are removed while the contact is retained and tagged for review.</p>
        </>}
      </Modal>
      <Modal isOpen={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} title="Delete Contact Permanently" footer={<><Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button><Button onClick={async () => { try { await deleteContact(deleteTarget._id); setDeleteTarget(null); await loadContacts(); } catch (err) { setError(err.response?.data?.message || "Unable to delete contact"); } }}>Delete permanently</Button></>}><p>Related outreach is protected. If outreach exists, deletion is blocked and its count is shown.</p>{deleteTarget ? <p>Source: {deleteTarget.sourceProvider || deleteTarget.sources?.join(", ") || "manual"}; created: {deleteTarget.createdAt ? new Date(deleteTarget.createdAt).toLocaleDateString() : "unknown"}; campaign: {deleteTarget.campaignIds?.length ? "associated" : "none"}.</p> : null}</Modal>
      <Modal isOpen={Boolean(detailContact)} onClose={() => setDetailContact(null)} title={detailContact?.name || "Contact"}>
        {detailContact ? <div className="contact-detail">
          <div className="contact-detail__summary">
            <div><span>{(detailContact.name || "?").slice(0, 1).toUpperCase()}</span><p><strong>{detailContact.name}</strong><small>{detailContact.title || "Contact"}{detailContact.company ? ` at ${detailContact.company}` : ""}</small></p></div>
            <Button size="sm" onClick={() => { setContactEditMode("full"); setEditingContact({ ...detailContact, ...contactNameParts(detailContact) }); setDetailContact(null); }}>Edit contact</Button>
          </div>
          {contactDetailGroups.map(([group, fields]) => {
            const visible = fields.map(([field, label]) => [field, label, detailValue(detailContact[field])]).filter(([, , value]) => value);
            if (!visible.length) return null;
            return <section className="contact-detail__group" key={group}><h3>{group}</h3><dl>{visible.map(([field, label, value]) => <div key={field}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section>;
          })}
          <section className="contact-detail__group"><h3>Campaigns</h3><p>{detailContact.campaignIds?.length ? `${detailContact.campaignIds.length} campaign assignment${detailContact.campaignIds.length === 1 ? "" : "s"}` : "Not assigned to a campaign yet."}</p></section>
        </div> : null}
      </Modal>
      <Modal isOpen={Boolean(editingContact)} onClose={() => setEditingContact(null)} title={contactEditMode === "audience" ? "Tell Ellie who this contact is" : "Edit contact & campaign"} footer={<><Button variant="outline" onClick={() => setEditingContact(null)}>Cancel</Button><Button onClick={async () => { const payload = { ...editingContact, name: fullContactName(editingContact), tags: Array.isArray(editingContact.tags) ? editingContact.tags : String(editingContact.tags || "").split(",").map((tag) => tag.trim()).filter(Boolean), audienceProfiles: Array.isArray(editingContact.audienceProfiles) ? editingContact.audienceProfiles : String(editingContact.audienceProfiles || "").split(",").map((profile) => profile.trim()).filter(Boolean), lastResearchedAt: new Date().toISOString() }; await updateContact(editingContact._id, payload); setEditingContact(null); await loadContacts(); }}>{contactEditMode === "audience" ? "Save audience information" : editingContact?.qualifyContact && editingContact?.campaignIds?.length && (editingContact?.emailStatus === "verified" || editingContact?.confirmEmailManually) ? "Save & Add to Campaign" : "Save Changes"}</Button></>}>{editingContact ? contactEditMode === "audience" ? <>
        <div className="audience-editor-intro">
          <span>Audience unknown</span>
          <h3>What would make {editingContact.firstName || editingContact.name} relevant to a future campaign?</h3>
          <p>Add only information you know. Ellie uses these categories to suggest the right campaigns—it will never guess from a name or email.</p>
        </div>
        <div className="audience-editor">
          <label className="form-field span-2">
            <span>Audience groups or interests</span>
            <input autoFocus className="select-input" placeholder="Example: Multifamily investor, entrepreneur, event host" value={Array.isArray(editingContact.audienceProfiles) ? editingContact.audienceProfiles.join(", ") : editingContact.audienceProfiles || ""} onChange={(event) => setEditingContact({ ...editingContact, audienceProfiles: event.target.value })} />
            <small>Separate multiple groups with commas.</small>
          </label>
          {(workspaceSettings.customContactFields || []).map((label) => {
            const key = label.toLowerCase().replace(/[^a-z0-9]+(.)/g, (_, character) => character.toUpperCase());
            return <label className="form-field" key={key}><span>{label}</span><input className="select-input" value={editingContact.additionalFields?.[key] || ""} onChange={(event) => setEditingContact({ ...editingContact, additionalFields: { ...(editingContact.additionalFields || {}), [key]: event.target.value } })} /></label>;
          })}
          <label className="form-field"><span>Industry (optional)</span><input className="select-input" placeholder="Example: Real estate" value={editingContact.industry || ""} onChange={(event) => setEditingContact({ ...editingContact, industry: event.target.value })} /></label>
          <label className="form-field"><span>Role or title (optional)</span><input className="select-input" placeholder="Example: Investor" value={editingContact.title || ""} onChange={(event) => setEditingContact({ ...editingContact, title: event.target.value })} /></label>
          <label className="form-field span-2"><span>Company (optional)</span><input className="select-input" value={editingContact.company || ""} onChange={(event) => setEditingContact({ ...editingContact, company: event.target.value })} /></label>
        </div>
      </> : <>
        <p className="contact-modal-intro"><strong>A name and a confirmed email are enough to add someone to a campaign.</strong> Company, title, and industry are optional and can be completed later.</p>
        <div className="contact-form-grid">
          {["firstName", "lastName", "email", "phone", "company", "title", "industry", "city", "state", "stage", "tags", "notes"].map((field) => <label className={field === "notes" ? "form-field span-2" : "form-field"} key={field}><span>{field.replace(/([A-Z])/g, " $1")}</span><input className="select-input" value={Array.isArray(editingContact[field]) ? editingContact[field].join(", ") : editingContact[field] || ""} onChange={(event) => setEditingContact({ ...editingContact, [field]: event.target.value })} /></label>)}
          <label className="form-field span-2">
            <span>Audience &amp; interests</span>
            <input className="select-input"
              placeholder="Example: Multifamily investors, networking event hosts"
              value={Array.isArray(editingContact.audienceProfiles) ? editingContact.audienceProfiles.join(", ") : editingContact.audienceProfiles || ""}
              onChange={(event) => setEditingContact({ ...editingContact, audienceProfiles: event.target.value })} />
            <small>Add only categories you know or the contact has confirmed. These are used for automatic campaign matching.</small>
          </label>
          <fieldset className="contact-decision-panel span-2">
            <legend>Three steps to add this contact</legend>
            <div className="contact-decision-step">
              <span className="contact-decision-step__number">1</span>
              {editingContact.emailStatus === "verified"
                ? <div><strong>Email confirmed</strong><small>This address is ready for outreach.</small></div>
                : editingContact.email
                  ? <label className="contact-qualify-choice">
                    <input type="checkbox" checked={Boolean(editingContact.confirmEmailManually)} onChange={(event) => setEditingContact({ ...editingContact, confirmEmailManually: event.target.checked })} />
                    <span><strong>I know this email address is correct</strong><small>Use this when the person gave you the address or you already confirmed it yourself. No verification credit will be used.</small></span>
                  </label>
                  : <div><strong>Add an email address</strong><small>An email is required before this contact can receive a campaign.</small></div>}
            </div>
            <div className="contact-decision-step">
              <span className="contact-decision-step__number">2</span>
              <label className="contact-qualify-choice">
                <input type="checkbox" checked={Boolean(editingContact.qualifyContact)} onChange={(event) => setEditingContact({ ...editingContact, qualifyContact: event.target.checked })} />
                <span><strong>This person is a good fit</strong><small>Include this contact in the audience for the selected campaign.</small></span>
              </label>
            </div>
            <div className="contact-decision-step">
              <span className="contact-decision-step__number">3</span>
              <label className="form-field">
                <span>Choose the campaign</span>
                <select className="select-input" value={String(editingContact.campaignIds?.[0] || "")} onChange={(event) => setEditingContact({ ...editingContact, campaignIds: event.target.value ? [event.target.value] : [] })}>
                  <option value="">Select a campaign</option>
                  {campaigns.map((campaign) => <option key={campaign._id} value={campaign._id}>{campaign.name}</option>)}
                </select>
              </label>
            </div>
            {!editingContact.email
              ? <p className="contact-decision-warning">Add an email address to continue.</p>
              : editingContact.emailStatus !== "verified" && !editingContact.confirmEmailManually
                ? <p className="contact-decision-warning">Check “I know this email address is correct” to continue without using a verification credit.</p>
                : !editingContact.qualifyContact
                  ? <p className="contact-decision-guidance">Check “This person is a good fit” if you want to include them.</p>
                  : !editingContact.campaignIds?.length
                    ? <p className="contact-decision-guidance">Choose which campaign should receive this contact.</p>
                    : <p className="contact-decision-success">Ready to save. This contact will be added to the selected campaign. No email will be sent yet.</p>}
          </fieldset>
        </div>
      </> : null}</Modal>
    </div>
  );
}
