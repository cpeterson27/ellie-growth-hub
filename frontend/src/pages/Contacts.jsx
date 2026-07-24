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
  ingestContacts,
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
  const [searchMessage, setSearchMessage] = useState("");
  const [importSummary, setImportSummary] = useState(null);
  const [isContactFormOpen, setContactFormOpen] = useState(false);
  const [isUploadOpen, setUploadOpen] = useState(false);
  const [manualContact, setManualContact] = useState({ name: "", email: "", phone: "", company: "", title: "", notes: "", linkedin: "", location: "", tags: "" });
  const [importRows, setImportRows] = useState([]);
  const [importHeaders, setImportHeaders] = useState([]);
  const [importCampaignId, setImportCampaignId] = useState("");
  const [savingContact, setSavingContact] = useState(false);

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

  function parseDelimitedText(text) {
    const lines = String(text || "").split(/\r?\n/).filter((line) => line.trim());
    if (lines.length < 2) throw new Error("Include a header row and at least one contact row.");
    const delimiter = lines[0].includes("\t") ? "\t" : ",";
    const readLine = (line) => {
      const result = []; let value = ""; let quoted = false;
      for (let i = 0; i < line.length; i += 1) {
        const char = line[i];
        if (char === '"' && line[i + 1] === '"') { value += '"'; i += 1; }
        else if (char === '"') quoted = !quoted;
        else if (char === delimiter && !quoted) { result.push(value.trim()); value = ""; }
        else value += char;
      }
      return [...result, value.trim()];
    };
    const headers = readLine(lines[0]);
    return { headers, rows: lines.slice(1).map(readLine).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]))) };
  }

  function prepareImport(text) {
    try {
      const parsed = parseDelimitedText(text);
      setImportHeaders(parsed.headers); setImportRows(parsed.rows); setError(""); setUploadOpen(true);
    } catch (err) { setError(err.message); }
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
    if (!manualContact.name.trim()) { setError("Enter a name to save this contact."); return; }
    const saved = await saveIngestion([{ ...manualContact, city: manualContact.location, tags: manualContact.tags.split(",").map((tag) => tag.trim()).filter(Boolean) }], "manual", importCampaignId);
    if (saved) { setContactFormOpen(false); setManualContact({ name: "", email: "", phone: "", company: "", title: "", notes: "", linkedin: "", location: "", tags: "" }); }
  }

  async function saveUploadedContacts() {
    const saved = await saveIngestion(importRows, "csv", importCampaignId);
    if (saved) { setUploadOpen(false); setImportRows([]); setImportHeaders([]); }
  }

  return (
    <div className="page-dashboard">
      <div className="page-header">
        <div>
          <h1 className="page-title">Contacts</h1>
          <p className="page-subtitle">Import and manage outreach contacts.</p>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <Button onClick={() => { setError(""); setContactFormOpen(true); }}>New Contact</Button>
          <Button variant="outline" onClick={() => { setError(""); setUploadOpen(true); }}>Import Contacts</Button>
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
        {importSummary ? <p>MongoDB: {importSummary.mongoCreated} created, {importSummary.mongoUpdated} updated. Monday CRM: {importSummary.mondayCreated} created, {importSummary.mondayUpdated} updated, {importSummary.mondayFailed} failed.</p> : null}
        <Table
          columns={columns}
          data={contacts}
          loading={loading}
          emptyMessage="No contacts found yet."
        />
      </DashboardCard>

      <DashboardCard title="Find Leads">
        <p>Apollo prospect search requires a paid Apollo plan. You can still import an Apollo CSV or use organization discovery.</p>
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
        {importSummary ? <p>MongoDB: {importSummary.mongoCreated} created, {importSummary.mongoUpdated} updated; Monday: {importSummary.mondayCreated} created, {importSummary.mondayUpdated} updated, {importSummary.mondayFailed} failed.</p> : null}
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

      <Modal
        isOpen={isContactFormOpen}
        onClose={() => !savingContact && setContactFormOpen(false)}
        title="New Contact"
        footer={<><Button variant="outline" disabled={savingContact} onClick={() => setContactFormOpen(false)}>Cancel</Button><Button loading={savingContact} onClick={saveManualContact}>Save Contact</Button></>}
      >
        <p>Only a name is required. Saving also updates Monday CRM when it is configured.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.75rem" }}>
          {[["name", "Name *"], ["email", "Email"], ["phone", "Phone"], ["company", "Company"], ["title", "Title"], ["linkedin", "LinkedIn"], ["location", "Location"], ["tags", "Tags (comma-separated)"]].map(([key, label]) => <input key={key} className="select-input" placeholder={label} value={manualContact[key]} onChange={(event) => setManualContact({ ...manualContact, [key]: event.target.value })} />)}
          <select className="select-input" value={importCampaignId} onChange={(event) => setImportCampaignId(event.target.value)}><option value="">No campaign</option>{campaigns.map((campaign) => <option key={campaign._id} value={campaign._id}>{campaign.name}</option>)}</select>
        </div>
        <textarea className="select-input" style={{ width: "100%", marginTop: "0.75rem", minHeight: "90px" }} placeholder="Notes" value={manualContact.notes} onChange={(event) => setManualContact({ ...manualContact, notes: event.target.value })} />
      </Modal>

      <Modal
        isOpen={isUploadOpen}
        onClose={() => !savingContact && setUploadOpen(false)}
        title="Import Contacts"
        footer={<><Button variant="outline" disabled={savingContact} onClick={() => setUploadOpen(false)}>Cancel</Button><Button loading={savingContact} disabled={!importRows.length} onClick={saveUploadedContacts}>Confirm Import</Button></>}
      >
        {!importRows.length ? <><p>Upload a CSV or paste comma- or tab-separated data. Excel files are not supported in this build.</p><input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={(event) => { const file = event.target.files?.[0]; if (file) { const reader = new FileReader(); reader.onload = () => prepareImport(reader.result); reader.readAsText(file); } }} /><textarea className="select-input" style={{ width: "100%", marginTop: "0.75rem", minHeight: "130px" }} placeholder="Paste header row and contacts here" onChange={(event) => { if (event.target.value.includes("\n")) prepareImport(event.target.value); }} /></> : <>
          <p>Detected headers: {importHeaders.join(", ")}</p>
          <p>Recognized: {importHeaders.filter((header) => ["First Name", "Last Name", "Title", "Company Name", "Email", "Work Direct Phone", "Person Linkedin Url", "City", "State", "Country", "# Employees", "Industry", "Apollo Contact Id", "Apollo Record Id"].includes(header)).join(", ") || "none"}</p>
          <p>Unrecognized columns: {importHeaders.filter((header) => !["First Name", "Last Name", "Title", "Company Name", "Email", "Work Direct Phone", "Person Linkedin Url", "City", "State", "Country", "# Employees", "Industry", "Apollo Contact Id", "Apollo Record Id"].includes(header)).join(", ") || "none"}</p>
          <select className="select-input" value={importCampaignId} onChange={(event) => setImportCampaignId(event.target.value)}><option value="">No campaign</option>{campaigns.map((campaign) => <option key={campaign._id} value={campaign._id}>{campaign.name}</option>)}</select>
          <div style={{ overflowX: "auto", marginTop: "0.75rem" }}><table><thead><tr>{["Name", "Email", "Phone", "Company", "Title", "City/State", "Source", "Campaign"].map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{importRows.slice(0, 5).map((row, index) => <tr key={index}><td>{row.Name || `${row["First Name"] || ""} ${row["Last Name"] || ""}`.trim()}</td><td>{row.Email}</td><td>{row["Work Direct Phone"] || row.Phone}</td><td>{row["Company Name"] || row.Company}</td><td>{row.Title}</td><td>{[row.City, row.State].filter(Boolean).join(", ")}</td><td>CSV import</td><td>{campaigns.find((campaign) => campaign._id === importCampaignId)?.name || "—"}</td></tr>)}</tbody></table></div>
          <p>{importRows.length} rows ready. Rows with no usable name will be rejected; all recognized fields are retained.</p>
        </>}
      </Modal>
    </div>
  );
}
