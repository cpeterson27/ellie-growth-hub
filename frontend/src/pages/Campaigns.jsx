import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiArrowRight } from "react-icons/fi";
import DashboardCard from "../components/DashboardCard.jsx";
import Table from "../components/Table.jsx";
import Button from "../components/Button.jsx";
import Modal from "../components/Modal.jsx";
import CampaignModal from "../components/CampaignModal.jsx";
import { createCampaign, deleteCampaign, fetchCampaignDeletionPreview, fetchCampaigns } from "../services/api.js";
import { getWorkspaceSettings } from "../utils/workspaceSettings.js";

const audienceOptions = ["Airbnb investors", "Real estate investors", "House flippers", "Property management companies", "Multifamily investors", "Experienced real-estate operators", "Affiliate and referral partners"];

export default function Campaigns() {
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deletePreview, setDeletePreview] = useState(null);
  const [deleteOptions, setDeleteOptions] = useState({ deleteOutreach: false, deleteEvent: false });
  const [deleting, setDeleting] = useState(false);
  const [defaultCampaignKind] = useState(() => getWorkspaceSettings().defaultCampaignKind);

  const loadCampaigns = async () => {
    try { setLoading(true); setCampaigns(await fetchCampaigns()); }
    catch (err) { console.error("LOAD CAMPAIGNS ERROR:", err); setError("Unable to load campaigns"); }
    finally { setLoading(false); }
  };
  useEffect(() => { loadCampaigns(); }, []);

  const openDeleteModal = async (campaign) => {
    setError("");
    setDeleteTarget(campaign);
    setDeletePreview(null);
    setDeleteOptions({ deleteOutreach: false, deleteEvent: false });
    try { setDeletePreview(await fetchCampaignDeletionPreview(campaign._id)); }
    catch (err) { setError(err.response?.data?.error || "Unable to prepare campaign deletion."); setDeleteTarget(null); }
  };

  const handleCreate = async (values) => {
    try { setSubmitting(true); setError(""); await createCampaign(values); setIsOpen(false); await loadCampaigns(); }
    catch (err) { const message = err.response?.data?.error || err.message || "Unable to create campaign"; setError(message); throw err; }
    finally { setSubmitting(false); }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      await deleteCampaign(deleteTarget._id, deleteOptions);
      setDeleteTarget(null);
      setDeletePreview(null);
      await loadCampaigns();
    } catch (err) { setError(err.response?.data?.error || "Unable to delete campaign."); }
    finally { setDeleting(false); }
  };

  const columns = [
    { header: "Campaign", accessor: "name" },
    { header: "Date", accessor: "startDate", render: (item) => item.startDate ? new Date(item.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : item.campaignKind === "program" ? "Evergreen program" : "—" },
    { header: "Price", accessor: "ticketPrice", render: (item) => item.campaignKind === "program" ? "Program" : `$${item.ticketPrice}` },
    { header: "Goal", accessor: "ticketGoal" },
    { header: "Tickets Sold", accessor: "ticketsSold" },
    { header: "Status", accessor: "status" },
    { header: "", accessor: "action", render: (item) => <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}><Button variant="outline" size="sm" onClick={() => navigate(`/campaigns/${item._id}`)}>View <FiArrowRight /></Button><Button variant="ghost" size="sm" onClick={() => openDeleteModal(item)}>Delete</Button></div> },
  ];

  return <div className="page-dashboard">
    <div className="page-header"><div><h1 className="page-title">Campaigns</h1><p className="page-subtitle">Track every campaign from brief to launch.</p></div><Button onClick={() => { setError(""); setIsOpen(true); }}>Create Campaign</Button></div>
    <DashboardCard title="Active Campaigns"><Table columns={columns} data={campaigns} loading={loading} emptyMessage="No campaigns are active yet." /></DashboardCard>
    <CampaignModal isOpen={isOpen} onClose={() => setIsOpen(false)} onSubmit={handleCreate} audienceOptions={audienceOptions} submitting={submitting} defaultCampaignKind={defaultCampaignKind} />
    <Modal isOpen={Boolean(deleteTarget)} onClose={() => !deleting && setDeleteTarget(null)} title="Delete campaign" footer={<><Button variant="outline" disabled={deleting} onClick={() => setDeleteTarget(null)}>Cancel</Button><Button loading={deleting} onClick={confirmDelete}>Delete campaign</Button></>}>
      {deletePreview ? <div className="campaign-delete-dialog"><p><strong>{deletePreview.campaignName}</strong> will be removed. This cannot be undone.</p>{deletePreview.outreachCount ? <label className="form-field"><span><input type="checkbox" checked={deleteOptions.deleteOutreach} onChange={(event) => setDeleteOptions({ ...deleteOptions, deleteOutreach: event.target.checked })} /> Delete {deletePreview.outreachCount} related outreach record{deletePreview.outreachCount === 1 ? "" : "s"}</span><small>Required to delete this campaign. Sent and replied history will also be removed.</small></label> : <p>No outreach records are attached.</p>}{deletePreview.event ? <label className="form-field"><span><input type="checkbox" disabled={!deletePreview.event.canDelete} checked={deleteOptions.deleteEvent} onChange={(event) => setDeleteOptions({ ...deleteOptions, deleteEvent: event.target.checked })} /> Also delete the linked event</span><small>{deletePreview.event.canDelete ? "Leave this unchecked to keep the event for future use." : "This event is used by another campaign and will be kept."}</small></label> : null}</div> : <p>Checking related records…</p>}
    </Modal>
    {error ? <p className="form-error">{error}</p> : null}
  </div>;
}
