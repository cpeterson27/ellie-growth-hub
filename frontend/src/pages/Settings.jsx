import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiArrowUpRight, FiBriefcase, FiCpu, FiImage, FiLock, FiMail, FiShield, FiTrash2, FiUser, FiUsers } from "react-icons/fi";
import Button from "../components/Button.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { changePassword, createMcpAccessToken, createWorkspaceMember, fetchCampaigns, fetchGmailConnection, fetchMcpAccessTokens, fetchWorkspaceConfig, fetchWorkspaceMembers, getMcpEndpoint, revokeMcpAccessToken, updateWorkspaceConfig, uploadEventImage } from "../services/api.js";
import { getWorkspaceSettings, saveWorkspaceSettings } from "../utils/workspaceSettings.js";
import "./Settings.css";

export default function Settings() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const [activeSection, setActiveSection] = useState("profile");
  const [workspaceName, setWorkspaceName] = useState(() => getWorkspaceSettings().workspaceName);
  const [accountEmail, setAccountEmail] = useState("");
  const [legalBusinessName, setLegalBusinessName] = useState("");
  const [address, setAddress] = useState({ line1: "", line2: "", city: "", region: "", postalCode: "", country: "United States" });
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [organizationLogoUrl, setOrganizationLogoUrl] = useState("");
  const [campaigns, setCampaigns] = useState([]);
  const [logoUploading, setLogoUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [passwords, setPasswords] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [members, setMembers] = useState([]);
  const [newMember, setNewMember] = useState({ name: "", email: "", role: "member", temporaryPassword: "" });
  const [mcpTokens, setMcpTokens] = useState([]);
  const [newMcpToken, setNewMcpToken] = useState(null);
  const [mcpName, setMcpName] = useState("My AI assistant");

  useEffect(() => {
    fetchWorkspaceConfig().then((config) => {
      setWorkspaceName(config.workspaceName);
      setLegalBusinessName(config.legalBusinessName || "");
      setAddress({
        line1: config.addressLine1 || (!config.addressCity ? config.postalAddress || "" : ""),
        line2: config.addressLine2 || "",
        city: config.addressCity || "",
        region: config.addressRegion || "",
        postalCode: config.addressPostalCode || "",
        country: config.addressCountry || "United States",
      });
      setWebsiteUrl(config.websiteUrl || "");
      setOrganizationLogoUrl(config.organizationLogoUrl || "");
    }).catch(() => {});
    fetchGmailConnection().then((connection) => setAccountEmail(connection.email || "")).catch(() => {});
    fetchCampaigns().then((items) => setCampaigns(items || [])).catch(() => {});
    fetchWorkspaceMembers().then((data) => setMembers(data.members || [])).catch(() => {});
    fetchMcpAccessTokens().then((data) => setMcpTokens(data.data || [])).catch(() => {});
  }, []);

  const connectAi = async () => {
    try {
      setSaving(true);
      const response = await createMcpAccessToken(mcpName);
      setNewMcpToken(response.data);
      setMcpTokens((items) => [response.data, ...items]);
      setError("");
    } catch (err) { setError(err.response?.data?.error || "Unable to create the AI connection."); }
    finally { setSaving(false); }
  };

  const revokeAi = async (id) => {
    try { await revokeMcpAccessToken(id); setMcpTokens((items) => items.filter((item) => (item._id || item.id) !== id)); }
    catch (err) { setError(err.response?.data?.error || "Unable to revoke the AI connection."); }
  };

  const savePassword = async () => {
    try {
      setSaving(true);
      await changePassword(passwords);
      setPasswords({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setSaved(true);
      setError("");
    } catch (err) { setError(err.response?.data?.error || "Unable to change password."); }
    finally { setSaving(false); }
  };

  const addMember = async () => {
    try {
      setSaving(true);
      const response = await createWorkspaceMember(newMember);
      setMembers((items) => [...items.filter((item) => item.email !== response.member.email), response.member]);
      setNewMember({ name: "", email: "", role: "member", temporaryPassword: "" });
      setSaved(true);
      setError("");
    } catch (err) { setError(err.response?.data?.error || "Unable to add team member."); }
    finally { setSaving(false); }
  };

  const save = async () => {
    try {
      setSaving(true);
      const cityLine = [address.city, address.region].filter(Boolean).join(", ");
      const postalAddress = [
        address.line1,
        address.line2,
        [cityLine, address.postalCode].filter(Boolean).join(" "),
        address.country,
      ].map((part) => part.trim()).filter(Boolean).join(", ");
      const config = await updateWorkspaceConfig({
        workspaceName,
        legalBusinessName,
        postalAddress,
        addressLine1: address.line1,
        addressLine2: address.line2,
        addressCity: address.city,
        addressRegion: address.region,
        addressPostalCode: address.postalCode,
        addressCountry: address.country,
        websiteUrl,
        organizationLogoUrl,
      });
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
    {saved ? <p className="discovery-notice">Organization profile saved. Campaign email footers now use these details.</p> : null}
    {error ? <p className="form-error">{error}</p> : null}
    <section className="account-layout">
      <nav className="account-settings-nav" aria-label="Settings sections">
        <button className={activeSection === "profile" ? "is-active" : ""} onClick={() => setActiveSection("profile")}><FiUser /> Organization profile</button>
        <button className={activeSection === "login" ? "is-active" : ""} onClick={() => setActiveSection("login")}><FiLock /> Login & password</button>
        <button className={activeSection === "security" ? "is-active" : ""} onClick={() => setActiveSection("security")}><FiShield /> Security</button>
        <button className={activeSection === "ai" ? "is-active" : ""} onClick={() => setActiveSection("ai")}><FiCpu /> AI connections</button>
        <button className={activeSection === "team" ? "is-active" : ""} onClick={() => setActiveSection("team")}><FiUsers /> Team access</button>
      </nav>
      {activeSection === "profile" ? <div className="account-settings-panel account-settings-panel--refined">
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
            <fieldset className="settings-address-fields">
              <legend>Business mailing address</legend>
              <p>Saved automatically in the compliance footer of campaign emails.</p>
              <label className="form-field settings-address-fields__wide"><span>Street address</span><input value={address.line1} onChange={(event) => { setAddress({ ...address, line1: event.target.value }); setSaved(false); }} placeholder="123 Main Street" /></label>
              <label className="form-field settings-address-fields__wide"><span>Unit, suite, or mailbox</span><input value={address.line2} onChange={(event) => { setAddress({ ...address, line2: event.target.value }); setSaved(false); }} placeholder="Suite 200 (optional)" /></label>
              <label className="form-field"><span>City</span><input value={address.city} onChange={(event) => { setAddress({ ...address, city: event.target.value }); setSaved(false); }} /></label>
              <label className="form-field"><span>State / region</span><input value={address.region} onChange={(event) => { setAddress({ ...address, region: event.target.value }); setSaved(false); }} /></label>
              <label className="form-field"><span>Postal code</span><input value={address.postalCode} onChange={(event) => { setAddress({ ...address, postalCode: event.target.value }); setSaved(false); }} /></label>
              <label className="form-field"><span>Country</span><input value={address.country} onChange={(event) => { setAddress({ ...address, country: event.target.value }); setSaved(false); }} /></label>
            </fieldset>
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section__heading"><FiMail /><div><h3>Email connection</h3><p>Mailbox access is managed from Integrations.</p></div></div>
          <div className="settings-email-row"><span>{accountEmail || "No Gmail account connected"}</span><Button variant="outline" size="sm" onClick={() => navigate("/integrations/gmail")}>Manage connection</Button></div>
        </section>

        <section className="settings-section">
          <div className="settings-section__heading"><FiImage /><div><h3>Campaign brands</h3><p>Give each event or program its own replaceable logo, website, and email color.</p></div></div>
          <div className="program-brand-links">{campaigns.length ? campaigns.map((campaign) => <button key={campaign._id} onClick={() => navigate(`/campaigns/${campaign._id}`)}><span>{campaign.brand?.logoUrl ? <img src={campaign.brand.logoUrl} alt="" /> : <FiImage />}<span className="campaign-brand-name"><small>{campaign.campaignKind === "program" ? "Program" : "Event"}</small><strong>{campaign.programName || campaign.name}</strong></span></span><em>Manage brand <FiArrowUpRight /></em></button>) : <p>No campaigns yet. Create an event or program campaign first.</p>}</div>
        </section>

        <footer><Button loading={saving} disabled={workspaceName.trim().length < 2} onClick={save}>Save organization profile</Button></footer>
      </div> : activeSection === "login" ? <form className="account-settings-panel account-settings-panel--refined" onSubmit={(event) => { event.preventDefault(); savePassword(); }}>
        <header><p className="page-eyebrow">Login & password</p><h2>Sign-in details</h2><p>Change the password for {session?.user?.email}. Your other signed-in devices will be logged out.</p></header>
        <section className="settings-section"><div className="settings-section__heading"><FiLock /><div><h3>Change password</h3><p>Use at least 12 characters and a password unique to Ellie.</p></div></div><div className="account-profile-form account-profile-form--compact">
          <label className="form-field"><span>Current password</span><input type="password" autoComplete="current-password" value={passwords.currentPassword} onChange={(event) => setPasswords({ ...passwords, currentPassword: event.target.value })} /></label>
          <span />
          <label className="form-field"><span>New password</span><input type="password" autoComplete="new-password" value={passwords.newPassword} onChange={(event) => setPasswords({ ...passwords, newPassword: event.target.value })} /></label>
          <label className="form-field"><span>Confirm new password</span><input type="password" autoComplete="new-password" value={passwords.confirmPassword} onChange={(event) => setPasswords({ ...passwords, confirmPassword: event.target.value })} /></label>
        </div></section>
        <footer><Button type="submit" loading={saving} disabled={!passwords.currentPassword || passwords.newPassword.length < 12 || passwords.newPassword !== passwords.confirmPassword}>Update password</Button></footer>
      </form> : activeSection === "security" ? <div className="account-settings-panel account-settings-panel--refined">
        <header><p className="page-eyebrow">Security</p><h2>Account protection</h2><p>Review the security controls currently protecting this workspace.</p></header>
        <section className="settings-section security-check-list"><p><FiShield /><span><strong>Secure server-side sessions</strong><small>Sessions expire automatically after 14 days.</small></span><em>Active</em></p><p><FiLock /><span><strong>Protected account changes</strong><small>Passwords are hashed and current-password verification is required.</small></span><em>Active</em></p><p><FiUsers /><span><strong>Role-based workspace access</strong><small>Your current role is {session?.role || "member"}.</small></span><em>Active</em></p></section>
      </div> : activeSection === "ai" ? <div className="account-settings-panel account-settings-panel--refined">
        <header><p className="page-eyebrow">AI connections</p><h2>Connect ChatGPT, Claude, Codex, and MCP clients</h2><p>Give an AI assistant controlled access to Ellie research and ranked lead lists. Email sending is not available through this connection.</p></header>
        <section className="settings-section">
          <div className="settings-section__heading"><FiCpu /><div><h3>Create a secure connection</h3><p>Tokens expire after 90 days and can be revoked at any time.</p></div></div>
          <div className="settings-ai-create"><input value={mcpName} onChange={(event) => setMcpName(event.target.value)} placeholder="Connection name" /><Button loading={saving} disabled={mcpName.trim().length < 2} onClick={connectAi}>Create connection</Button></div>
          {newMcpToken ? <div className="settings-token-reveal"><strong>Copy this token now—it will not be shown again.</strong><code>{newMcpToken.token}</code><small>MCP URL: {getMcpEndpoint()}</small></div> : null}
        </section>
        <section className="settings-section"><div className="settings-section__heading"><FiShield /><div><h3>Active connections</h3><p>Every tool call is workspace-scoped and recorded in Ellie's audit log.</p></div></div><div className="team-member-list">{mcpTokens.length ? mcpTokens.map((token) => <div key={token._id || token.id}><span><strong>{token.name}</strong><small>{token.prefix}… · expires {new Date(token.expiresAt).toLocaleDateString()}</small></span><button className="settings-revoke" onClick={() => revokeAi(token._id || token.id)} aria-label={`Revoke ${token.name}`}><FiTrash2 /></button></div>) : <p>No AI assistants connected yet.</p>}</div></section>
      </div> : <form className="account-settings-panel account-settings-panel--refined" onSubmit={(event) => { event.preventDefault(); addMember(); }}>
        <header><p className="page-eyebrow">Team access</p><h2>Workspace members</h2><p>Add a teammate with a temporary password, then send their login details securely.</p></header>
        <section className="settings-section"><div className="team-member-list">{members.map((member) => <div key={member.id}><span><strong>{member.name}</strong><small>{member.email}</small></span><em>{member.role}</em></div>)}</div></section>
        {["owner", "admin"].includes(session?.role) ? <section className="settings-section"><div className="settings-section__heading"><FiUsers /><div><h3>Add team member</h3><p>They can sign in immediately using the temporary password.</p></div></div><div className="account-profile-form account-profile-form--compact">
          <label className="form-field"><span>Name</span><input value={newMember.name} onChange={(event) => setNewMember({ ...newMember, name: event.target.value })} /></label>
          <label className="form-field"><span>Email</span><input type="email" value={newMember.email} onChange={(event) => setNewMember({ ...newMember, email: event.target.value })} /></label>
          <label className="form-field"><span>Role</span><select value={newMember.role} onChange={(event) => setNewMember({ ...newMember, role: event.target.value })}><option value="admin">Admin</option><option value="member">Member</option><option value="viewer">Viewer</option></select></label>
          <label className="form-field"><span>Temporary password</span><input type="password" value={newMember.temporaryPassword} onChange={(event) => setNewMember({ ...newMember, temporaryPassword: event.target.value })} /></label>
        </div></section> : null}
        {["owner", "admin"].includes(session?.role) ? <footer><Button type="submit" loading={saving} disabled={newMember.name.length < 2 || !newMember.email.includes("@") || newMember.temporaryPassword.length < 12}>Add team member</Button></footer> : null}
      </form>}
    </section>
  </div>;
}
