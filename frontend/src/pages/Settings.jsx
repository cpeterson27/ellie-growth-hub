import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiArrowUpRight, FiBriefcase, FiImage, FiLock, FiMail, FiShield, FiUser, FiUsers } from "react-icons/fi";
import Button from "../components/Button.jsx";
import { fetchCampaigns, fetchGmailConnection, fetchWorkspaceConfig, updateWorkspaceConfig, uploadEventImage } from "../services/api.js";
import { getWorkspaceSettings, saveWorkspaceSettings } from "../utils/workspaceSettings.js";
import "./Settings.css";

export default function Settings() {
  const navigate = useNavigate();
  const [workspaceName, setWorkspaceName] = useState(() => getWorkspaceSettings().workspaceName);
  const [accountEmail, setAccountEmail] = useState("");
  const [legalBusinessName, setLegalBusinessName] = useState("");
  const [postalAddress, setPostalAddress] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [organizationLogoUrl, setOrganizationLogoUrl] = useState("");
  const [programs, setPrograms] = useState([]);
  const [logoUploading, setLogoUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchWorkspaceConfig().then((config) => {
      setWorkspaceName(config.workspaceName);
      setLegalBusinessName(config.legalBusinessName || "");
      setPostalAddress(config.postalAddress || "");
      setWebsiteUrl(config.websiteUrl || "");
      setOrganizationLogoUrl(config.organizationLogoUrl || "");
    }).catch(() => {});
    fetchGmailConnection().then((connection) => setAccountEmail(connection.email || "")).catch(() => {});
    fetchCampaigns().then((items) => setPrograms((items || []).filter((item) => item.campaignKind === "program"))).catch(() => {});
  }, []);

  const save = async () => {
    try {
      setSaving(true);
      const config = await updateWorkspaceConfig({ workspaceName, legalBusinessName, postalAddress, websiteUrl, organizationLogoUrl });
      const local = { ...getWorkspaceSettings(), workspaceName: config.workspaceName };
      saveWorkspaceSettings(local);
      setWorkspaceName(config.workspaceName);
      setSaved(true);
      setError("");
    } catch (err) { setError(err.response?.data?.error || "Unable to save the workspace name."); }
    finally { setSaving(false); }
  };

  const uploadLogo = async (file) => {
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 8 * 1024 * 1024) {
      setError("Choose a PNG, JPG, or WEBP logo smaller than 8 MB.");
      return;
    }
    try {
      setLogoUploading(true);
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const uploaded = await uploadEventImage({ file: dataUrl, filename: file.name });
      setOrganizationLogoUrl(uploaded.url);
      setSaved(false);
    } catch (err) {
      setError(err.response?.data?.error || "Unable to upload the organization logo.");
    } finally {
      setLogoUploading(false);
    }
  };

  return <div className="page-dashboard account-page">
    <div className="page-header"><div><p className="page-eyebrow">Account</p><h1 className="page-title">Settings</h1><p className="page-subtitle">Manage the account and organization behind this Ellie workspace.</p></div></div>
    {saved ? <p className="discovery-notice">Workspace name saved across Ellie.</p> : null}
    {error ? <p className="form-error">{error}</p> : null}
    <section className="account-layout">
      <nav className="account-settings-nav" aria-label="Settings sections">
        <button className="is-active"><FiUser /> Organization profile</button>
        <button disabled><FiLock /> Login & password <small>After user accounts</small></button>
        <button disabled><FiShield /> Security <small>After user accounts</small></button>
        <button disabled><FiUsers /> Team access <small>After user accounts</small></button>
      </nav>
      <div className="account-settings-panel account-settings-panel--refined">
        <header><p className="page-eyebrow">Organization profile</p><h2>Identity and email brand</h2><p>Set the client-level identity once. Individual events and programs can use their own logo and campaign branding.</p></header>

        <section className="settings-section">
          <div className="settings-section__heading"><FiImage /><div><h3>Brand assets</h3><p>The primary organization logo used across the client account.</p></div></div>
          <div className="brand-asset-row">
            <div className="brand-logo-preview">{organizationLogoUrl ? <img src={organizationLogoUrl} alt="Organization logo" /> : <span><FiImage />No logo uploaded</span>}</div>
            <div><label className="brand-upload-button">Choose logo<input type="file" accept="image/*" onChange={(event) => uploadLogo(event.target.files?.[0])} /></label><small>{logoUploading ? "Uploading…" : "PNG, JPG, or WEBP · maximum 8 MB"}</small>{organizationLogoUrl ? <button className="brand-remove" type="button" onClick={() => { setOrganizationLogoUrl(""); setSaved(false); }}>Remove</button> : null}</div>
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section__heading"><FiBriefcase /><div><h3>Business details</h3><p>Used in navigation and the compliance footer on campaign email.</p></div></div>
          <div className="account-profile-form account-profile-form--compact">
            <label className="form-field"><span>Workspace name</span><input value={workspaceName} onChange={(event) => { setWorkspaceName(event.target.value); setSaved(false); }} /></label>
            <label className="form-field"><span>Legal business name</span><input value={legalBusinessName} onChange={(event) => { setLegalBusinessName(event.target.value); setSaved(false); }} /></label>
            <label className="form-field"><span>Business website</span><input type="url" value={websiteUrl} onChange={(event) => { setWebsiteUrl(event.target.value); setSaved(false); }} placeholder="https://elliescoaching.com" /></label>
            <label className="form-field"><span>Business mailing address</span><textarea rows="2" value={postalAddress} onChange={(event) => { setPostalAddress(event.target.value); setSaved(false); }} placeholder="Street, city, state, postal code" /><small>Required in campaign email footers.</small></label>
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section__heading"><FiMail /><div><h3>Email connection</h3><p>Mailbox access is managed from Integrations.</p></div></div>
          <div className="settings-email-row"><span>{accountEmail || "No Gmail account connected"}</span><Button variant="outline" size="sm" onClick={() => navigate("/integrations/gmail")}>Manage connection</Button></div>
        </section>

        <section className="settings-section">
          <div className="settings-section__heading"><FiImage /><div><h3>Program brands</h3><p>Each offer has its own replaceable logo, website, and email color.</p></div></div>
          <div className="program-brand-links">{programs.length ? programs.map((program) => <button key={program._id} onClick={() => navigate(`/campaigns/${program._id}`)}><span>{program.brand?.logoUrl ? <img src={program.brand.logoUrl} alt="" /> : <FiImage />}<strong>{program.programName || program.name}</strong></span><em>Manage brand <FiArrowUpRight /></em></button>) : <p>No program campaigns yet. Create an Offer / program campaign first.</p>}</div>
        </section>

        <footer><Button loading={saving} disabled={workspaceName.trim().length < 2} onClick={save}>Save organization profile</Button></footer>
      </div>
    </section>
  </div>;
}
