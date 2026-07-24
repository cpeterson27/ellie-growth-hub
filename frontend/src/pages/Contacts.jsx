import { useEffect, useState } from "react";

import Button from "../components/Button.jsx";
import DashboardCard from "../components/DashboardCard.jsx";
import Modal from "../components/Modal.jsx";
import Table from "../components/Table.jsx";
import {
  fetchContacts,
  fetchCampaigns,
  importContactsFromApollo,
  importContactsFromMonday,
  searchApolloLeads,
} from "../services/api.js";

const columns = [
  { header: "Name", accessor: "name" },
  { header: "Email", accessor: "email" },
  { header: "Company", accessor: "company" },
  { header: "Status", accessor: "status" },
];

const importCopy = {
  monday: {
    title: "Import Contacts from Monday CRM?",
    body: "This will pull contacts from your Monday CRM into Ellie AI. Do you want to continue?",
  },
  apollo: {
    title: "Import Contacts from Apollo?",
    body: "This will use Apollo API credits to pull contacts into Ellie AI. Do you want to continue?",
  },
};

export default function Contacts() {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [selectedSource, setSelectedSource] = useState(null);
  const [isConfirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState("");
  const [campaigns, setCampaigns] = useState([]);
  const [campaignId, setCampaignId] = useState("");
  const [filters, setFilters] = useState({ title: "", location: "", industry: "", employeeSize: "" });
  const [apolloResults, setApolloResults] = useState([]);
  const [selectedLeads, setSelectedLeads] = useState([]);
  const [searching, setSearching] = useState(false);
  const [importSummary, setImportSummary] = useState(null);

  async function loadContacts() {
    try {
      setLoading(true);
      const response = await fetchContacts();
      setContacts(response.data || []);
    } catch (err) {
      setError(err.response?.data?.message || "Unable to load contacts");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadContacts();
    fetchCampaigns().then((items) => {
      setCampaigns(items);
      setCampaignId(items[0]?._id || "");
    }).catch(() => setError("Unable to load campaigns"));
  }, []);

  function openImportConfirmation(source) {
    setError("");
    setSelectedSource(source);
    setConfirmOpen(true);
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

      if (selectedSource === "monday") {
        await importContactsFromMonday();
      } else {
        const response = await importContactsFromApollo({ campaignId, leads: selectedLeads });
        setImportSummary(response.data);
      }

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
    if (!campaignId) return setError("Select a campaign before searching Apollo.");
    try {
      setSearching(true); setError(""); setImportSummary(null);
      const response = await searchApolloLeads({
        campaignId,
        titles: filters.title ? [filters.title] : [],
        locations: filters.location ? [filters.location] : [],
        keywords: [filters.industry, filters.employeeSize].filter(Boolean),
      });
      setApolloResults(response.data?.results || []);
      setSelectedLeads([]);
    } catch (err) { setError(err.response?.data?.message || "Apollo search failed"); }
    finally { setSearching(false); }
  }

  function toggleLead(lead) {
    const id = lead.apolloPersonId || lead.email || lead.linkedinUrl;
    setSelectedLeads((current) => current.some((item) => (item.apolloPersonId || item.email || item.linkedinUrl) === id)
      ? current.filter((item) => (item.apolloPersonId || item.email || item.linkedinUrl) !== id)
      : [...current, lead]);
  }

  return (
    <div className="page-dashboard">
      <div className="page-header">
        <div>
          <h1 className="page-title">Contacts</h1>
          <p className="page-subtitle">Import and manage outreach contacts.</p>
        </div>
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <Button
            variant="outline"
            onClick={() => openImportConfirmation("monday")}
            disabled={importing}
          >
            Import from Monday CRM
          </Button>
        </div>
      </div>

      <DashboardCard title="Contacts">
        {error ? <p className="form-error">{error}</p> : null}
        <Table
          columns={columns}
          data={contacts}
          loading={loading}
          emptyMessage="No contacts found yet."
        />
      </DashboardCard>

      <DashboardCard title="Find Leads">
        <div style={{ display: "grid", gap: "0.75rem" }}>
          <select value={campaignId} onChange={(event) => setCampaignId(event.target.value)} className="select-input">
            <option value="">Select campaign</option>
            {campaigns.map((campaign) => <option key={campaign._id} value={campaign._id}>{campaign.name}</option>)}
          </select>
          {[["title", "Job title"], ["location", "Location"], ["industry", "Industry"], ["employeeSize", "Company employee size"]].map(([key, label]) => (
            <input key={key} className="select-input" placeholder={label} value={filters[key]} onChange={(event) => setFilters({ ...filters, [key]: event.target.value })} />
          ))}
          <Button loading={searching} onClick={searchApollo}>Search Leads</Button>
        </div>
        {apolloResults.length ? <>
          <p>{selectedLeads.length} selected</p>
          <Button variant="outline" onClick={() => setSelectedLeads(selectedLeads.length === apolloResults.length ? [] : apolloResults)}>Select all / Clear all</Button>
          <div style={{ overflowX: "auto", marginTop: "1rem" }}><table><thead><tr><th>Select</th><th>Name</th><th>Role</th><th>Company</th><th>Email</th><th>Location</th><th>LinkedIn</th></tr></thead><tbody>{apolloResults.map((lead) => { const id = lead.apolloPersonId || lead.email || lead.linkedinUrl; const selected = selectedLeads.some((item) => (item.apolloPersonId || item.email || item.linkedinUrl) === id); return <tr key={id}><td><input type="checkbox" checked={selected} onChange={() => toggleLead(lead)} /></td><td>{lead.name}</td><td>{lead.title}</td><td>{lead.company}</td><td>{lead.email || "Unavailable"}</td><td>{lead.location}</td><td>{lead.linkedinUrl ? <a href={lead.linkedinUrl} target="_blank" rel="noreferrer">Open</a> : "—"}</td></tr>; })}</tbody></table></div>
          <Button variant="primary" disabled={!selectedLeads.length} onClick={() => openImportConfirmation("apollo")}>Import Selected Leads</Button>
        </> : <p>Search Apollo to review leads before importing.</p>}
        {importSummary ? <p>Imported: {importSummary.imported}; skipped: {importSummary.skipped}; failed: {importSummary.failed}.</p> : null}
      </DashboardCard>

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
    </div>
  );
}
