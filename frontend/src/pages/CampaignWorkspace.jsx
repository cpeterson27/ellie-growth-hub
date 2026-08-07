import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Button from "../components/Button.jsx";
import DashboardCard from "../components/DashboardCard.jsx";
import { approveCampaignEmailTemplate, assignCampaignAudience, fetchCampaign, fetchCampaignEmailTemplate, fetchContacts, fetchImageUploadStatus, previewCampaignAudience, previewCampaignEmailTemplate, saveCampaignEmailTemplate, updateCampaignBrand, updateCampaignRegistrationLinks, uploadEventImage } from "../services/api.js";
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
  const [brandSaving, setBrandSaving] = useState(false);
  const [imageUpload, setImageUpload] = useState({ configured: false, loaded: false });
  const [emailTemplate, setEmailTemplate] = useState(null);
  const [templateVersions, setTemplateVersions] = useState([]);
  const [templateHistoryOpen, setTemplateHistoryOpen] = useState(false);
  const [templateSaving, setTemplateSaving] = useState(false);
  const [emailPreview, setEmailPreview] = useState(null);
  const [previewContacts, setPreviewContacts] = useState([]);
  const [previewContactId, setPreviewContactId] = useState("");
  const [templateAudience, setTemplateAudience] = useState("general");
  const [activeSection, setActiveSection] = useState("email");

  useEffect(() => {
    if (!id) { setError("Campaign ID missing."); setLoading(false); return; }
    fetchCampaign(id)
      .then(setCampaign)
      .catch((err) => setError(err.response?.data?.error || "Unable to load campaign."))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    fetchContacts({ campaignId: id, limit: 500 }).then((response) => {
      const contacts = response.data || [];
      setPreviewContacts(contacts);
      setPreviewContactId((current) => current || String(contacts[0]?._id || ""));
    }).catch(() => setPreviewContacts([]));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    fetchCampaignEmailTemplate(id, templateAudience).then(({ template, versions }) => {
      setEmailTemplate(template);
      setTemplateVersions(versions || []);
    }).catch(() => {});
  }, [id, templateAudience]);

  useEffect(() => {
    if (!id) return;
    previewCampaignAudience(id).then(setAudienceMatch).catch(() => setAudienceMatch(null));
    fetchImageUploadStatus().then((status) => setImageUpload({ ...status, loaded: true })).catch(() => setImageUpload({ configured: false, loaded: true }));
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

  const updateBrandField = (field, value) => setCampaign((current) => ({
    ...current,
    brand: { ...current.brand, [field]: value },
  }));

  const uploadLogo = async (file) => {
    if (!file) return;
    try {
      setBrandSaving(true);
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const uploaded = await uploadEventImage({ file: dataUrl, filename: file.name });
      const updated = await updateCampaignBrand(id, { ...campaign.brand, logoUrl: uploaded.url });
      setCampaign(updated);
    } catch (err) {
      setError(err.response?.data?.error || "Unable to upload the program logo.");
    } finally {
      setBrandSaving(false);
    }
  };

  const saveBrand = async () => {
    try {
      setBrandSaving(true);
      setCampaign(await updateCampaignBrand(id, campaign.brand || {}));
    } catch (err) {
      setError(err.response?.data?.error || "Unable to save the program brand.");
    } finally {
      setBrandSaving(false);
    }
  };

  const updateTemplateField = (field, value) => setEmailTemplate((current) => ({ ...current, [field]: value, status: "draft" }));
  const loadHistoricalTemplate = (version) => {
    setEmailTemplate({
      subject: version.subject || "",
      body: version.body || "",
      callToAction: version.callToAction || "",
      callToActionUrl: version.callToActionUrl || "",
      topic: version.topic || emailTemplate?.topic || "event_invitations",
      status: "draft",
      currentVersion: emailTemplate?.currentVersion || 0,
    });
    setTemplateHistoryOpen(false);
    setEmailPreview(null);
  };
  const updateMeetupButton = (field, value) => setCampaign((current) => ({
    ...current,
    registrationLinks: {
      ...current.registrationLinks,
      meetup: { ...current.registrationLinks?.meetup, [field]: value },
    },
  }));
  const saveButtonLinks = async () => {
    const updated = await updateCampaignRegistrationLinks(id, {
      eventbriteUrl: campaign.registrationLinks?.eventbrite?.url || "",
      meetupUrl: campaign.registrationLinks?.meetup?.enabled ? campaign.registrationLinks?.meetup?.url || "" : "",
      meetupLabel: campaign.registrationLinks?.meetup?.label || "View on Meetup",
    });
    setCampaign(updated);
  };
  const saveTemplate = async () => {
    try {
      setTemplateSaving(true);
      setError("");
      await saveButtonLinks();
      const audienceLabel = templateAudience === "general" ? "All Deal to Close contacts" : campaign.audience?.[Number(templateAudience.replace("audience-", ""))] || "";
      setEmailTemplate(await saveCampaignEmailTemplate(id, { ...emailTemplate, audienceKey: templateAudience, audienceLabel }));
    } catch (err) {
      setError(err.response?.data?.error || "Unable to save the campaign email.");
    } finally {
      setTemplateSaving(false);
    }
  };
  const approveTemplate = async () => {
    try {
      setTemplateSaving(true);
      setError("");
      await saveButtonLinks();
      const audienceLabel = templateAudience === "general" ? "All Deal to Close contacts" : campaign.audience?.[Number(templateAudience.replace("audience-", ""))] || "";
      await saveCampaignEmailTemplate(id, { ...emailTemplate, audienceKey: templateAudience, audienceLabel });
      const result = await approveCampaignEmailTemplate(id, templateAudience);
      setEmailTemplate(result.template);
      setTemplateVersions((current) => [result.version, ...current]);
    } catch (err) {
      setError(err.response?.data?.error || "Unable to approve the campaign email.");
    } finally {
      setTemplateSaving(false);
    }
  };
  const previewTemplate = async () => {
    try {
      setTemplateSaving(true);
      setError("");
      setEmailPreview(await previewCampaignEmailTemplate(id, {
        ...emailTemplate,
        meetupEnabled: campaign.registrationLinks?.meetup?.enabled === true,
        meetupUrl: campaign.registrationLinks?.meetup?.url || "",
        meetupLabel: campaign.registrationLinks?.meetup?.label || "View on Meetup",
        previewContactId,
      }));
    } catch (err) {
      setError(err.response?.data?.error || "Unable to prepare the email preview.");
    } finally {
      setTemplateSaving(false);
    }
  };
  if (loading) return <div className="page-dashboard"><p>Loading campaign…</p></div>;
  if (error || !campaign) return <div className="page-dashboard"><p className="form-error">{error || "Campaign not found."}</p><Button variant="outline" onClick={() => navigate("/campaigns")}>Back to Campaigns</Button></div>;

  const isProgram = campaign.campaignKind === "program";
  const metrics = campaign.metrics || {};
  const overview = isProgram
    ? [["Offer", campaign.programName || "Premium program"], ["Target groups", campaign.audience?.length || 0], ["Campaign type", "Program enrollment"]]
    : [["Event date", formatDate(campaign.startDate)], ["Ticket price", formatMoney(campaign.ticketPrice)], ["Registration goal", campaign.ticketGoal || "Not specified"], ["Target groups", campaign.audience?.length || 0]];
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

      <nav className="campaign-workspace__tabs" aria-label="Campaign workspace sections">
        <button className={activeSection === "email" ? "active" : ""} onClick={() => setActiveSection("email")}>Email design</button>
        <button className={activeSection === "audience" ? "active" : ""} onClick={() => setActiveSection("audience")}>Target audience</button>
        <button className={activeSection === "overview" ? "active" : ""} onClick={() => setActiveSection("overview")}>Campaign setup</button>
      </nav>

      <section className="campaign-workspace__grid">
        {activeSection === "overview" ? <DashboardCard title="Campaign details">
          <div className="campaign-overview-list">{overview.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
          {campaign.description ? <p className="campaign-workspace__description">{campaign.description}</p> : null}
        </DashboardCard> : null}

        {activeSection === "email" ? <DashboardCard title="Campaign master email">
          {emailTemplate ? <div className="campaign-template-editor">
            <div className="campaign-template-editor__status"><span className={`campaign-status-dot is-${emailTemplate.status}`} /> <strong>{emailTemplate.status === "approved" ? `Saved version ${emailTemplate.currentVersion}` : "Editing master template"}</strong></div>
            <label><span>Template for target audience</span><select value={templateAudience} onChange={(event) => setTemplateAudience(event.target.value)}><option value="general">All Deal to Close contacts</option>{(campaign.audience || []).map((audience, index) => <option value={`audience-${index}`} key={`${audience}-${index}`}>{audience}</option>)}</select></label>
            <div className="campaign-flyer-editor">
              <span>Email flyer</span>
              {campaign.brand?.logoUrl ? <img src={campaign.brand.logoUrl} alt={`${campaign.name} flyer`} /> : null}
              {imageUpload.configured ? <label className="campaign-file-button">Choose or replace flyer<input type="file" accept="image/*" onChange={(event) => uploadLogo(event.target.files?.[0])} /></label> : <p className="image-hosting-note">Add the rotated Cloudinary URL to the Render backend environment to enable direct upload.</p>}
              <small>The flyer is placed above the registration buttons in every email.</small>
            </div>
            <label><span>Master subject</span><input value={emailTemplate.subject} onChange={(event) => updateTemplateField("subject", event.target.value)} /></label>
            <label><span>Master message</span><textarea rows="14" value={emailTemplate.body} onChange={(event) => updateTemplateField("body", event.target.value)} /></label>
            <label><span>Button text</span><input value={emailTemplate.callToAction || ""} onChange={(event) => updateTemplateField("callToAction", event.target.value)} placeholder="Register now" /></label>
            <label><span>Button link</span><input type="url" value={emailTemplate.callToActionUrl || ""} onChange={(event) => updateTemplateField("callToActionUrl", event.target.value)} placeholder="https://" /></label>
            <div className="campaign-secondary-button">
              <label className="campaign-secondary-button__toggle"><input type="checkbox" checked={campaign.registrationLinks?.meetup?.enabled === true} onChange={(event) => updateMeetupButton("enabled", event.target.checked)} /><span>Include a second Meetup button</span></label>
              {campaign.registrationLinks?.meetup?.enabled ? <>
                <label><span>Meetup button text</span><input value={campaign.registrationLinks?.meetup?.label || "View on Meetup"} onChange={(event) => updateMeetupButton("label", event.target.value)} /></label>
                <label><span>Meetup button link</span><input type="url" value={campaign.registrationLinks?.meetup?.url || ""} onChange={(event) => updateMeetupButton("url", event.target.value)} placeholder="https://www.meetup.com/..." /></label>
              </> : null}
            </div>
            <p className="campaign-template-help">Use {"{{firstName}}"}, {"{{company}}"}, {"{{campaignName}}"}, {"{{programName}}"}, and {"{{eventLink}}"} for personalization.</p>
            <label><span>Preview as an assigned contact</span><select value={previewContactId} onChange={(event) => setPreviewContactId(event.target.value)}><option value="">Example contact and company</option>{previewContacts.map((contact) => <option key={contact._id} value={contact._id}>{contact.name || [contact.firstName, contact.lastName].filter(Boolean).join(" ") || "Unnamed contact"}{contact.company ? ` · ${contact.company}` : " · company missing"}</option>)}</select><small>The preview uses this contact’s saved first name and company. It does not send an email.</small></label>
            <div className="campaign-auto-footer"><strong>Added automatically to every sent email</strong><span>Your business name and postal address from Settings</span><span className="campaign-unsubscribe-preview">Unsubscribe from campaign emails</span></div>
            <div className="campaign-template-editor__actions"><Button variant="outline" loading={templateSaving} onClick={previewTemplate}>Preview complete email</Button><Button variant="outline" loading={templateSaving} onClick={saveTemplate}>Save draft</Button><Button loading={templateSaving} onClick={approveTemplate}>Approve new version</Button></div>
            {emailPreview ? <div className="campaign-email-preview"><div><strong>Previewing:</strong> {emailPreview.previewRecipient?.name} · {emailPreview.previewRecipient?.company || "company missing"}<br/><strong>Subject:</strong> {emailPreview.subject}<button type="button" onClick={() => setEmailPreview(null)}>Close preview</button></div><iframe title="Complete campaign email preview" srcDoc={emailPreview.html} sandbox="allow-popups allow-popups-to-escape-sandbox" /></div> : null}
            {templateVersions.length ? <section className="campaign-template-history">
              <button type="button" className="campaign-template-history__toggle" onClick={() => setTemplateHistoryOpen((open) => !open)}>
                <span><strong>Template history</strong><small>{templateVersions.length} saved version{templateVersions.length === 1 ? "" : "s"} · sent copies are preserved</small></span>
                <b>{templateHistoryOpen ? "Hide" : "View all"}</b>
              </button>
              {templateHistoryOpen ? <div className="campaign-template-history__list">{templateVersions.map((version) => <article key={version.version}>
                <header><span>Version {version.version}</span><small>{version.approvedAt ? new Date(version.approvedAt).toLocaleString() : "Approval date unavailable"}</small></header>
                <strong>{version.subject}</strong>
                <small>{version.audienceLabel || "Historical campaign template"}{version.sentCount ? ` · used for ${version.sentCount} sent email${version.sentCount === 1 ? "" : "s"}` : " · never sent"}</small>
                <pre>{version.body}</pre>
                <footer><Button variant="outline" size="sm" onClick={() => loadHistoricalTemplate(version)}>Use as new draft</Button>{version.lastSentAt ? <small>Last sent {new Date(version.lastSentAt).toLocaleString()}</small> : null}</footer>
              </article>)}</div> : null}
            </section> : null}
          </div> : <p>Loading the master template…</p>}
        </DashboardCard> : null}

        {activeSection === "email" ? <DashboardCard title={isProgram ? "Program brand" : "Event brand"}>
          <div className="program-brand-editor">
            {campaign.brand?.logoUrl ? <img src={campaign.brand.logoUrl} alt={`${campaign.programName || campaign.name} logo`} /> : <div className="program-brand-placeholder">Add the program logo</div>}
            <label><span>Logo image URL</span><input type="url" value={campaign.brand?.logoUrl || ""} placeholder="https://your-site.com/logo.png" onChange={(event) => updateBrandField("logoUrl", event.target.value)} /></label>
            {imageUpload.configured ? <label><span>Or upload a new logo</span><input type="file" accept="image/*" onChange={(event) => uploadLogo(event.target.files?.[0])} /></label> : <p className="image-hosting-note"><strong>Direct file upload is optional and not connected.</strong> For the fastest setup, paste an existing hosted image URL above. Cloudinary is only needed if you want Growth Operator to upload files for you.</p>}
            <label><span>Program website</span><input type="url" value={campaign.brand?.websiteUrl || ""} placeholder="https://" onChange={(event) => updateBrandField("websiteUrl", event.target.value)} /></label>
            <label><span>Brand color</span><input type="color" value={campaign.brand?.accentColor || "#173f36"} onChange={(event) => updateBrandField("accentColor", event.target.value)} /></label>
            <Button loading={brandSaving} onClick={saveBrand}>Save program brand</Button>
          </div>
          <p className="campaign-workspace__empty">This logo and color are reused in every email for this {isProgram ? "program" : "event"}. Replace the asset here whenever the campaign branding changes.</p>
        </DashboardCard> : null}

        {activeSection === "overview" && !isProgram && <DashboardCard title="Registration channels">
          {registrationLinks.length ? <div className="campaign-registration-links">
            {registrationLinks.map(([provider, link], index) => <a href={link.url} target="_blank" rel="noreferrer" key={provider}>
              <span>{index === 0 ? "Primary registration" : "Additional listing"}</span>
              <strong>{provider}</strong>
              <small>{index === 0 ? "Ticket checkout and main email button" : "Meetup discovery and RSVPs"} ↗</small>
            </a>)}
          </div> : <p className="campaign-workspace__empty">No registration channels connected yet.</p>}
        </DashboardCard>}

        {activeSection === "audience" ? <DashboardCard title="Confirmed target audience">
          {audienceMatch ? <>
            <div className="campaign-audience-source">
              <div><strong>Source of truth</strong><p>The confirmed target audience below is the audience Growth Operator uses for matching, templates, and future searches.</p></div>
              {eventId ? <Button variant="outline" size="sm" onClick={() => navigate(`/events?eventId=${eventId}&tab=strategy`)}>Edit target audience</Button> : null}
            </div>
            <div className="campaign-audience-groups">
              {(campaign.audience || []).map((audience) => <span key={audience}>{audience}</span>)}
            </div>
            {campaign.eventId?.audienceSuggestions?.length ? <details className="campaign-audience-suggestions"><summary>Suggestions found in the Eventbrite listing</summary><p>These are suggestions only. They do not become active unless you select and save them in Event strategy.</p><div>{campaign.eventId.audienceSuggestions.map((audience) => <span key={audience}>{audience}</span>)}</div></details> : null}
            <div className="audience-flow">
              <div><span>1</span><p><strong>Confirm the targeting brief</strong>Growth Operator can suggest segments from the event, but you decide the official audience for this campaign.</p></div>
              <div><span>2</span><p><strong>Use real contact sources</strong>Contacts come from Growth Operator research, CRM records, CSV uploads, manual entry, and future approved integrations.</p></div>
              <div><span>3</span><p><strong>Match safely</strong>Growth Operator compares the brief with titles, industries, tags, keywords, companies, lists, and notes. Nothing is emailed automatically.</p></div>
            </div>
            {eventId ? <div className="audience-strategy-action"><p><strong>Targeting brief</strong><span>{campaign.audience?.join(", ") || "Not approved yet"}</span></p><Button variant="outline" size="sm" onClick={() => navigate(`/events?eventId=${eventId}&tab=strategy`)}>Review targeting brief</Button></div> : null}
            <div className="campaign-audience-counts">
              <div><strong>{audienceMatch.matched || 0}</strong><span>safe matches</span></div>
              <div><strong>{audienceMatch.alreadyAssigned || 0}</strong><span>already assigned</span></div>
              <button type="button" onClick={() => navigate("/contacts?allCampaigns=true&researchStatus=needs_research")}><strong>{audienceMatch.needsResearch || 0}</strong><span>need research</span></button>
              <button type="button" onClick={() => navigate("/contacts?allCampaigns=true&researchStatus=ready_for_review")}><strong>{audienceMatch.readyForReview || 0}</strong><span>ready for review</span></button>
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
        </DashboardCard> : null}
      </section>
    </div>
  );
}
