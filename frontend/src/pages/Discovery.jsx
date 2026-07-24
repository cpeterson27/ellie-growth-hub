import { useEffect, useMemo, useState } from "react";
import Button from "../components/Button.jsx";
import DashboardCard from "../components/DashboardCard.jsx";
import Modal from "../components/Modal.jsx";
import Table from "../components/Table.jsx";
import {
  deleteContact,
  fetchCampaigns,
  fetchContacts,
  importContactsFromMonday,
  updateContact,
} from "../services/api.js";
import "./Discovery.css";

export default function Discovery() {
  const [prospects, setProspects] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [query, setQuery] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [source, setSource] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [notice, setNotice] = useState("");

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

      <DashboardCard title="Apollo search">
        <div className="apollo-search-grid">
          <label>Search mode<select defaultValue="people"><option value="people">People</option><option value="organizations">Organizations</option></select></label>
          <label>Search<input disabled placeholder="People Search requires API access" /></label>
          <Button disabled>Search Apollo</Button>
        </div>
        <div className="apollo-status"><span className="status-dot" />Connected · Free plan · People Search unavailable · Organization Search available</div>
        <p className="apollo-note">People Search requires an Apollo plan with API access. It will be available here automatically after your upgrade.</p>
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
