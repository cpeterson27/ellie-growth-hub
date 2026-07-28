import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Button from "../components/Button.jsx";
import DashboardCard from "../components/DashboardCard.jsx";
import { assignCampaignAudience, fetchCampaign, previewCampaignAudience } from "../services/api.js";
import "./CampaignWorkspace.css";
import "./CampaignAudience.css";
import "./CampaignRegistration.css";

const formatDate = (value) => value ? new Date(value).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "Evergreen";
const formatMoney = (value) => Number(value || 0).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export default function CampaignWorkspace() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [audienceMatch, setAudienceMatch] = useState(null);
  const [matchingAudience, setMatchingAudience] = useState(false);
  const [matchPage, setMatchPage] = useState(1);

  useEffect(() => {
    if (!id) { setError("Campaign ID missing."); setLoading(false); return; }
    fetchCampaign(id)
      .then(setCampaign)
      .catch((err) => setError(err.response?.data?.error || "Unable to load campaign."))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    previewCampaignAudience(id).then(setAudienceMatch).catch(() => setAudienceMatch(null));
  }, [id]);

  const refreshAudience = async () => {
    try {
      setMatchingAudience(true);
      setError("");
      await assignCampaignAudience(id);
      setAudienceMatch(await previewCampaignAudience(id));
    } catch (err) {
      setError(err.response?.data?.error || "Unable to match campaign contacts.");
    } finally {
      setMatchingAudience(false);
    }
  };

  if (loading) return <div className="page-dashboard"><p>Loading campaign…</p></div>;
  if (error || !campaign) return <div className="page-dashboard"><p className="form-error">{error || "Campaign not found."}</p><Button variant="outline" onClick={() => navigate("/campaigns")}>Back to Campaigns</Button></div>;

  const isProgram = campaign.campaignKind === "program";
  const metrics = campaign.metrics || {};
  const overview = isProgram
    ? [["Offer", campaign.programName || "Premium program"], ["Audience", campaign.audience?.join(", ") || "Not specified"], ["Campaign type", "Program enrollment"]]
    : [["Event date", formatDate(campaign.startDate)], ["Ticket price", formatMoney(campaign.ticketPrice)], ["Registration goal", campaign.ticketGoal || "Not specified"], ["Audience", campaign.audience?.join(", ") || "Not specified"]];
  const registrationLinks = [
    ["Eventbrite", campaign.registrationLinks?.eventbrite],
    ["Meetup", campaign.registrationLinks?.meetup],
  ].filter(([, link]) => link?.enabled && link?.url);
  const eventId = String(campaign.eventId?._id || campaign.eventId || "");
  const matchedContacts = audienceMatch?.contacts || [];
  const matchPageSize = 5;
  const matchPageCount = Math.max(1, Math.ceil(matchedContacts.length / matchPageSize));
  const visibleMatches = matchedContacts.slice((matchPage - 1) * matchPageSize, matchPage * matchPageSize);

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

        {!isProgram && <DashboardCard title="Registration channels">
          {registrationLinks.length ? <div className="campaign-registration-links">
            {registrationLinks.map(([provider, link], index) => <a href={link.url} target="_blank" rel="noreferrer" key={provider}>
              <span>{index === 0 ? "Primary registration" : "Additional listing"}</span>
              <strong>{provider}</strong>
              <small>{index === 0 ? "Ticket checkout and main email button" : "Meetup discovery and RSVPs"} ↗</small>
            </a>)}
          </div> : <p className="campaign-workspace__empty">No registration channels connected yet.</p>}
        </DashboardCard>}

        <DashboardCard title="Audience matching">
          {audienceMatch ? <>
            <div className="audience-flow">
              <div><span>1</span><p><strong>Define the event audience</strong>Ellie suggests groups from the event description. You review and approve them.</p></div>
              <div><span>2</span><p><strong>Compare CRM contacts</strong>Approved groups are compared with contact titles, industries, tags, keywords, companies, lists, and notes.</p></div>
              <div><span>3</span><p><strong>Protect outreach</strong>Only verified, qualified contacts become safe matches. Nothing is sent automatically.</p></div>
            </div>
            {eventId ? <div className="audience-strategy-action"><p><strong>Target audience</strong><span>{campaign.audience?.join(", ") || "Not approved yet"}</span></p><Button variant="outline" size="sm" onClick={() => navigate(`/events?eventId=${eventId}&tab=strategy`)}>Review target audience</Button></div> : null}
            <div className="campaign-audience-counts">
              <div><strong>{audienceMatch.matched || 0}</strong><span>safe matches</span></div>
              <div><strong>{audienceMatch.alreadyAssigned || 0}</strong><span>already assigned</span></div>
              <div><strong>{audienceMatch.needsResearch || 0}</strong><span>need research</span></div>
              <div><strong>{audienceMatch.readyForReview || 0}</strong><span>ready for review</span></div>
            </div>
            {matchedContacts.length ? <>
              <div className="campaign-match-table">
                <div className="campaign-match-table__head"><span>Contact</span><span>Why they match</span></div>
                {visibleMatches.map((contact) => <div className="campaign-match-table__row" key={contact._id}><p><strong>{contact.name}</strong><span>{contact.company || contact.email}</span></p><small>{contact.reasons.flatMap((reason) => reason.terms).join(", ") || "Qualified audience profile"}</small></div>)}
              </div>
              <div className="campaign-match-pagination"><span>Showing {(matchPage - 1) * matchPageSize + 1}–{Math.min(matchPage * matchPageSize, matchedContacts.length)} of {matchedContacts.length}</span><div><button disabled={matchPage === 1} onClick={() => setMatchPage((page) => page - 1)}>Previous</button><button disabled={matchPage === matchPageCount} onClick={() => setMatchPage((page) => page + 1)}>Next</button></div></div>
            </> : <p className="campaign-workspace__empty">No safe matches yet. Add audience information to contacts, then qualify them for outreach.</p>}
            <div className="campaign-audience-actions"><Button variant="outline" onClick={() => navigate("/contacts")}>Review contacts</Button><Button loading={matchingAudience} onClick={refreshAudience}>Refresh and assign safe matches</Button></div>
          </> : <p>Checking qualified contacts…</p>}
        </DashboardCard>
      </section>
    </div>
  );
}
