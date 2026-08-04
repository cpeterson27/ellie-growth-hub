import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Button from "../components/Button.jsx";
import DashboardCard from "../components/DashboardCard.jsx";
import Modal from "../components/Modal.jsx";
import {
  createAudienceDefinition,
  createResearchMonitor,
  createMarketResearchPlan,
  deleteContact,
  discoverAudienceOrganizations,
  fetchCampaigns,
  fetchContacts,
  fetchDiscoveryTemplates,
  fetchMarketResearchResults,
  fetchMarketResearchHistory,
  fetchPeopleResearchPreviews,
  fetchMarketResearchSources,
  fetchResearchMonitors,
  fetchResearchMonitorPresets,
  fetchResearchActivity,
  fetchResearchNotifications,
  clearResearchNotifications,
  updateResearchNotification,
  fetchIntentSignals,
  fetchMarketResearchJob,
  saveDiscoveryTemplates,
  startExternalMarketResearch,
  runResearchMonitor,
  updateResearchMonitor,
  updateIntentSignal,
  convertIntentSignal,
  generateIntentEmailDraft,
  updateIntentEmailDraft,
  transferIntentEmailDraft,
  updateContact,
} from "../services/api.js";
import "./Discovery.css";
import "./DiscoveryTargeting.css";
import "./DiscoveryReview.css";
import "./DiscoveryExperience.css";

const EMPTY_TARGET = {
  name: "",
  industries: "",
  keywords: "",
  locations: "",
  employeeMin: "",
  employeeMax: "",
  revenueMin: "",
  revenueMax: "",
};

const splitValues = (value) => String(value || "")
  .split(/[,;\n]+/)
  .map((item) => item.trim())
  .filter(Boolean);

const displayText = (value) => String(value || "")
  .replace(/<[^>]*>/g, " ")
  .replace(/&(?:#32|nbsp);/gi, " ")
  .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
  .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/\s+/g, " ").trim();

const publicAccount = (signal) => {
  const raw = `${signal?.authorName || ""} ${signal?.authorUrl || ""}`;
  const reddit = raw.match(/(?:reddit\.com\/user\/|\/?u\/)([A-Za-z0-9_-]+)/i)?.[1];
  if (reddit) return { label: `u/${reddit}`, url: `https://www.reddit.com/user/${reddit}` };
  const label = displayText(signal?.authorName).replace(/https?:\/\/\S+/g, "").trim();
  return { label: label || "Account not available", url: /^https:\/\//i.test(signal?.authorUrl || "") ? signal.authorUrl : "" };
};

const friendlySourceState = (state) => ({ healthy: "Working", rate_limited: "Temporarily limited", blocked: "Temporarily unavailable", failed: "Retrying automatically", never: "Waiting for first check" }[state] || "Checking");
const friendlyMonitorMessage = (message) => String(message || "").replace(/;?\s*\d+ source failure\(s\)\.?/i, ". Some optional sources will retry automatically.").replace(/;?\s*\d+ optional source retry\(s\)\.?/i, ". Some optional sources will retry automatically.");
const friendlyActivityMessage = (item) => item.type === "source_failure" ? "An optional source was unavailable and will retry automatically." : friendlyMonitorMessage(item.message);

const examples = [
  "Find multifamily property managers in Florida and Texas with 10–100 employees",
  "Find independent event venues in Sacramento that serve business groups",
  "Find real estate investment firms in the United States focused on acquisitions",
];

function buildAudiencePayload(target) {
  return {
    name: target.name || `Market research · ${new Date().toLocaleDateString()}`,
    description: "Organization research created inside Growth Operator.",
    source: "manual",
    criteria: {
      keywords: splitValues(target.keywords),
      industries: splitValues(target.industries),
      locations: splitValues(target.locations),
      employeeRange: {
        min: target.employeeMin === "" ? null : Number(target.employeeMin),
        max: target.employeeMax === "" ? null : Number(target.employeeMax),
      },
      revenueRange: {
        min: target.revenueMin || null,
        max: target.revenueMax || null,
      },
      minimumScore: 0,
      targetTier: null,
    },
  };
}

export default function Discovery() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [prospects, setProspects] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [target, setTarget] = useState(EMPTY_TARGET);
  const [targetPreset, setTargetPreset] = useState("custom");
  const [marketQuestion, setMarketQuestion] = useState("");
  const [marketPlan, setMarketPlan] = useState(null);
  const [planning, setPlanning] = useState(false);
  const [campaignId, setCampaignId] = useState("");
  const [query, setQuery] = useState("");
  const [emailFilter, setEmailFilter] = useState("verified");
  const [notice, setNotice] = useState("");
  const [running, setRunning] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [researchResult, setResearchResult] = useState(null);
  const [researchOrganizations, setResearchOrganizations] = useState([]);
  const [researchSource, setResearchSource] = useState(null);
  const [externalJob, setExternalJob] = useState(null);
  const [externalRunning, setExternalRunning] = useState(false);
  const [researchHistory, setResearchHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [openingHistoryId, setOpeningHistoryId] = useState("");
  const [peoplePreviews, setPeoplePreviews] = useState([]);
  const [peoplePreviewsLoading, setPeoplePreviewsLoading] = useState(false);
  const [openPeoplePreviewId, setOpenPeoplePreviewId] = useState("");
  const [monitors, setMonitors] = useState([]);
  const [intentSignals, setIntentSignals] = useState([]);
  const [monitorSaving, setMonitorSaving] = useState(false);
  const [monitorRunningId, setMonitorRunningId] = useState("");
  const [signalBusyId, setSignalBusyId] = useState("");
  const [activeTab, setActiveTab] = useState(() => searchParams.get("tab") || "company");
  const [monitorPresets, setMonitorPresets] = useState([]);
  const [monitorActivity, setMonitorActivity] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showMonitorSetup, setShowMonitorSetup] = useState(false);
  const [leadView, setLeadView] = useState("new");
  const [qualityEditingId, setQualityEditingId] = useState("");
  const [qualitySaving, setQualitySaving] = useState(false);
  const [qualityDraft, setQualityDraft] = useState({ query: "", keywords: "", negativeKeywords: "" });
  const [peopleSearchPrompt, setPeopleSearchPrompt] = useState("Find 20 owners, founders, real estate investors, or business decision-makers in the United States who are likely able to purchase a ticket for the August 22 online event. Exclude minors, students, job seekers, and people without evidence of a real business or investment role.");
  const [draftSignal, setDraftSignal] = useState(null);
  const [draftCampaignId, setDraftCampaignId] = useState("");
  const [draftEditor, setDraftEditor] = useState(null);
  const [draftBusy, setDraftBusy] = useState(false);
  const [selectedSources, setSelectedSources] = useState(["bing_web", "bing_news", "gdelt", "sec_form_d", "bluesky", "hacker_news", "stack_exchange", "reddit_rss", "duckduckgo"]);
  const [monitorDraft, setMonitorDraft] = useState({
    name: "Nationwide event buyer intent",
    query: "People in the United States discussing leaving a W-2 job, starting or buying a business, building wealth through real estate, scaling a company, needing business systems, coaching, or an entrepreneurial community",
    keywords: "leave my W-2, quit my job, start a business, buy a business, real estate investor, multifamily, build wealth, business systems, entrepreneur, business coach, scale my business",
    negativeKeywords: "minor, high school, student assignment, homework, hypothetical, no money, can't afford, job seeker, hiring, promotion, fictional, video game",
    feedUrls: "",
    intervalMinutes: 60,
    intentCategories: [],
  });

  useEffect(() => {
    const question = String(searchParams.get("question") || "").trim();
    if (question) setMarketQuestion(question);
    const tab = String(searchParams.get("tab") || "").trim();
    if (["company", "monitoring", "leads", "people", "saved"].includes(tab)) setActiveTab(tab);
  }, [searchParams]);

  useEffect(() => {
    if (!showNotifications) return undefined;
    const closeOnEscape = (event) => { if (event.key === "Escape") setShowNotifications(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [showNotifications]);

  const loadProspects = async () => {
    const response = await fetchContacts({ status: "prospect", limit: 500 });
    setProspects(Array.isArray(response?.data) ? response.data.filter(Boolean) : []);
  };

  const loadResearchHistory = async () => {
    try {
      setHistoryLoading(true);
      const response = await fetchMarketResearchHistory(50);
      setResearchHistory(response.history || []);
    } catch {
      setNotice("Unable to load saved research history.");
    } finally {
      setHistoryLoading(false);
    }
  };

  const loadPeoplePreviews = async () => {
    try {
      setPeoplePreviewsLoading(true);
      const response = await fetchPeopleResearchPreviews(20);
      setPeoplePreviews(response.previews || []);
    } catch {
      setNotice("Unable to load staged people research.");
    } finally {
      setPeoplePreviewsLoading(false);
    }
  };

  const loadAutomaticResearch = async () => {
    try {
      const [monitorResponse, signalResponse, activityResponse, notificationResponse] = await Promise.all([fetchResearchMonitors(), fetchIntentSignals({ limit: 150 }), fetchResearchActivity({ limit: 100 }), fetchResearchNotifications()]);
      setMonitors(monitorResponse.monitors || []);
      setIntentSignals(signalResponse.signals || []);
      const focusedSignalId = String(searchParams.get("signalId") || "");
      if (focusedSignalId) {
        const focusedSignal = (signalResponse.signals || []).find((item) => String(item._id) === focusedSignalId);
        setActiveTab("leads");
        setLeadView(focusedSignal?.status === "qualified" ? "qualified" : "all");
      }
      setMonitorActivity(activityResponse.activity || []);
      setNotifications(notificationResponse.notifications || []);
    } catch {
      setNotice("Unable to load automatic intent monitoring.");
    }
  };

  useEffect(() => {
    loadProspects().catch(() => setNotice("Unable to load prospects."));
    fetchCampaigns().then((items) => setCampaigns(Array.isArray(items) ? items : [])).catch(() => {});
    fetchDiscoveryTemplates().then((data) => setTemplates(data.templates || [])).catch(() => {});
    fetchMarketResearchSources().then((data) => setResearchSource(data.sources?.[0] || null)).catch(() => {});
    fetchResearchMonitorPresets().then((data) => setMonitorPresets(data.presets || [])).catch(() => {});
    loadResearchHistory();
    loadPeoplePreviews();
    loadAutomaticResearch();
    const refreshHistory = window.setInterval(() => {
      loadResearchHistory();
      loadPeoplePreviews();
      loadAutomaticResearch();
    }, 15000);
    return () => window.clearInterval(refreshHistory);
  }, []);

  const createMonitor = async () => {
    try {
      setMonitorSaving(true);
      await createResearchMonitor({
        ...monitorDraft,
        keywords: splitValues(monitorDraft.keywords),
        negativeKeywords: splitValues(monitorDraft.negativeKeywords),
        locations: ["United States"],
        feedUrls: splitValues(monitorDraft.feedUrls),
        sources: selectedSources,
        maxResultsPerSource: 35,
      });
      setNotice("Nationwide monitoring started. Jarvis will keep checking public sources in the background.");
      await loadAutomaticResearch();
    } catch (error) {
      setNotice(error.response?.data?.error || "Unable to start automatic monitoring.");
    } finally { setMonitorSaving(false); }
  };

  const applyMonitorPreset = (preset) => {
    setMonitorDraft((current) => ({ ...current, name: preset.name, query: preset.query, keywords: (preset.intentCategories || []).flatMap((category) => category.phrases || []).join(", "), negativeKeywords: (preset.negativeKeywords || []).join(", "), intervalMinutes: preset.intervalMinutes || 30, intentCategories: preset.intentCategories || [] }));
    setActiveTab("monitoring");
    setNotice("August 22 nationwide preset loaded. Every phrase remains editable before you start it.");
  };

  const toggleDraftSource = (source) => setSelectedSources((current) => current.includes(source) ? current.filter((item) => item !== source) : [...current, source]);

  const toggleExistingSource = async (monitor, source) => {
    const sources = (monitor.sources || []).includes(source) ? monitor.sources.filter((item) => item !== source) : [...(monitor.sources || []), source];
    await updateResearchMonitor(monitor._id, { sources });
    await loadAutomaticResearch();
  };

  const openQualityEditor = (monitor) => {
    setQualityEditingId(String(monitor._id));
    setQualityDraft({ query: monitor.query || "", keywords: (monitor.keywords || []).join("\n"), negativeKeywords: (monitor.negativeKeywords || []).join("\n") });
  };

  const saveLeadQuality = async (monitor) => {
    try {
      setQualitySaving(true);
      await updateResearchMonitor(monitor._id, { query: qualityDraft.query, keywords: splitValues(qualityDraft.keywords), negativeKeywords: splitValues(qualityDraft.negativeKeywords) });
      await runResearchMonitor(monitor._id);
      setQualityEditingId("");
      setNotice("Lead-quality rules saved. A fresh check is queued with your improved audience definition.");
      await loadAutomaticResearch();
    } catch (error) { setNotice(error.response?.data?.error || "Unable to save the lead-quality rules."); }
    finally { setQualitySaving(false); }
  };

  const markNotificationRead = async (notification) => {
    await updateResearchNotification(notification._id, true);
    setNotifications((items) => items.map((item) => item._id === notification._id ? { ...item, readAt: new Date().toISOString() } : item));
  };

  const openNotification = async (notification) => {
    await markNotificationRead(notification);
    setShowNotifications(false);
    if (["high_score", "published_email", "qualified_lead"].includes(notification.type)) {
      setActiveTab("leads");
      setLeadView(notification.type === "qualified_lead" ? "qualified" : "all");
    } else {
      setActiveTab("monitoring");
    }
  };

  const clearNotifications = async () => {
    await clearResearchNotifications();
    setNotifications([]);
    setShowNotifications(false);
    setNotice("Notifications cleared. Monitoring and leads were not changed.");
  };

  const visibleSignals = intentSignals.filter((signal) => leadView === "all" ? signal.status !== "dismissed" : signal.status === leadView);

  const runMonitorNow = async (monitorId) => {
    try {
      setMonitorRunningId(monitorId);
      await runResearchMonitor(monitorId);
      setNotice("Monitoring run started. Results will appear here automatically.");
      window.setTimeout(loadAutomaticResearch, 5000);
    } catch (error) { setNotice(error.response?.data?.error || "Unable to run this monitor."); }
    finally { setMonitorRunningId(""); }
  };

  const toggleMonitor = async (monitor) => {
    await updateResearchMonitor(monitor._id, { enabled: !monitor.enabled });
    await loadAutomaticResearch();
  };

  const reviewSignal = async (signal, status) => {
    try {
      setSignalBusyId(signal._id);
      await updateIntentSignal(signal._id, status);
      setNotice(status === "qualified" ? "Saved as a possible lead. Next, review the personalized Deal to Close email draft. Nothing was sent or added to the CRM." : "Removed from your active review queue as not a fit.");
      await loadAutomaticResearch();
      if (status === "qualified") {
        setLeadView("qualified");
        openEmailDraft({ ...signal, status: "qualified" });
      }
    } finally { setSignalBusyId(""); }
  };

  const addSignalToCrm = async (signal) => {
    let name = /^(?:\/?u\/|@|https?:\/\/)/i.test(String(signal.authorName || "").trim()) ? "" : signal.authorName || "";
    if (!name) name = window.prompt("Enter this person's name before adding the lead to the CRM:", "") || "";
    if (!name.trim()) return;
    try {
      setSignalBusyId(signal._id);
      await convertIntentSignal(signal._id, { name, company: signal.identityResolution?.status === "supported" ? (signal.organizationName || signal.organizationDomain || "") : "" });
      setNotice(`${name} was added to the CRM as a needs-research lead. No outreach was sent.`);
      await loadAutomaticResearch();
      await loadProspects();
    } catch (error) { setNotice(error.response?.data?.error || "Unable to add this signal to the CRM."); }
    finally { setSignalBusyId(""); }
  };

  const openEmailDraft = (signal) => {
    const existing = signal.emailDrafts?.[0] || null;
    const eligibleCampaigns = campaigns.filter((campaign) => campaign.campaignKind !== "program");
    setDraftSignal(signal);
    setDraftEditor(existing ? { ...existing } : null);
    setDraftCampaignId(String(existing?.campaignId || eligibleCampaigns[0]?._id || ""));
  };

  const researchSignalIdentity = (signal) => {
    const account = publicAccount(signal);
    const prompt = `Research 1 prospect for the Deal to Close Bootcamp. Start with this exact public account ${account.label} and post: ${signal.sourceUrl}. Determine whether public evidence supports the real adult person's name, business or company, and role. Find a visibly published business email or official public contact page only when evidence supports the same identity. Do not guess, infer identity from the username, or mark an email verified. If identity cannot be established, say so clearly and recommend only the public platform contact options.`;
    const params = new URLSearchParams({ prompt, autostart: "1", task: "intent-identity", sourceUrl: signal.sourceUrl || account.url || "", leadLabel: account.label, returnTo: `/discovery?tab=leads&signalId=${signal._id}` });
    navigate(`/jarvis?${params.toString()}`);
  };

  const generateEmailDraft = async () => {
    if (!draftSignal?._id || !draftCampaignId) return;
    try {
      setDraftBusy(true);
      const response = await generateIntentEmailDraft(draftSignal._id, draftCampaignId);
      setDraftEditor(response.draft);
      setNotice("Personalized draft created with both Eventbrite and Meetup links. Nothing was sent.");
    } catch (error) { setNotice(error.response?.data?.error || "Unable to create the email draft."); }
    finally { setDraftBusy(false); }
  };

  const saveReviewedEmailDraft = async () => {
    if (!draftSignal?._id || !draftEditor?._id) return;
    try {
      setDraftBusy(true);
      const response = await updateIntentEmailDraft(draftSignal._id, draftEditor._id, { subject: draftEditor.subject, body: draftEditor.body, status: "reviewed" });
      setDraftEditor(response.draft);
      setNotice("Draft saved as reviewed. It is still unsent and has not entered Outreach.");
      await loadAutomaticResearch();
    } catch (error) { setNotice(error.response?.data?.error || "Unable to save the reviewed draft."); }
    finally { setDraftBusy(false); }
  };

  const moveDraftToOutreach = async () => {
    if (!draftSignal?._id || !draftEditor?._id) return;
    try {
      setDraftBusy(true);
      const response = await transferIntentEmailDraft(draftSignal._id, draftEditor._id);
      setNotice(response.message || "Draft moved to Outreach. Nothing was sent.");
      setDraftSignal(null);
      navigate(`/outreach?campaignId=${draftEditor.campaignId}`);
    } catch (error) { setNotice(error.response?.data?.error || "Unable to move this draft to Outreach."); }
    finally { setDraftBusy(false); }
  };

  useEffect(() => {
    if (window.location.hash !== "#people-research-previews") return;
    const scrollTimer = window.setTimeout(() => {
      document.getElementById("people-research-previews")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
    return () => window.clearTimeout(scrollTimer);
  }, []);

  const openSavedResearch = async (entry) => {
    try {
      setOpeningHistoryId(String(entry._id));
      const resultList = await fetchMarketResearchResults(entry._id);
      setResearchOrganizations(resultList.organizations || []);
      setResearchResult({
        organizationsFound: resultList.organizations?.length || 0,
        organizationsCreated: entry.job?.statistics?.created || 0,
        organizationsUpdated: entry.job?.statistics?.updated || 0,
      });
      setTarget((current) => ({ ...current, name: entry.name || current.name }));
      setNotice(`Opened ${entry.name}. ${resultList.organizations?.length || 0} ranked organizations are available.`);
      window.setTimeout(() => document.getElementById("ranked-research-results")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (error) {
      setNotice(error.response?.data?.error || "Unable to open this saved research list.");
    } finally {
      setOpeningHistoryId("");
    }
  };

  const filtered = useMemo(() => prospects.filter((item) => {
    const text = [item?.name, item?.company, item?.email].filter(Boolean).join(" ").toLowerCase();
    return (!query || text.includes(query.toLowerCase()))
      && (!campaignId || item?.campaignIds?.some((id) => String(id) === campaignId))
      && (emailFilter === "all" || (emailFilter === "verified" ? item?.emailStatus === "verified" : item?.emailStatus !== "verified"));
  }), [prospects, query, campaignId, emailFilter]);

  const setField = (field, value) => setTarget((current) => ({ ...current, [field]: value }));

  const buildResearchPlan = async () => {
    if (!marketQuestion.trim()) return;
    try {
      setPlanning(true);
      setNotice("");
      const response = await createMarketResearchPlan(marketQuestion);
      const plan = response.plan;
      setMarketPlan(plan);
      setTarget((current) => ({
        ...current,
        name: plan.name || current.name,
        industries: (plan.criteria?.industries || []).join(", "),
        keywords: (plan.criteria?.keywords || []).join(", "),
        locations: (plan.criteria?.locations || []).join("; "),
        employeeMin: plan.criteria?.employeeRange?.min ?? "",
        employeeMax: plan.criteria?.employeeRange?.max ?? "",
      }));
      setTargetPreset("custom");
      setNotice(plan.compilerWarning || "Research plan created. Review the evidence requirements and criteria before running it.");
    } catch (error) {
      setNotice(error.response?.data?.error || "Growth Operator could not build this research plan.");
    } finally {
      setPlanning(false);
    }
  };

  const selectTemplate = (id) => {
    setTargetPreset(id);
    const template = templates.find((item) => item.id === id);
    setTarget(template ? { ...EMPTY_TARGET, ...template } : { ...EMPTY_TARGET });
  };

  const saveTemplate = async () => {
    const name = target.name.trim();
    if (!name) return setNotice("Name this research profile before saving it.");
    const id = targetPreset === "custom" ? (globalThis.crypto?.randomUUID?.() || `template-${Date.now()}`) : targetPreset;
    const next = targetPreset === "custom"
      ? [...templates, { ...target, id }]
      : templates.map((item) => item.id === id ? { ...target, id } : item);
    try {
      setSavingTemplate(true);
      const data = await saveDiscoveryTemplates(next);
      setTemplates(data.templates || []);
      setTargetPreset(id);
      setNotice("Research profile saved.");
    } catch (error) {
      setNotice(error.response?.data?.error || "Unable to save this research profile.");
    } finally {
      setSavingTemplate(false);
    }
  };

  const runResearch = async () => {
    if (!splitValues(target.industries).length && !splitValues(target.keywords).length) {
      return setNotice("Add at least one industry or business keyword.");
    }
    if (target.employeeMin !== "" && target.employeeMax !== "" && Number(target.employeeMin) > Number(target.employeeMax)) {
      return setNotice("Minimum employees cannot be greater than maximum employees.");
    }
    try {
      setRunning(true);
      setNotice("");
      const created = await createAudienceDefinition(buildAudiencePayload(target));
      const result = await discoverAudienceOrganizations(created.audience._id);
      setResearchResult(result);
      const resultList = await fetchMarketResearchResults(created.audience._id);
      setResearchOrganizations(resultList.organizations || []);
      setNotice(`${result.organizationsFound || 0} organizations found; ${result.organizationsCreated || 0} added and ${result.organizationsUpdated || 0} updated.`);
    } catch (error) {
      setNotice(error.response?.data?.error || "Growth Operator could not complete this research run.");
    } finally {
      setRunning(false);
    }
  };

  const runExternalResearch = async () => {
    if (!marketPlan) return setNotice("Build and review a research plan first.");
    try {
      setExternalRunning(true);
      const response = await startExternalMarketResearch({ question: marketQuestion, plan: marketPlan, maxResults: 1000 });
      setExternalJob(response.job);
      loadResearchHistory();
      if (response.job.status === "source_required") {
        setNotice(response.job.error);
        return;
      }
      setNotice("External research started. You can keep this page open while Growth Operator collects and deduplicates results.");
      for (let attempt = 0; attempt < 90; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const current = await fetchMarketResearchJob(response.job._id);
        setExternalJob(current.job);
        if (["completed", "failed", "source_required"].includes(current.job.status)) {
          if (current.job.status === "completed") {
            const resultList = await fetchMarketResearchResults(current.job.audienceId);
            setResearchOrganizations(resultList.organizations || []);
            setResearchResult({ organizationsFound: current.job.statistics.received, organizationsCreated: current.job.statistics.created, organizationsUpdated: current.job.statistics.updated });
            setNotice(`Research complete: ${current.job.statistics.created} new and ${current.job.statistics.updated} refreshed organizations.`);
            loadResearchHistory();
          } else setNotice(current.job.error || "External research did not complete.");
          break;
        }
      }
    } catch (error) {
      setNotice(error.response?.data?.error || "Growth Operator could not start external research.");
    } finally {
      setExternalRunning(false);
    }
  };

  const exportResearchList = () => {
    if (!researchOrganizations.length) return;
    const headers = ["Company Name", "Website", "Industry", "Location", "Employees", "Fit Score", "Fit Tier", "Evidence URLs", "Last Verified"];
    const escape = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const rows = researchOrganizations.map((organization) => [
      organization.name,
      organization.website || organization.domain,
      organization.industry,
      organization.location,
      organization.employeeCount,
      organization.audienceScore,
      organization.audienceTier,
      (organization.researchEvidence || []).map((evidence) => evidence.sourceUrl).filter(Boolean).join(" | "),
      organization.lastResearchVerifiedAt,
    ]);
    const csv = [headers, ...rows].map((row) => row.map(escape).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(target.name || "growth-operator-research-list").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const approve = async (prospect) => {
    await updateContact(prospect._id, { status: "active" });
    setProspects((items) => items.filter((item) => item?._id !== prospect._id));
    setNotice("Prospect approved and moved to Contacts.");
  };

  const remove = async () => {
    if (!deleteTarget?._id) return;
    await deleteContact(deleteTarget._id);
    setProspects((items) => items.filter((item) => item?._id !== deleteTarget._id));
    setDeleteTarget(null);
    setNotice("Prospect deleted permanently.");
  };

  return <div className="discovery-page">
    <header className="discovery-header">
      <div><span className="eyebrow">Growth Operator Market Intelligence</span><h1>Find the right companies and buyer intent</h1><p>Five focused workspaces keep company discovery, continuous monitoring, lead decisions, people research, and saved work clear.</p></div>
      <button className="notification-button" type="button" onClick={() => setShowNotifications((value) => !value)} aria-expanded={showNotifications}>Notifications <span>{notifications.filter((item) => !item.readAt).length}</span></button>
    </header>

    {showNotifications ? <div className="notification-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowNotifications(false); }}><section className="notification-panel" role="dialog" aria-modal="true" aria-label="Monitoring notifications"><header><div><strong>Notifications</strong><span>{notifications.filter((item) => !item.readAt).length} unread · select one to open its destination</span></div><div className="notification-panel__controls">{notifications.length ? <button type="button" onClick={clearNotifications}>Clear all</button> : null}<button type="button" onClick={() => setShowNotifications(false)} aria-label="Close notifications">Close ×</button></div></header><div className="notification-list">{notifications.length ? notifications.slice(0, 20).map((item) => <button type="button" key={item._id} className={item.readAt ? "is-read" : ""} onClick={() => openNotification(item)}><strong>{item.type === "source_failure" ? "Some sources are retrying" : item.title}</strong><span>{item.type === "source_failure" ? "Other sources still completed. Select this to open monitoring details." : item.message}</span><small>{new Date(item.createdAt).toLocaleString()} · Open { ["high_score", "published_email", "qualified_lead"].includes(item.type) ? "Live Leads" : "Intent Monitoring"}</small></button>) : <p>No notifications yet.</p>}</div></section></div> : null}

    <nav className="discovery-tabs" aria-label="Organization discovery workspaces">{[["company", "Company Discovery"], ["monitoring", "Intent Monitoring"], ["leads", "Live Leads"], ["people", "People Research"], ["saved", "Saved Searches"]].map(([id, label]) => <button key={id} type="button" className={activeTab === id ? "is-active" : ""} onClick={() => setActiveTab(id)}>{label}{id === "leads" && intentSignals.filter((item) => item.status === "new").length ? <span>{intentSignals.filter((item) => item.status === "new").length}</span> : null}</button>)}</nav>

    {notice ? <div className="notice-banner" role="status">{notice}</div> : null}

    {activeTab === "company" ? <><DashboardCard title="Ask Growth Operator to find a market">
      <div className="discovery-agent-prompt">
        <textarea value={marketQuestion} onChange={(event) => setMarketQuestion(event.target.value)} placeholder="Example: Find hair salons in San Francisco with 2+ locations" />
        <Button loading={planning} disabled={!marketQuestion.trim()} onClick={buildResearchPlan}>Build research plan</Button>
      </div>
      <div className="discovery-query-examples">{examples.map((example) => <button key={example} type="button" onClick={() => setMarketQuestion(example)}>{example}</button>)}</div>
      <p className="discovery-safety-note"><strong>Professional standard:</strong> results must show their source and freshness. An email is never labeled verified unless a verification check supports it.</p>
      {marketPlan ? <section className="market-plan-review">
        <header><div><span>{marketPlan.compiler === "openai" ? "AI-structured plan" : "Growth Operator rules-based plan"}</span><strong>{marketPlan.name}</strong></div><small>Review before research</small></header>
        <p>{marketPlan.summary}</p>
        <div><article><strong>Ranking</strong><span>{(marketPlan.rankingDimensions || []).join(" · ")}</span></article><article><strong>Needs attention</strong><span>{[...(marketPlan.assumptions || []), ...(marketPlan.unresolved || [])].join(" ") || "No unresolved criteria."}</span></article></div>
      </section> : null}
    </DashboardCard></> : null}

    {activeTab === "monitoring" ? <><section className="monitoring-guide"><div><span>Runs automatically</span><h2>Growth Operator listens for likely adult buyers</h2><p>It scans public sources, removes minors and low-value noise, and sends plausible opportunities to Live Leads. Nothing is contacted or added to your CRM automatically.</p></div><ol><li><strong>1</strong><span><b>Listen</b>Checks public conversations while your browser is closed.</span></li><li><strong>2</strong><span><b>Filter</b>Rejects minors, students, promotions, job seekers, and no-budget posts.</span></li><li><strong>3</strong><span><b>You decide</b>Review evidence and approve one lead at a time.</span></li></ol></section>

    <DashboardCard title="Your active monitors" action={<div className="monitor-header-actions"><Button variant="outline" onClick={loadAutomaticResearch}>Refresh</Button><Button onClick={() => setShowMonitorSetup((value) => !value)}>{showMonitorSetup ? "Close setup" : "Create a monitor"}</Button></div>}>
      {showMonitorSetup ? <section className="monitor-setup-panel"><header><span>New monitor</span><h3>Choose what Growth Operator should listen for</h3><p>Start with the August 22 preset, then edit any language you want.</p></header>{monitorPresets.map((preset) => <button className="monitor-preset" type="button" key={preset.id} onClick={() => applyMonitorPreset(preset)}><span>Recommended starting point</span><strong>{preset.name}</strong><small>Nationwide adult buyer intent for your online event</small></button>)}<div className="intent-monitor-builder">
        <label><span>Monitor name</span><input value={monitorDraft.name} onChange={(event) => setMonitorDraft((current) => ({ ...current, name: event.target.value }))} /></label>
        <label><span>Check frequency</span><select value={monitorDraft.intervalMinutes} onChange={(event) => setMonitorDraft((current) => ({ ...current, intervalMinutes: Number(event.target.value) }))}><option value={15}>Every 15 minutes</option><option value={30}>Every 30 minutes</option><option value={60}>Every hour</option><option value={360}>Every 6 hours</option><option value={1440}>Daily</option></select></label>
        <label className="span-2"><span>Describe the adult buyer you want</span><textarea value={monitorDraft.query} onChange={(event) => setMonitorDraft((current) => ({ ...current, query: event.target.value }))} /></label>
        <label className="span-2"><span>Buying-intent phrases</span><textarea value={monitorDraft.keywords} onChange={(event) => setMonitorDraft((current) => ({ ...current, keywords: event.target.value }))} /></label>
        {monitorDraft.intentCategories?.length ? <div className="intent-category-editor span-2">{monitorDraft.intentCategories.map((category, categoryIndex) => <label key={`${category.name}-${categoryIndex}`}><span>{category.name}</span><textarea value={(category.phrases || []).join("\n")} onChange={(event) => setMonitorDraft((current) => ({ ...current, intentCategories: current.intentCategories.map((item, index) => index === categoryIndex ? { ...item, phrases: splitValues(event.target.value) } : item) }))} /></label>)}</div> : null}
        <label className="span-2"><span>Always ignore</span><textarea value={monitorDraft.negativeKeywords} onChange={(event) => setMonitorDraft((current) => ({ ...current, negativeKeywords: event.target.value }))} /></label>
        <details className="advanced-monitor-options span-2"><summary>Advanced source options</summary><label><span>Additional public feed URLs</span><textarea value={monitorDraft.feedUrls} onChange={(event) => setMonitorDraft((current) => ({ ...current, feedUrls: event.target.value }))} placeholder="One URL per line" /></label><div className="intent-source-chips">{[["bing_web", "Bing web"], ["bing_news", "Bing News"], ["gdelt", "News index"], ["sec_form_d", "SEC filings"], ["bluesky", "Bluesky"], ["hacker_news", "Hacker News"], ["stack_exchange", "Stack Exchange"], ["reddit_rss", "Reddit"], ["duckduckgo", "DuckDuckGo"]].map(([id, label]) => <button type="button" className={selectedSources.includes(id) ? "is-on" : ""} key={id} onClick={() => toggleDraftSource(id)}>{selectedSources.includes(id) ? "On · " : "Off · "}{label}</button>)}</div></details>
      </div>
      <div className="monitor-setup-actions"><Button loading={monitorSaving} disabled={!monitorDraft.query.trim()} onClick={createMonitor}>Start this monitor</Button><small>You can pause it at any time. No outreach is ever sent.</small></div></section> : null}
      {monitors.length ? <div className="intent-monitor-list">{monitors.map((monitor) => { const failures = (monitor.sourceHealth || []).filter((health) => ["failed", "blocked", "rate_limited"].includes(health.state)); return <article key={monitor._id}>
        <header className="monitor-card-header"><div><span className={`intent-monitor-state is-${monitor.lastRunStatus}`}>{monitor.enabled ? "Monitoring is on" : "Monitoring paused"}</span><strong>{monitor.name}</strong></div><div className="intent-monitor-actions"><Button size="sm" onClick={() => openQualityEditor(monitor)}>Improve lead quality</Button><Button size="sm" variant="outline" loading={monitorRunningId === monitor._id} disabled={!monitor.enabled || monitor.lastRunStatus === "running"} onClick={() => runMonitorNow(monitor._id)}>Check now</Button><Button size="sm" variant="outline" onClick={() => toggleMonitor(monitor)}>{monitor.enabled ? "Pause" : "Resume"}</Button></div></header>
        <div className="monitor-card-summary"><div><strong>{monitor.totals?.signalsFound || 0}</strong><span>raw public matches processed—not leads</span></div><div><strong>{monitor.nextRunAt ? new Date(monitor.nextRunAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "—"}</strong><span>next automatic check</span></div><div><strong>{failures.length}</strong><span>optional sources retrying</span></div></div>
        <div className="monitor-count-explainer"><strong>Where are the actual leads?</strong><span>This raw total includes duplicates, rejected posts, and the same item seen again. Only deduplicated adult-buyer candidates appear in Live Leads. There is nothing to review inside the raw total itself.</span><button type="button" onClick={() => setActiveTab("leads")}>Review actual Live Leads</button></div>
        <p className="monitor-last-result">Latest check: {friendlyMonitorMessage(monitor.lastRunMessage) || "Waiting for the first check."}</p>
        {qualityEditingId === String(monitor._id) ? <section className="quality-editor"><header><div><span>Improve future results</span><h3>Teach Growth Operator what a good lead looks like</h3></div><button type="button" onClick={() => setQualityEditingId("")}>Close</button></header><div><label><span>Who is a good buyer?</span><textarea value={qualityDraft.query} onChange={(event) => setQualityDraft((current) => ({ ...current, query: event.target.value }))} /><small>Describe an adult with the role, business situation, and reason they could benefit from the event.</small></label><label><span>Language that signals buying interest</span><textarea value={qualityDraft.keywords} onChange={(event) => setQualityDraft((current) => ({ ...current, keywords: event.target.value }))} /><small>Use specific phrases such as “looking for a business coach” or “need systems to scale.”</small></label><label><span>Always reject</span><textarea value={qualityDraft.negativeKeywords} onChange={(event) => setQualityDraft((current) => ({ ...current, negativeKeywords: event.target.value }))} /><small>Minors, schoolwork, no-budget posts, promotions, and job seekers are also blocked automatically.</small></label></div><footer><Button loading={qualitySaving} onClick={() => saveLeadQuality(monitor)}>Save and check again</Button><span>This changes future monitoring. It does not contact anyone.</span></footer></section> : null}
        <details className="monitor-details"><summary>Advanced: source health</summary><p>These are raw posts and pages checked—not qualified leads. Large numbers, such as Stack Exchange, mostly become rejected noise. Temporary limits are retried automatically and do not stop successful sources.</p><div className="source-health-list">{(monitor.sourceHealth || []).map((health) => <div key={health.source} className={`is-${health.state}`}><span className="source-health-dot"></span><strong>{health.source.replaceAll("_", " ")}</strong><span>{friendlySourceState(health.state)}</span><small>{health.resultsCollected || 0} raw items checked (not leads)</small><small>{health.lastSuccessfulCheck ? `Checked ${new Date(health.lastSuccessfulCheck).toLocaleString()}` : "Will retry automatically"}</small><button type="button" onClick={() => toggleExistingSource(monitor, health.source)}>{(monitor.sources || []).includes(health.source) ? "Disable" : "Enable"}</button></div>)}</div></details>
      </article>; })}</div> : <div className="friendly-empty"><strong>No monitors yet</strong><p>Create one above and Growth Operator will start listening automatically.</p></div>}
    </DashboardCard>

    <details className="activity-drawer"><summary>View monitoring activity</summary><p className="activity-help">This is an optional audit trail. Source retries are informational; you do not need to fix them.</p><div className="monitor-timeline">{monitorActivity.length ? monitorActivity.slice(0, 20).map((item) => <article key={item._id} className={`is-${item.type}`}><span></span><div><strong>{friendlyActivityMessage(item)}</strong><small>{new Date(item.createdAt).toLocaleString()}</small></div></article>) : <p>No activity yet.</p>}</div></details></> : null}

    {activeTab === "leads" ? <><section className="lead-review-hero"><div><span>Your decision queue</span><h2>Potential buyers worth a human look</h2><p>Growth Operator already removed minors, student questions, promotions, job seekers, and obvious no-budget posts. These remaining signals still require your judgment.</p></div><div className="lead-review-stats"><div><strong>{intentSignals.filter((signal) => signal.status === "new").length}</strong><span>need a decision</span></div><div><strong>{intentSignals.filter((signal) => signal.status === "qualified").length}</strong><span>worth following up</span></div><div><strong>{intentSignals.filter((signal) => signal.publishedEmails?.length).length}</strong><span>with a published email</span></div></div></section>
    <section className="lead-workflow"><div><strong>1. Read the need</strong><span>Confirm this is a real current problem—not advice, promotion, or general content.</span></div><div><strong>2. Open the evidence</strong><span>The source account is only a public username; it is not a verified real identity.</span></div><div><strong>3. Save or reject</strong><span>Saving keeps it for later CRM research. It does not contact or import anyone.</span></div></section>
    <DashboardCard title="Buyer-intent review" action={<div className="lead-view-tabs"><button type="button" className={leadView === "new" ? "is-active" : ""} onClick={() => setLeadView("new")}>Needs a decision</button><button type="button" className={leadView === "qualified" ? "is-active" : ""} onClick={() => setLeadView("qualified")}>Saved possible leads</button><button type="button" className={leadView === "all" ? "is-active" : ""} onClick={() => setLeadView("all")}>All active</button></div>}>
      {visibleSignals.length ? <div className="intent-signal-list">{visibleSignals.map((signal) => { const account = publicAccount(signal); return <article key={signal._id} className={`is-${signal.status}`}>
        <div className="signal-priority"><span>Priority</span><strong>{signal.score >= 75 ? "High" : signal.score >= 55 ? "Medium" : "Review"}</strong><small>{signal.score}/100 match</small></div>
        <div className="intent-signal-main"><div><span>{signal.source.replaceAll("_", " ")}</span><small>{signal.publishedAt ? new Date(signal.publishedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "New"}</small></div><h3>{displayText(signal.title) || "Public buyer-intent signal"}</h3><p>{displayText(signal.excerpt) || "Open the original source to review the context."}</p><div className="signal-why"><strong>Why it scored {signal.score}/100</strong><span>{(signal.scoreReasons || []).slice(0, 3).join(" · ") || "A specific current need matched your audience rules."}</span></div><a href={signal.sourceUrl} target="_blank" rel="noreferrer">View original public post ↗</a></div>
        <aside className="signal-contact"><span>Source account</span>{account.url ? <a href={account.url} target="_blank" rel="noreferrer">{account.label} ↗</a> : <strong>{account.label}</strong>}<small>Public username from the post—not a verified real name. Open it only to review public context.</small>{signal.organizationName || signal.organizationDomain ? <><span>Organization</span><strong>{signal.identityResolution?.status === "supported" ? (signal.organizationName || signal.organizationDomain) : "Not established"}</strong></> : null}{signal.publishedEmails?.length ? <div className="published-email-note">Published email found · still unverified</div> : null}</aside>
        <div className="intent-signal-actions">{["qualified", "converted"].includes(signal.status) ? <><div className="intent-next-step"><span>Next step</span><strong>{!signal.emailDrafts?.length ? "Create the Deal to Close email" : !signal.crmContact ? "Find the real person and contact method" : signal.crmContact.emailStatus !== "verified" ? "Verify a contact email" : "Review and move the draft to Outreach"}</strong><small>Nothing is sent automatically.</small></div><div className="intent-action-row"><Button size="sm" onClick={() => openEmailDraft(signal)}>{signal.emailDrafts?.length ? "Review generated email" : "Generate Deal to Close email"}</Button><Button size="sm" variant="outline" onClick={() => researchSignalIdentity(signal)}>Research identity & email</Button>{signal.status === "converted" ? <Button size="sm" variant="outline" onClick={() => navigate(`/contacts?tab=attention&search=${encodeURIComponent(signal.crmContact?.name || "Identity research needed")}`)}>Open contact next steps</Button> : <Button size="sm" variant="outline" disabled={signalBusyId === signal._id} onClick={() => addSignalToCrm(signal)}>Add researched person to CRM</Button>}</div><ol className="intent-progress"><li className="is-done">Intent approved</li><li className={signal.emailDrafts?.length ? "is-done" : ""}>Email drafted</li><li className={signal.crmContact ? "is-done" : ""}>Identity added</li><li className={signal.crmContact?.emailStatus === "verified" ? "is-done" : ""}>Email verified</li><li className={signal.emailDrafts?.some((draft) => draft.status === "transferred") ? "is-done" : ""}>Ready in Outreach</li></ol><small>Every draft includes Eventbrite and Meetup. You review it before Outreach, and Outreach still does not send automatically.</small></> : <><Button size="sm" disabled={signalBusyId === signal._id} onClick={() => reviewSignal(signal, "qualified")}>Yes—prepare follow-up</Button><small>Saves the lead and opens a personalized unsent email draft as the next step.</small></>}<Button size="sm" variant="outline" disabled={signalBusyId === signal._id || signal.status === "converted"} onClick={() => reviewSignal(signal, "dismissed")}>Not a buyer</Button></div>
      </article>; })}</div> : <div className="friendly-empty"><strong>{leadView === "new" ? "You’re caught up" : "No leads in this view"}</strong><p>{leadView === "new" ? "Growth Operator will place the next plausible adult buyer here after the automatic filters run." : "Change the view above or wait for the next monitoring check."}</p></div>}
    </DashboardCard></> : null}

    {activeTab === "saved" ? <><DashboardCard title="Saved research and prospect lists" action={<Button variant="outline" loading={historyLoading} onClick={loadResearchHistory}>Refresh</Button>}>
      {researchHistory.length ? <div className="research-history-list">{researchHistory.map((entry) => {
        const jobStatus = entry.job?.status || (entry.totalOrgs ? "completed" : "saved");
        const statistics = entry.job?.statistics || {};
        return <article key={entry._id} className={`research-history-item is-${jobStatus}`}>
          <div className="research-history-main"><span>{jobStatus.replaceAll("_", " ")}</span><strong>{entry.name}</strong><p>{entry.description || entry.job?.question || "Saved prospect list"}</p></div>
          <div className="research-history-counts"><strong>{entry.totalOrgs || statistics.received || 0}</strong><span>organizations</span><small>{entry.job ? `${statistics.created || 0} new · ${statistics.updated || 0} refreshed` : entry.source}</small></div>
          <div className="research-history-actions"><small>{new Date(entry.createdAt).toLocaleString()}</small><Button size="sm" variant="outline" loading={openingHistoryId === String(entry._id)} onClick={() => openSavedResearch(entry)}>Open results</Button></div>
          {entry.job?.error ? <p className="research-history-error">{entry.job.error}</p> : null}
        </article>;
      })}</div> : <div className="table-state table-state--empty">No saved research yet. Research started in ChatGPT or on this page will appear here automatically.</div>}
    </DashboardCard></> : null}

    {activeTab === "people" ? <div id="people-research-previews" className="people-research-workspace">
      <section className="people-search-guide"><div><span>People Research</span><h2>Find named decision-makers at real organizations</h2><p>This is different from Intent Monitoring. Instead of listening for public conversations, Jarvis searches public websites for owners, founders, executives, and other roles you describe.</p></div><div className="people-search-steps"><div><strong>1</strong><span><b>Describe the people</b>Include role, industry, location, and how many you want.</span></div><div><strong>2</strong><span><b>Jarvis researches</b>It finds public evidence, company details, and published emails when available.</span></div><div><strong>3</strong><span><b>You review</b>Nothing enters the CRM until you select and confirm each import.</span></div></div></section>
      <DashboardCard title="Start a people search"><div className="people-search-launcher"><label><span>Tell Jarvis exactly who to find</span><textarea value={peopleSearchPrompt} onChange={(event) => setPeopleSearchPrompt(event.target.value)} /></label><div><Button disabled={!peopleSearchPrompt.trim()} onClick={() => navigate(`/jarvis?prompt=${encodeURIComponent(peopleSearchPrompt)}`)}>Open this request in Jarvis</Button><small>Jarvis will show the request before searching. Public emails remain unverified.</small></div></div><div className="people-search-examples"><span>Good requests include:</span><button type="button" onClick={() => setPeopleSearchPrompt("Find 20 owners of property-management companies in the United States with evidence of an active business. Exclude students, job seekers, and companies without a public website.")}>Property-management owners</button><button type="button" onClick={() => setPeopleSearchPrompt("Find 20 founders or CEOs of established service businesses in the United States who may need systems to scale. Require a public leadership or company source.")}>Established service-business founders</button><button type="button" onClick={() => setPeopleSearchPrompt("Find 20 adult real estate investors or multifamily principals in the United States with a public company, portfolio, or leadership page.")}>Real estate investors</button></div></DashboardCard>
      <DashboardCard title="Jarvis research previews" action={<Button variant="outline" loading={peoplePreviewsLoading} onClick={loadPeoplePreviews}>Refresh</Button>}>
        <p className="people-preview-intro">People found by Growth Operator stay here for review before they become CRM contacts. A published email is still unverified and cannot be used for outreach until it passes your verification rules.</p>
        {peoplePreviews.length ? <div className="people-preview-list">{peoplePreviews.map((preview) => {
          const isOpen = openPeoplePreviewId === String(preview._id);
          return <article key={preview._id} className={`people-preview-batch is-${preview.status}`}>
            <header>
              <div><span>{preview.status.replaceAll("_", " ")}</span><strong>{preview.name}</strong><small>{new Date(preview.updatedAt).toLocaleString()} · {preview.source === "chatgpt_public_web" ? "ChatGPT connection" : "Jarvis"} public-web research</small></div>
              <div className="people-preview-summary"><strong>{preview.summary?.total || preview.people?.length || 0}</strong><span>people</span><small>{preview.summary?.newContacts || 0} new · {preview.summary?.existingContacts || 0} existing · {preview.summary?.publishedEmails || 0} published emails</small></div>
              <Button size="sm" variant="outline" onClick={() => setOpenPeoplePreviewId(isOpen ? "" : String(preview._id))}>{isOpen ? "Hide people" : "Review people"}</Button>
            </header>
            {isOpen ? <div className="people-preview-rows">{(preview.people || []).map((person, index) => <div className="people-preview-person" key={`${person.firstName}-${person.lastName}-${person.company}-${index}`}>
              <div><strong>{[person.firstName, person.lastName].filter(Boolean).join(" ") || "Unnamed person"}</strong><span>{[person.title, person.company].filter(Boolean).join(" · ") || "Role needs review"}</span></div>
              <div><small>Email</small><strong>{person.email || "Not publicly listed"}</strong><span className={`people-email-state is-${person.emailStatus}`}>{String(person.emailStatus || "missing").replaceAll("_", " ")}</span></div>
              <div><small>CRM review</small><strong>{String(person.reviewStatus || "new").replaceAll("_", " ")}</strong>{person.matchReason ? <span>{person.matchReason}</span> : null}</div>
              <div className="people-preview-evidence"><small>Evidence</small><p>{person.evidenceSummary || "Public source attached for manual review."}</p><a href={person.evidenceUrl} target="_blank" rel="noreferrer">Open source</a></div>
            </div>)}</div> : null}
            {preview.status !== "imported" ? <p className="people-preview-footnote">Staged only—these people have not been added to Contacts. Import remains a separate confirmed step.</p> : <p className="people-preview-footnote is-imported">Imported as needs-review prospects. Open Prospect review below to qualify them.</p>}
          </article>;
        })}</div> : <div className="table-state table-state--empty">No staged people previews yet. Ask Jarvis to find public-web decision-makers; the preview will appear here automatically.</div>}
      </DashboardCard>
    </div> : null}

    {activeTab === "company" ? <><DashboardCard title="External research source">
      <div className={`research-source-status ${researchSource?.configured ? "is-ready" : "is-needed"}`}>
        <div><span>{researchSource?.configured ? "Connected" : "Source required"}</span><strong>{researchSource?.name || "Checking source…"}</strong><p>{researchSource?.message || "Growth Operator is checking the external-data configuration."}</p></div>
        <Button loading={externalRunning} disabled={!marketPlan || !researchSource?.configured} onClick={runExternalResearch}>Discover up to 1,000 organizations</Button>
      </div>
      {externalJob ? <div className="research-job-progress"><strong>{externalJob.status.replace(/_/g, " ")}</strong><span>{externalJob.statistics?.received || 0} received · {externalJob.statistics?.created || 0} new · {externalJob.statistics?.updated || 0} refreshed · {externalJob.statistics?.duplicates || 0} duplicates</span></div> : null}
    </DashboardCard>

    <DashboardCard title="Research criteria" action={<select value={targetPreset} onChange={(event) => selectTemplate(event.target.value)}><option value="custom">New profile</option>{templates.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}>
      <div className="target-grid">
        <label><span>Profile name</span><input value={target.name} onChange={(event) => setField("name", event.target.value)} placeholder="Sacramento event venues" /></label>
        <label><span>Industries</span><input value={target.industries} onChange={(event) => setField("industries", event.target.value)} placeholder="Hospitality, Event Services" /></label>
        <label><span>Business keywords</span><input value={target.keywords} onChange={(event) => setField("keywords", event.target.value)} placeholder="conference venue, corporate events" /></label>
        <label><span>Locations</span><input value={target.locations} onChange={(event) => setField("locations", event.target.value)} placeholder="Sacramento, CA" /></label>
        <label><span>Minimum employees</span><input type="number" min="0" value={target.employeeMin} onChange={(event) => setField("employeeMin", event.target.value)} /></label>
        <label><span>Maximum employees</span><input type="number" min="0" value={target.employeeMax} onChange={(event) => setField("employeeMax", event.target.value)} /></label>
      </div>
      <div className="target-actions"><Button variant="outline" loading={savingTemplate} onClick={saveTemplate}>Save profile</Button><Button loading={running} onClick={runResearch}>Match saved organizations</Button></div>
      {researchResult ? <div className="discovery-result-summary"><strong>{researchResult.organizationsFound || 0} matched organizations</strong><span>{researchResult.organizationsCreated || 0} new · {researchResult.organizationsUpdated || 0} refreshed</span></div> : null}
    </DashboardCard>

    {researchResult ? <div id="ranked-research-results"><DashboardCard title="Ranked organization list" action={<Button variant="outline" disabled={!researchOrganizations.length} onClick={exportResearchList}>Export CSV</Button>}>
      {researchOrganizations.length ? <div className="market-result-list">{researchOrganizations.map((organization, index) => <article key={organization._id}>
        <span className="market-result-rank">{index + 1}</span>
        <div><strong>{organization.name}</strong><small>{[organization.industry, organization.location].filter(Boolean).join(" · ") || "Business details need research"}</small><p>{(organization.scoreReasons || []).join(" · ") || "No scoring evidence recorded yet."}</p></div>
        <div className="market-result-score"><strong>{organization.audienceScore || 0}</strong><span>{organization.audienceTier || "unscored"}</span></div>
        <div className="market-result-evidence"><strong>{organization.researchEvidence?.length || 0} sources</strong><span>{organization.lastResearchVerifiedAt ? `Checked ${new Date(organization.lastResearchVerifiedAt).toLocaleDateString()}` : "Verification needed"}</span></div>
      </article>)}</div> : <div className="table-state table-state--empty">No stored organizations match this plan yet. Growth Operator did not manufacture results.</div>}
    </DashboardCard></div> : null}</> : null}

    {activeTab === "people" ? <DashboardCard title="CRM import review" action={<div className="discovery-review-filters"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search staged people" /><select value={campaignId} onChange={(event) => setCampaignId(event.target.value)}><option value="">All campaigns</option>{campaigns.map((campaign) => <option key={campaign._id} value={campaign._id}>{campaign.name}</option>)}</select><select value={emailFilter} onChange={(event) => setEmailFilter(event.target.value)}><option value="verified">Verified email</option><option value="review">Needs review</option><option value="all">All</option></select></div>}>
      <p className="crm-review-explainer"><strong>When to use this:</strong> People appear here only after a People Research import has been confirmed and staged for final CRM approval. Approve moves one person into Contacts. Delete removes that staged person. Neither action sends outreach.</p>
      {filtered.length ? <div className="discovery-review-list">{filtered.map((prospect) => <article key={prospect._id}><div><strong>{prospect.name || "Unnamed prospect"}</strong><span>{[prospect.title, prospect.company].filter(Boolean).join(" · ") || "Company details needed"}</span><small>{prospect.email || "No email"} · {prospect.emailStatus || "unverified"}</small></div><div><Button size="sm" onClick={() => approve(prospect)}>Approve into Contacts</Button><Button size="sm" variant="outline" onClick={() => setDeleteTarget(prospect)}>Remove</Button></div></article>)}</div> : <div className="friendly-empty"><strong>No staged people need CRM approval</strong><p>Run People Research first, review its evidence, then confirm an import. Those people will appear here for the final decision.</p></div>}
    </DashboardCard> : null}

    <Modal isOpen={Boolean(draftSignal)} onClose={() => !draftBusy && setDraftSignal(null)} title="Personalized email draft" footer={<>{draftEditor?.status === "transferred" ? <><Button variant="outline" onClick={() => setDraftSignal(null)}>Close</Button><Button onClick={() => navigate(`/outreach?campaignId=${draftEditor.campaignId}`)}>Open in Outreach</Button></> : draftEditor ? <><Button variant="outline" disabled={draftBusy} onClick={() => setDraftSignal(null)}>Close</Button><Button variant="outline" loading={draftBusy} onClick={saveReviewedEmailDraft}>Save reviewed draft</Button>{draftEditor.status === "reviewed" ? <Button loading={draftBusy} onClick={moveDraftToOutreach}>Move to Outreach</Button> : null}</> : <><Button variant="outline" disabled={draftBusy} onClick={() => setDraftSignal(null)}>Cancel</Button><Button loading={draftBusy} disabled={!draftCampaignId} onClick={generateEmailDraft}>Generate unsent draft</Button></>}</>}>
      <div className="intent-draft-modal">
        <div className="intent-draft-safety"><strong>Draft only—nothing sends from this window.</strong><span>Every draft must contain both registration links. Moving it to Outreach later requires a CRM contact with a verified email.</span></div>
        {!draftEditor ? <><label><span>Event campaign</span><select value={draftCampaignId} onChange={(event) => setDraftCampaignId(event.target.value)}><option value="">Choose a campaign</option>{campaigns.filter((campaign) => campaign.campaignKind !== "program").map((campaign) => { const hasEventbrite = Boolean(campaign.registrationLinks?.eventbrite?.url); const hasMeetup = Boolean(campaign.registrationLinks?.meetup?.url); return <option key={campaign._id} value={campaign._id}>{campaign.name}{hasEventbrite && hasMeetup ? "" : " · add both registration links first"}</option>; })}</select></label><div className="intent-draft-basis"><span>Personalization source</span><strong>{displayText(draftSignal?.title)}</strong><p>Growth Operator will use only this public evidence and will not assume the username is a verified real name.</p></div></> : <><header className="intent-draft-status"><div><span>{draftEditor.status === "reviewed" ? "Reviewed and unsent" : draftEditor.status === "transferred" ? "Pending in Outreach" : "Generated draft—review required"}</span><strong>{draftEditor.generationMethod === "openai" ? "AI-assisted personalization" : "Rules-based personalization"}</strong></div>{draftEditor.status !== "transferred" ? <button type="button" onClick={() => setDraftEditor(null)}>Choose another campaign</button> : null}</header><div className="intent-draft-links"><a href={draftEditor.eventbriteUrl} target="_blank" rel="noreferrer"><span>Eventbrite</span><strong>Included in draft ↗</strong></a><a href={draftEditor.meetupUrl} target="_blank" rel="noreferrer"><span>Meetup</span><strong>Included in draft ↗</strong></a></div><label><span>Subject</span><input disabled={draftEditor.status === "transferred"} value={draftEditor.subject || ""} onChange={(event) => setDraftEditor((current) => ({ ...current, subject: event.target.value, status: "draft" }))} /></label><label><span>Email body</span><textarea disabled={draftEditor.status === "transferred"} value={draftEditor.body || ""} onChange={(event) => setDraftEditor((current) => ({ ...current, body: event.target.value, status: "draft" }))} /></label><p className="intent-draft-placeholder"><strong>{"{{firstName}}"}</strong> stays as a placeholder until the person is researched in the CRM. A published or guessed email cannot move into Outreach.</p></>}
      </div>
    </Modal>

    <Modal isOpen={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} title="Delete this prospect?" footer={<><Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button><Button onClick={remove}>Delete permanently</Button></>}><p>This removes {deleteTarget?.name || "this prospect"} from Growth Operator. This cannot be undone.</p></Modal>
  </div>;
}
