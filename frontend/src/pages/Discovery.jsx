import { useEffect, useMemo, useState } from "react";
import Button from "../components/Button.jsx";
import DashboardCard from "../components/DashboardCard.jsx";
import Modal from "../components/Modal.jsx";
import Table from "../components/Table.jsx";
import {
  deleteContact,
  createAudienceDefinition,
  discoverAudienceOrganizations,
  fetchCampaigns,
  fetchContacts,
  importContactsFromMonday,
  searchApolloLeads,
  updateContact,
} from "../services/api.js";
import "./Discovery.css";
import "./DiscoveryTargeting.css";

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
  const [importOpen, setImportOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [notice, setNotice] = useState("");
  const [searchMode, setSearchMode] = useState("organizations");
  const [targetPreset, setTargetPreset] = useState("real_estate");
  const [target, setTarget] = useState(TARGET_PRESETS.real_estate);
  const [searchingApollo, setSearchingApollo] = useState(false);

  const loadProspects = async () => {
    const response = await fetchContacts({ status: "prospect" });
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
      && (!source || item?.sourceProvider === source || item?.sources?.includes(source));
  }), [prospects, query, campaignId, source]);

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
      setNotice(`${result.organizationsFound || 0} organizations found for “${target.name}”; ${result.organizationsCreated || 0} added and ${result.organizationsUpdated || 0} updated.`);
    } catch (error) {
      setNotice(error.response?.data?.message || error.response?.data?.error || "Apollo search could not be completed.");
    } finally {
      setSearchingApollo(false);
    }
  };

  const columns = [
    { header: "Name", accessor: "name" },
    { header: "Title", accessor: "title" },
    { header: "Company", accessor: "company" },
    { header: "Email", accessor: "email" },
    { header: "Source", render: (row) => row.sourceProvider || row.sources?.join(", ") || "—" },
    { header: "Campaign", render: (row) => row.campaignIds?.length ? "Assigned" : "—" },
    { header: "Imported", render: (row) => row.importedAt ? new Date(row.importedAt).toLocaleDateString() : "—" },
    {
      header: "Actions",
      render: (row) => (
        <div className="discovery-actions">
          <Button variant="outline" onClick={() => approve(row)}>Approve</Button>
          <Button variant="outline" onClick={() => setDeleteTarget(row)}>Delete</Button>
        </div>
      ),
    },
  ];

  return (
    <div className="page-dashboard discovery-page">
      <header className="discovery-header">
        <div>
          <p className="discovery-kicker">Lead pipeline</p>
          <h1 className="page-title">Discovery</h1>
          <p className="page-subtitle">Bring in prospects, qualify the fit, and approve only the people ready for your CRM.</p>
        </div>
        <Button onClick={() => setImportOpen(true)}>Import prospects</Button>
      </header>

      <DashboardCard title="Apollo targeting">
        <p className="apollo-note">Choose who this search is for, then adjust the filters. Organization discovery works on the connected plan; People Search requires Apollo API access.</p>
        <div className="apollo-target-topline">
          <label>Target profile<select value={targetPreset} onChange={(event) => selectPreset(event.target.value)}><option value="real_estate">Real estate decision-makers</option><option value="short_term_rental">Airbnb / short-term rental investors</option><option value="program_15k">$15K program prospects</option><option value="custom">Custom search</option></select></label>
          <label>Search mode<select value={searchMode} onChange={(event) => setSearchMode(event.target.value)}><option value="organizations">Organizations</option><option value="people">People</option></select></label>
        </div>
        <div className="apollo-target-grid">
          <label>Titles<input value={target.titles} onChange={(event) => setTarget({ ...target, titles: event.target.value })} placeholder="Owner, Founder, Investor" /></label>
          <label>Industries<input value={target.industries} onChange={(event) => setTarget({ ...target, industries: event.target.value })} placeholder="Real Estate, Hospitality" /></label>
          <label>Keywords<input value={target.keywords} onChange={(event) => setTarget({ ...target, keywords: event.target.value })} placeholder="multifamily, Airbnb, acquisitions" /></label>
          <label>Locations<input value={target.locations} onChange={(event) => setTarget({ ...target, locations: event.target.value })} placeholder="United States, Texas" /></label>
          <label>Minimum employees<input type="number" min="0" value={target.employeeMin} onChange={(event) => setTarget({ ...target, employeeMin: event.target.value })} /></label>
          <label>Maximum employees<input type="number" min="0" value={target.employeeMax} onChange={(event) => setTarget({ ...target, employeeMax: event.target.value })} /></label>
        </div>
        <div className="apollo-search-actions"><Button loading={searchingApollo} disabled={searchMode === "people"} onClick={runApolloSearch}>{searchMode === "people" ? "People Search requires paid Apollo" : "Find matching organizations"}</Button></div>
        <div className="apollo-status"><span className="status-dot" />Connected · Free plan · People Search unavailable · Organization Search available</div>
        <p className="apollo-note">Profiles are starting points, not permanent rules. Ellie can switch profiles for each offer or campaign.</p>
      </DashboardCard>

      <section className="discovery-stats">
        <DashboardCard title="New prospects"><strong>{prospects.length}</strong><span>Awaiting review</span></DashboardCard>
        <DashboardCard title="Approved this week"><strong>—</strong><span>Live data appears after approvals</span></DashboardCard>
        <DashboardCard title="Imported this week"><strong>{prospects.filter((item) => item?.importedAt && Date.now() - new Date(item.importedAt) < 604800000).length}</strong><span>Across all import sources</span></DashboardCard>
        <DashboardCard title="Apollo status"><strong>Free plan</strong><span>CSV and organizations available</span></DashboardCard>
      </section>

      <DashboardCard title="Prospect review">
        <div className="discovery-filters">
          <input className="select-input" placeholder="Search name, company, or email" value={query} onChange={(event) => setQuery(event.target.value)} />
          <select value={source} onChange={(event) => setSource(event.target.value)}><option value="">All sources</option><option value="apollo">Apollo</option><option value="csv">CSV</option><option value="monday">Monday</option></select>
          <select value={campaignId} onChange={(event) => setCampaignId(event.target.value)}><option value="">All campaigns</option>{campaigns.map((campaign) => <option key={campaign._id} value={campaign._id}>{campaign.name}</option>)}</select>
        </div>
        {notice ? <p className="discovery-notice">{notice}</p> : null}
        <Table columns={columns} data={filtered} emptyMessage="No prospects are waiting for review." />
      </DashboardCard>

      <Modal isOpen={importOpen} onClose={() => setImportOpen(false)} title="Import prospects" footer={<Button variant="outline" onClick={() => setImportOpen(false)}>Close</Button>}>
        <div className="import-modal">
          <p>Choose how you want to add prospects. Imported records stay in Discovery until you approve them.</p>
          <button onClick={() => setNotice("Use Contacts → Import → Apollo CSV to upload your Apollo export.")}><strong>Apollo CSV</strong><span>Import a downloaded Apollo export</span></button>
          <button onClick={() => setNotice("Use Contacts → Import → Standard CSV to upload a spreadsheet export.")}><strong>Standard CSV</strong><span>Import contacts from a spreadsheet export</span></button>
          <button onClick={async () => { await importContactsFromMonday(); await loadProspects(); setImportOpen(false); }}><strong>Monday CRM</strong><span>Pull prospects from your connected Monday board</span></button>
          <button onClick={() => setNotice("Organization discovery will use Apollo Organization Search when that workflow is enabled.")}><strong>Organization discovery</strong><span>Search organizations before People Search is upgraded</span></button>
        </div>
      </Modal>

      <Modal isOpen={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} title="Delete prospect" footer={<><Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button><Button onClick={remove}>Delete permanently</Button></>}>
        <p>Delete this prospect permanently? This action cannot be undone.</p>
      </Modal>
    </div>
  );
}
