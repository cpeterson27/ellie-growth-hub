import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
  CONTACT_TEMPLATE_HEADERS,
  downloadContactTemplate,
  normalizeContactRows,
} from "../utils/contactImport.js";
import {
  fetchContacts,
  fetchContactOverview,
  fetchCampaigns,
  ingestContacts,
  previewContactIngestion,
  fetchLatestContactImport,
  archiveContact,
  deleteContact,
  updateContact,
  extractBusinessCard,
  resolveDigitalBusinessCard,
  bulkAssignContactsToCampaign,
  bulkConfirmAndAssignContacts,
  createEmailVerificationBatch,
  fetchEmailVerificationBatch,
  fetchJarvisEditableContactFields,
  prepareJarvisContactFieldUpdate,
  confirmJarvisContactFieldUpdate,
} from "../services/api.js";
import { useInitiative } from "../context/InitiativeContext.jsx";

const recognizedImportHeaders = [
  "Name",
  "First Name",
  "Last Name",
  "Title",
  "Job Title",
  "Company Name",
  "Company",
  "Email",
  "Email Status",
  "Phone",
  "Work Direct Phone",
  "Person Linkedin Url",
  "Website",
  "Location",
  "City",
  "State",
  "Country",
  "# Employees",
  "Company Employees",
  "Industry",
  "Industries",
  "Seniority",
  "Departments",
  "Keywords",
  "Lists",
  "Stage",
  "Status",
  "Qualify Contact",
  "Tags",
  "Notes",
];

function contactNameParts(contact = {}) {
  const firstName = String(contact.firstName || "").trim();
  const lastName = String(contact.lastName || "").trim();
  if (firstName || lastName) return { firstName, lastName };

  const parts = String(contact.name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
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

function isIntentContact(contact = {}) {
  return contact.sourceProvider === "intent_monitor";
}

function contactDisplayName(contact = {}) {
  const name = String(contact.name || "").trim();
  if (isIntentContact(contact) && /(?:reddit\.com\/user\/|^\/?u\/|https?:\/\/)/i.test(name)) {
    return "Identity research needed";
  }
  return name || "Identity research needed";
}

function isUnsubscribed(contact = {}) {
  return (
    contact.status === "unsubscribed" ||
    contact.emailPreferences?.marketingStatus === "unsubscribed"
  );
}

function unsubscribeSourceLabel(source) {
  const labels = {
    email_one_click: "Clicked the unsubscribe link in an email",
    preference_center: "Unsubscribed in the email preference center",
    reply_request: "Asked to be unsubscribed by reply",
    spam_complaint: "Reported an email as spam",
    admin: "Marked unsubscribed by an administrator",
  };
  return labels[source] || "Unsubscribed from marketing email";
}

function unsubscribeDate(contact = {}) {
  const value = contact.emailPreferences?.unsubscribedAt;
  if (!value) return "Date not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date not recorded"
    : date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

const contactDetailGroups = [
  [
    "Contact",
    [
      ["name", "Name"],
      ["email", "Email"],
      ["secondaryEmail", "Secondary email"],
      ["phone", "Phone"],
      ["mobilePhone", "Mobile phone"],
      ["workDirectPhone", "Work direct phone"],
      ["title", "Job title"],
      ["seniority", "Seniority"],
      ["linkedin", "LinkedIn"],
    ],
  ],
  [
    "Company",
    [
      ["company", "Company"],
      ["industry", "Industry"],
      ["website", "Website"],
      ["employeeCount", "Company size"],
      ["companyLinkedinUrl", "Company LinkedIn"],
      ["companyPhone", "Company phone"],
      ["companyAddress", "Company address"],
    ],
  ],
  [
    "Location",
    [
      ["city", "City"],
      ["state", "State"],
      ["country", "Country"],
    ],
  ],
  [
    "CRM",
    [
      ["stage", "Lifecycle stage"],
      ["type", "Relationship type"],
      ["audienceProfiles", "Audience / interests"],
      ["departments", "Departments"],
      ["keywords", "Keywords"],
      ["tags", "Tags"],
      ["lists", "Lists"],
      ["sources", "Source"],
    ],
  ],
  [
    "History",
    [
      ["lastContacted", "Last contacted"],
      ["notes", "Notes"],
    ],
  ],
];

const contactEditorSections = [
  [
    "Contact information",
    [
      ["firstName", "First name"],
      ["lastName", "Last name"],
      ["email", "Email"],
      ["secondaryEmail", "Secondary email"],
      ["phone", "Phone"],
      ["mobilePhone", "Mobile phone"],
      ["workDirectPhone", "Work direct phone"],
      ["linkedin", "LinkedIn URL"],
    ],
  ],
  [
    "Role and company",
    [
      ["title", "Job title"],
      ["seniority", "Seniority"],
      ["company", "Company"],
      ["industry", "Industry"],
      ["website", "Company website"],
      ["employeeCount", "Company size"],
      ["companyLinkedinUrl", "Company LinkedIn URL"],
      ["companyPhone", "Company phone"],
    ],
  ],
  [
    "Location",
    [
      ["city", "City"],
      ["state", "State"],
      ["country", "Country"],
      ["companyAddress", "Company address"],
    ],
  ],
  [
    "Organization and CRM",
    [
      ["departments", "Departments (comma-separated)"],
      ["keywords", "Keywords (comma-separated)"],
      ["lists", "Lists (comma-separated)"],
      ["stage", "Lifecycle stage"],
      ["tags", "Tags (comma-separated)"],
      ["notes", "Notes"],
    ],
  ],
];

const manualContactDefaults = {
  firstName: "",
  lastName: "",
  email: "",
  secondaryEmail: "",
  phone: "",
  mobilePhone: "",
  workDirectPhone: "",
  company: "",
  title: "",
  seniority: "",
  industry: "",
  website: "",
  employeeCount: "",
  linkedin: "",
  companyLinkedinUrl: "",
  companyPhone: "",
  companyAddress: "",
  city: "",
  state: "",
  country: "",
  tags: "",
  lists: "",
  departments: "",
  keywords: "",
  notes: "",
  audienceProfiles: "",
  confirmEmailManually: false,
  canReceiveCampaignEmail: false,
};

const CRM_PIPELINE_STAGES = [
  "New lead",
  "Qualified",
  "Contacted",
  "Engaged",
  "Opportunity",
  "Customer",
  "Partner",
  "Nurture",
];

function crmStage(contact = {}) {
  const current = String(contact.stage || "").trim();
  const match = CRM_PIPELINE_STAGES.find(
    (stage) => stage.toLowerCase() === current.toLowerCase(),
  );
  if (match) return match;
  if (contact.type === "customer") return "Customer";
  if (contact.type === "partner") return "Partner";
  if (contact.replied) return "Engaged";
  if (contact.emailSent || contact.lastContacted) return "Contacted";
  if (contact.qualifyContact || contact.researchStatus === "qualified")
    return "Qualified";
  return "New lead";
}

function cleanCardValue(value = "") {
  return String(value)
    .replace(/\\n/gi, " ")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .trim();
}

function parseBusinessCardPayload(payload = "") {
  const raw = String(payload || "")
    .replace(/\r\n[ \t]/g, "")
    .trim();
  const card = {};
  if (/^MECARD:/i.test(raw)) {
    const entries = Object.fromEntries(
      raw
        .replace(/^MECARD:/i, "")
        .split(";")
        .map((part) => {
          const splitAt = part.indexOf(":");
          return splitAt > 0
            ? [
                part.slice(0, splitAt).toUpperCase(),
                cleanCardValue(part.slice(splitAt + 1)),
              ]
            : ["", ""];
        }),
    );
    const [lastName = "", firstName = ""] = String(entries.N || "")
      .split(",")
      .map(cleanCardValue);
    return {
      firstName,
      lastName,
      email: entries.EMAIL || "",
      phone: entries.TEL || "",
      company: entries.ORG || "",
      title: entries.TITLE || "",
      website: entries.URL || "",
      notes: entries.NOTE || "",
    };
  }
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const url = raw.match(/https?:\/\/[^\s]+/i)?.[0] || "";
  if (url) {
    try {
      const cardUrl = new URL(url);
      if (/(^|\.)blinq\.me$/i.test(cardUrl.hostname)) {
        const sharedName = cleanCardValue(cardUrl.searchParams.get("n") || "");
        const nameParts = sharedName.split(/\s+/).filter(Boolean);
        const location = cleanCardValue(cardUrl.searchParams.get("l") || "");
        return {
          firstName: nameParts.shift() || "",
          lastName: nameParts.join(" "),
          website: url,
          notes: [location && `Location: ${location}`, `Digital business card: ${url}`]
            .filter(Boolean)
            .join("\n"),
        };
      }
    } catch {
      // Continue with the generic text/card parser for malformed URLs.
    }
  }
  const values = (key) =>
    lines
      .filter((line) => new RegExp(`^${key}(?:;[^:]*)?:`, "i").test(line))
      .map((line) => cleanCardValue(line.slice(line.indexOf(":") + 1)));
  if (/BEGIN:VCARD/i.test(raw)) {
    const fullName = values("FN")[0] || "";
    const structuredName = (values("N")[0] || "").split(";");
    card.firstName = cleanCardValue(
      structuredName[1] || fullName.split(/\s+/)[0] || "",
    );
    card.lastName = cleanCardValue(
      structuredName[0] || fullName.split(/\s+/).slice(1).join(" "),
    );
    card.company = values("ORG")[0] || "";
    card.title = values("TITLE")[0] || "";
    card.email = values("EMAIL")[0] || "";
    card.phone = values("TEL")[0] || "";
    const urls = values("URL");
    card.linkedin = urls.find((url) => /linkedin\.com/i.test(url)) || "";
    card.website = urls.find((url) => !/linkedin\.com/i.test(url)) || "";
    card.notes = values("NOTE")[0] || "";
    const address = (values("ADR")[0] || "").split(";");
    card.city = cleanCardValue(address[3] || "");
    card.state = cleanCardValue(address[4] || "");
    card.country = cleanCardValue(address[6] || "");
    return card;
  }
  
  const email = raw.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/)?.[0] || "";
  const phone = raw.match(/(?:\+?\d[\d ().-]{7,}\d)/)?.[0] || "";
  const possibleName =
    lines.find(
      (line) =>
        !line.includes("@") &&
        !/^https?:/i.test(line) &&
        !/^[+()\d .-]+$/.test(line),
    ) || "";
  const nameParts = possibleName.split(/\s+/);
  return {
    firstName: nameParts.shift() || "",
    lastName: nameParts.join(" "),
    email,
    phone,
    ...(url && /linkedin\.com/i.test(url)
      ? { linkedin: url }
      : { website: url }),
    notes:
      raw && !email && !phone && url ? `Digital business card: ${url}` : "",
  };
}

function detailValue(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join(", ");
  if (value instanceof Date) return value.toLocaleDateString();
  return String(value ?? "").trim();
}

function importedEmailState(status) {
  const value = String(status || "")
    .trim()
    .toLowerCase();
  if (["verified", "valid", "deliverable"].includes(value))
    return "deliverable";
  if (["risky", "catch-all", "catchall", "accept_all"].includes(value))
    return "risky";
  if (["invalid", "undeliverable", "bounced", "unavailable"].includes(value))
    return "undeliverable";
  return "";
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
    contact.lists?.length,
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
      detail: "Tell Growth Operator what this person is interested in.",
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
  const [searchParams] = useSearchParams();
  const { selectedId: initiativeId } = useInitiative();
  const workspaceSettings = getWorkspaceSettings();
  const [contacts, setContacts] = useState([]);
  const [contactOverview, setContactOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [campaigns, setCampaigns] = useState([]);
  const [campaignId, setCampaignId] = useState(() =>
    searchParams.get("allCampaigns") === "true"
      ? ""
      : searchParams.get("campaignId") ||
        (initiativeId === "all" ? "" : initiativeId),
  );
  const [importSummary, setImportSummary] = useState(null);
  const [isContactFormOpen, setContactFormOpen] = useState(false);
  const [isUploadOpen, setUploadOpen] = useState(false);
  const [manualContact, setManualContact] = useState(manualContactDefaults);
  const [importRows, setImportRows] = useState([]);
  const [importHeaders, setImportHeaders] = useState([]);
  const [importFileName, setImportFileName] = useState("");
  const [importPasteText, setImportPasteText] = useState("");
  const [importSource, setImportSource] = useState("csv");
  const [importWorkspaceMode, setImportWorkspaceMode] = useState("import");
  const [importCampaignId, setImportCampaignId] = useState("");
  const [importMarketingPermission, setImportMarketingPermission] =
    useState(false);
  const [savingContact, setSavingContact] = useState(false);
  const [contactTab, setContactTab] = useState(
    () => searchParams.get("tab") || "all",
  );
  const [importMenuOpen, setImportMenuOpen] = useState(false);
  const [actionMenu, setActionMenu] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [previewStats, setPreviewStats] = useState(null);
  const [duplicatePreview, setDuplicatePreview] = useState(null);
  const [detailContact, setDetailContact] = useState(null);
  const [editingContact, setEditingContact] = useState(null);
  const [contactEditMode, setContactEditMode] = useState("full");
  const [searchTerm, setSearchTerm] = useState(
    () => searchParams.get("search") || "",
  );
  const [currentPage, setCurrentPage] = useState(1);
  const [verifyingEmails, setVerifyingEmails] = useState(false);
  const [verificationProgress, setVerificationProgress] = useState(null);
  const [verificationResults, setVerificationResults] = useState({});
  const [emailVerificationMode, setEmailVerificationMode] =
    useState("emailable");
  const [showAllImportRows, setShowAllImportRows] = useState(false);
  const [importError, setImportError] = useState("");
  const [selectedContactIds, setSelectedContactIds] = useState([]);
  const [bulkCampaignId, setBulkCampaignId] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkNotice, setBulkNotice] = useState("");
  const [fieldUpdateOpen, setFieldUpdateOpen] = useState(false);
  const [fieldUpdateFields, setFieldUpdateFields] = useState([]);
  const [fieldUpdateDraft, setFieldUpdateDraft] = useState({ fieldKey: "", value: "" });
  const [fieldUpdateApproval, setFieldUpdateApproval] = useState(null);
  const [fieldUpdateSaving, setFieldUpdateSaving] = useState(false);
  const [fieldUpdateError, setFieldUpdateError] = useState("");
  const [unsubscribedContacts, setUnsubscribedContacts] = useState([]);
  const [crmView, setCrmView] = useState("list");
  const [isCardCaptureOpen, setCardCaptureOpen] = useState(false);
  const [cardDraft, setCardDraft] = useState(manualContactDefaults);
  const [cardRaw, setCardRaw] = useState("");
  const [cardStatus, setCardStatus] = useState("");
  const [cardDuplicate, setCardDuplicate] = useState(null);
  const [cardCampaignId, setCardCampaignId] = useState("");
  const [cardScanning, setCardScanning] = useState(false);
  const cardVideoRef = useRef(null);
  const cardStreamRef = useRef(null);
  const cardFrameRef = useRef(null);
  const pageSize = 15;

  useEffect(() => {
    if (searchParams.get("scan") !== "business-card") return;
    setCardDraft(manualContactDefaults);
    setCardRaw("");
    setCardStatus("");
    setCardDuplicate(null);
    setCardCampaignId(campaignId || "");
    setCardCaptureOpen(true);
  }, []);
  const importCampaignTargetId = String(
    importSummary?.campaignId ||
      campaigns.find(
        (campaign) => campaign.name === importSummary?.campaignName,
      )?._id ||
      "",
  );
  const selectedContacts = contacts.filter((contact) =>
    selectedContactIds.includes(String(contact._id)),
  );
  const selectedCampaignIds = [
    ...new Set(
      selectedContacts.flatMap((contact) =>
        (contact.campaignIds || []).map(String),
      ),
    ),
  ];
  const commonSelectedCampaignId =
    selectedCampaignIds.length === 1 &&
    selectedContacts.every((contact) =>
      contact.campaignIds?.some((id) => String(id) === selectedCampaignIds[0]),
    )
      ? selectedCampaignIds[0]
      : "";
  const selectedFieldUpdateDefinition = fieldUpdateFields.find(
    (field) => field.key === fieldUpdateDraft.fieldKey,
  );

  async function openFieldUpdate() {
    try {
      setFieldUpdateError("");
      setFieldUpdateApproval(null);
      setFieldUpdateDraft({ fieldKey: "", value: "" });
      setFieldUpdateOpen(true);
      const response = await fetchJarvisEditableContactFields();
      setFieldUpdateFields(response.data || []);
    } catch (err) {
      setFieldUpdateError(err.response?.data?.error || "Unable to load editable CRM fields.");
    }
  }

  async function prepareFieldUpdate() {
    if (!fieldUpdateDraft.fieldKey) return setFieldUpdateError("Choose the field Jarvis should update.");
    try {
      setFieldUpdateSaving(true);
      setFieldUpdateError("");
      const response = await prepareJarvisContactFieldUpdate(
        selectedContactIds,
        fieldUpdateDraft.fieldKey,
        fieldUpdateDraft.value,
      );
      setFieldUpdateApproval(response.data);
    } catch (err) {
      setFieldUpdateError(err.response?.data?.error || "Unable to prepare this field update.");
    } finally {
      setFieldUpdateSaving(false);
    }
  }

  async function confirmFieldUpdate() {
    if (!fieldUpdateApproval) return;
    try {
      setFieldUpdateSaving(true);
      setFieldUpdateError("");
      const response = await confirmJarvisContactFieldUpdate(
        fieldUpdateApproval.approvalId,
        fieldUpdateApproval.confirmationPhrase,
      );
      const result = response.data;
      setBulkNotice(
        `Jarvis updated ${result.updated} contact${result.updated === 1 ? "" : "s"} in ${result.field.label}.${result.conflicts ? ` ${result.conflicts} skipped because the record changed after preview.` : ""} An audit receipt was saved.`,
      );
      setFieldUpdateOpen(false);
      setFieldUpdateApproval(null);
      setSelectedContactIds([]);
      await loadContacts();
    } catch (err) {
      setFieldUpdateError(err.response?.data?.error || "Unable to apply this field update.");
    } finally {
      setFieldUpdateSaving(false);
    }
  }

  function stopCardScanner() {
    if (cardFrameRef.current) {
      cancelAnimationFrame(cardFrameRef.current);
    }

    cardFrameRef.current = null;

    if (cardStreamRef.current) {
      cardStreamRef.current.stop();
    }

    cardStreamRef.current = null;
    setCardScanning(false);
  }

  function closeCardCapture() {
    stopCardScanner();
    setCardCaptureOpen(false);
  }

  async function reviewCardDraft(nextDraft) {
    const name = fullContactName(nextDraft);
    if (!name) {
      setCardDuplicate(null);
      return;
    }
    try {
      const preview = await previewContactIngestion({
        contacts: [{ ...nextDraft, name }],
        source: "business_card",
      });
      setCardDuplicate(preview.data?.rows?.[0] || null);
    } catch {
      setCardDuplicate(null);
    }
  }

  async function acceptCardPayload(payload) {
    const parsed = parseBusinessCardPayload(payload);
    let resolved = {};
    let resolveError = "";
    const url = String(payload || "").match(/https?:\/\/[^\s]+/i)?.[0] || "";
    if (url) {
      try {
        const parsedUrl = new URL(url);
        if (/(^|\.)blinq\.me$/i.test(parsedUrl.hostname)) {
          setCardStatus("Opening the Blinq card and retrieving all shared contact details…");
          const response = await resolveDigitalBusinessCard(url);
          resolved = response.data || {};
        }
      } catch (error) {
        console.error("Unable to resolve digital business card", error);
        resolveError = error.response?.data?.message || error.message || "Blinq did not return the card details.";
      }
    }
    const nextDraft = { ...manualContactDefaults, ...parsed };
    Object.entries(resolved).forEach(([key, value]) => {
      if (value) nextDraft[key] = value;
    });
    setCardRaw(payload);
    setCardDraft(nextDraft);
    setCardStatus(
      resolveError
        ? `The Blinq QR code was read, but its contact details could not be retrieved: ${resolveError}`
        : fullContactName(nextDraft)
        ? "Digital card details retrieved. Review the information before saving."
        : "The QR code was read, but the card did not include a name. Complete the missing fields below.",
    );
    await reviewCardDraft(nextDraft);
  }

  async function startCardScanner() {
    try {
      setCardStatus(
        "Point the camera at the contact’s digital business-card QR code.",
      );

      const { BrowserQRCodeReader } = await import("@zxing/browser");
      const codeReader = new BrowserQRCodeReader();

      const controls = await codeReader.decodeFromConstraints(
        {
          audio: false,
          video: { facingMode: { ideal: "environment" } },
        },
        cardVideoRef.current,
        async (result) => {
          if (result) {
            await acceptCardPayload(result.getText());
            controls.stop();
            stopCardScanner();
          }
        },
      );

      cardStreamRef.current = controls;
      setCardScanning(true);
    } catch (err) {
      console.error(err);
      stopCardScanner();

      setCardStatus(
        err.name === "NotAllowedError"
          ? "Camera access was blocked. Allow camera access."
          : "Growth Operator could not start the camera. Try again.",
      );
    }
  }

  async function readCardImage(file) {
    if (!file) return;
    const imageUrl = URL.createObjectURL(file);
    try {
      setCardStatus("Reading the QR code and all printed card details…");
      const dataUrlPromise = new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const qrPromise = import("@zxing/browser")
        .then(({ BrowserQRCodeReader }) => new BrowserQRCodeReader().decodeFromImageUrl(imageUrl))
        .then((result) => result.getText())
        .catch(() => "");
      const [dataUrl, qrPayload] = await Promise.all([dataUrlPromise, qrPromise]);
      const response = await extractBusinessCard(dataUrl);
      const printed = response.data || {};
      const qrFields = qrPayload ? parseBusinessCardPayload(qrPayload) : {};
      const nextDraft = { ...manualContactDefaults, ...printed };
      Object.entries(qrFields).forEach(([key, value]) => {
        if (value) nextDraft[key] = value;
      });
      setCardRaw(qrPayload || "");
      setCardDraft(nextDraft);
      setCardStatus("QR and printed details captured. Review every field before saving.");
      await reviewCardDraft(nextDraft);
    } catch (error) {
      setCardStatus(error.response?.data?.message || "The card could not be read. Try a sharper photo with the entire card visible.");
    } finally {
      URL.revokeObjectURL(imageUrl);
    }
  }

  async function saveBusinessCard() {
    const name = fullContactName(cardDraft);
    if (!name)
      return setCardStatus(
        "Add the contact’s first or last name before saving.",
      );
    const saved = await saveIngestion(
      [
        {
          ...cardDraft,
          name,
          notes: [cardDraft.notes, "Captured from a digital business card."]
            .filter(Boolean)
            .join("\n"),
        },
      ],
      "business_card",
      cardCampaignId,
      false,
    );
    if (saved) {
      closeCardCapture();
      setCardDraft(manualContactDefaults);
      setCardRaw("");
      setCardStatus("");
      setCardDuplicate(null);
      setCardCampaignId("");
    }
  }

  async function moveContactStage(contactId, stage) {
    try {
      await updateContact(contactId, { stage });
      setBulkNotice(`Contact moved to ${stage}.`);
      await loadContacts();
    } catch (err) {
      setError(
        err.response?.data?.message || "Unable to update the lifecycle stage.",
      );
    }
  }

  useEffect(
    () => () => {
      if (cardFrameRef.current) cancelAnimationFrame(cardFrameRef.current);
      cardStreamRef.current?.getTracks?.().forEach((track) => track.stop());
    },
    [],
  );

  async function loadContacts() {
    try {
      setLoading(true);
      const query = {
        limit: 500,
        ...(contactTab === "archived"
          ? { status: "archived" }
          : contactTab === "unsubscribed"
            ? { status: "unsubscribed" }
            : {}),
      };
      const [response, unsubscribeResponse] = await Promise.all([
        fetchContacts(query),
        fetchContacts({ limit: 100, status: "unsubscribed" }),
      ]);
      const allContacts = response.data || [];
      setUnsubscribedContacts(
        [...(unsubscribeResponse.data || [])].sort(
          (a, b) =>
            new Date(b.emailPreferences?.unsubscribedAt || 0) -
            new Date(a.emailPreferences?.unsubscribedAt || 0),
        ),
      );
      const items = allContacts.filter((contact) => {
        const workflow = contactWorkflowState(contact);
        const requestedResearchStatus = searchParams.get("researchStatus");
        const tabMatches =
          contactTab === "attention"
            ? workflow.key === "email" || workflow.key === "audience"
            : contactTab === "ready"
              ? workflow.key === "ready"
              : contactTab === "assigned"
                ? workflow.key === "assigned"
                : true;
        return (
          tabMatches &&
          (!requestedResearchStatus ||
            contact.researchStatus === requestedResearchStatus) &&
          (!campaignId ||
            contact.campaignIds?.some((id) => String(id) === campaignId)) &&
          (!searchTerm ||
            [contact.name, contact.company, contact.email, contact.title]
              .join(" ")
              .toLowerCase()
              .includes(searchTerm.toLowerCase()))
        );
      });
      setContacts(items);
      setSelectedContactIds((current) =>
        current.filter((id) =>
          items.some((contact) => String(contact._id) === String(id)),
        ),
      );
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
  }, [contactTab, campaignId, searchTerm, searchParams]);

  useEffect(() => {
    fetchLatestContactImport()
      .then((response) => {
        const receipt = response.data;
        if (
          receipt &&
          localStorage.getItem("ellie.dismissedImportReceipt") !==
            String(
              receipt.receiptId || receipt.importBatchId || receipt.completedAt,
            )
        )
          setImportSummary(receipt);
      })
      .catch(() => {});
  }, []);

  function dismissImportReceipt() {
    if (importSummary)
      localStorage.setItem(
        "ellie.dismissedImportReceipt",
        String(
          importSummary.receiptId ||
            importSummary.importBatchId ||
            importSummary.completedAt ||
            "dismissed",
        ),
      );
    setImportSummary(null);
  }

  useEffect(() => {
    setCurrentPage(1);
  }, [contactTab, campaignId, searchTerm]);

  useEffect(() => {
    fetchCampaigns()
      .then((items) => {
        setCampaigns(items);
      })
      .catch(() => setError("Unable to load campaigns"));
  }, []);

  useEffect(() => {
    setCampaignId(
      searchParams.get("allCampaigns") === "true"
        ? ""
        : searchParams.get("campaignId") ||
            (initiativeId === "all" ? "" : initiativeId),
    );
    if (searchParams.get("tab")) setContactTab(searchParams.get("tab"));
    if (searchParams.get("search") !== null)
      setSearchTerm(searchParams.get("search") || "");
  }, [initiativeId, searchParams]);

  function openCsvImport() {
    setImportWorkspaceMode("import");
    setImportCampaignId(
      campaignId || (initiativeId === "all" ? "" : initiativeId),
    );
    setImportRows([]);
    setImportHeaders([]);
    setImportFileName("");
    setImportPasteText("");
    setImportSource("csv");
    setPreviewStats(null);
    setVerificationResults({});
    setVerificationProgress(null);
    setEmailVerificationMode("emailable");
    setShowAllImportRows(false);
    setImportMarketingPermission(false);
    setImportError("");
    setUploadOpen(true);
    setImportMenuOpen(false);
  }

  function openPreparationWorkspace() {
    openCsvImport();
    setImportWorkspaceMode("prepare");
    setImportSource("csv");
  }

  async function assignSelectedContacts() {
    if (!selectedContactIds.length)
      return setError("Select at least one contact.");
    if (!bulkCampaignId) return setError("Choose the campaign or event first.");
    try {
      setBulkSaving(true);
      setError("");
      setBulkNotice("");
      const response = await bulkAssignContactsToCampaign(
        selectedContactIds,
        bulkCampaignId,
      );
      setBulkNotice(
        `${response.data?.assigned || 0} selected contact${response.data?.assigned === 1 ? "" : "s"} qualified and assigned to ${response.data?.campaignName || "the campaign"}.${response.data?.skipped ? ` ${response.data.skipped} skipped because a verified name and email were unavailable.` : ""} No emails were sent.`,
      );
      setSelectedContactIds([]);
      await loadContacts();
    } catch (err) {
      setError(
        err.response?.data?.message || "Unable to assign selected contacts",
      );
    } finally {
      setBulkSaving(false);
    }
  }

  async function confirmAndAssignSelectedContacts() {
    if (!selectedContactIds.length)
      return setError("Select at least one contact.");
    if (!bulkCampaignId) return setError("Choose the campaign or event first.");
    if (!window.confirm(
      `Apply both confirmations to all ${selectedContactIds.length} selected contacts?\n\n• I know every email address is correct\n• Every person is a good fit for this campaign`,
    )) return;
    try {
      setBulkSaving(true);
      setError("");
      setBulkNotice("");
      const response = await bulkConfirmAndAssignContacts(selectedContactIds, bulkCampaignId);
      setBulkNotice(
        `${response.data?.confirmedAndAssigned || 0} selected contacts were confirmed and assigned to ${response.data?.campaignName || "the campaign"}.${response.data?.skipped ? ` ${response.data.skipped} suppressed, archived, or incomplete contacts were skipped.` : ""} No emails were sent yet.`,
      );
      setSelectedContactIds([]);
      await loadContacts();
    } catch (err) {
      setError(err.response?.data?.message || "Unable to confirm and assign selected contacts");
    } finally {
      setBulkSaving(false);
    }
  }

  function exportSelectedContacts() {
    if (!selectedContacts.length) return;
    const fields = [
      ["Name", "name"],
      ["Email", "email"],
      ["Title", "title"],
      ["Company", "company"],
      ["Phone", "phone"],
      ["LinkedIn", "linkedin"],
      ["Email Status", "emailStatus"],
    ];
    const escapeCsv = (value) =>
      `"${String(value || "").replaceAll('"', '""')}"`;
    const csv = [
      fields.map(([label]) => escapeCsv(label)).join(","),
      ...selectedContacts.map((contact) =>
        fields.map(([, field]) => escapeCsv(contact[field])).join(","),
      ),
    ].join("\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `growth-operator-selected-contacts-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setBulkNotice(
      `${selectedContacts.length} selected contact${selectedContacts.length === 1 ? "" : "s"} exported. No CRM records were changed.`,
    );
  }

  async function archiveSelectedContacts() {
    if (
      !selectedContacts.length ||
      !window.confirm(
        `Archive ${selectedContacts.length} selected contact${selectedContacts.length === 1 ? "" : "s"}? They can be restored from the Archived tab.`,
      )
    )
      return;
    try {
      setBulkSaving(true);
      await Promise.all(
        selectedContacts.map((contact) => archiveContact(contact._id)),
      );
      setBulkNotice(
        `${selectedContacts.length} contact${selectedContacts.length === 1 ? "" : "s"} archived.`,
      );
      setSelectedContactIds([]);
      await loadContacts();
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Unable to archive the selected contacts.",
      );
    } finally {
      setBulkSaving(false);
    }
  }

  function prepareImport(text, source = "csv") {
    setImportSource(source);
    Papa.parse(String(text || ""), {
      header: true,
      skipEmptyLines: "greedy",
      delimiter: String(text || "").includes("\t") ? "\t" : "",
      transformHeader: (header) => header.replace(/^\uFEFF/, "").trim(),
      complete: async ({ data, meta, errors }) => {
        const normalizedData = normalizeContactRows(data);
        const normalizedHeaders = [
          ...new Set(normalizedData.flatMap((row) => Object.keys(row))),
        ];
        const rows = normalizedData.map((row) =>
          Object.fromEntries(
            Object.entries(row).map(([key, value]) => {
              const cleaned = String(value ?? "").trim();
              if (
                key === "Title" &&
                /^[+()\d\s.-]{7,}$/.test(cleaned) &&
                cleaned.replace(/\D/g, "").length >= 7
              )
                return [key, ""];
              if (cleaned.toLowerCase() !== "stage = needs research")
                return [key, cleaned];
              if (key === "Stage") return [key, "Needs Research"];
              if (key === "Qualify Contact") return [key, "no"];
              if (key === "Tags") return [key, "needs-research"];
              return [key, ""];
            }),
          ),
        );
        const valid = rows.filter(
          (row) => row.Name || row["First Name"] || row["Last Name"],
        ).length;
        const emails = rows.filter((row) => !row.Email).length;
        const hasImportedEmailStatus =
          normalizedHeaders.includes("Email Status") &&
          rows.some((row) => importedEmailState(row["Email Status"]));
        setEmailVerificationMode(
          hasImportedEmailStatus ? "source" : "emailable",
        );
        setShowAllImportRows(false);
        setImportHeaders(normalizedHeaders);
        setImportRows(rows);
        setDuplicatePreview(null);
        setVerificationResults({});
        setVerificationProgress(null);
        setPreviewStats({
          parsed: rows.length,
          valid,
          missingName: rows.length - valid,
          missingEmail: emails,
          malformed: errors.length,
        });
        setImportError(
          errors.length ? "Some rows have malformed column counts." : "",
        );
        setError("");
        setUploadOpen(true);
        try {
          const preview = await previewContactIngestion({
            contacts: rows,
            source,
          });
          setDuplicatePreview(preview.data);
        } catch (previewError) {
          setImportError(
            previewError.response?.data?.message ||
              "Growth Operator could not check this CSV for duplicates. Import is paused.",
          );
        }
      },
      error: () => setImportError("Unable to parse contact file."),
    });
  }

  async function refreshImportPreview(rows) {
    setDuplicatePreview(null);
    try {
      const preview = await previewContactIngestion({
        contacts: rows,
        source: importSource,
      });
      setDuplicatePreview(preview.data);
    } catch (previewError) {
      setImportError(
        previewError.response?.data?.message ||
          "Growth Operator could not recheck this working list for duplicates.",
      );
    }
  }

  function updateImportCell(rowIndex, header, value) {
    setImportRows((current) =>
      current.map((row, index) =>
        index === rowIndex ? { ...row, [header]: value } : row,
      ),
    );
    setDuplicatePreview(null);
    setVerificationResults({});
  }

  function remapImportHeader(currentHeader, nextHeader) {
    if (!nextHeader || nextHeader === currentHeader) return;
    if (importHeaders.includes(nextHeader)) {
      setImportError(`“${nextHeader}” is already assigned to another column.`);
      return;
    }
    const nextRows = importRows.map((row) => {
      const updated = { ...row, [nextHeader]: row[currentHeader] || "" };
      delete updated[currentHeader];
      return updated;
    });
    setImportHeaders((current) =>
      current.map((header) =>
        header === currentHeader ? nextHeader : header,
      ),
    );
    setImportRows(nextRows);
    setImportError("");
    setVerificationResults({});
    refreshImportPreview(nextRows);
  }

  function removeImportRow(rowIndex) {
    const nextRows = importRows.filter((_, index) => index !== rowIndex);
    setImportRows(nextRows);
    setVerificationResults({});
    refreshImportPreview(nextRows);
  }

  function downloadPreparedContactCsv() {
    const fields = [
      ...CONTACT_TEMPLATE_HEADERS,
      ...importHeaders.filter(
        (header) => !CONTACT_TEMPLATE_HEADERS.includes(header),
      ),
    ];
    const csv = Papa.unparse({ fields, data: importRows });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "growth-operator-email-finder-working-list.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function saveIngestion(
    contactsToSave,
    source,
    selectedCampaignId,
    marketingPermission = false,
    importMeta = {},
  ) {
    try {
      setSavingContact(true);
      setError("");
      const response = await ingestContacts({
        contacts: contactsToSave,
        source,
        campaignId: selectedCampaignId || null,
        marketingPermission,
        ...importMeta,
      });
      setImportSummary(response.data);
      await loadContacts();
      return true;
    } catch (err) {
      setError(err.response?.data?.message || "Unable to save contacts");
      return false;
    } finally {
      setSavingContact(false);
    }
  }

  async function saveManualContact() {
    const name = fullContactName(manualContact);
    if (!name) {
      setError("Enter a first or last name to save this contact.");
      return;
    }
    const saved = await saveIngestion(
      [
        {
          ...manualContact,
          name,
          tags: manualContact.tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
          lists: manualContact.lists
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
          departments: manualContact.departments
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
          keywords: manualContact.keywords
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
          audienceProfiles: manualContact.audienceProfiles
            .split(",")
            .map((profile) => profile.trim())
            .filter(Boolean),
        },
      ],
      "manual",
      importCampaignId,
      manualContact.canReceiveCampaignEmail,
    );
    if (saved) {
      setContactFormOpen(false);
      setManualContact(manualContactDefaults);
    }
  }

  async function saveUploadedContacts() {
    const pending = importRows.some(
      (row) =>
        row.Email && !effectiveVerificationResults[row.Email.toLowerCase()],
    );
    if (pending) {
      setError("Verify the email addresses before importing.");
      return;
    }
    const sanitizedRows = importRows.map((row) => {
      const email = String(row.Email || "").trim();
      if (!email) return row;
      const result = effectiveVerificationResults[email.toLowerCase()];
      if (result?.state === "deliverable") {
        return {
          ...row,
          Email: email,
          "Email Status": "verified",
          "Primary Email Verification Source":
            result.reason === "imported_email_status"
                ? "csv_import_status"
                : "emailable",
        };
      }
      const tags = [
        ...new Set(
          [String(row.Tags || "").split(","), ["needs-email-verification"]]
            .flat()
            .map((tag) => tag.trim())
            .filter(Boolean),
        ),
      ].join(",");
      return {
        ...row,
        Email: email,
        "Email Status":
          result?.state === "undeliverable" ? "undeliverable" : "unverified",
        "Primary Email Verification Source":
          result?.reason === "verification_skipped" ? "not_verified" : "emailable",
        Tags: tags,
      };
    });
    const batch = {
      id: `csv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      fileName: importFileName || "Pasted CSV",
    };
    const saved = await saveIngestion(
      sanitizedRows,
      importSource,
      importCampaignId,
      importMarketingPermission,
      {
        importBatchId: batch.id,
        importFileName: batch.fileName,
      },
    );
    if (saved) {
      setContactTab("all");
      setCampaignId("");
      setUploadOpen(false);
      setImportRows([]);
      setImportHeaders([]);
      setImportFileName("");
      setImportPasteText("");
      setDuplicatePreview(null);
      setVerificationResults({});
      setVerificationProgress(null);
      setEmailVerificationMode("emailable");
      setImportMarketingPermission(false);
    }
  }

  function viewNewImportedContacts() {
    const verifiedIds = (importSummary?.createdContacts || [])
      .filter((contact) => contact.emailStatus === "verified")
      .map((contact) => String(contact.id));
    setContactTab("all");
    setCampaignId("");
    setSearchTerm("");
    setCurrentPage(1);
    setSelectedContactIds(verifiedIds);
    setBulkNotice(
      `${importSummary?.mongoCreated || 0} new contacts are shown at the top. ${verifiedIds.length} with verified emails are selected.`,
    );
    window.setTimeout(
      () =>
        document
          .getElementById("contact-results")
          ?.scrollIntoView({ behavior: "smooth", block: "start" }),
      50,
    );
  }

  const emailsToVerify = [
    ...new Set(
      importRows
        .map((row) =>
          String(row.Email || "")
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean),
    ),
  ];
  const importedVerificationResults = Object.fromEntries(
    importRows
      .map((row) => {
        const email = String(row.Email || "")
          .trim()
          .toLowerCase();
        const state = importedEmailState(row["Email Status"]);
        return email && state
          ? [email, { email, state, reason: "imported_email_status" }]
          : null;
      })
      .filter(Boolean),
  );
  const skippedVerificationResults = Object.fromEntries(
    emailsToVerify.map((email) => [
      email,
      {
        email,
        state: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
          ? "unknown"
          : "undeliverable",
        reason: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
          ? "verification_skipped"
          : "invalid_format",
      },
    ]),
  );
  // Source verification is only evidence for rows that actually contain a
  // recognized status. Do not silently treat blank statuses as an intentional
  // verification skip just because another row in the same CSV is verified.
  // Leaving those rows pending forces the user to choose a fresh Emailable
  // check or explicitly select "Skip email verification" for the whole file.
  const sourceVerificationResults = importedVerificationResults;
  const hasImportedVerification =
    Object.keys(importedVerificationResults).length > 0;
  const effectiveVerificationResults =
    emailVerificationMode === "source"
      ? sourceVerificationResults
      : emailVerificationMode === "skip"
        ? skippedVerificationResults
        : verificationResults;
  const pendingEmailCount = emailsToVerify.filter(
    (email) => !effectiveVerificationResults[email],
  ).length;
  const verificationCounts = Object.values(effectiveVerificationResults).reduce(
    (counts, result) => {
      const state = result.state || "unknown";
      counts[state] = (counts[state] || 0) + 1;
      return counts;
    },
    {},
  );
  const verificationIssues = emailsToVerify
    .map((email) => {
      const result = effectiveVerificationResults[email];
      if (!result || result.state === "deliverable") return null;
      const rowIndex = importRows.findIndex(
        (row) =>
          String(row.Email || "")
            .trim()
            .toLowerCase() === email,
      );
      const row = importRows[rowIndex] || {};
      return {
        email,
        state: result.state || "unknown",
        reason: result.reason || "verification_failed",
        rowNumber: rowIndex + 2,
        name:
          String(
            row.Name || `${row["First Name"] || ""} ${row["Last Name"] || ""}`,
          ).trim() || "Unnamed contact",
        company: row["Company Name"] || row.Company || "",
      };
    })
    .filter(Boolean);

  function getLocalInvalidResults() {
    return Object.fromEntries(
      emailsToVerify
        .filter((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        .map((email) => [
          email,
          { email, state: "undeliverable", reason: "invalid_format" },
        ]),
    );
  }

  async function pollEmailVerificationBatch(batchId, invalidResults) {
    for (let attempt = 0; attempt < 90; attempt += 1) {
      if (attempt) await new Promise((resolve) => setTimeout(resolve, 2000));
      const response = await fetchEmailVerificationBatch(batchId);
      const batch = response.data || {};
      setVerificationProgress({
        processed: (batch.processed || 0) + Object.keys(invalidResults).length,
        total: emailsToVerify.length,
      });
      const returnedResults = Array.isArray(batch.results)
        ? Object.fromEntries(
            batch.results.map((result) => [result.email, result]),
          )
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
        setVerificationProgress({
          processed: emailsToVerify.length,
          total: emailsToVerify.length,
        });
        return;
      }
    }
    throw new Error(
      "Email verification is taking longer than expected. Keep this window open and click Verify again shortly; Growth Operator will reuse the existing check.",
    );
  }

  async function verifyImportedEmails() {
    if (!emailsToVerify.length) return;
    try {
      setVerifyingEmails(true);
      setEmailVerificationMode("emailable");
      setImportError("");
      const plausibleEmails = emailsToVerify.filter((email) =>
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
      );
      const invalidResults = getLocalInvalidResults();
      setVerificationResults(invalidResults);
      setVerificationProgress({ processed: 0, total: emailsToVerify.length });
      if (!plausibleEmails.length) {
        setVerificationProgress({
          processed: emailsToVerify.length,
          total: emailsToVerify.length,
        });
        return;
      }
      const created = await createEmailVerificationBatch(plausibleEmails);
      const batchId = created.data?.id;
      if (!batchId) throw new Error("Emailable did not return a batch ID");
      await pollEmailVerificationBatch(batchId, invalidResults);
    } catch (err) {
      setVerificationProgress(null);
      setImportError(
        err.response?.data?.message || err.message || "Unable to verify emails",
      );
    } finally {
      setVerifyingEmails(false);
    }
  }

  return (
    <div className="page-dashboard contacts-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">CRM</h1>
          <p className="page-subtitle">
            Keep every relationship organized, understand the next action, and
            move the right people into campaigns.
          </p>
        </div>
        <div className="crm-header-actions">
          <Button
            onClick={() => {
              setCardDraft(manualContactDefaults);
              setCardRaw("");
              setCardStatus("");
              setCardDuplicate(null);
              setCardCampaignId(campaignId || "");
              setCardCaptureOpen(true);
            }}
          >
            Scan business card
          </Button>
          <Button
            onClick={() => {
              setError("");
              setContactFormOpen(true);
            }}
          >
            + New Contact
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate("/contacts/fields")}
          >
            Customize fields
          </Button>
          <div className="crm-menu-wrap">
            <Button
              variant="outline"
              onClick={() => setImportMenuOpen((open) => !open)}
            >
              Import ▾
            </Button>
            {importMenuOpen ? (
              <div className="crm-menu crm-import-menu">
                <button onClick={openPreparationWorkspace}>
                  Prepare lead list / CSV
                </button>
                <button onClick={openCsvImport}>Import completed CSV</button>
                <button
                  onClick={() => {
                    navigate("/discovery");
                    setImportMenuOpen(false);
                  }}
                >
                  Organization Discovery
                </button>
              </div>
            ) : null}
          </div>
          <Button variant="outline" onClick={() => navigate("/discovery")}>
            Discover New Prospects
          </Button>
        </div>
      </div>

      <section className="crm-mode-banner" aria-label="CRM connection options">
        <div>
          <span className="crm-mode-banner__eyebrow">Your contact system</span>
          <strong>Growth Operator CRM is active.</strong>
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
        {importSummary ? (
          <section
            className={
              importSummary.failed
                ? "import-receipt has-errors"
                : "import-receipt"
            }
          >
            <header>
              <div>
                <span>Recent import receipt</span>
                <h3>
                  {importSummary.mongoCreated} new contact
                  {importSummary.mongoCreated === 1 ? "" : "s"} added
                </h3>
                <p>
                  {importSummary.mongoUpdated} existing contact
                  {importSummary.mongoUpdated === 1 ? " was" : "s were"} updated
                  without creating duplicates. This is an audit receipt, not a
                  pending-work queue.
                </p>
              </div>
              <div className="import-receipt__actions">
                {importCampaignTargetId ? (
                  <Button
                    size="sm"
                    onClick={() =>
                      navigate(`/campaigns/${importCampaignTargetId}`)
                    }
                  >
                    <b className="import-receipt-button-label">Open campaign</b>
                  </Button>
                ) : null}
                {importSummary.createdContacts?.length ? (
                  <Button
                    variant={importCampaignTargetId ? "outline" : "primary"}
                    size="sm"
                    onClick={viewNewImportedContacts}
                  >
                    <b
                      className={
                        importCampaignTargetId
                          ? ""
                          : "import-receipt-button-label"
                      }
                    >
                      View these {importSummary.mongoCreated} contacts
                    </b>
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={dismissImportReceipt}
                >
                  Dismiss receipt
                </Button>
              </div>
            </header>
            {importSummary.createdContacts?.length ? (
              <div className="import-receipt__contacts">
                {importSummary.createdContacts.map((contact) => (
                  <article key={String(contact.id)}>
                    <span>
                      {String(contact.name || "?")
                        .slice(0, 1)
                        .toUpperCase()}
                    </span>
                    <div>
                      <strong>{contact.name}</strong>
                      <small>
                        {contact.company || "Company missing"} ·{" "}
                        {contact.email || "No usable email"}
                      </small>
                    </div>
                    <em className={`is-${contact.emailStatus}`}>
                      {contact.emailStatus === "verified"
                        ? "Ready to contact"
                        : "Email needs review"}
                    </em>
                  </article>
                ))}
              </div>
            ) : null}
            {importSummary.campaignName ? (
              <div className="import-receipt__next">
                <strong>Assignment confirmed</strong>
                <p>
                  These contacts are assigned to {importSummary.campaignName}.
                  Sending or completing outreach does not remove this receipt;
                  dismiss it when you no longer need the import record.
                </p>
                {importCampaignTargetId ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      navigate(`/outreach?campaignId=${importCampaignTargetId}`)
                    }
                  >
                    Open outreach
                  </Button>
                ) : null}
              </div>
            ) : (
              <p className="import-receipt__assignment">
                Use “View these contacts,” then choose a campaign from the
                bulk-action bar.
              </p>
            )}
            {importSummary.failed && importSummary.errors?.[0]?.message ? (
              <p className="form-error">
                First failure: {importSummary.errors[0].message}
              </p>
            ) : null}
          </section>
        ) : null}
        {contactOverview ? (
          <section
            className="contact-overview contact-overview--workflow"
            aria-label="CRM workflow overview"
          >
            <button onClick={() => setContactTab("all")}>
              <span>All relationships</span>
              <strong>{contactOverview.total}</strong>
              <small>Everyone stored in your CRM</small>
            </button>
            <button
              className="is-warning"
              onClick={() => setContactTab("attention")}
            >
              <span>Data quality review</span>
              <strong>{contactOverview.needsAttention || 0}</strong>
              <small>
                {contactOverview.emailAttention || 0} email safety ·{" "}
                {contactOverview.audienceAttention || 0} missing profile
              </small>
            </button>
            <button className="is-safe" onClick={() => setContactTab("ready")}>
              <span>Ready to assign</span>
              <strong>{contactOverview.readyToAssign || 0}</strong>
              <small>Verified contacts not yet assigned</small>
            </button>
            <button
              className="is-safe"
              onClick={() => setContactTab("assigned")}
            >
              <span>Campaign assigned</span>
              <strong>{contactOverview.campaignAssigned || 0}</strong>
              <small>Contacts already connected to an offer or event</small>
            </button>
          </section>
        ) : null}
        {contactOverview ? (
          <p className="contact-guidance">
            <strong>To leave Data quality review:</strong> a contact needs a name,
            a verified email, and at least one audience clue—job title, company,
            industry, seniority, audience/interests, keyword, or list. Campaign
            assignment is separate, so an assigned contact can still need review.
          </p>
        ) : null}
        <div className="crm-toolbar">
          <label>
            Campaign{" "}
            <select
              value={campaignId}
              onChange={(event) => setCampaignId(event.target.value)}
            >
              <option value="">All campaigns</option>
              {campaigns.map((campaign) => (
                <option key={campaign._id} value={campaign._id}>
                  {campaign.name}
                </option>
              ))}
            </select>
          </label>
          <input
            className="select-input"
            placeholder="Search contacts"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
          {campaignId || searchTerm ? (
            <Button
              variant="outline"
              onClick={() => {
                setCampaignId("");
                setSearchTerm("");
              }}
            >
              Clear filters
            </Button>
          ) : null}
          <div className="crm-view-switch" aria-label="CRM view">
            <button
              className={crmView === "list" ? "active" : ""}
              onClick={() => setCrmView("list")}
            >
              Relationship list
            </button>
            <button
              className={crmView === "pipeline" ? "active" : ""}
              onClick={() => setCrmView("pipeline")}
            >
              Lifecycle pipeline
            </button>
          </div>
        </div>
        <div className="crm-tabs crm-tabs--simple">
          {[
            ["all", "All contacts"],
            ["attention", "Data quality review"],
            ["ready", "Ready to assign"],
            ["assigned", "Campaign assigned"],
            ["unsubscribed", `Unsubscribed (${unsubscribedContacts.length})`],
            ["archived", "Archived"],
          ].map(([value, label]) => (
            <button
              key={value}
              className={contactTab === value ? "active" : ""}
              onClick={() => setContactTab(value)}
            >
              {label}
            </button>
          ))}
        </div>
        {contacts.length &&
        !["archived", "unsubscribed"].includes(contactTab) ? (
          <section
            className={`contact-bulk-actions ${selectedContactIds.length ? "has-selection" : ""}`}
            aria-label="Selected contact actions"
          >
            <div className="contact-bulk-actions__selection">
              <label className="contact-select-all">
                <input
                  type="checkbox"
                  checked={
                    contacts.length > 0 &&
                    contacts.every((contact) =>
                      selectedContactIds.includes(String(contact._id)),
                    )
                  }
                  onChange={(event) =>
                    setSelectedContactIds(
                      event.target.checked
                        ? contacts.map((contact) => String(contact._id))
                        : [],
                    )
                  }
                />
                <span>Select all contacts in this view</span>
              </label>
              <strong>{selectedContactIds.length} selected</strong>
            </div>
            {selectedContactIds.length ? (
              <div className="contact-bulk-actions__workspace">
                <div>
                  <small>Selection actions</small>
                  <strong>Choose what to do with these contacts</strong>
                </div>
                {commonSelectedCampaignId ? (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        navigate(`/campaigns/${commonSelectedCampaignId}`)
                      }
                    >
                      Open campaign
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        navigate(
                          `/outreach?campaignId=${commonSelectedCampaignId}`,
                        )
                      }
                    >
                      Open outreach
                    </Button>
                  </>
                ) : null}
                <select
                  className="select-input"
                  value={bulkCampaignId}
                  onChange={(event) => setBulkCampaignId(event.target.value)}
                >
                  <option value="">Add to another campaign…</option>
                  {campaigns.map((campaign) => (
                    <option key={campaign._id} value={campaign._id}>
                      {campaign.name}
                    </option>
                  ))}
                </select>
                <Button
                  loading={bulkSaving}
                  disabled={!bulkCampaignId}
                  onClick={assignSelectedContacts}
                >
                  Add to campaign
                </Button>
                <Button
                  variant="outline"
                  loading={bulkSaving}
                  disabled={!bulkCampaignId}
                  onClick={confirmAndAssignSelectedContacts}
                >
                  Confirm emails + fit for all
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={exportSelectedContacts}
                >
                  Export CSV
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={openFieldUpdate}
                >
                  Update fields with Jarvis
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  loading={bulkSaving}
                  onClick={archiveSelectedContacts}
                >
                  Archive
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedContactIds([])}
                >
                  Clear selection
                </Button>
              </div>
            ) : (
              <p className="contact-bulk-actions__help">
                Select one or more contacts to open campaign, outreach, export,
                assignment, and archive options. Selecting never sends an email.
              </p>
            )}
          </section>
        ) : null}
        {bulkNotice ? (
          <p className="contact-bulk-notice">{bulkNotice}</p>
        ) : null}
        <Modal
          isOpen={fieldUpdateOpen}
          onClose={() => !fieldUpdateSaving && setFieldUpdateOpen(false)}
          title="Update selected CRM fields with Jarvis"
          footer={
            <>
              <Button variant="outline" disabled={fieldUpdateSaving} onClick={() => setFieldUpdateOpen(false)}>Cancel</Button>
              {fieldUpdateApproval ? (
                <Button loading={fieldUpdateSaving} onClick={confirmFieldUpdate}>Confirm exact update</Button>
              ) : (
                <Button loading={fieldUpdateSaving} disabled={!fieldUpdateDraft.fieldKey} onClick={prepareFieldUpdate}>Preview changes</Button>
              )}
            </>
          }
        >
          <div className="jarvis-field-update">
            <p><strong>{selectedContactIds.length} selected contact{selectedContactIds.length === 1 ? "" : "s"}.</strong> Jarvis changes one approved field at a time and never changes email consent, verification, suppression, or unsubscribe data here.</p>
            {!fieldUpdateApproval ? <>
              <label className="form-field"><span>Field to update</span><select className="select-input" value={fieldUpdateDraft.fieldKey} onChange={(event) => setFieldUpdateDraft({ fieldKey: event.target.value, value: "" })}><option value="">Choose a CRM field…</option>{fieldUpdateFields.map((field) => <option key={`${field.custom ? "custom" : "built-in"}-${field.key}`} value={field.key}>{field.label}{field.custom ? " · custom" : ""}</option>)}</select></label>
              {selectedFieldUpdateDefinition?.type === "boolean" ? <label className="form-field"><span>New value</span><select className="select-input" value={fieldUpdateDraft.value} onChange={(event) => setFieldUpdateDraft({ ...fieldUpdateDraft, value: event.target.value })}><option value="">Choose yes or no…</option><option value="true">Yes</option><option value="false">No</option></select></label> : <label className="form-field"><span>New value</span><input className="select-input" type={selectedFieldUpdateDefinition?.type === "number" ? "number" : selectedFieldUpdateDefinition?.type === "date" ? "date" : "text"} value={fieldUpdateDraft.value} onChange={(event) => setFieldUpdateDraft({ ...fieldUpdateDraft, value: event.target.value })} placeholder={selectedFieldUpdateDefinition?.type === "list" ? "Separate multiple values with commas" : "Enter the approved value"} /></label>}
              <small>Nothing changes when you preview. You will see the old and new values before confirming.</small>
            </> : <section className="jarvis-field-update__preview">
              <header><span>Approval preview</span><strong>{fieldUpdateApproval.preview.changedCount} record{fieldUpdateApproval.preview.changedCount === 1 ? "" : "s"} will change</strong><small>{fieldUpdateApproval.preview.unchangedCount || 0} already matched · {fieldUpdateApproval.preview.missingCount || 0} unavailable</small></header>
              <div className="jarvis-field-update__changes">{(fieldUpdateApproval.preview.displayChanges || fieldUpdateApproval.preview.changes || []).map((change) => <article key={change.contactId}><strong>{change.contactName}</strong><span><del>{change.beforeDisplay}</del><b>→</b><ins>{change.afterDisplay}</ins></span></article>)}</div>
              <div className="jarvis-field-update__confirmation"><span>Required confirmation</span><strong>{fieldUpdateApproval.confirmationPhrase}</strong><small>Expires at {new Date(fieldUpdateApproval.expiresAt).toLocaleTimeString()}. If a record changes before confirmation, Jarvis skips it instead of overwriting newer work.</small></div>
            </section>}
            {fieldUpdateError ? <p className="form-error">{fieldUpdateError}</p> : null}
          </div>
        </Modal>
        {!loading && contacts.length ? (
          <div className="crm-results-summary" id="contact-results">
            <span>
              Showing {(currentPage - 1) * pageSize + 1}–
              {Math.min(currentPage * pageSize, contacts.length)} of{" "}
              {contacts.length} contacts
            </span>
            <span>
              Page {currentPage} of{" "}
              {Math.max(1, Math.ceil(contacts.length / pageSize))}
            </span>
          </div>
        ) : null}
        {!loading && contacts.length > pageSize ? (
          <nav
            className="crm-pagination crm-pagination--top"
            aria-label="Contact pages above results"
          >
            <Button
              variant="outline"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
            >
              Previous
            </Button>
            <span>
              Page {currentPage} of {Math.ceil(contacts.length / pageSize)}
            </span>
            <Button
              variant="outline"
              disabled={currentPage >= Math.ceil(contacts.length / pageSize)}
              onClick={() => setCurrentPage((page) => page + 1)}
            >
              Next
            </Button>
          </nav>
        ) : null}
        {!loading && contacts.length && crmView === "pipeline" ? (
          <section
            className="crm-pipeline"
            aria-label="Contact lifecycle pipeline"
          >
            {CRM_PIPELINE_STAGES.map((stage) => {
              const stageContacts = contacts.filter(
                (contact) => crmStage(contact) === stage,
              );
              return (
                <div
                  className="crm-pipeline__column"
                  key={stage}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    const contactId =
                      event.dataTransfer.getData("text/contact-id");
                    if (contactId) moveContactStage(contactId, stage);
                  }}
                >
                  <header>
                    <strong>{stage}</strong>
                    <span>{stageContacts.length}</span>
                  </header>
                  <div>
                    {stageContacts.length ? (
                      stageContacts.map((contact) => (
                        <article
                          draggable
                          key={contact._id}
                          onDragStart={(event) =>
                            event.dataTransfer.setData(
                              "text/contact-id",
                              String(contact._id),
                            )
                          }
                          onClick={() => setDetailContact(contact)}
                        >
                          <strong>{contact.name}</strong>
                          <span>{contact.title || "Role missing"}</span>
                          <small>{contact.company || "Company missing"}</small>
                          <footer>
                            <em
                              className={`is-${contact.emailStatus || "missing"}`}
                            >
                              {contact.emailStatus === "verified"
                                ? "Verified"
                                : "Email review"}
                            </em>
                            <span>
                              {contact.campaignIds?.length
                                ? "Campaign assigned"
                                : "Unassigned"}
                            </span>
                          </footer>
                        </article>
                      ))
                    ) : (
                      <p>Drop a contact here</p>
                    )}
                  </div>
                </div>
              );
            })}
          </section>
        ) : null}
        {loading ? (
          <div className="table-state">Loading contacts…</div>
        ) : contacts.length && crmView === "list" ? (
          <div className="contact-record-list contact-record-list--compact">
            {contacts
              .slice((currentPage - 1) * pageSize, currentPage * pageSize)
              .map((contact) => {
                const workflow = contactWorkflowState(contact);
                return (
                  <article
                    className="contact-record"
                    key={contact._id}
                    onClick={() => setDetailContact(contact)}
                  >
                    <header>
                      <div className="contact-record__identity">
                        <input
                          type="checkbox"
                          aria-label={`Select ${contact.name}`}
                          checked={selectedContactIds.includes(
                            String(contact._id),
                          )}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) =>
                            setSelectedContactIds((current) =>
                              event.target.checked
                                ? [
                                    ...new Set([
                                      ...current,
                                      String(contact._id),
                                    ]),
                                  ]
                                : current.filter(
                                    (id) => id !== String(contact._id),
                                  ),
                            )
                          }
                        />
                        <div>
                          <h3>{contact.name}</h3>
                          <p>
                            {contact.title || "Title missing"}
                            {contact.company
                              ? ` · ${contact.company}`
                              : " · Company missing"}
                          </p>
                        </div>
                      </div>
                      <div className="contact-record__top-actions">
                        {isUnsubscribed(contact) ? (
                          <span className="contact-status-badge contact-status-badge--unsubscribed">
                            Unsubscribed
                          </span>
                        ) : (
                          <span
                            className={`contact-status-badge contact-status-badge--${contact.emailStatus || "missing"}`}
                          >
                            {contact.emailStatus === "verified"
                              ? "Verified email"
                              : contact.emailStatus === "risky"
                                ? "Risky — withheld"
                                : contact.emailStatus === "undeliverable"
                                  ? "Undeliverable — withheld"
                                  : "No verified email"}
                          </span>
                        )}
                        {!hasAudienceSignals(contact) ? (
                          <span
                            className="contact-status-badge contact-status-badge--unknown"
                            title="Growth Operator has only identity information and will not guess this person’s interests."
                          >
                            Audience unknown
                          </span>
                        ) : null}
                        <button
                          className={`contact-next-action contact-next-action--${workflow.key}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            setContactEditMode(
                              workflow.key === "audience" ? "audience" : "full",
                            );
                            setEditingContact({
                              ...contact,
                              ...contactNameParts(contact),
                            });
                          }}
                        >
                          {workflow.label}
                        </button>
                        <div
                          className="crm-menu-wrap"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <button
                            className="crm-overflow"
                            aria-label={`Actions for ${contact.name}`}
                            onClick={() =>
                              setActionMenu(
                                actionMenu === contact._id ? null : contact._id,
                              )
                            }
                          >
                            <FiMoreHorizontal aria-hidden="true" />
                          </button>
                          {actionMenu === contact._id ? (
                            <div className="crm-menu">
                              <button onClick={() => setDetailContact(contact)}>
                                View details
                              </button>
                              <button
                                onClick={() => {
                                  setContactEditMode("full");
                                  setEditingContact({
                                    ...contact,
                                    ...contactNameParts(contact),
                                  });
                                }}
                              >
                                Edit contact & campaign
                              </button>
                              <button
                                onClick={() =>
                                  archiveContact(contact._id).then(loadContacts)
                                }
                              >
                                Archive
                              </button>
                              <button
                                className="danger"
                                onClick={() => setDeleteTarget(contact)}
                              >
                                Delete permanently
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </header>
                    <div className="contact-record__details">
                      <div>
                        <span>Email</span>
                        <strong>
                          {contact.email || "Withheld or unavailable"}
                        </strong>
                      </div>
                      <div>
                        <span>Audience</span>
                        <strong>
                          {contact.audienceProfiles?.join(", ") ||
                            contact.industry ||
                            contact.title ||
                            "Unknown"}
                        </strong>
                      </div>
                      <div>
                        <span>Campaign</span>
                        <strong>
                          {contact.campaignIds?.length
                            ? "Assigned"
                            : "Not assigned"}
                        </strong>
                      </div>
                      <div>
                        <span>Next action</span>
                        <strong>{workflow.detail}</strong>
                      </div>
                    </div>
                  </article>
                );
              })}
            <nav className="crm-pagination" aria-label="Contact pages">
              <Button
                variant="outline"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              >
                Previous
              </Button>
              <span>
                Page {currentPage} of {Math.ceil(contacts.length / pageSize)}
              </span>
              <Button
                variant="outline"
                disabled={currentPage >= Math.ceil(contacts.length / pageSize)}
                onClick={() => setCurrentPage((page) => page + 1)}
              >
                Next
              </Button>
            </nav>
          </div>
        ) : (
          <div className="table-state table-state--empty">
            {contactTab === "ready"
              ? "No verified contacts are waiting for a campaign assignment."
              : contactTab === "attention"
                ? "No contacts need a data-quality decision right now."
                : "No contacts match this view."}
          </div>
        )}
      </DashboardCard>

      {false ? (
        <DashboardCard title="Find Leads">
          <div className="lead-search-retired">
            <p>
              Direct provider search has been retired. Use Growth Operator Market
              Intelligence or import a completed CSV here.
            </p>
            <p>
              <small>
                Growth Operator now uses its own research and review workflow.
              </small>
            </p>
            <Button onClick={openCsvImport}>Import contact CSV</Button>
            <Button variant="outline" onClick={() => navigate("/marketing")}>
              Open Organization Discovery
            </Button>
            <small>
              Native lead research is available from Discovery.
            </small>
          </div>
          <div style={{ display: "none" }}>
            <select
              value={campaignId}
              onChange={(event) => setCampaignId(event.target.value)}
              className="select-input"
            >
              <option value="">Select campaign</option>
              {campaigns.map((campaign) => (
                <option key={campaign._id} value={campaign._id}>
                  {campaign.name}
                </option>
              ))}
            </select>
            {[
              ["title", "Job title"],
              ["location", "Location"],
              ["industry", "Industry"],
              ["employeeSize", "Company employee size"],
            ].map(([key, label]) => (
              <input
                key={key}
                className="select-input"
                placeholder={label}
                value={filters[key]}
                onChange={(event) =>
                  setFilters({ ...filters, [key]: event.target.value })
                }
              />
            ))}
            <Button loading={false} onClick={() => navigate("/discovery")}>
              Search Leads
            </Button>
          </div>
          {false ? <p /> : null}
          {false ? (
            <>
              <p>0 selected</p>
              <Button
                variant="outline"
                onClick={() =>
                  setSelectedLeads(
                    [],
                  )
                }
              >
                Select all / Clear all
              </Button>
              <div style={{ overflowX: "auto", marginTop: "1rem" }}>
                <table>
                  <thead>
                    <tr>
                      <th>Select</th>
                      <th>Name</th>
                      <th>Role</th>
                      <th>Company</th>
                      <th>Email</th>
                      <th>Location</th>
                      <th>LinkedIn</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[].map((lead) => {
                      const id =
                        lead.providerContactId || lead.email || lead.linkedinUrl;
                      const selected = false;
                      return (
                        <tr key={id}>
                          <td>
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => {}}
                            />
                          </td>
                          <td>{lead.name}</td>
                          <td>{lead.title}</td>
                          <td>{lead.company}</td>
                          <td>{lead.email || "Unavailable"}</td>
                          <td>{lead.location}</td>
                          <td>
                            {lead.linkedinUrl ? (
                              <a
                                href={lead.linkedinUrl}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Open
                              </a>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Button
                variant="primary"
                disabled
                onClick={() => {
                  if (!campaignId)
                    return setError(
                      "Select a campaign before importing selected leads.",
                    );
                  navigate("/discovery");
                }}
              >
                Import to Growth Operator
                {campaignId ? " and Add to Selected Campaign" : ""}
              </Button>
            </>
          ) : (
            <p>Use Discovery to research and review leads.</p>
          )}
          {importSummary ? (
            <p>
              MongoDB: {importSummary.mongoCreated} created,{" "}
              {importSummary.mongoUpdated} updated, {importSummary.failed || 0}{" "}
              failed.
            </p>
          ) : null}
        </DashboardCard>
      ) : null}

      <Modal
        isOpen={isCardCaptureOpen}
        onClose={closeCardCapture}
        title="Scan a business card"
        footer={
          <>
            <Button
              variant="outline"
              disabled={savingContact}
              onClick={closeCardCapture}
            >
              Cancel
            </Button>
            <Button
              loading={savingContact}
              disabled={!fullContactName(cardDraft)}
              onClick={saveBusinessCard}
            >
              {cardDuplicate?.status === "existing"
                ? "Update existing contact"
                : "Add to CRM"}
            </Button>
          </>
        }
      >
        <div className="business-card-capture">
          <section className="business-card-capture__intro">
            <span>Networking intake</span>
            <h3>Scan once. Review once. Keep the relationship connected.</h3>
            <p>
              Photograph a printed card, scan a digital-card QR code, or paste
              copied details. Review the result before it enters the CRM.
            </p>
          </section>
          <ol className="business-card-steps">
            <li>
              <strong>Take a clear photo</strong>
              <span>Keep the entire card inside the frame with good lighting.</span>
            </li>
            <li>
              <strong>Review the details</strong>
              <span>Correct anything unclear before saving.</span>
            </li>
            <li>
              <strong>Add to CRM</strong>
              <span>Duplicate checking runs before the final save.</span>
            </li>
          </ol>
          <div className="business-card-capture__methods">
            <div
              className={cardScanning ? "business-card-live is-active" : "business-card-live"}
            >
              <strong>Scan live QR</strong>
              <small>Use the rear camera on a phone when available.</small>
              <Button
                variant="outline"
                size="sm"
                onClick={cardScanning ? stopCardScanner : startCardScanner}
              >
                {cardScanning ? "Stop camera" : "Start camera"}
              </Button>
              <video
                className={
                  cardScanning
                    ? "business-card-camera is-active"
                    : "business-card-camera"
                }
                ref={cardVideoRef}
                autoPlay
                muted
                playsInline
              />
            </div>
            <label>
              <strong>Photograph or upload a card</strong>
              <small>Reads printed details and QR codes.</small>
              <span className="business-card-upload-button">
                Choose screenshot
              </span>
              <input
                className="business-card-file"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                capture="environment"
                onChange={(event) => readCardImage(event.target.files?.[0])}
              />
            </label>
            <div className="business-card-capture__paste">
              <strong>Paste copied contact details</strong>
              <small>
                Use this if the digital card offers “Copy contact,” “Share
                contact,” or a card link.
              </small>
              <Button
                variant="outline"
                size="sm"
                disabled={!cardRaw.trim()}
                onClick={() => acceptCardPayload(cardRaw)}
              >
                Read contact details
              </Button>
            </div>
          </div>
          <label className="business-card-raw">
            <span>Copied contact details or digital-card link</span>
            <textarea
              value={cardRaw}
              onChange={(event) => setCardRaw(event.target.value)}
              placeholder="Paste what you copied from the digital business card"
            />
          </label>
          {cardStatus ? (
            <p className="business-card-status" role="status">
              {cardStatus}
            </p>
          ) : null}
          {cardDuplicate ? (
            <section
              className={`business-card-match is-${cardDuplicate.status}`}
            >
              <strong>
                {cardDuplicate.status === "existing"
                  ? "Existing CRM contact found"
                  : "New CRM contact"}
              </strong>
              <span>
                {cardDuplicate.status === "existing"
                  ? `${cardDuplicate.existingContact?.name || "This person"} matches by ${cardDuplicate.matchReason}. Saving updates the existing record instead of creating a duplicate.`
                  : "No matching email, LinkedIn URL, phone number, or name/company record was found."}
              </span>
            </section>
          ) : null}
          <fieldset className="business-card-review">
            <legend>Review captured information</legend>
            <div className="contact-form-grid">
              {[
                ["firstName", "First name"],
                ["lastName", "Last name"],
                ["email", "Email"],
                ["phone", "Phone"],
                ["company", "Company"],
                ["title", "Job title"],
                ["linkedin", "LinkedIn"],
                ["website", "Website"],
                ["city", "City"],
                ["state", "State"],
                ["country", "Country"],
              ].map(([key, label]) => (
                <label className="form-field" key={key}>
                  <span>{label}</span>
                  <input
                    className="select-input"
                    value={cardDraft[key] || ""}
                    onChange={(event) => {
                      setCardDraft({ ...cardDraft, [key]: event.target.value });
                      setCardDuplicate(null);
                    }}
                    onBlur={() => reviewCardDraft(cardDraft)}
                  />
                </label>
              ))}
              <label className="form-field span-2">
                <span>Networking notes</span>
                <textarea
                  className="select-input"
                  value={cardDraft.notes || ""}
                  onChange={(event) =>
                    setCardDraft({ ...cardDraft, notes: event.target.value })
                  }
                  placeholder="Where you met, what you discussed, and the next step"
                />
              </label>
              <label className="form-field span-2">
                <span>Campaign or event</span>
                <select
                  className="select-input"
                  value={cardCampaignId}
                  onChange={(event) => setCardCampaignId(event.target.value)}
                >
                  <option value="">Keep unassigned</option>
                  {campaigns.map((campaign) => (
                    <option key={campaign._id} value={campaign._id}>
                      {campaign.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </fieldset>
          <p className="business-card-consent">
            <strong>Email safety:</strong> Receiving a business card does not
            automatically grant bulk-marketing consent. Growth Operator stores the contact
            for relationship follow-up; campaign permission remains off until it
            is recorded separately.
          </p>
        </div>
      </Modal>

      <Modal
        isOpen={isContactFormOpen}
        onClose={() => !savingContact && setContactFormOpen(false)}
        title="New Contact"
        footer={
          <>
            <Button
              variant="outline"
              disabled={savingContact}
              onClick={() => setContactFormOpen(false)}
            >
              Cancel
            </Button>
            <Button loading={savingContact} onClick={saveManualContact}>
              Save Contact
            </Button>
          </>
        }
      >
        <p className="contact-modal-intro">
          Only a usable name is required. Growth Operator saves this contact directly
          to MongoDB.
        </p>
        {contactEditorSections.map(([section, fields]) => (
          <fieldset className="contact-editor-section" key={section}>
            <legend>{section}</legend>
            <div className="contact-form-grid">
              {fields.map(([key, label]) => (
                <label
                  className={
                    key === "notes" ? "form-field span-2" : "form-field"
                  }
                  key={key}
                >
                  <span>{label}</span>
                  {key === "notes" ? (
                    <textarea
                      className="select-input"
                      value={manualContact[key]}
                      onChange={(event) =>
                        setManualContact({
                          ...manualContact,
                          [key]: event.target.value,
                        })
                      }
                    />
                  ) : (
                    <input
                      className="select-input"
                      value={manualContact[key]}
                      onChange={(event) =>
                        setManualContact({
                          ...manualContact,
                          [key]: event.target.value,
                        })
                      }
                    />
                  )}
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        <div className="contact-form-grid">
          <label className="form-field span-2">
            <span>Audience &amp; interests (comma-separated)</span>
            <input
              className="select-input"
              value={manualContact.audienceProfiles}
              onChange={(event) =>
                setManualContact({
                  ...manualContact,
                  audienceProfiles: event.target.value,
                })
              }
            />
          </label>
          <label className="form-field">
            <span>Campaign</span>
            <select
              className="select-input"
              value={importCampaignId}
              onChange={(event) => setImportCampaignId(event.target.value)}
            >
              <option value="">No campaign</option>
              {campaigns.map((campaign) => (
                <option key={campaign._id} value={campaign._id}>
                  {campaign.name}
                </option>
              ))}
            </select>
          </label>
          {manualContact.email ? (
            <label className="contact-qualify-choice span-2">
              <input
                type="checkbox"
                checked={manualContact.confirmEmailManually}
                onChange={(event) =>
                  setManualContact({
                    ...manualContact,
                    confirmEmailManually: event.target.checked,
                  })
                }
              />
              <span>
                <strong>I personally confirmed this email address</strong>
                <small>
                  Use this only when the person gave you the address directly or
                  you already confirmed it. Growth Operator records this as
                  owner-confirmed, not Emailable-verified.
                </small>
              </span>
            </label>
          ) : null}
          <label className="contact-qualify-choice span-2">
            <input
              type="checkbox"
              disabled={!manualContact.email}
              checked={manualContact.canReceiveCampaignEmail}
              onChange={(event) =>
                setManualContact({
                  ...manualContact,
                  canReceiveCampaignEmail: event.target.checked,
                })
              }
            />
            <span>
              <strong>Can receive campaign email</strong>
              <small>
                {manualContact.email
                  ? "Turn this on when this person gave permission. Growth Operator will include unsubscribe options automatically."
                  : "Enter an email address above to enable this setting."}
              </small>
            </span>
          </label>
        </div>
      </Modal>

      <Modal
        isOpen={isUploadOpen}
        onClose={() =>
          !savingContact && !verifyingEmails && setUploadOpen(false)
        }
        title={
          importWorkspaceMode === "prepare"
            ? "Prepare lead list / CSV"
            : "Import people"
        }
        size="workspace"
        footer={
          <>
            <Button
              variant="outline"
              disabled={savingContact || verifyingEmails}
              onClick={() => setUploadOpen(false)}
            >
              Cancel
            </Button>
            {importWorkspaceMode === "prepare" ? (
              <Button
                disabled={!importRows.length}
                onClick={downloadPreparedContactCsv}
              >
                Download CSV for email finder
              </Button>
            ) : (
              <Button
                loading={savingContact}
                disabled={
                  !importRows.length ||
                  !duplicatePreview ||
                  verifyingEmails ||
                  pendingEmailCount > 0
                }
                onClick={saveUploadedContacts}
              >
                {duplicatePreview?.existingContacts
                  ? `Add ${duplicatePreview.newContacts} new & update ${duplicatePreview.existingContacts}`
                  : "Import new contacts"}
              </Button>
            )}
          </>
        }
      >
        {importError ? (
          <p className="form-error" role="alert">
            {importError}
          </p>
        ) : null}
        {importWorkspaceMode === "import" ? (
          <section className="csv-campaign-first">
          <span className="csv-campaign-first__step">Step 1</span>
          <div>
            <strong>Choose where these people belong</strong>
            <small>
              Selecting a campaign now keeps this import together and removes a
              later assignment step.
            </small>
          </div>
          <select
            className="select-input"
            value={importCampaignId}
            onChange={(event) => setImportCampaignId(event.target.value)}
          >
            <option value="">Do not assign yet</option>
            {campaigns.map((campaign) => (
              <option key={campaign._id} value={campaign._id}>
                {campaign.name}
              </option>
            ))}
          </select>
          </section>
        ) : (
          <section className="lead-workspace-intro">
            <span>Preparation only</span>
            <strong>No contacts will be added to your CRM here.</strong>
            <p>
              Upload or paste a structured list, edit it, and download the clean
              CSV. After your email-finder fills it in, return through Import →
              Import completed CSV.
            </p>
          </section>
        )}
        {!importRows.length ? (
          <div className="crm-import-start">
            <div className="crm-import-steps">
              <div className="active">
                <span>2</span>
                <strong>Add people</strong>
                <small>Paste tabular rows or upload a file</small>
              </div>
              <div>
                <span>3</span>
                <strong>Verify emails</strong>
                <small>Review deliverability before saving</small>
              </div>
              <div>
                <span>4</span>
                <strong>Save to CRM</strong>
                <small>Contacts appear here immediately</small>
              </div>
            </div>
            <section className="lead-paste-intake">
              <header>
                <div>
                  <span>List preparation workspace</span>
                  <strong>Turn a contact table into a clean CSV</strong>
                  <small>
                    Paste rows with column headings. Growth Operator separates the people
                    into editable fields, flags incomplete records, and
                    prepares a CSV for your email-finder website. Nothing is
                    added to the CRM until you choose to import it.
                  </small>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={downloadContactTemplate}
                >
                  Download people template
                </Button>
              </header>
              <div
                className="lead-clipboard-target"
                tabIndex={0}
                role="button"
                aria-label="Paste copied contacts"
                onPaste={(event) => {
                  const pasted = event.clipboardData.getData("text/plain");
                  if (!pasted.trim()) return;
                  event.preventDefault();
                  setImportPasteText(pasted);
                  setImportFileName("People pasted into Growth Operator");
                  prepareImport(pasted, "csv");
                }}
              >
                <span className="lead-clipboard-target__icon">⌘V</span>
                <strong>Click here, then paste tabular contacts</strong>
                <p>
                  Growth Operator immediately converts the clipboard into spreadsheet
                  columns. The unstructured source text is not kept on screen.
                </p>
                <small>Mac: Command + V · Windows: Ctrl + V</small>
              </div>
            </section>
            <div className="lead-import-divider">
              <span>or upload a file</span>
            </div>
            <p>
              Upload a CSV exported from a spreadsheet or another CRM.
              Growth Operator recognizes common people columns automatically.
            </p>
            <label className="crm-file-drop">
              <input
                type="file"
                accept=".csv,.txt,text/csv,text/plain"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    setImportFileName(file.name);
                    const reader = new FileReader();
                    reader.onload = () =>
                      prepareImport(
                        reader.result,
                        "csv",
                      );
                    reader.readAsText(file);
                  }
                }}
              />
              <strong>Choose a CSV file</strong>
              <span>or drag a file here</span>
            </label>
          </div>
        ) : (
          <>
            <div className="crm-import-steps">
              <div>
                <span>✓</span>
                <strong>People loaded</strong>
                <small>{importRows.length} contacts found</small>
              </div>
              <div className="active">
                <span>3</span>
                <strong>Verify emails</strong>
                <small>Use Emailable only when needed</small>
              </div>
              <div>
                <span>4</span>
                <strong>Save to CRM</strong>
                <small>No Discovery approval required</small>
              </div>
            </div>
            <p>
              Rows parsed: {previewStats?.parsed || 0}; valid:{" "}
              {previewStats?.valid || 0}; missing usable name:{" "}
              {previewStats?.missingName || 0}; missing email:{" "}
              {previewStats?.missingEmail || 0}; malformed:{" "}
              {previewStats?.malformed || 0}.
            </p>
            <section className="contact-list-workbench">
              <div>
                <span>Working CSV</span>
                <strong>Edit, remove, and download before importing</strong>
                <p>
                  Download this clean file for your email-finder website. When
                  it returns the emails, upload that completed CSV back here so
                  Growth Operator keeps every field in the correct column.
                </p>
              </div>
              <Button variant="outline" onClick={downloadPreparedContactCsv}>
                Download CSV for email finder
              </Button>
            </section>
            {duplicatePreview ? (
              <section className="duplicate-preflight">
                <header>
                  <div>
                    <span>Duplicate protection complete</span>
                    <h3>
                      {duplicatePreview.newContacts} new ·{" "}
                      {duplicatePreview.existingContacts} already in Growth Operator ·{" "}
                      {duplicatePreview.duplicatesInFile} repeated in this
                      import
                    </h3>
                  </div>
                  <strong>
                    {duplicatePreview.newContacts
                      ? `${duplicatePreview.newContacts} new shown below`
                      : "No new contacts"}
                  </strong>
                </header>
                <p>
                  Growth Operator will never create another contact for a matched row.
                  Existing contacts are updated with useful new information.
                  Repeated rows in this file resolve to the same contact.
                </p>
                {duplicatePreview.rows.some((row) => row.status === "new") ? (
                  <section className="duplicate-preflight__new">
                    <h4>New contacts — these will be created</h4>
                    {duplicatePreview.rows
                      .filter((row) => row.status === "new")
                      .map((row) => (
                        <article key={`new-${row.index}`}>
                          <span className="duplicate-preflight__status is-new">
                            New
                          </span>
                          <div>
                            <strong>
                              {row.name ||
                                row.email ||
                                `CSV row ${row.rowNumber}`}
                            </strong>
                            <small>
                              {row.email || "No email"}
                              {row.company ? ` · ${row.company}` : ""}
                            </small>
                          </div>
                          <p>No matching contact was found in Growth Operator.</p>
                        </article>
                      ))}
                  </section>
                ) : null}
                {duplicatePreview.rows.some((row) => row.status !== "new") ? (
                  <details className="duplicate-preflight__matches">
                    <summary>
                      Review{" "}
                      {duplicatePreview.existingContacts +
                        duplicatePreview.duplicatesInFile}{" "}
                      existing or repeated rows
                    </summary>
                    <div className="duplicate-preflight__list">
                      {duplicatePreview.rows
                        .filter((row) => row.status !== "new")
                        .map((row) => (
                          <article key={`${row.status}-${row.index}`}>
                            <span
                              className={`duplicate-preflight__status is-${row.status}`}
                            >
                              {row.status === "existing"
                                ? "Already in Growth Operator"
                                : "Repeated in import"}
                            </span>
                            <div>
                              <strong>
                                {row.name ||
                                  row.email ||
                                  `Row ${row.rowNumber}`}
                              </strong>
                              <small>
                                {row.email ||
                                  row.company ||
                                  "No email or company"}
                              </small>
                            </div>
                            <p>
                              {row.status === "existing"
                                ? `Matches ${row.existingContact?.name || "an existing contact"} by ${row.matchReason}. This record will be updated, not copied.`
                                : `Matches row ${row.duplicateOfRow} by ${row.matchReason}.`}
                            </p>
                          </article>
                        ))}
                    </div>
                  </details>
                ) : null}
              </section>
            ) : (
              <section className="duplicate-preflight is-checking">
                <strong>Checking every row against Growth Operator…</strong>
                <span>
                  Import stays disabled until duplicate protection finishes.
                </span>
              </section>
            )}
            <p>Detected headers: {importHeaders.join(", ")}</p>
            <p>
              Recognized:{" "}
              {importHeaders
                .filter((header) => recognizedImportHeaders.includes(header))
                .join(", ") || "none"}
            </p>
            <p>
              Unrecognized columns:{" "}
              {importHeaders
                .filter((header) => !recognizedImportHeaders.includes(header))
                .join(", ") || "none"}
            </p>
            <p className="contact-modal-intro">
              <strong>What happens next:</strong>{" "}
              {importCampaignId
                ? "These contacts will be saved and assigned to the selected campaign."
                : "These contacts will be saved to Contacts without a campaign assignment."}{" "}
              Nothing is emailed during import.
            </p>
            <label className="contact-qualify-choice">
              <input
                type="checkbox"
                checked={importMarketingPermission}
                onChange={(event) =>
                  setImportMarketingPermission(event.target.checked)
                }
              />
              <span>
                <strong>Approve these people for campaign email</strong>
                <small>
                  Turn this on only when everyone in this import is eligible to
                  receive this campaign. Growth Operator applies it to the whole group and
                  adds unsubscribe options automatically.
                </small>
              </span>
            </label>
            {emailsToVerify.length ? (
              <div className="email-verification-panel">
                <div className="email-verification-heading">
                  <strong>Choose how to verify these emails</strong>
                  <p>
                    Imported verification can be used as provided, or you can run
                    an optional fresh Emailable check.
                  </p>
                </div>
                <div className="email-verification-choices">
                  {hasImportedVerification ? (
                    <label
                      className={
                        emailVerificationMode === "source" ? "active" : ""
                      }
                    >
                      <input
                        type="radio"
                        name="email-verification-mode"
                        value="source"
                        checked={emailVerificationMode === "source"}
                        onChange={() => setEmailVerificationMode("source")}
                      />
                      <span>
                        <strong>Use verification from this CSV</strong>
                        <small>
                          No Emailable credits.{" "}
                          {
                            Object.values(importedVerificationResults).filter(
                              (result) => result.state === "deliverable",
                            ).length
                          }{" "}
                          addresses are marked verified in the file.
                        </small>
                      </span>
                    </label>
                  ) : null}
                  <label
                    className={emailVerificationMode === "skip" ? "active" : ""}
                  >
                    <input
                      type="radio"
                      name="email-verification-mode"
                      value="skip"
                      checked={emailVerificationMode === "skip"}
                      onChange={() => {
                        setEmailVerificationMode("skip");
                        setVerificationProgress(null);
                      }}
                    />
                    <span>
                      <strong>Skip email verification</strong>
                      <small>
                        Save addresses as unverified without using credits.
                        Unverified addresses stay blocked from outreach.
                      </small>
                    </span>
                  </label>
                  <label
                    className={
                      emailVerificationMode === "emailable" ? "active" : ""
                    }
                  >
                    <input
                      type="radio"
                      name="email-verification-mode"
                      value="emailable"
                      checked={emailVerificationMode === "emailable"}
                      onChange={() => setEmailVerificationMode("emailable")}
                    />
                    <span>
                      <strong>Reverify with Emailable</strong>
                      <small>
                        Optional fresh check. Uses {emailsToVerify.length} live
                        credit{emailsToVerify.length === 1 ? "" : "s"} when
                        started.
                      </small>
                    </span>
                  </label>
                </div>
                {emailVerificationMode === "emailable" ? (
                  <Button
                    variant="outline"
                    loading={verifyingEmails}
                    disabled={verifyingEmails}
                    onClick={verifyImportedEmails}
                  >
                    {Object.keys(verificationResults).length
                      ? "Verify again"
                      : `Verify ${emailsToVerify.length} emails`}
                  </Button>
                ) : (
                  <p className="source-verification-note">
                    {emailVerificationMode === "source"
                      ? "Using the verification statuses already included in this CSV."
                      : "No external verification will run. These addresses will be saved as unverified and cannot be emailed."}
                  </p>
                )}
                {verificationProgress ? (
                  <div className="verification-progress">
                    <span
                      style={{
                        width: `${Math.min(100, Math.round((verificationProgress.processed / Math.max(1, verificationProgress.total)) * 100))}%`,
                      }}
                    />
                  </div>
                ) : null}
                {Object.keys(effectiveVerificationResults).length ? (
                  <p className="verification-summary">
                    Deliverable: {verificationCounts.deliverable || 0} · Risky:{" "}
                    {verificationCounts.risky || 0} · Undeliverable:{" "}
                    {verificationCounts.undeliverable || 0} · Unknown:{" "}
                    {verificationCounts.unknown || 0} · Pending:{" "}
                    {pendingEmailCount}
                  </p>
                ) : null}
                {verificationIssues.length ? (
                  <section className="verification-issues">
                    <h4>Email issues to review</h4>
                    {verificationIssues.map((issue) => (
                      <article key={issue.email}>
                        <span className={`verification-badge ${issue.state}`}>
                          {issue.state}
                        </span>
                        <div>
                          <strong>{issue.name}</strong>
                          <small>
                            {issue.email}
                            {issue.company ? ` · ${issue.company}` : ""} · CSV
                            row {issue.rowNumber}
                          </small>
                        </div>
                        <p>
                          {issue.reason === "invalid_format"
                            ? "This address is not formatted like a valid email. It will be saved for reference but blocked from outreach."
                            : issue.reason === "verification_skipped"
                              ? "Saved for reference; blocked from outreach until verified."
                            : issue.state === "risky"
                              ? "This address may bounce. It will be withheld until reviewed."
                              : issue.state === "unknown"
                                ? "Verification could not confirm this address. It will be withheld until reviewed."
                                : "This address was reported as undeliverable. It will be saved for reference but blocked from outreach."}
                        </p>
                      </article>
                    ))}
                  </section>
                ) : null}
              </div>
            ) : null}
            <div className="import-preview-heading">
              <p>
                <strong>
                  Previewing{" "}
                  {showAllImportRows
                    ? importRows.length
                    : Math.min(5, importRows.length)}{" "}
                  of {importRows.length} contacts.
                </strong>{" "}
                You can edit every cell before download or import.
              </p>
              {importRows.length > 5 ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowAllImportRows((current) => !current)}
                >
                  {showAllImportRows
                    ? "Show first 5"
                    : `Show all ${importRows.length}`}
                </Button>
              ) : null}
            </div>
            <div className="email-import-preview">
              <table>
                <thead>
                  <tr>
                    {importHeaders.map((header) => (
                      <th key={header}>
                        <span>Map to Growth Operator field</span>
                        <select
                          aria-label={`Map ${header} column to Growth Operator field`}
                          value={header}
                          onChange={(event) =>
                            remapImportHeader(header, event.target.value)
                          }
                        >
                          {[...new Set([header, ...recognizedImportHeaders])].map(
                            (field) => (
                              <option key={field} value={field}>
                                {field}
                              </option>
                            ),
                          )}
                        </select>
                      </th>
                    ))}
                    <th>Remove</th>
                  </tr>
                </thead>
                <tbody>
                  {importRows
                    .slice(0, showAllImportRows ? importRows.length : 5)
                    .map((row, rowIndex) => {
                      return (
                        <tr key={`working-contact-${rowIndex}`}>
                          {importHeaders.map((header) => {
                            const rawValue = String(row[header] || "").trim();
                            const value =
                              header.toLowerCase().includes("phone") &&
                              /request phone number/i.test(rawValue)
                                ? ""
                                : rawValue;
                            const result =
                              header === "Email"
                                ? effectiveVerificationResults[
                                    value.toLowerCase()
                                  ]
                                : null;
                            return (
                              <td key={header}>
                              <input
                                aria-label={`${header} for row ${rowIndex + 1}`}
                                value={value}
                                placeholder={header}
                                onChange={(event) =>
                                  updateImportCell(
                                    rowIndex,
                                    header,
                                    event.target.value,
                                  )
                                }
                                onBlur={() => refreshImportPreview(importRows)}
                              />
                              {header === "Email" && value ? (
                                <i
                                  className={`verification-badge ${result?.state || "pending"}`}
                                >
                                  {result?.state === "deliverable"
                                    ? "verified"
                                    : result?.state || "not verified"}
                                </i>
                              ) : null}
                              </td>
                            );
                          })}
                          <td>
                            <button
                              className="contact-workbench-remove"
                              type="button"
                              onClick={() => removeImportRow(rowIndex)}
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
            <p>
              {importRows.length} rows ready. Deliverable emails are saved.
              Risky, unknown, and undeliverable addresses are removed while the
              contact is retained and tagged for review.
            </p>
          </>
        )}
      </Modal>
      <Modal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete Contact Permanently"
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                try {
                  await deleteContact(deleteTarget._id);
                  setDeleteTarget(null);
                  await loadContacts();
                } catch (err) {
                  setError(
                    err.response?.data?.message || "Unable to delete contact",
                  );
                }
              }}
            >
              Delete permanently
            </Button>
          </>
        }
      >
        <p>
          Related outreach is protected. If outreach exists, deletion is blocked
          and its count is shown.
        </p>
        {deleteTarget ? (
          <p>
            Source:{" "}
            {deleteTarget.sourceProvider ||
              deleteTarget.sources?.join(", ") ||
              "manual"}
            ; created:{" "}
            {deleteTarget.createdAt
              ? new Date(deleteTarget.createdAt).toLocaleDateString()
              : "unknown"}
            ; campaign:{" "}
            {deleteTarget.campaignIds?.length ? "associated" : "none"}.
          </p>
        ) : null}
      </Modal>
      <Modal
        isOpen={Boolean(detailContact)}
        onClose={() => setDetailContact(null)}
        title={detailContact ? contactDisplayName(detailContact) : "Contact"}
      >
        {detailContact ? (
          <div className="contact-detail">
            <div className="contact-detail__summary">
              <div>
                <span>
                  {contactDisplayName(detailContact).slice(0, 1).toUpperCase()}
                </span>
                <p>
                  <strong>{contactDisplayName(detailContact)}</strong>
                  <small>
                    {isIntentContact(detailContact) ? "Public intent lead · research not finished" : detailContact.title || "Contact"}
                    {detailContact.company
                      ? ` at ${detailContact.company}`
                      : ""}
                  </small>
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => {
                  setContactEditMode("full");
                  setEditingContact({
                    ...detailContact,
                    ...contactNameParts(detailContact),
                  });
                  setDetailContact(null);
                }}
              >
                Edit contact
              </Button>
            </div>
            {isIntentContact(detailContact) ? (
              <section className="intent-contact-action-center">
                <header>
                  <span>Deal to Close follow-up</span>
                  <h3>This is a saved public signal—not a complete person yet</h3>
                  <p>Growth Operator kept the original post as evidence, but it will not treat a Reddit username as a real name or invent an email. Complete these steps in order.</p>
                </header>
                <ol>
                  <li className="is-done"><b>1</b><div><strong>Buyer intent reviewed</strong><span>You already said this signal may be worth following up.</span></div></li>
                  <li><b>2</b><div><strong>Research the real identity</strong><span>Jarvis looks for a name, company, role, and published business contact using supporting public sources.</span></div></li>
                  <li><b>3</b><div><strong>Review the generated email</strong><span>The Deal to Close draft includes both Eventbrite and Meetup links and remains unsent.</span></div></li>
                  <li><b>4</b><div><strong>Verify the contact method</strong><span>Only a verified email can move the reviewed draft into Outreach. You still approve every step.</span></div></li>
                </ol>
                <div className="intent-contact-action-center__actions">
                  <Button onClick={() => {
                    const sourceUrl = detailContact.website || "";
                    const prompt = `Research 1 prospect for the Deal to Close Bootcamp. Start with this exact public account and post: ${sourceUrl || detailContact.notes || "saved public intent signal"}. Determine whether public evidence supports the real adult person's name, business or company, and role. Find a visibly published business email or official public contact page only when evidence supports the same identity. Do not guess, infer identity from the username, or mark an email verified. If identity cannot be established, say so clearly and recommend only the public platform contact options.`;
                    const params = new URLSearchParams({ prompt, autostart: "1", task: "intent-identity", sourceUrl, leadLabel: "Saved Deal to Close lead", returnTo: `/discovery?tab=leads&signalId=${detailContact.providerContactId || ""}` });
                    setDetailContact(null);
                    navigate(`/jarvis?${params.toString()}`);
                  }}>Research identity with Jarvis</Button>
                  <Button variant="outline" onClick={() => {
                    setDetailContact(null);
                    navigate(`/discovery?tab=leads&signalId=${encodeURIComponent(detailContact.providerContactId || "")}`);
                  }}>Open intent lead & email</Button>
                  {detailContact.website ? <a href={detailContact.website} target="_blank" rel="noreferrer">Open original public evidence ↗</a> : null}
                </div>
                <p className="intent-contact-action-center__safety"><strong>No outreach has been sent.</strong> Missing fields are intentional until reliable public evidence is found.</p>
              </section>
            ) : null}
            {isUnsubscribed(detailContact) ? (
              <section className="contact-unsubscribe-alert" role="alert">
                <span>Do not email</span>
                <strong>This contact unsubscribed from campaign email.</strong>
                <p>
                  {unsubscribeSourceLabel(
                    detailContact.emailPreferences?.unsubscribeSource,
                  )}{" "}
                  on {unsubscribeDate(detailContact)}. Growth Operator will keep campaign
                  sending blocked unless the contact explicitly opts in again.
                </p>
              </section>
            ) : null}
            {contactDetailGroups.map(([group, fields]) => {
              const rows = fields.map(([field, label]) => [
                field,
                label,
                field === "name" ? contactDisplayName(detailContact) : detailValue(detailContact[field]),
              ]);
              return (
                <section className="contact-detail__group" key={group}>
                  <h3>{group}</h3>
                  <dl>
                    {rows.map(([field, label, value]) => {
                      const isLink =
                        value &&
                        ["linkedin", "website", "companyLinkedinUrl"].includes(
                          field,
                        );
                      return (
                        <div key={field}>
                          <dt>{label}</dt>
                          <dd className={value ? "" : "is-empty"}>
                            {isLink ? (
                              <a href={value} target="_blank" rel="noreferrer">
                                {value}
                              </a>
                            ) : (
                              value || "Not added"
                            )}
                          </dd>
                        </div>
                      );
                    })}
                  </dl>
                </section>
              );
            })}
            <section className="contact-detail__group">
              <h3>Campaigns</h3>
              {detailContact.campaignIds?.length ? (
                <ul className="contact-campaign-list">
                  {detailContact.campaignIds.map((id) => {
                    const campaign = campaigns.find(
                      (item) => String(item._id) === String(id?._id || id),
                    );
                    return (
                      <li key={String(id?._id || id)}>
                        {campaign?.name || id?.name || "Assigned campaign"}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p>Not assigned to a campaign yet.</p>
              )}
            </section>
          </div>
        ) : null}
      </Modal>
      <Modal
        isOpen={Boolean(editingContact)}
        onClose={() => setEditingContact(null)}
        title={
          contactEditMode === "audience"
            ? "Tell Growth Operator who this contact is"
            : "Edit contact & campaign"
        }
        footer={
          <>
            <Button variant="outline" onClick={() => setEditingContact(null)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                const commaFields = [
                  "tags",
                  "lists",
                  "departments",
                  "keywords",
                  "audienceProfiles",
                ];
                const payload = {
                  ...editingContact,
                  name: fullContactName(editingContact),
                  lastResearchedAt: new Date().toISOString(),
                };
                commaFields.forEach((field) => {
                  payload[field] = Array.isArray(editingContact[field])
                    ? editingContact[field]
                    : String(editingContact[field] || "")
                        .split(",")
                        .map((item) => item.trim())
                        .filter(Boolean);
                });
                await updateContact(editingContact._id, payload);
                setEditingContact(null);
                await loadContacts();
              }}
            >
              {contactEditMode === "audience"
                ? "Save audience information"
                : editingContact?.qualifyContact &&
                    editingContact?.campaignIds?.length &&
                    (editingContact?.emailStatus === "verified" ||
                      editingContact?.confirmEmailManually)
                  ? "Save & Add to Campaign"
                  : "Save Changes"}
            </Button>
          </>
        }
      >
        {editingContact ? (
          contactEditMode === "audience" ? (
            <>
              <div className="audience-editor-intro">
                <span>Audience unknown</span>
                <h3>
                  What would make{" "}
                  {editingContact.firstName || editingContact.name} relevant to
                  a future campaign?
                </h3>
                <p>
                  Add only information you know. Growth Operator uses these categories to
                  suggest the right campaigns—it will never guess from a name or
                  email.
                </p>
              </div>
              <div className="audience-editor">
                <label className="form-field span-2">
                  <span>Audience groups or interests</span>
                  <input
                    autoFocus
                    className="select-input"
                    placeholder="Example: Multifamily investor, entrepreneur, event host"
                    value={
                      Array.isArray(editingContact.audienceProfiles)
                        ? editingContact.audienceProfiles.join(", ")
                        : editingContact.audienceProfiles || ""
                    }
                    onChange={(event) =>
                      setEditingContact({
                        ...editingContact,
                        audienceProfiles: event.target.value,
                      })
                    }
                  />
                  <small>Separate multiple groups with commas.</small>
                </label>
                {(workspaceSettings.customContactFields || []).map((label) => {
                  const key = label
                    .toLowerCase()
                    .replace(/[^a-z0-9]+(.)/g, (_, character) =>
                      character.toUpperCase(),
                    );
                  return (
                    <label className="form-field" key={key}>
                      <span>{label}</span>
                      <input
                        className="select-input"
                        value={editingContact.additionalFields?.[key] || ""}
                        onChange={(event) =>
                          setEditingContact({
                            ...editingContact,
                            additionalFields: {
                              ...(editingContact.additionalFields || {}),
                              [key]: event.target.value,
                            },
                          })
                        }
                      />
                    </label>
                  );
                })}
                <label className="form-field">
                  <span>Industry (optional)</span>
                  <input
                    className="select-input"
                    placeholder="Example: Real estate"
                    value={editingContact.industry || ""}
                    onChange={(event) =>
                      setEditingContact({
                        ...editingContact,
                        industry: event.target.value,
                      })
                    }
                  />
                </label>
                <label className="form-field">
                  <span>Role or title (optional)</span>
                  <input
                    className="select-input"
                    placeholder="Example: Investor"
                    value={editingContact.title || ""}
                    onChange={(event) =>
                      setEditingContact({
                        ...editingContact,
                        title: event.target.value,
                      })
                    }
                  />
                </label>
                <label className="form-field span-2">
                  <span>Company (optional)</span>
                  <input
                    className="select-input"
                    value={editingContact.company || ""}
                    onChange={(event) =>
                      setEditingContact({
                        ...editingContact,
                        company: event.target.value,
                      })
                    }
                  />
                </label>
              </div>
            </>
          ) : (
            <>
              <p className="contact-modal-intro">
                <strong>
                  A name and a confirmed email are enough to add someone to a
                  campaign.
                </strong>{" "}
                Company, title, and industry are optional and can be completed
                later.
              </p>
              {contactEditorSections.map(([section, fields]) => (
                <fieldset className="contact-editor-section" key={section}>
                  <legend>{section}</legend>
                  <div className="contact-form-grid">
                    {fields.map(([field, label]) => (
                      <label
                        className={
                          field === "notes" ? "form-field span-2" : "form-field"
                        }
                        key={field}
                      >
                        <span>{label}</span>
                        {field === "notes" ? (
                          <textarea
                            className="select-input"
                            value={editingContact[field] || ""}
                            onChange={(event) =>
                              setEditingContact({
                                ...editingContact,
                                [field]: event.target.value,
                              })
                            }
                          />
                        ) : (
                          <input
                            className="select-input"
                            value={
                              Array.isArray(editingContact[field])
                                ? editingContact[field].join(", ")
                                : editingContact[field] || ""
                            }
                            onChange={(event) =>
                              setEditingContact({
                                ...editingContact,
                                [field]: event.target.value,
                              })
                            }
                          />
                        )}
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
              <div className="contact-form-grid">
                <label className="form-field span-2">
                  <span>Audience &amp; interests</span>
                  <input
                    className="select-input"
                    placeholder="Example: Multifamily investors, networking event hosts"
                    value={
                      Array.isArray(editingContact.audienceProfiles)
                        ? editingContact.audienceProfiles.join(", ")
                        : editingContact.audienceProfiles || ""
                    }
                    onChange={(event) =>
                      setEditingContact({
                        ...editingContact,
                        audienceProfiles: event.target.value,
                      })
                    }
                  />
                  <small>
                    Add only categories you know or the contact has confirmed.
                    These are used for automatic campaign matching.
                  </small>
                </label>
                <fieldset className="contact-decision-panel span-2">
                  <legend>Three steps to add this contact</legend>
                  <div className="contact-decision-step">
                    <span className="contact-decision-step__number">1</span>
                    {editingContact.emailStatus === "verified" ? (
                      <div>
                        <strong>Email confirmed</strong>
                        <small>This address is ready for outreach.</small>
                      </div>
                    ) : editingContact.email ? (
                      <label className="contact-qualify-choice">
                        <input
                          type="checkbox"
                          checked={Boolean(editingContact.confirmEmailManually)}
                          onChange={(event) =>
                            setEditingContact({
                              ...editingContact,
                              confirmEmailManually: event.target.checked,
                            })
                          }
                        />
                        <span>
                          <strong>I know this email address is correct</strong>
                          <small>
                            Use this when the person gave you the address or you
                            already confirmed it yourself. No verification
                            credit will be used.
                          </small>
                        </span>
                      </label>
                    ) : (
                      <div>
                        <strong>Add an email address</strong>
                        <small>
                          An email is required before this contact can receive a
                          campaign.
                        </small>
                      </div>
                    )}
                  </div>
                  <div className="contact-decision-step">
                    <span className="contact-decision-step__number">2</span>
                    <label className="contact-qualify-choice">
                      <input
                        type="checkbox"
                        checked={Boolean(editingContact.qualifyContact)}
                        onChange={(event) =>
                          setEditingContact({
                            ...editingContact,
                            qualifyContact: event.target.checked,
                          })
                        }
                      />
                      <span>
                        <strong>This person is a good fit</strong>
                        <small>
                          Include this contact in the audience for the selected
                          campaign.
                        </small>
                      </span>
                    </label>
                  </div>
                  <div className="contact-decision-step">
                    <span className="contact-decision-step__number">3</span>
                    <label className="form-field">
                      <span>Choose the campaign</span>
                      <select
                        className="select-input"
                        value={String(editingContact.campaignIds?.[0] || "")}
                        onChange={(event) =>
                          setEditingContact({
                            ...editingContact,
                            campaignIds: event.target.value
                              ? [event.target.value]
                              : [],
                          })
                        }
                      >
                        <option value="">Select a campaign</option>
                        {campaigns.map((campaign) => (
                          <option key={campaign._id} value={campaign._id}>
                            {campaign.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {editingContact.campaignIds?.[0] ? (() => {
                    const selectedCampaign = campaigns.find((campaign) => String(campaign._id) === String(editingContact.campaignIds[0]));
                    const campaignKey = String(editingContact.campaignIds[0]);
                    const availableTemplates = Object.entries(selectedCampaign?.emailAudienceTemplates || {}).filter(([, template]) => template?.status === "approved");
                    return <div className="contact-decision-step">
                      <span className="contact-decision-step__number">4</span>
                      <label className="form-field">
                        <span>Email template for this contact</span>
                        <select
                          className="select-input"
                          value={String(editingContact.campaignTemplateOverrides?.[campaignKey] || "auto")}
                          onChange={(event) => setEditingContact({
                            ...editingContact,
                            campaignTemplateOverrides: {
                              ...(editingContact.campaignTemplateOverrides || {}),
                              [campaignKey]: event.target.value,
                            },
                          })}
                        >
                          <option value="auto">Automatic—match from title and audience data</option>
                          <option value="general">Main campaign template</option>
                          {availableTemplates.map(([key, template]) => <option key={key} value={key}>{template.audienceLabel || key}</option>)}
                        </select>
                        <small>Automatic routing checks title, industry, company, audience profiles, tags, keywords, lists, seniority, and notes. If nothing matches, the main campaign template is used.</small>
                      </label>
                    </div>;
                  })() : null}
                  {!editingContact.email ? (
                    <p className="contact-decision-warning">
                      Add an email address to continue.
                    </p>
                  ) : editingContact.emailStatus !== "verified" &&
                    !editingContact.confirmEmailManually ? (
                    <p className="contact-decision-warning">
                      Check “I know this email address is correct” to continue
                      without using a verification credit.
                    </p>
                  ) : !editingContact.qualifyContact ? (
                    <p className="contact-decision-guidance">
                      Check “This person is a good fit” if you want to include
                      them.
                    </p>
                  ) : !editingContact.campaignIds?.length ? (
                    <p className="contact-decision-guidance">
                      Choose which campaign should receive this contact.
                    </p>
                  ) : (
                    <p className="contact-decision-success">
                      Ready to save. This contact will be added to the selected
                      campaign. No email will be sent yet.
                    </p>
                  )}
                </fieldset>
              </div>
            </>
          )
        ) : null}
      </Modal>
    </div>
  );
}
