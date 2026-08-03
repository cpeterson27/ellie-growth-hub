import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Button from "../components/Button.jsx";
import DashboardCard from "../components/DashboardCard.jsx";
import Modal from "../components/Modal.jsx";
import {
  createAudienceDefinition,
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
  fetchMarketResearchJob,
  saveDiscoveryTemplates,
  startExternalMarketResearch,
  updateContact,
} from "../services/api.js";
import "./Discovery.css";
import "./DiscoveryTargeting.css";
import "./DiscoveryReview.css";

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

  useEffect(() => {
    const question = String(searchParams.get("question") || "").trim();
    if (question) setMarketQuestion(question);
  }, [searchParams]);

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

  useEffect(() => {
    loadProspects().catch(() => setNotice("Unable to load prospects."));
    fetchCampaigns().then((items) => setCampaigns(Array.isArray(items) ? items : [])).catch(() => {});
    fetchDiscoveryTemplates().then((data) => setTemplates(data.templates || [])).catch(() => {});
    fetchMarketResearchSources().then((data) => setResearchSource(data.sources?.[0] || null)).catch(() => {});
    loadResearchHistory();
    loadPeoplePreviews();
    const refreshHistory = window.setInterval(() => {
      loadResearchHistory();
      loadPeoplePreviews();
    }, 15000);
    return () => window.clearInterval(refreshHistory);
  }, []);

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
      <div><span className="eyebrow">Growth Operator Market Intelligence</span><h1>Research a market, rank the fit, then build your list</h1><p>Growth Operator owns the workflow: research profiles, evidence, scoring, review, CRM records, and outreach handoff.</p></div>
    </header>

    {notice ? <div className="notice-banner" role="status">{notice}</div> : null}

    <DashboardCard title="Ask Growth Operator to find a market">
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
    </DashboardCard>

    <DashboardCard title="Saved research and prospect lists" action={<Button variant="outline" loading={historyLoading} onClick={loadResearchHistory}>Refresh</Button>}>
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
    </DashboardCard>

    <div id="people-research-previews">
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
    </div>

    <DashboardCard title="External research source">
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
    </DashboardCard></div> : null}

    <DashboardCard title="Prospect review" action={<div className="discovery-review-filters"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search prospects" /><select value={campaignId} onChange={(event) => setCampaignId(event.target.value)}><option value="">All campaigns</option>{campaigns.map((campaign) => <option key={campaign._id} value={campaign._id}>{campaign.name}</option>)}</select><select value={emailFilter} onChange={(event) => setEmailFilter(event.target.value)}><option value="verified">Verified email</option><option value="review">Needs review</option><option value="all">All</option></select></div>}>
      {filtered.length ? <div className="discovery-review-list">{filtered.map((prospect) => <article key={prospect._id}><div><strong>{prospect.name || "Unnamed prospect"}</strong><span>{[prospect.title, prospect.company].filter(Boolean).join(" · ") || "Company details needed"}</span><small>{prospect.email || "No email"} · {prospect.emailStatus || "unverified"}</small></div><div><Button size="sm" onClick={() => approve(prospect)}>Approve</Button><Button size="sm" variant="outline" onClick={() => setDeleteTarget(prospect)}>Delete</Button></div></article>)}</div> : <div className="table-state table-state--empty">No prospects match this review view.</div>}
    </DashboardCard>

    <Modal isOpen={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} title="Delete this prospect?" footer={<><Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button><Button onClick={remove}>Delete permanently</Button></>}><p>This removes {deleteTarget?.name || "this prospect"} from Growth Operator. This cannot be undone.</p></Modal>
  </div>;
}
