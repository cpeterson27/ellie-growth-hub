import { useEffect, useMemo, useState } from "react";
import Button from "../components/Button.jsx";
import DashboardCard from "../components/DashboardCard.jsx";
import Modal from "../components/Modal.jsx";
import {
  deleteContact,
  createAudienceDefinition,
  discoverAudienceOrganizations,
  fetchCampaigns,
  fetchContacts,
  fetchDiscoveryTemplates,
  fetchApolloStatus,
  fetchApolloLists,
  fetchApolloHistory,
  estimateApolloEnrichment,
  importContactsFromApollo,
  saveDiscoveryTemplates,
  searchApolloLeads,
  updateContact,
} from "../services/api.js";
import "./Discovery.css";
import "./DiscoveryTargeting.css";
import "./DiscoveryReview.css";

const EMPTY_TARGET = { name: "Untitled search", titles: "", industries: "", keywords: "", locations: "", employeeMin: "", employeeMax: "", industryIds: [], emailStatuses: ["verified"], seniorities: [], technologiesAny: "", technologiesAll: "", technologiesExclude: "", revenueMin: "", revenueMax: "", fundingMin: "", fundingMax: "" };
const APOLLO_INDUSTRIES = [
  { id: "5567cd477369645401010000", label: "Real estate" },
  { id: "5567e1887369641d68d40100", label: "Commercial real estate" },
  { id: "5567cdd67369643e64020000", label: "Financial services" },
];
const SENIORITIES = ["owner","founder","c_suite","partner","vp","head","director","manager","senior","entry","intern"];

const splitFilters = (value) => String(value || "").split(",").map((item) => item.trim()).filter(Boolean);

export default function Discovery() {
  const [prospects, setProspects] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [query, setQuery] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [source, setSource] = useState("");
  const [emailFilter, setEmailFilter] = useState("verified");
  const [importOpen, setImportOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [notice, setNotice] = useState("");
  const [searchMode, setSearchMode] = useState("organizations");
  const [templates, setTemplates] = useState([]);
  const [targetPreset, setTargetPreset] = useState("custom");
  const [target, setTarget] = useState(EMPTY_TARGET);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [searchingApollo, setSearchingApollo] = useState(false);
  const [apolloResult, setApolloResult] = useState(null);
  const [apolloPeople, setApolloPeople] = useState([]);
  const [apolloPeopleTotal, setApolloPeopleTotal] = useState(0);
  const [apolloPeoplePage, setApolloPeoplePage] = useState(1);
  const [selectedApolloPeople, setSelectedApolloPeople] = useState([]);
  const [apolloStatus, setApolloStatus] = useState({ state: "checking", message: "Checking Apollo connection…" });
  const [apolloError, setApolloError] = useState(null);
  const [apolloPhase, setApolloPhase] = useState("ready");
  const [apolloLists, setApolloLists] = useState([]);
  const [apolloListName, setApolloListName] = useState("");
  const [apolloHistory, setApolloHistory] = useState([]);
  const [enrichmentEstimate, setEnrichmentEstimate] = useState(null);

  const loadProspects = async () => {
    const response = await fetchContacts({ status: "prospect", limit: 500 });
    setProspects(Array.isArray(response?.data) ? response.data.filter(Boolean) : []);
  };

  useEffect(() => {
    loadProspects().catch(() => setNotice("Unable to load prospects."));
    fetchCampaigns()
      .then((items) => setCampaigns(Array.isArray(items) ? items.filter((item) => item?._id) : []))
      .catch(() => setNotice("Unable to load campaigns for filtering."));
    fetchDiscoveryTemplates()
      .then((data) => {
        const savedTemplates = data.templates || [];
        setTemplates(savedTemplates);
        if (savedTemplates[0]) {
          setTargetPreset(savedTemplates[0].id);
          setTarget({ ...savedTemplates[0] });
        }
      })
      .catch(() => setNotice("Unable to load saved search templates."));
    fetchApolloStatus()
      .then((status) => setApolloStatus({ ...status, state: status.connected ? "connected" : "error" }))
      .catch((error) => setApolloStatus({
        state: "error",
        code: error.response?.data?.code || "unavailable",
        message: error.response?.data?.message || "Ellie could not verify the Apollo connection.",
      }));
    fetchApolloLists().then((data) => setApolloLists((data.lists || []).filter((item) => item.modality === "contacts"))).catch(() => {});
    fetchApolloHistory().then((data) => setApolloHistory(data.runs || [])).catch(() => {});
  }, []);

  const filtered = useMemo(() => prospects.filter((item) => {
    const searchText = [item?.name, item?.company, item?.email].filter(Boolean).join(" ").toLowerCase();
    return (!query || searchText.includes(query.toLowerCase()))
      && (!campaignId || item?.campaignIds?.some((id) => String(id) === campaignId))
      && (!source || item?.sourceProvider === source || item?.sources?.includes(source))
      && (emailFilter === "verified"
        ? item?.emailStatus === "verified"
        : emailFilter === "review"
          ? item?.emailStatus !== "verified"
          : true);
  }), [prospects, query, campaignId, source, emailFilter]);

  const emailCounts = useMemo(() => ({
    verified: prospects.filter((item) => item?.emailStatus === "verified").length,
    review: prospects.filter((item) => item?.emailStatus !== "verified").length,
    risky: prospects.filter((item) => item?.emailStatus === "risky").length,
    undeliverable: prospects.filter((item) => item?.emailStatus === "undeliverable").length,
  }), [prospects]);

  const apolloPerformance = useMemo(() => {
    const completed = apolloHistory.filter((run) => run.status !== "error");
    return {
      searches: apolloHistory.length,
      successRate: apolloHistory.length ? Math.round((completed.length / apolloHistory.length) * 100) : 0,
      matches: apolloHistory.reduce((sum, run) => sum + (run.totalMatches || 0), 0),
      averageSeconds: apolloHistory.length
        ? (apolloHistory.reduce((sum, run) => sum + (run.durationMs || 0), 0) / apolloHistory.length / 1000).toFixed(1)
        : "0.0",
    };
  }, [apolloHistory]);

  const approve = async (row) => {
    await updateContact(row._id, { status: "active" });
    setProspects((items) => items.filter((item) => item?._id !== row._id));
    setNotice("Prospect approved and moved to Contacts.");
  };

  const remove = async () => {
    if (!deleteTarget?._id) return;
    await deleteContact(deleteTarget._id);
    setProspects((items) => items.filter((item) => item?._id !== deleteTarget._id));
    setDeleteTarget(null);
    setNotice("Prospect deleted permanently.");
  };

  const selectPreset = (value) => {
    setTargetPreset(value);
    setTarget(value === "custom" ? { ...EMPTY_TARGET } : { ...templates.find((template) => template.id === value) });
  };

  const persistTemplates = async (nextTemplates, selectedId) => {
    try {
      setSavingTemplate(true);
      const data = await saveDiscoveryTemplates(nextTemplates);
      setTemplates(data.templates || []);
      setTargetPreset(selectedId);
      setNotice("Saved search templates updated.");
    } catch (error) {
      setNotice(error.response?.data?.error || "Unable to save search templates.");
    } finally {
      setSavingTemplate(false);
    }
  };

  const saveTemplate = async () => {
    const name = target.name.trim();
    if (!name) return setNotice("Give this search template a name first.");
    if (targetPreset !== "custom") {
      return persistTemplates(templates.map((template) => template.id === targetPreset ? { ...target, id: targetPreset } : template), targetPreset);
    }
    const id = globalThis.crypto?.randomUUID?.() || `template-${Date.now()}`;
    await persistTemplates([...templates, { ...target, id }], id);
  };

  const deleteTemplate = async () => {
    if (targetPreset === "custom") return;
    const nextTemplates = templates.filter((template) => template.id !== targetPreset);
    await persistTemplates(nextTemplates, "custom");
    setTarget({ ...EMPTY_TARGET });
  };

  const runApolloSearch = async (searchPage = 1) => {
    const missingPeopleTitles = searchMode === "people" && !splitFilters(target.titles).length;
    const missingCompanyFilters = searchMode === "organizations" && !splitFilters(target.keywords).length && !splitFilters(target.industries).length;
    const invalidRanges = [
      ["employee", target.employeeMin, target.employeeMax],
      ["revenue", target.revenueMin, target.revenueMax],
      ["funding", target.fundingMin, target.fundingMax],
    ].find(([, min, max]) => min !== "" && max !== "" && Number(min) > Number(max));
    if (invalidRanges) {
      setApolloError({
        title: `Correct the ${invalidRanges[0]} range`,
        message: "The minimum cannot be greater than the maximum.",
        action: "Update the range, then run the search again.",
      });
      return;
    }
    if (missingPeopleTitles || missingCompanyFilters) {
      setApolloError({
        title: "Add at least one required filter",
        message: missingPeopleTitles ? "People Search requires at least one job title." : "Organization Search requires at least one company industry or keyword.",
        action: "Complete the highlighted search fields, then try again.",
      });
      return;
    }
    setSearchingApollo(true);
    setApolloPhase("searching");
    setApolloError(null);
    setNotice("");
    setApolloResult(null);
    setApolloPeople([]);
    setApolloPeopleTotal(0);
    setSelectedApolloPeople([]);
    try {
      if (searchMode === "people") {
        const response = await searchApolloLeads({
          titles: splitFilters(target.titles),
          keywords: splitFilters(target.keywords),
          locations: splitFilters(target.locations),
          industryIds: target.industryIds || [],
          emailStatuses: target.emailStatuses || [],
          employeeRange: {
            min: target.employeeMin === "" ? null : Number(target.employeeMin),
            max: target.employeeMax === "" ? null : Number(target.employeeMax),
          },
          seniorities: target.seniorities || [],
          technologiesAny: splitFilters(target.technologiesAny),
          technologiesAll: splitFilters(target.technologiesAll),
          technologiesExclude: splitFilters(target.technologiesExclude),
          revenueRange: { min: target.revenueMin || null, max: target.revenueMax || null },
          templateName: target.name,
          page: searchPage,
          perPage: 25,
        });
        const results = response.data?.results || [];
        setApolloPeople(results);
        setApolloPeopleTotal(response.data?.total || results.length);
        setApolloPeoplePage(searchPage);
        setApolloPhase(results.length ? "results" : "empty");
        setNotice(`${response.data?.total || results.length || 0} people matched in Apollo; showing ${results.length} results.`);
        fetchApolloHistory().then((data) => setApolloHistory(data.runs || [])).catch(() => {});
        return;
      }
      const created = await createAudienceDefinition({
        name: `${target.name} — ${new Date().toLocaleDateString()}`,
        description: `Apollo organization discovery created from the ${target.name} targeting profile.`,
        source: "manual",
        criteria: {
          keywords: splitFilters(target.keywords),
          industries: splitFilters(target.industries),
          locations: splitFilters(target.locations),
          employeeRange: {
            min: target.employeeMin === "" ? null : Number(target.employeeMin),
            max: target.employeeMax === "" ? null : Number(target.employeeMax),
          },
          revenueRange: { min: target.revenueMin || null, max: target.revenueMax || null },
          fundingRange: { min: target.fundingMin || null, max: target.fundingMax || null },
          technologiesAny: splitFilters(target.technologiesAny),
          minimumScore: 0,
          targetTier: null,
        },
      });
      const result = await discoverAudienceOrganizations(created.audience._id);
      setApolloResult(result);
      setApolloPhase(result.organizationsFound ? "results" : "empty");
      setNotice(`${result.organizationsFound || 0} organizations found for “${target.name}”; ${result.organizationsCreated || 0} added and ${result.organizationsUpdated || 0} updated.`);
      fetchApolloHistory().then((data) => setApolloHistory(data.runs || [])).catch(() => {});
    } catch (error) {
      const data = error.response?.data || {};
      setApolloPhase("error");
      setApolloError({
        title: data.message || data.error || "Apollo search could not be completed",
        message: data.detail || (error.response ? "Apollo rejected or could not complete this search request." : "Ellie could not reach the search service."),
        action: data.action || "Check the Apollo connection status and retry.",
        code: data.code,
        retryAfter: data.retryAfter,
      });
    } finally {
      setSearchingApollo(false);
    }
  };

  const importSelectedPeople = async () => {
    if (!campaignId) return setNotice("Choose a campaign before adding people to Ellie CRM.");
    const leads = apolloPeople.filter((person) => selectedApolloPeople.includes(person.apolloPersonId));
    if (!enrichmentEstimate || enrichmentEstimate.count !== leads.length) {
      try {
        setEnrichmentEstimate(await estimateApolloEnrichment(leads.length));
        setNotice("Review the Apollo credit estimate, then approve the import.");
      } catch {
        setApolloError({ title: "Could not prepare the import estimate", message: "Ellie could not calculate the enrichment range.", action: "Retry before approving this import." });
      }
      return;
    }
    try {
      setApolloPhase("importing");
      setApolloError(null);
      const result = await importContactsFromApollo({ campaignId, leads, apolloListName });
      const listMessage = !apolloListName
        ? ""
        : result.apolloListSync?.success
          ? ` ${result.apolloListSync.saved || leads.length} also synchronized to Apollo list “${apolloListName}.”`
          : ` Ellie CRM import succeeded, but Apollo list sync needs attention: ${result.apolloListSync?.message || "unknown Apollo error"}`;
      setNotice(`${result.data?.created || 0} contacts added to Ellie CRM.${listMessage}`);
      setSelectedApolloPeople([]);
      setEnrichmentEstimate(null);
      setApolloPhase("imported");
      await loadProspects();
      fetchApolloHistory().then((data) => setApolloHistory(data.runs || [])).catch(() => {});
    } catch (error) {
      setApolloPhase("error");
      setApolloError({ title: "Selected people were not imported", message: error.response?.data?.message || "Apollo enrichment or Ellie CRM import failed.", action: "Confirm the campaign, Apollo enrichment access, and available credits, then retry." });
    }
  };

  return (
    <div className="page-dashboard discovery-page">
      <header className="discovery-header">
        <div>
          <p className="discovery-kicker">Find new people and organizations</p>
          <h1 className="page-title">Prospect Discovery</h1>
          <p className="page-subtitle">Search for relationships you do not already have. CSV files and existing business contacts belong in the CRM, not here.</p>
        </div>
      </header>

      <p className="discovery-notice">
        <strong>Discovery and CRM have different jobs:</strong> Discovery finds
        net-new prospects. The CRM stores contacts you already collected,
        imported, met, or received from another system.
      </p>

      <DashboardCard title="Apollo targeting">
        <div className={`apollo-connection-panel is-${apolloStatus.state}`}><span className="status-dot" /><div><strong>{apolloStatus.state === "connected" ? "Apollo connected" : apolloStatus.state === "checking" ? "Checking Apollo" : "Apollo needs attention"}</strong><p>{apolloStatus.message}</p></div><Button variant="ghost" size="sm" onClick={() => { setApolloStatus({ state: "checking", message: "Checking Apollo connection…" }); fetchApolloStatus().then((status) => setApolloStatus({ ...status, state: status.connected ? "connected" : "error" })).catch((error) => setApolloStatus({ state: "error", message: error.response?.data?.message || "Unable to verify Apollo." })); }}>Check connection</Button></div>
        <p className="apollo-note">Saved search templates belong to this Ellie workspace. They only remember filters; selecting one fills the fields below, and clicking Find sends those filters to Apollo.</p>
        <div className="apollo-target-topline">
          <label>Saved search template<select value={targetPreset} onChange={(event) => selectPreset(event.target.value)}><option value="custom">New custom search</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label>
          <label>Search mode<select value={searchMode} onChange={(event) => setSearchMode(event.target.value)}><option value="organizations">Organizations</option><option value="people">People</option></select></label>
        </div>
        <div className="apollo-target-grid">
          <label>Search name<input value={target.name} onChange={(event) => setTarget({ ...target, name: event.target.value })} placeholder="Example: Texas property managers" /><small>This is the name Ellie saves—not an Apollo list.</small></label>
          {searchMode === "people" ? <label>Job titles<input value={target.titles} onChange={(event) => setTarget({ ...target, titles: event.target.value })} placeholder="Owner, Founder, Investor" /></label> : null}
          {searchMode === "people" ? <fieldset className="apollo-industry-options"><legend>Company industries</legend>{APOLLO_INDUSTRIES.map((industry) => <label key={industry.id}><input type="checkbox" checked={(target.industryIds || []).includes(industry.id)} onChange={() => setTarget({ ...target, industryIds: (target.industryIds || []).includes(industry.id) ? target.industryIds.filter((id) => id !== industry.id) : [...(target.industryIds || []), industry.id] })} />{industry.label}</label>)}<small>These use Apollo’s industry IDs from your search.</small></fieldset> : <label>Company industries<input value={target.industries} onChange={(event) => setTarget({ ...target, industries: event.target.value })} placeholder="Real estate, hospitality" /><small>Sent to Apollo as company keyword tags.</small></label>}
          <label>Company keywords<input value={target.keywords} onChange={(event) => setTarget({ ...target, keywords: event.target.value })} placeholder="multifamily, Airbnb, acquisitions" /></label>
          <label>Headquarters locations<input value={target.locations} onChange={(event) => setTarget({ ...target, locations: event.target.value })} placeholder="United States, Texas" /><small>Apollo matches the company headquarters.</small></label>
          <label>Minimum employees<input type="number" min="0" value={target.employeeMin} onChange={(event) => setTarget({ ...target, employeeMin: event.target.value })} /></label>
          <label>Maximum employees<input type="number" min="0" value={target.employeeMax} onChange={(event) => setTarget({ ...target, employeeMax: event.target.value })} /></label>
          {searchMode === "people" ? <fieldset className="apollo-verified-filter"><legend>Email status</legend><label><input type="checkbox" checked={(target.emailStatuses || []).includes("verified")} onChange={(event) => setTarget({ ...target, emailStatuses: event.target.checked ? ["verified"] : [] })} />Verified emails only</label></fieldset> : null}
        </div>
        <details className="apollo-advanced-filters">
          <summary>Advanced Apollo filters <span>Technology, revenue, funding, and seniority</span></summary>
          <div className="apollo-target-grid">
            {searchMode === "people" ? <fieldset className="apollo-seniority-options"><legend>Seniority</legend>{SENIORITIES.map((seniority) => <label key={seniority}><input type="checkbox" checked={(target.seniorities || []).includes(seniority)} onChange={() => setTarget({ ...target, seniorities: (target.seniorities || []).includes(seniority) ? target.seniorities.filter((item) => item !== seniority) : [...(target.seniorities || []), seniority] })} />{seniority.replaceAll("_", " ")}</label>)}</fieldset> : null}
            <label>Technologies — any<input value={target.technologiesAny} onChange={(event) => setTarget({ ...target, technologiesAny: event.target.value })} placeholder="Technology IDs, comma separated" /><small>Matches companies using at least one technology ID.</small></label>
            {searchMode === "people" ? <label>Technologies — all<input value={target.technologiesAll} onChange={(event) => setTarget({ ...target, technologiesAll: event.target.value })} placeholder="Technology IDs, comma separated" /></label> : null}
            {searchMode === "people" ? <label>Exclude technologies<input value={target.technologiesExclude} onChange={(event) => setTarget({ ...target, technologiesExclude: event.target.value })} placeholder="Technology IDs, comma separated" /></label> : null}
            <label>Minimum annual revenue<input type="number" min="0" value={target.revenueMin} onChange={(event) => setTarget({ ...target, revenueMin: event.target.value })} placeholder="Example: 1000000" /></label>
            <label>Maximum annual revenue<input type="number" min="0" value={target.revenueMax} onChange={(event) => setTarget({ ...target, revenueMax: event.target.value })} placeholder="Example: 50000000" /></label>
            {searchMode === "organizations" ? <label>Minimum latest funding<input type="number" min="0" value={target.fundingMin} onChange={(event) => setTarget({ ...target, fundingMin: event.target.value })} /></label> : null}
            {searchMode === "organizations" ? <label>Maximum latest funding<input type="number" min="0" value={target.fundingMax} onChange={(event) => setTarget({ ...target, fundingMax: event.target.value })} /></label> : null}
          </div>
          <div className="apollo-unavailable-filter"><strong>Buyer intent</strong><span>Not available through Apollo’s public People or Organization Search API for this connection. Ellie will not pretend to apply a filter Apollo ignores.</span></div>
        </details>
        <div className="apollo-template-actions"><Button variant="outline" loading={savingTemplate} onClick={saveTemplate}>{targetPreset === "custom" ? "Save as template" : "Save template changes"}</Button>{targetPreset !== "custom" ? <Button variant="ghost" disabled={savingTemplate} onClick={deleteTemplate}>Delete template</Button> : null}<span>Templates store filters in Ellie. They do not run until you click Find.</span></div>
        <div className="apollo-search-actions"><Button loading={searchingApollo} onClick={() => runApolloSearch(1)}>{searchMode === "people" ? "Find matching people" : "Find matching organizations"}</Button></div>
        <div className="apollo-workflow-status" aria-live="polite"><span className={apolloPhase !== "ready" ? "is-complete" : ""}>1. Validate filters</span><span className={["searching","results","empty","importing","imported"].includes(apolloPhase) ? "is-active" : ""}>2. Search Apollo</span><span className={["results","importing","imported"].includes(apolloPhase) ? "is-active" : ""}>3. Review results</span><span className={apolloPhase === "imported" ? "is-complete" : ""}>4. Add to Ellie CRM</span></div>
        {apolloError ? <div className="apollo-error-panel" role="alert"><strong>{apolloError.title}</strong><p>{apolloError.message}</p><span>{apolloError.action}</span>{apolloError.code ? <small>Error code: {apolloError.code}{apolloError.retryAfter ? ` · Retry after ${apolloError.retryAfter}` : ""}</small> : null}</div> : null}
        {apolloResult ? <div className={`apollo-search-result ${apolloResult.organizationsFound ? "is-success" : "is-empty"}`} role="status"><strong>{apolloResult.organizationsFound ? `${apolloResult.organizationsFound} organizations found` : "Search completed — no matches found"}</strong><p>{apolloResult.organizationsFound ? `${apolloResult.organizationsCreated || 0} new organizations were added and ${apolloResult.organizationsUpdated || 0} existing records were updated.` : "Apollo is connected and responded successfully. Try fewer keywords, a broader location, or a larger employee range."}</p></div> : null}
        <div className="apollo-status"><span className="status-dot" />People Search: no search credit · Organization Search: 1 credit per results page · Enrichment may use credits</div>
        <p className="apollo-note">Each search creates an Ellie audience record and saves matched companies to Discovery. It does not create or modify an Apollo saved search.</p>
      </DashboardCard>
      {searchMode === "people" && apolloPeople.length ? <DashboardCard title="Apollo people results" action={<span>{apolloPeopleTotal.toLocaleString()} matched</span>}>
        <div className="apollo-people-toolbar">
          <label>Assign to campaign<select value={campaignId} onChange={(event) => setCampaignId(event.target.value)}><option value="">Choose campaign</option>{campaigns.map((campaign) => <option key={campaign._id} value={campaign._id}>{campaign.name}</option>)}</select></label>
          <label>Synchronize to Apollo list<select value={apolloListName} onChange={(event) => setApolloListName(event.target.value)}><option value="">Do not sync to a list</option>{apolloLists.map((list) => <option key={list.id || list._id} value={list.name}>{list.name}</option>)}</select></label>
          <Button disabled={!selectedApolloPeople.length || !campaignId} onClick={importSelectedPeople}>{enrichmentEstimate?.count === selectedApolloPeople.length ? "Approve enrichment & import" : `Review cost for ${selectedApolloPeople.length || 0}`}</Button>
        </div>
        {enrichmentEstimate?.count === selectedApolloPeople.length ? <div className="apollo-credit-estimate" role="status"><div><strong>Approval required</strong><span>{enrichmentEstimate.count} selected contacts may use {enrichmentEstimate.minimumCredits}–{enrichmentEstimate.maximumCredits} Apollo credits.</span><small>{enrichmentEstimate.note}</small></div><Button variant="ghost" size="sm" onClick={() => setEnrichmentEstimate(null)}>Cancel</Button></div> : null}
        <div className="apollo-people-table"><div className="apollo-people-row apollo-people-row--header"><input type="checkbox" checked={selectedApolloPeople.length === apolloPeople.length} onChange={() => { setSelectedApolloPeople(selectedApolloPeople.length === apolloPeople.length ? [] : apolloPeople.map((person) => person.apolloPersonId)); setEnrichmentEstimate(null); }} /><span>Name</span><span>Title</span><span>Company</span><span>Email status</span></div>{apolloPeople.map((person) => <div className="apollo-people-row" key={person.apolloPersonId}><input type="checkbox" checked={selectedApolloPeople.includes(person.apolloPersonId)} onChange={() => { setSelectedApolloPeople((items) => items.includes(person.apolloPersonId) ? items.filter((id) => id !== person.apolloPersonId) : [...items, person.apolloPersonId]); setEnrichmentEstimate(null); }} /><span><strong>{person.name || "Apollo prospect"}</strong><small>{person.location}</small></span><span>{person.title || "—"}</span><span>{person.company || "—"}</span><span>{person.emailStatus || "Unavailable"}</span></div>)}</div>
        <div className="apollo-results-pagination"><Button variant="outline" size="sm" disabled={apolloPeoplePage === 1 || searchingApollo} onClick={() => runApolloSearch(apolloPeoplePage - 1)}>Previous</Button><span>Page {apolloPeoplePage} · showing {apolloPeople.length} results</span><Button variant="outline" size="sm" disabled={apolloPeoplePage * 25 >= apolloPeopleTotal || searchingApollo} onClick={() => runApolloSearch(apolloPeoplePage + 1)}>Next</Button></div>
      </DashboardCard> : null}

      <DashboardCard title="Apollo search performance" action={<span>Last {apolloHistory.length} searches</span>}>
        <div className="apollo-performance-summary"><div><strong>{apolloPerformance.searches}</strong><span>Searches</span></div><div><strong>{apolloPerformance.successRate}%</strong><span>Completed</span></div><div><strong>{apolloPerformance.matches.toLocaleString()}</strong><span>Total matches</span></div><div><strong>{apolloPerformance.averageSeconds}s</strong><span>Average time</span></div></div>
        {apolloHistory.length ? <div className="apollo-history-table"><div className="apollo-history-row apollo-history-row--header"><span>Date</span><span>Search</span><span>Mode</span><span>Status</span><span>Matches</span><span>Time</span></div>{apolloHistory.slice(0, 10).map((run) => <div className="apollo-history-row" key={run._id}><span>{new Date(run.createdAt).toLocaleString()}</span><span>{run.templateName || "Custom search"}</span><span>{run.mode}</span><span className={`is-${run.status}`}>{run.status}</span><span>{(run.totalMatches || 0).toLocaleString()}</span><span>{((run.durationMs || 0) / 1000).toFixed(1)}s</span></div>)}</div> : <div className="table-state table-state--empty">Search history will appear after the first Apollo search.</div>}
      </DashboardCard>

      <section className="discovery-stats">
        <DashboardCard title="Newly discovered"><strong>{prospects.length}</strong><span>Prospects found through discovery tools</span></DashboardCard>
        <DashboardCard title="Approved this week"><strong>—</strong><span>Live data appears after approvals</span></DashboardCard>
        <DashboardCard title="Imported this week"><strong>{prospects.filter((item) => item?.importedAt && Date.now() - new Date(item.importedAt) < 604800000).length}</strong><span>Across all import sources</span></DashboardCard>
        <DashboardCard title="Apollo status"><strong>{apolloStatus.state === "connected" ? "Connected" : "Needs attention"}</strong><span>People and company search monitored</span></DashboardCard>
      </section>

      <DashboardCard title="Prospect review">
        <div className="discovery-workflow">
          <div><span>1</span><strong>Review verified emails</strong><small>Start with deliverable addresses only.</small></div>
          <div><span>2</span><strong>Complete missing research</strong><small>Confirm company, title, and industry.</small></div>
          <div><span>3</span><strong>Add the right fit to CRM</strong><small>Only new prospects need this approval step.</small></div>
        </div>
        <div className="discovery-email-tabs" aria-label="Email safety filters">
          <button className={emailFilter === "verified" ? "active" : ""} onClick={() => setEmailFilter("verified")}><strong>{emailCounts.verified}</strong><span>Verified emails</span><small>Review these first</small></button>
          <button className={emailFilter === "review" ? "active" : ""} onClick={() => setEmailFilter("review")}><strong>{emailCounts.review}</strong><span>Email review</span><small>{emailCounts.risky} risky · {emailCounts.undeliverable} undeliverable</small></button>
          <button className={emailFilter === "all" ? "active" : ""} onClick={() => setEmailFilter("all")}><strong>{prospects.length}</strong><span>All prospects</span><small>Every imported person</small></button>
        </div>
        <div className="discovery-filters">
          <input className="select-input" placeholder="Search name, company, or email" value={query} onChange={(event) => setQuery(event.target.value)} />
          <select value={source} onChange={(event) => setSource(event.target.value)}><option value="">All sources</option><option value="apollo">Apollo</option><option value="csv">CSV</option></select>
          <select value={campaignId} onChange={(event) => setCampaignId(event.target.value)}><option value="">All campaigns</option>{campaigns.map((campaign) => <option key={campaign._id} value={campaign._id}>{campaign.name}</option>)}</select>
        </div>
        {notice ? <p className="discovery-notice">{notice}</p> : null}
        {filtered.length ? <div className="prospect-review-list">
          {filtered.map((prospect) => <article className="prospect-review-card" key={prospect._id}>
            <header>
              <div>
                <h3>{prospect.name}</h3>
                <p>{prospect.title || "Title missing"}{prospect.company ? ` · ${prospect.company}` : " · Company missing"}</p>
              </div>
              <span className={`contact-status-badge contact-status-badge--${prospect.emailStatus || "missing"}`}>{prospect.emailStatus === "verified" ? "Verified email" : prospect.emailStatus === "risky" ? "Risky email withheld" : prospect.emailStatus === "undeliverable" ? "Undeliverable email withheld" : "No verified email"}</span>
            </header>
            <div className="prospect-review-card__details">
              <div><span>Email</span><strong>{prospect.email || "Withheld or unavailable"}</strong></div>
              <div><span>Source</span><strong>{prospect.sourceProvider || prospect.sources?.join(", ") || "Unknown"}</strong></div>
              <div><span>Research status</span><strong>{String(prospect.researchStatus || "needs_research").replaceAll("_", " ")}</strong></div>
              <div><span>Missing information</span><strong>{prospect.missingFields?.length ? prospect.missingFields.join(", ") : "None"}</strong></div>
              <div><span>Imported</span><strong>{prospect.importedAt ? new Date(prospect.importedAt).toLocaleDateString() : "Unknown"}</strong></div>
            </div>
            <footer className="discovery-actions">
              <Button onClick={() => approve(prospect)}>Add to CRM</Button>
              <Button variant="outline" onClick={() => setDeleteTarget(prospect)}>Delete prospect</Button>
            </footer>
          </article>)}
        </div> : <div className="table-state table-state--empty">No prospects are waiting for review.</div>}
      </DashboardCard>

      <Modal isOpen={importOpen} onClose={() => setImportOpen(false)} title="Import prospects" footer={<Button variant="outline" onClick={() => setImportOpen(false)}>Close</Button>}>
        <div className="import-modal">
          <p>Choose how you want to add prospects. Imported records stay in Discovery until you approve them.</p>
          <button onClick={() => setNotice("Use Contacts → Import → Apollo CSV to upload your Apollo export.")}><strong>Apollo CSV</strong><span>Import a downloaded Apollo export</span></button>
          <button onClick={() => setNotice("Use Contacts → Import → Standard CSV to upload a spreadsheet export.")}><strong>Standard CSV</strong><span>Import contacts from a spreadsheet export</span></button>
          <button onClick={() => setNotice("Organization discovery will use Apollo Organization Search when that workflow is enabled.")}><strong>Organization discovery</strong><span>Search organizations before People Search is upgraded</span></button>
        </div>
      </Modal>

      <Modal isOpen={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} title="Delete prospect" footer={<><Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button><Button onClick={remove}>Delete permanently</Button></>}>
        <p>Delete this prospect permanently? This action cannot be undone.</p>
      </Modal>
    </div>
  );
}
