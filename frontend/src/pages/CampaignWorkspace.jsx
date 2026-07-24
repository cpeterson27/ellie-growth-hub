import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Button from "../components/Button.jsx";
import DashboardCard from "../components/DashboardCard.jsx";
import { fetchCampaign } from "../services/api.js";
import "./CampaignWorkspace.css";

const formatDate = (value) => value ? new Date(value).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "Evergreen";
const formatMoney = (value) => Number(value || 0).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export default function CampaignWorkspace() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) { setError("Campaign ID missing."); setLoading(false); return; }
    fetchCampaign(id)
      .then(setCampaign)
      .catch((err) => setError(err.response?.data?.error || "Unable to load campaign."))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="page-dashboard"><p>Loading campaign…</p></div>;
  if (error || !campaign) return <div className="page-dashboard"><p className="form-error">{error || "Campaign not found."}</p><Button variant="outline" onClick={() => navigate("/campaigns")}>Back to Campaigns</Button></div>;

  const isProgram = campaign.campaignKind === "program";
  const metrics = campaign.metrics || {};
  const overview = isProgram
    ? [["Offer", campaign.programName || "Premium program"], ["Audience", campaign.audience?.join(", ") || "Not specified"], ["Campaign type", "Program enrollment"]]
    : [["Event date", formatDate(campaign.startDate)], ["Ticket price", formatMoney(campaign.ticketPrice)], ["Registration goal", campaign.ticketGoal || "Not specified"], ["Audience", campaign.audience?.join(", ") || "Not specified"]];

  return (
    <div className="page-dashboard campaign-workspace">
      <header className="campaign-workspace__header">
        <div>
          <button className="campaign-workspace__back" onClick={() => navigate("/campaigns")}>← All campaigns</button>
          <p className="campaign-workspace__eyebrow">{isProgram ? "Program campaign" : "Event campaign"}</p>
          <h1 className="page-title">{campaign.name}</h1>
          <div className="campaign-workspace__meta"><span className={`campaign-status campaign-status--${campaign.status}`}>{campaign.status}</span><span>{isProgram ? "Evergreen campaign" : formatDate(campaign.startDate)}</span></div>
        </div>
        <div className="campaign-workspace__actions"><Button variant="outline" onClick={() => navigate("/contacts")}>Manage contacts</Button><Button onClick={() => navigate(`/outreach?campaignId=${campaign._id}`)}>Open outreach</Button></div>
      </header>

      <section className="campaign-workspace__metrics" aria-label="Campaign metrics">
        {[['Sent', metrics.sent], ['Delivered', metrics.delivered], ['Opened', metrics.opened], ['Converted', metrics.converted]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value || 0}</strong></div>)}
      </section>

      <section className="campaign-workspace__grid">
        <DashboardCard title="Campaign brief">
          <div className="campaign-overview-list">{overview.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
          {campaign.description ? <p className="campaign-workspace__description">{campaign.description}</p> : <p className="campaign-workspace__empty">Add a campaign brief to guide your messaging and team.</p>}
        </DashboardCard>

        <DashboardCard title="Email starting point">
          <p className="campaign-template-name">{campaign.templateKey?.replaceAll("_", " ") || "Campaign template"}</p>
          <p><strong>Subject</strong><br />{campaign.content?.subject || "No subject set yet."}</p>
          <p className="campaign-workspace__body-preview">{campaign.content?.body || "Your outreach draft will appear here after it is prepared."}</p>
        </DashboardCard>
      </section>
    </div>
  );
}
