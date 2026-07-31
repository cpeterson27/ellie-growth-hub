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
  searchApolloLeads,
  updateContact,
} from "../services/api.js";
import "./Discovery.css";
import "./DiscoveryTargeting.css";
import "./DiscoveryReview.css";

const TARGET_PRESETS = {
  custom: { name: "Custom search", titles: "", industries: "", keywords: "", locations: "", employeeMin: "", employeeMax: "" },
  real_estate: { name: "Real estate decision-makers", titles: "Owner, Founder, Principal, Managing Partner, Director of Acquisitions", industries: "Real Estate", keywords: "real estate, multifamily, property investment", locations: "United States", employeeMin: "1", employeeMax: "500" },
  short_term_rental: { name: "Airbnb and short-term rental investors", titles: "Owner, Founder, Investor, Property Manager, Portfolio Manager", industries: "Real Estate, Hospitality", keywords: "Airbnb, short-term rental, vacation rental, STR investor", locations: "United States", employeeMin: "1", employeeMax: "200" },
  program_15k: { name: "$15K program prospects", titles: "Owner, Founder, CEO, Managing Partner, Real Estate Investor", industries: "Real Estate, Investment Management", keywords: "multifamily investor, real estate entrepreneur, portfolio growth, acquisitions", locations: "United States", employeeMin: "1", employeeMax: "100" },
};

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
  const [targetPreset, setTargetPreset] = useState("real_estate");
  const [target, setTarget] = useState(TARGET_PRESETS.real_estate);
  const [searchingApollo, setSearchingApollo] = useState(false);
  const [apolloResult, setApolloResult] = useState(null);

  const loadProspects = async () => {
    const response = await fetchContacts({ status: "prospect", limit: 500 });
    setProspects(Array.isArray(response?.data) ? response.data.filter(Boolean) : []);
  };

  useEffect(() => {
    loadProspects().catch(() => setNotice("Unable to load prospects."));
    fetchCampaigns()
      .then((items) => setCampaigns(Array.isArray(items) ? items.filter((item) => item?._id) : []))
      .catch(() => setNotice("Unable to load campaigns for filtering."));
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
    setTarget({ ...TARGET_PRESETS[value] });
  };

  const runApolloSearch = async () => {
    setSearchingApollo(true);
    setNotice("");
    setApolloResult(null);
    try {
      if (searchMode === "people") {
        const response = await searchApolloLeads({
          titles: splitFilters(target.titles),
          keywords: splitFilters(target.keywords),
          locations: splitFilters(target.locations),
          perPage: 25,
        });
        setNotice(`${response.data?.total || response.data?.results?.length || 0} people matched. Review and import paid-plan people results from Contacts.`);
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
          minimumScore: 0,
          targetTier: null,
        },
      });
      const result = await discoverAudienceOrganizations(created.audience._id);
      setApolloResult(result);
      setNotice(`${result.organizationsFound || 0} organizations found for “${target.name}”; ${result.organizationsCreated || 0} added and ${result.organizationsUpdated || 0} updated.`);
    } catch (error) {
      setNotice(error.response?.data?.message || error.response?.data?.error || "Apollo search could not be completed.");
    } finally {
      setSearchingApollo(false);
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
        <p className="apollo-note">Start with an Ellie search template, then adjust the Apollo-compatible company filters. Templates are saved in Ellie; they are not imported from your Apollo account.</p>
        <div className="apollo-target-topline">
          <label>Ellie search template<select value={targetPreset} onChange={(event) => selectPreset(event.target.value)}><option value="real_estate">Real estate decision-makers</option><option value="short_term_rental">Airbnb / short-term rental investors</option><option value="program_15k">$15K program prospects</option><option value="custom">Custom search</option></select></label>
          <label>Search mode<select value={searchMode} onChange={(event) => setSearchMode(event.target.value)}><option value="organizations">Organizations</option><option value="people">People</option></select></label>
        </div>
        <div className="apollo-target-grid">
          {searchMode === "people" ? <label>Job titles<input value={target.titles} onChange={(event) => setTarget({ ...target, titles: event.target.value })} placeholder="Owner, Founder, Investor" /></label> : null}
          <label>Company industries<input value={target.industries} onChange={(event) => setTarget({ ...target, industries: event.target.value })} placeholder="Real estate, hospitality" /><small>Sent to Apollo as company keyword tags.</small></label>
          <label>Company keywords<input value={target.keywords} onChange={(event) => setTarget({ ...target, keywords: event.target.value })} placeholder="multifamily, Airbnb, acquisitions" /></label>
          <label>Headquarters locations<input value={target.locations} onChange={(event) => setTarget({ ...target, locations: event.target.value })} placeholder="United States, Texas" /><small>Apollo matches the company headquarters.</small></label>
          <label>Minimum employees<input type="number" min="0" value={target.employeeMin} onChange={(event) => setTarget({ ...target, employeeMin: event.target.value })} /></label>
          <label>Maximum employees<input type="number" min="0" value={target.employeeMax} onChange={(event) => setTarget({ ...target, employeeMax: event.target.value })} /></label>
        </div>
        <div className="apollo-search-actions"><Button loading={searchingApollo} disabled={searchMode === "people"} onClick={runApolloSearch}>{searchMode === "people" ? "People Search requires paid Apollo" : "Find matching organizations"}</Button></div>
        {apolloResult ? <div className={`apollo-search-result ${apolloResult.organizationsFound ? "is-success" : "is-empty"}`} role="status"><strong>{apolloResult.organizationsFound ? `${apolloResult.organizationsFound} organizations found` : "Search completed — no matches found"}</strong><p>{apolloResult.organizationsFound ? `${apolloResult.organizationsCreated || 0} new organizations were added and ${apolloResult.organizationsUpdated || 0} existing records were updated.` : "Apollo is connected and responded successfully. Try fewer keywords, a broader location, or a larger employee range."}</p></div> : null}
        <div className="apollo-status"><span className="status-dot" />API key configured · Organization Search uses 1 Apollo credit per results page · People Search access depends on your Apollo key</div>
        <p className="apollo-note">Each search creates an Ellie audience record and saves matched companies to Discovery. It does not create or modify an Apollo saved search.</p>
      </DashboardCard>

      <section className="discovery-stats">
        <DashboardCard title="Newly discovered"><strong>{prospects.length}</strong><span>Prospects found through discovery tools</span></DashboardCard>
        <DashboardCard title="Approved this week"><strong>—</strong><span>Live data appears after approvals</span></DashboardCard>
        <DashboardCard title="Imported this week"><strong>{prospects.filter((item) => item?.importedAt && Date.now() - new Date(item.importedAt) < 604800000).length}</strong><span>Across all import sources</span></DashboardCard>
        <DashboardCard title="Apollo status"><strong>Free plan</strong><span>CSV and organizations available</span></DashboardCard>
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
