import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiCheck, FiChevronRight, FiCircle, FiSend } from "react-icons/fi";
import Button from "../components/Button.jsx";
import { fetchCampaigns, fetchOutreach } from "../services/api.js";
import "./CampaignLaunch.css";

export default function CampaignLaunch() {
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [outreach, setOutreach] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetchCampaigns().then((items) => {
      const list = Array.isArray(items) ? items : [];
      setCampaigns(list);
      setSelectedId(list[0]?._id || "");
    }).finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (!selectedId) return undefined;
    fetchOutreach(selectedId).then((items) => setOutreach(Array.isArray(items) ? items : items?.outreach || [])).catch(() => setOutreach([]));
  }, [selectedId]);
  const selected = campaigns.find((item) => item._id === selectedId);
  const counts = useMemo(() => outreach.reduce((result, item) => {
    result[item.status] = (result[item.status] || 0) + 1;
    return result;
  }, {}), [outreach]);
  const templateApproved = selected?.emailTemplate?.status === "approved" || Object.values(selected?.emailAudienceTemplates || {}).some((template) => template?.status === "approved");
  const steps = [
    { title: "Campaign details", description: "Confirm the event, audience, links, flyer, and brand.", complete: Boolean(selected), action: "Open campaign", path: selected ? `/campaigns/${selected._id}` : "/campaigns" },
    { title: "Audience and contacts", description: "Import or assign the people who belong in this campaign.", complete: outreach.length > 0, detail: outreach.length ? `${outreach.length} recipient records prepared` : "No recipient drafts yet", action: "Open contacts", path: "/contacts" },
    { title: "Approved template", description: "Save and approve the master or audience-specific email template.", complete: templateApproved, detail: templateApproved ? "Approved template available" : "Template approval required", action: "Edit template", path: selected ? `/campaigns/${selected._id}` : "/campaigns" },
    { title: "Recipient drafts", description: "Refresh personalized drafts and review the correct audience template.", complete: outreach.length > 0, detail: `${counts.pending || 0} pending · ${counts.approved || 0} approved`, action: "Prepare outreach", path: selected ? `/outreach?campaignId=${selected._id}` : "/outreach" },
    { title: "Test and approve", description: "Review the complete rendered email and send the fixed-address test.", complete: Boolean(counts.approved || counts.sent || counts.replied), detail: "Tests never affect live campaign totals", action: "Review emails", path: selected ? `/outreach?campaignId=${selected._id}` : "/outreach" },
    { title: "Send and monitor", description: "Send approved recipients, then watch delivery, replies, and performance.", complete: Boolean(counts.sent || counts.replied), detail: `${counts.sent || 0} sent · ${counts.replied || 0} replied`, action: counts.sent || counts.replied ? "Open analytics" : "Open outreach", path: counts.sent || counts.replied ? "/analytics" : `/outreach?campaignId=${selected?._id || ""}` },
  ];
  const completed = steps.filter((step) => step.complete).length;

  return <div className="page-dashboard launch-page">
    <header className="launch-hero"><div><p className="page-eyebrow">Guided campaign launch</p><h1>Launch with confidence.</h1><p>Ellie keeps every required decision in order. Nothing sends until the test, template, and recipients are ready.</p></div><div className="launch-progress"><strong>{completed}/{steps.length}</strong><span>steps complete</span></div></header>
    <section className="launch-picker"><label><span>Campaign</span><select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>{campaigns.map((campaign) => <option key={campaign._id} value={campaign._id}>{campaign.name}</option>)}</select></label>{selected ? <Button variant="outline" onClick={() => navigate(`/campaigns/${selected._id}`)}>Campaign workspace</Button> : null}</section>
    {loading ? <p>Loading launch workflow…</p> : campaigns.length ? <section className="launch-steps">{steps.map((step, index) => <article key={step.title} className={step.complete ? "is-complete" : ""}><div className="launch-step-number">{step.complete ? <FiCheck /> : <FiCircle />}<span>{index + 1}</span></div><div><p>{step.complete ? "Ready" : "Next decision"}</p><h2>{step.title}</h2><span>{step.description}</span><small>{step.detail}</small></div><Button variant={step.complete ? "outline" : "primary"} onClick={() => navigate(step.path)}>{step.action}<FiChevronRight /></Button></article>)}</section> : <section className="launch-empty"><FiSend /><h2>Create the first campaign</h2><p>Once a campaign exists, Ellie will guide the entire launch from audience to results.</p><Button onClick={() => navigate("/campaigns")}>Open Campaigns</Button></section>}
  </div>;
}
