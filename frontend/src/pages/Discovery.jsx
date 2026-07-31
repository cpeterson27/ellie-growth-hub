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

const EMPTY_TARGET = { name: "", titles: "", industries: "", keywords: "", locations: "", employeeMin: "", employeeMax: "", employeeRanges: [], industryIds: [], emailStatuses: ["verified"], seniorities: [], technologiesAny: "", technologiesAll: "", technologiesExclude: "", revenueMin: "", revenueMax: "", fundingMin: "", fundingMax: "" };
const SENIORITIES = ["owner","founder","c_suite","partner","vp","head","director","manager","senior","entry","intern"];
const EMPLOYEE_RANGES = ["1,10", "11,20", "21,50", "51,100", "101,200", "201,500", "501,1000", "1001,2000", "2001,5000", "5001,10000", "10001,1000000"];

const splitFilters = (value) => String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
const splitLocations = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return [];
  if (/[;\n]/.test(raw)) return raw.split(/[;\n]+/).map((item) => item.trim()).filter(Boolean);
  const pieces = raw.split(",").map((item) => item.trim()).filter(Boolean);
  const locations = [];
  for (const piece of pieces) {
    if (/^(US|USA|United States)$/i.test(piece) && locations.length) locations[locations.length - 1] += `, ${piece}`;
    else locations.push(piece);
  }
  return locations;
};
const employeeRangeLabel = (range) => range === "10001,1000000" ? "10,001+" : range.replace(",", "–");
const employeeRangeBounds = (ranges = []) => {
  const parsed = ranges.map((range) => range.split(",").map(Number)).filter(([min, max]) => Number.isFinite(min) && Number.isFinite(max));
  return parsed.length ? { min: Math.min(...parsed.map(([min]) => min)), max: Math.max(...parsed.map(([, max]) => max)) } : { min: null, max: null };
};
const suggestedSearchName = (target, campaignName = "") => {
  const focus = splitFilters(target.keywords)[0] || splitFilters(target.titles)[0] || "Event prospects";
  const locations = splitLocations(target.locations).map((item) => item.replace(/,?\s*US$/i, "")).slice(0, 2).join(" + ");
  return [campaignName, focus, locations].filter(Boolean).join(" · ");
};
const buildApolloPeopleUrl = (target) => {
  const params = new URLSearchParams({ page: "1" });
  splitFilters(target.titles).forEach((value) => params.append("personTitles[]", value));
  splitLocations(target.locations).forEach((value) => params.append("personLocations[]", value));
  splitFilters(target.keywords).forEach((value) => params.append("qOrganizationKeywordTags[]", value));
  (target.emailStatuses || []).forEach((value) => params.append("contactEmailStatusV2[]", value));
  (target.employeeRanges || []).forEach((value) => params.append("organizationNumEmployeesRanges[]", value));
  (target.seniorities || []).forEach((value) => params.append("personSeniorities[]", value));
  return `https://app.apollo.io/#/people?${params.toString()}`;
};

export default function Discovery() {
  const [prospects, setProspects] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [query, setQuery] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [eventCampaignId, setEventCampaignId] = useState("");
  const [emailFilter, setEmailFilter] = useState("verified");
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
  const [apolloListCapability, setApolloListCapability] = useState({ state: "checking", message: "Checking saved-list access…" });
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
      .then((items) => {
        const available = Array.isArray(items) ? items.filter((item) => item?._id) : [];
        setCampaigns(available);
        if (available[0]) setEventCampaignId(available[0]._id);
      })
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
    fetchApolloLists()
      .then((data) => {
        setApolloLists((data.lists || []).filter((item) => item.modality === "contacts"));
        setApolloListCapability({ state: data.available === false ? "unavailable" : "available", code: data.code, message: data.message, action: data.action });
      })
      .catch((error) => setApolloListCapability({ state: "error", code: error.response?.data?.errorCode || "provider_error", message: error.response?.data?.message || "Ellie could not check Apollo saved-list access.", action: "Recheck the Apollo connection or try again later." }));
    fetchApolloHistory().then((data) => setApolloHistory(data.runs || [])).catch(() => {});
  }, []);

  const filtered = useMemo(() => prospects.filter((item) => {
    const searchText = [item?.name, item?.company, item?.email].filter(Boolean).join(" ").toLowerCase();
    return (!query || searchText.includes(query.toLowerCase()))
      && (!campaignId || item?.campaignIds?.some((id) => String(id) === campaignId))
      && (emailFilter === "verified"
        ? item?.emailStatus === "verified"
        : emailFilter === "review"
          ? item?.emailStatus !== "verified"
          : true);
  }), [prospects, query, campaignId, emailFilter]);

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
  const peopleApiAvailable = apolloStatus.capabilities?.peopleSearch?.available !== false;
  const peopleSearchRunsInApollo = !peopleApiAvailable || splitFilters(target.keywords).length > 0;
  const currentFilterGroups = searchMode === "people" ? [
    ["Job titles", splitFilters(target.titles)],
    ["Person locations", splitLocations(target.locations)],
    ["Company keywords", splitFilters(target.keywords)],
    ["Email status", target.emailStatuses || []],
    ["Employees", (target.employeeRanges || []).map(employeeRangeLabel)],
  ].filter(([, values]) => values.length) : [];
  const currentFilterCount = currentFilterGroups.reduce((total, [, values]) => total + values.length, 0);

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
    const template = templates.find((item) => item.id === value);
    setTarget(value === "custom" ? { ...EMPTY_TARGET } : { ...template });
    if (template?.mode) setSearchMode(template.mode);
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
    const campaign = campaigns.find((item) => item._id === eventCampaignId);
    const name = target.name.trim() || suggestedSearchName(target, campaign?.name);
    if (!name) return setNotice("Give this search template a name first.");
    const namedTarget = { ...target, name, mode: searchMode };
    if (targetPreset !== "custom") {
      return persistTemplates(templates.map((template) => template.id === targetPreset ? { ...namedTarget, id: targetPreset } : template), targetPreset);
    }
    const id = globalThis.crypto?.randomUUID?.() || `template-${Date.now()}`;
    setTarget(namedTarget);
    await persistTemplates([...templates, { ...namedTarget, id }], id);
  };

  const buildEventAudience = () => {
    const campaign = campaigns.find((item) => item._id === eventCampaignId);
    if (!campaign) return setNotice("Choose an event or campaign first.");
    const isMultifamily = /multifamily|deal to close/i.test(`${campaign.name || ""} ${campaign.programName || ""}`);
    const next = isMultifamily ? {
      ...EMPTY_TARGET,
      name: `${campaign.name} · acquisitions & underwriting · FL + TX`,
      titles: "Acquisitions Manager, Underwriter, Managing Partner",
      keywords: "Multifamily, Syndication, Rent Roll",
      locations: "Florida, US; Texas, US",
      employeeRanges: ["1,10"],
      emailStatuses: ["verified"],
    } : {
      ...EMPTY_TARGET,
      name: `${campaign.name} · event prospects`,
      titles: "Owner, Founder, Managing Partner",
      keywords: campaign.programName || campaign.name,
      locations: "United States",
      employeeRanges: ["1,10", "11,20", "21,50"],
      emailStatuses: ["verified"],
    };
    setSearchMode("people");
    setTargetPreset("custom");
    setTarget(next);
    setNotice("Event audience prepared. Review the filters, save the search, then open it in Apollo.");
  };

  const openApolloPeopleSearch = () => {
    if (!splitFilters(target.titles).length) return setNotice("Add at least one job title first.");
    window.open(buildApolloPeopleUrl(target), "_blank", "noopener,noreferrer");
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
          locations: splitLocations(target.locations),
          industryIds: target.industryIds || [],
          emailStatuses: target.emailStatuses || [],
          employeeRanges: target.employeeRanges || [],
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
          locations: splitLocations(target.locations),
          employeeRange: (target.employeeRanges || []).length ? employeeRangeBounds(target.employeeRanges) : {
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
          <p className="page-subtitle">Find new people and companies through Apollo, then review the best matches before adding them to your CRM.</p>
        </div>
      </header>

      <p className="discovery-notice">
        <strong>Discovery and CRM have different jobs:</strong> Discovery finds
        net-new prospects. The CRM stores contacts you already collected,
        imported, met, or received from another system.
      </p>

      <div className="apollo-workbench">
      <DashboardCard title="Filters" className="apollo-filter-panel" action={<span className="apollo-filter-count">{searchMode === "people" ? "People" : "Companies"}</span>}>
        <div className={`apollo-connection-panel is-${apolloStatus.state}`}><span className="status-dot" /><div><strong>{apolloStatus.state === "connected" ? "Apollo search ready" : apolloStatus.state === "checking" ? "Checking Apollo account" : "Apollo account needs attention"}</strong><p>{apolloStatus.state === "connected" ? "People and company search access is connected." : apolloStatus.message}</p></div><Button variant="ghost" size="sm" onClick={() => { setApolloStatus({ state: "checking", message: "Checking Apollo connection…" }); fetchApolloStatus().then((status) => setApolloStatus({ ...status, state: status.connected ? "connected" : "error" })).catch((error) => setApolloStatus({ state: "error", message: error.response?.data?.message || "Unable to verify Apollo." })); }}>Recheck</Button></div>
        {apolloListCapability.state === "unavailable" ? <div className="apollo-capability-notice" role="status"><div><strong>Saved-list sync unavailable</strong><span>{apolloListCapability.message}</span><small>{apolloListCapability.action}</small></div></div> : null}
        {!peopleApiAvailable ? <div className="apollo-capability-notice" role="status"><div><strong>People Search runs in Apollo on the Free plan</strong><span>Ellie can build, name, save, and reopen the exact web search. Apollo does not allow this account to return People results through its API.</span><small>Upgrade Apollo when you want the same People results returned inside Ellie.</small></div></div> : null}
        <div className="apollo-event-builder"><label>Build an audience for<select value={eventCampaignId} onChange={(event) => setEventCampaignId(event.target.value)}><option value="">Choose event or campaign</option>{campaigns.map((campaign) => <option key={campaign._id} value={campaign._id}>{campaign.name}</option>)}</select></label><Button variant="outline" size="sm" onClick={buildEventAudience}>Generate event search</Button></div>
        <p className="apollo-note">Choose a saved filter set or build a new one. Saved searches here are reusable Ellie filters for searching Apollo.</p>
        <div className="apollo-target-topline">
          <label>Saved search template<select value={targetPreset} onChange={(event) => selectPreset(event.target.value)}><option value="custom">New custom search</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label>
          <label>Search mode<select value={searchMode} onChange={(event) => setSearchMode(event.target.value)}><option value="organizations">Organizations</option><option value="people">People</option></select></label>
        </div>
        <div className="apollo-target-grid">
          <label>Search name<input value={target.name} onChange={(event) => setTarget({ ...target, name: event.target.value })} placeholder={suggestedSearchName(target, campaigns.find((item) => item._id === eventCampaignId)?.name) || "Example: Multifamily partners · FL + TX"} /><small>Saved in Ellie so you can reopen the same audience later.</small></label>
          {searchMode === "people" ? <label>Job titles<input value={target.titles} onChange={(event) => setTarget({ ...target, titles: event.target.value })} placeholder="Owner, Founder, Investor" /></label> : null}
          {searchMode === "organizations" ? <label>Company industries<input value={target.industries} onChange={(event) => setTarget({ ...target, industries: event.target.value })} placeholder="Real estate, hospitality" /><small>Sent to Apollo as company keyword tags.</small></label> : null}
          <label>Company keywords<input value={target.keywords} onChange={(event) => setTarget({ ...target, keywords: event.target.value })} placeholder="multifamily, Airbnb, acquisitions" /></label>
          <label>{searchMode === "people" ? "Person locations" : "Headquarters locations"}<input value={target.locations} onChange={(event) => setTarget({ ...target, locations: event.target.value })} placeholder="Florida, US; Texas, US" /><small>{searchMode === "people" ? "Matches where the person lives. Separate locations with a semicolon." : "Matches company headquarters. Separate locations with a semicolon."}</small></label>
          <fieldset className="apollo-employee-ranges"><legend>Company size · employees</legend>{EMPLOYEE_RANGES.map((range) => <label key={range}><input type="checkbox" checked={(target.employeeRanges || []).includes(range)} onChange={() => setTarget({ ...target, employeeRanges: (target.employeeRanges || []).includes(range) ? target.employeeRanges.filter((item) => item !== range) : [...(target.employeeRanges || []), range], employeeMin: "", employeeMax: "" })} />{employeeRangeLabel(range)}</label>)}<small>Select one or more Apollo ranges.</small></fieldset>
          {searchMode === "people" ? <fieldset className="apollo-verified-filter"><legend>Email status</legend><label><input type="checkbox" checked={(target.emailStatuses || []).includes("verified")} onChange={(event) => setTarget({ ...target, emailStatuses: event.target.checked ? ["verified"] : [] })} />Verified emails only</label></fieldset> : null}
        </div>
        {searchMode === "people" && currentFilterGroups.length ? <div className="apollo-search-blueprint"><header><div><strong>Search blueprint</strong><span>{currentFilterCount} active filters</span></div><small>{peopleSearchRunsInApollo ? "Opens as a filtered search in Apollo" : "Runs through Apollo People Search API"}</small></header>{currentFilterGroups.map(([label, values]) => <div key={label}><strong>{label}</strong><span>{values.join(" · ")}</span></div>)}</div> : null}
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
        <div className="apollo-search-actions"><Button loading={searchingApollo} onClick={() => searchMode === "people" && peopleSearchRunsInApollo ? openApolloPeopleSearch() : runApolloSearch(1)}>{searchMode === "people" ? (peopleSearchRunsInApollo ? "Open search in Apollo" : "Find matching people") : "Find matching organizations"}</Button></div>
        {apolloError ? <div className="apollo-error-panel" role="alert"><strong>{apolloError.title}</strong><p>{apolloError.message}</p><span>{apolloError.action}</span>{apolloError.code ? <small>Error code: {apolloError.code}{apolloError.retryAfter ? ` · Retry after ${apolloError.retryAfter}` : ""}</small> : null}</div> : null}
        <div className="apollo-status"><span className="status-dot" />People Search: no search credit · Organization Search: 1 credit per results page · Enrichment may use credits</div>
        <p className="apollo-note">Company results are saved in Ellie’s Discovery workspace so you can review and use them later. Your Apollo account stays unchanged unless you explicitly synchronize selected people to an Apollo list.</p>
      </DashboardCard>
      <div className="apollo-results-pane">
      {searchMode === "people" && apolloPeople.length ? <DashboardCard title="Apollo people results" action={<span>{apolloPeopleTotal.toLocaleString()} matched</span>}>
        <div className="apollo-people-toolbar">
          <label>Assign to campaign<select value={campaignId} onChange={(event) => setCampaignId(event.target.value)}><option value="">Choose campaign</option>{campaigns.map((campaign) => <option key={campaign._id} value={campaign._id}>{campaign.name}</option>)}</select></label>
          <label>Synchronize to Apollo list<select disabled={apolloListCapability.state !== "available"} value={apolloListName} onChange={(event) => setApolloListName(event.target.value)}><option value="">{apolloListCapability.state === "available" ? "Do not sync to a list" : "Unavailable for this API key"}</option>{apolloLists.map((list) => <option key={list.id || list._id} value={list.name}>{list.name}</option>)}</select></label>
          <Button disabled={!selectedApolloPeople.length || !campaignId} onClick={importSelectedPeople}>{enrichmentEstimate?.count === selectedApolloPeople.length ? "Approve enrichment & import" : `Review cost for ${selectedApolloPeople.length || 0}`}</Button>
        </div>
        {enrichmentEstimate?.count === selectedApolloPeople.length ? <div className="apollo-credit-estimate" role="status"><div><strong>Approval required</strong><span>{enrichmentEstimate.count} selected contacts may use {enrichmentEstimate.minimumCredits}–{enrichmentEstimate.maximumCredits} Apollo credits.</span><small>{enrichmentEstimate.note}</small></div><Button variant="ghost" size="sm" onClick={() => setEnrichmentEstimate(null)}>Cancel</Button></div> : null}
        <div className="apollo-people-table"><div className="apollo-people-row apollo-people-row--header"><input type="checkbox" checked={selectedApolloPeople.length === apolloPeople.length} onChange={() => { setSelectedApolloPeople(selectedApolloPeople.length === apolloPeople.length ? [] : apolloPeople.map((person) => person.apolloPersonId)); setEnrichmentEstimate(null); }} /><span>Name</span><span>Title</span><span>Company</span><span>Email status</span></div>{apolloPeople.map((person) => <div className="apollo-people-row" key={person.apolloPersonId}><input type="checkbox" checked={selectedApolloPeople.includes(person.apolloPersonId)} onChange={() => { setSelectedApolloPeople((items) => items.includes(person.apolloPersonId) ? items.filter((id) => id !== person.apolloPersonId) : [...items, person.apolloPersonId]); setEnrichmentEstimate(null); }} /><span><strong>{person.name || "Apollo prospect"}</strong><small>{person.location}</small></span><span>{person.title || "—"}</span><span>{person.company || "—"}</span><span>{person.emailStatus || "Unavailable"}</span></div>)}</div>
        <div className="apollo-results-pagination"><Button variant="outline" size="sm" disabled={apolloPeoplePage === 1 || searchingApollo} onClick={() => runApolloSearch(apolloPeoplePage - 1)}>Previous</Button><span>Page {apolloPeoplePage} · showing {apolloPeople.length} results</span><Button variant="outline" size="sm" disabled={apolloPeoplePage * 25 >= apolloPeopleTotal || searchingApollo} onClick={() => runApolloSearch(apolloPeoplePage + 1)}>Next</Button></div>
      </DashboardCard> : null}
      {searchMode === "people" && !apolloPeople.length ? <DashboardCard title="People results" className="apollo-results-empty"><div><strong>{searchingApollo ? "Searching Apollo…" : "Ready to search"}</strong><p>Set filters on the left, then find matching people. Results will stay here in a selectable table.</p></div></DashboardCard> : null}
      {searchMode === "organizations" ? <DashboardCard title="Company results" className="apollo-results-empty" action={apolloResult ? <span>{apolloResult.organizationsFound || 0} matched</span> : null}><div><strong>{searchingApollo ? "Searching Apollo…" : apolloResult ? (apolloResult.organizationsFound ? "Companies saved to Discovery" : "No matching companies") : "Ready to search"}</strong><p>{apolloResult?.organizationsFound ? `${apolloResult.organizationsCreated || 0} new companies were added and ${apolloResult.organizationsUpdated || 0} were updated. Open Prospect review below when you are ready to work with them.` : "Set company filters on the left. Matching organizations will be saved in Ellie for review."}</p></div></DashboardCard> : null}

      <DashboardCard title="Search activity" className="apollo-history-panel" action={<span>Last {apolloHistory.length}</span>}>
        <div className="apollo-performance-summary"><div><strong>{apolloPerformance.searches}</strong><span>Searches</span></div><div><strong>{apolloPerformance.successRate}%</strong><span>Completed</span></div><div><strong>{apolloPerformance.matches.toLocaleString()}</strong><span>Total matches</span></div><div><strong>{apolloPerformance.averageSeconds}s</strong><span>Average time</span></div></div>
        {apolloHistory.length ? <div className="apollo-history-table"><div className="apollo-history-row apollo-history-row--header"><span>Date</span><span>Search</span><span>Mode</span><span>Status</span><span>Matches</span><span>Time</span></div>{apolloHistory.slice(0, 5).map((run) => <div className="apollo-history-row" key={run._id}><span>{new Date(run.createdAt).toLocaleString()}</span><span>{run.templateName || "Custom search"}</span><span>{run.mode}</span><span className={`is-${run.status}`}>{run.status}</span><span>{(run.totalMatches || 0).toLocaleString()}</span><span>{((run.durationMs || 0) / 1000).toFixed(1)}s</span></div>)}</div> : <div className="table-state table-state--empty">Search history will appear after the first Apollo search.</div>}
      </DashboardCard>
      </div>
      </div>

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

      <section className="discovery-stats">
        <DashboardCard title="Waiting for review"><strong>{prospects.length}</strong><span>Prospects currently in your work queue</span></DashboardCard>
        <DashboardCard title="Approved this week"><strong>—</strong><span>Live data appears after approvals</span></DashboardCard>
        <DashboardCard title="Added this week"><strong>{prospects.filter((item) => item?.importedAt && Date.now() - new Date(item.importedAt) < 604800000).length}</strong><span>Apollo prospects added to review</span></DashboardCard>
        <DashboardCard title="Apollo account"><strong>{apolloStatus.state === "connected" ? "Ready" : "Check account"}</strong><span>Search access and permissions</span></DashboardCard>
      </section>

      <Modal isOpen={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} title="Delete prospect" footer={<><Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button><Button onClick={remove}>Delete permanently</Button></>}>
        <p>Delete this prospect permanently? This action cannot be undone.</p>
      </Modal>
    </div>
  );
}
