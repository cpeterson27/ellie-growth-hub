import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  FiArrowUpRight,
  FiBriefcase,
  FiCheck,
  FiCopy,
  FiCpu,
  FiCreditCard,
  FiImage,
  FiLock,
  FiMail,
  FiShield,
  FiTrash2,
  FiUser,
  FiUsers,
} from "react-icons/fi";
import Button from "../components/Button.jsx";
import TeamAccess from "../components/TeamAccess.jsx";
import ApplicationNotificationSettings from "../components/ApplicationNotificationSettings.jsx";
import WebsiteBrandManager from "../components/WebsiteBrandManager.jsx";
import ApplicationRouting from "../components/ApplicationRouting.jsx";
import ApplicationImageSettings from "../components/ApplicationImageSettings.jsx";
import LaunchReadiness from "../components/LaunchReadiness.jsx";
import PrivacyRequests from "../components/PrivacyRequests.jsx";
import InvitationTemplates from "../components/InvitationTemplates.jsx";
import PaymentSettings from "../components/PaymentSettings.jsx";
import useAuth from "../context/useAuth.js";
import {
  changePassword,
  createMcpAccessToken,
  fetchCampaigns,
  fetchGmailConnection,
  fetchMcpAccessTokens,
  fetchOAuthConnections,
  fetchWorkspaceConfig,
  getGptActionsSchemaEndpoint,
  getMcpEndpoint,
  revokeMcpAccessToken,
  revokeOAuthConnection,
  updateWorkspaceConfig,
  uploadEventImage,
} from "../services/api.js";
import { hasPermission } from "../utils/roleAccess.js";
import {
  getWorkspaceSettings,
  saveWorkspaceSettings,
} from "../utils/workspaceSettings.js";
import "./Settings.css";

export default function Settings() {
  const navigate = useNavigate();
  const location = useLocation();
  const { session } = useAuth();
  const [activeSection, setActiveSection] = useState(() =>
    location.pathname.endsWith("/payments")
      ? "payments"
      : location.pathname.includes("/communications/invitations")
        ? "invitations"
        : location.pathname.endsWith("/privacy")
          ? "privacy"
          : location.pathname.endsWith("/website")
            ? "public"
            : location.pathname.endsWith("/applications")
              ? "applications"
              : location.pathname.endsWith("/team")
                ? "team"
                : "profile",
  );
  const [workspaceName, setWorkspaceName] = useState(
    () => getWorkspaceSettings().workspaceName,
  );
  const [accountEmail, setAccountEmail] = useState("");
  const [legalBusinessName, setLegalBusinessName] = useState("");
  const [address, setAddress] = useState({
    line1: "",
    line2: "",
    city: "",
    region: "",
    postalCode: "",
    country: "United States",
  });
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [organizationLogoUrl, setOrganizationLogoUrl] = useState("");
  const [invitationIdentity, setInvitationIdentity] = useState({
    senderName: "",
    replyToEmail: "",
  });
  const [campaigns, setCampaigns] = useState([]);
  const [logoUploading, setLogoUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [passwords, setPasswords] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [mcpTokens, setMcpTokens] = useState([]);
  const [newMcpToken, setNewMcpToken] = useState(null);
  const [mcpName, setMcpName] = useState("Lead Porch");
  const [oauthConnections, setOauthConnections] = useState([]);
  const [copiedValue, setCopiedValue] = useState("");

  const mcpEndpoint = getMcpEndpoint();
  const codexCommand = `codex mcp add growth-operator --url "${mcpEndpoint}"`;
  const codexLoginCommand = "codex mcp login growth-operator";
  const codexSetupCommands = `${codexCommand}\n${codexLoginCommand}`;

  const copyValue = async (label, value) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedValue(label);
      window.setTimeout(
        () => setCopiedValue((current) => (current === label ? "" : current)),
        1800,
      );
    } catch {
      setError(
        "Copying was blocked by the browser. Select the value and copy it manually.",
      );
    }
  };

  useEffect(() => {
    fetchWorkspaceConfig()
      .then((config) => {
        setWorkspaceName(config.workspaceName);
        setLegalBusinessName(config.legalBusinessName || "");
        setAddress({
          line1:
            config.addressLine1 ||
            (!config.addressCity ? config.postalAddress || "" : ""),
          line2: config.addressLine2 || "",
          city: config.addressCity || "",
          region: config.addressRegion || "",
          postalCode: config.addressPostalCode || "",
          country: config.addressCountry || "United States",
        });
        setWebsiteUrl(config.websiteUrl || "");
        setOrganizationLogoUrl(config.organizationLogoUrl || "");
        setInvitationIdentity({
          senderName: config.invitationIdentity?.senderName || "",
          replyToEmail: config.invitationIdentity?.replyToEmail || "",
        });
      })
      .catch(() => {});
    fetchGmailConnection()
      .then((connection) => setAccountEmail(connection.email || ""))
      .catch(() => {});
    fetchCampaigns()
      .then((items) => setCampaigns(items || []))
      .catch(() => {});
    fetchMcpAccessTokens()
      .then((data) => setMcpTokens(data.data || []))
      .catch(() => {});
    fetchOAuthConnections()
      .then((data) => setOauthConnections(data.connections || []))
      .catch(() => {});
  }, []);

  const connectAi = async () => {
    try {
      setSaving(true);
      const response = await createMcpAccessToken(mcpName);
      setNewMcpToken(response.data);
      setMcpTokens((items) => [response.data, ...items]);
      setError("");
    } catch (err) {
      setError(
        err.response?.data?.error || "Unable to create the AI connection.",
      );
    } finally {
      setSaving(false);
    }
  };

  const revokeAi = async (id) => {
    try {
      await revokeMcpAccessToken(id);
      setMcpTokens((items) =>
        items.filter((item) => (item._id || item.id) !== id),
      );
    } catch (err) {
      setError(
        err.response?.data?.error || "Unable to revoke the AI connection.",
      );
    }
  };

  const disconnectAiApp = async (clientId) => {
    try {
      await revokeOAuthConnection(clientId);
      setOauthConnections((items) =>
        items.filter((item) => item.clientId !== clientId),
      );
    } catch (err) {
      setError(err.response?.data?.error || "Unable to disconnect the AI app.");
    }
  };

  const savePassword = async () => {
    try {
      setSaving(true);
      await changePassword(passwords);
      setPasswords({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      setSaved(true);
      setError("");
    } catch (err) {
      setError(err.response?.data?.error || "Unable to change password.");
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    try {
      setSaving(true);
      const cityLine = [address.city, address.region]
        .filter(Boolean)
        .join(", ");
      const postalAddress = [
        address.line1,
        address.line2,
        [cityLine, address.postalCode].filter(Boolean).join(" "),
        address.country,
      ]
        .map((part) => part.trim())
        .filter(Boolean)
        .join(", ");
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
        invitationIdentity,
      });
      const local = {
        ...getWorkspaceSettings(),
        workspaceName: config.workspaceName,
      };
      saveWorkspaceSettings(local);
      setWorkspaceName(config.workspaceName);
      window.dispatchEvent(
        new CustomEvent("workspace-organization-updated", {
          detail: {
            workspaceName: config.workspaceName,
            organizationLogoUrl: config.organizationLogoUrl || "",
          },
        }),
      );
      setSaved(true);
      setError("");
    } catch (err) {
      setError(
        err.response?.data?.error || "Unable to save the workspace name.",
      );
    } finally {
      setSaving(false);
    }
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
      const uploaded = await uploadEventImage({
        file: dataUrl,
        filename: file.name,
      });
      setOrganizationLogoUrl(uploaded.url);
      const cityLine = [address.city, address.region]
        .filter(Boolean)
        .join(", ");
      const postalAddress = [
        address.line1,
        address.line2,
        [cityLine, address.postalCode].filter(Boolean).join(" "),
        address.country,
      ]
        .map((part) => part.trim())
        .filter(Boolean)
        .join(", ");
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
        organizationLogoUrl: uploaded.url,
        invitationIdentity,
      });
      window.dispatchEvent(
        new CustomEvent("workspace-organization-updated", {
          detail: {
            workspaceName: config.workspaceName,
            organizationLogoUrl: config.organizationLogoUrl || uploaded.url,
          },
        }),
      );
      setSaved(true);
    } catch (err) {
      setError(
        err.response?.data?.error || "Unable to upload the organization logo.",
      );
    } finally {
      setLogoUploading(false);
    }
  };

  return (
    <div className="page-dashboard account-page">
      <div className="page-header">
        <div>
          <p className="page-eyebrow">Account</p>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">
            Manage the account and organization behind this Lead Porch
            workspace.
          </p>
        </div>
      </div>
      {saved ? (
        <p className="discovery-notice">
          Organization profile saved. Campaign email footers now use these
          details.
        </p>
      ) : null}
      {error ? <p className="form-error">{error}</p> : null}
      <section className="account-layout">
        <nav className="account-settings-nav" aria-label="Settings sections">
          <button
            className={activeSection === "profile" ? "is-active" : ""}
            onClick={() => setActiveSection("profile")}
          >
            <FiUser /> Organization profile
          </button>
          <button
            className={activeSection === "login" ? "is-active" : ""}
            onClick={() => setActiveSection("login")}
          >
            <FiLock /> Login & password
          </button>
          <button
            className={activeSection === "security" ? "is-active" : ""}
            onClick={() => setActiveSection("security")}
          >
            <FiShield /> Security
          </button>
          <button
            className={activeSection === "ai" ? "is-active" : ""}
            onClick={() => setActiveSection("ai")}
          >
            <FiCpu /> AI connections
          </button>
          <button
            className={activeSection === "team" ? "is-active" : ""}
            onClick={() => {
              setActiveSection("team");
              navigate("/settings/team");
            }}
          >
            <FiUsers /> Team & Access
          </button>
          {hasPermission(session, "payments.view") ||
          hasPermission(session, "payments.manage") ? (
            <button
              className={activeSection === "payments" ? "is-active" : ""}
              onClick={() => {
                setActiveSection("payments");
                navigate("/settings/payments");
              }}
            >
              <FiCreditCard /> Payments
            </button>
          ) : null}
          {hasPermission(session, "team.manage") ? (
            <button
              className={activeSection === "invitations" ? "is-active" : ""}
              onClick={() => {
                setActiveSection("invitations");
                navigate("/settings/communications/invitations");
              }}
            >
              <FiMail /> Communications · Invitation templates
            </button>
          ) : null}
          {hasPermission(session, "workspace.manage") ? (
            <button
              className={activeSection === "public" ? "is-active" : ""}
              onClick={() => {
                setActiveSection("public");
                navigate("/settings/website");
              }}
            >
              <FiImage /> Website & Brand
            </button>
          ) : null}
          {hasPermission(session, "workspace.manage") ? (
            <button
              className={activeSection === "applications" ? "is-active" : ""}
              onClick={() => {
                setActiveSection("applications");
                navigate("/settings/applications");
              }}
            >
              <FiBriefcase /> Student Application
            </button>
          ) : null}
          {hasPermission(session, "workspace.manage") ? (
            <button
              className={activeSection === "readiness" ? "is-active" : ""}
              onClick={() => setActiveSection("readiness")}
            >
              <FiCheck /> Launch readiness
            </button>
          ) : null}
          {hasPermission(session, "workspace.manage") ? (
            <button
              className={activeSection === "privacy" ? "is-active" : ""}
              onClick={() => {
                setActiveSection("privacy");
                navigate("/settings/privacy");
              }}
            >
              <FiShield /> Privacy requests
            </button>
          ) : null}
        </nav>
        {activeSection === "profile" ? (
          <div className="account-settings-panel account-settings-panel--refined">
            <header>
              <p className="page-eyebrow">Organization profile</p>
              <h2>Identity and email brand</h2>
              <p>
                Set the client-level identity once. Individual events and
                programs can use their own logo and campaign branding.
              </p>
            </header>

            <section className="settings-section">
              <div className="settings-section__heading">
                <FiImage />
                <div>
                  <h3>Brand assets</h3>
                  <p>
                    The primary organization logo used in the authenticated
                    Lead Porch sidebar and campaign email branding. Public
                    website light/dark logos are managed separately under
                    Website &amp; Brand.
                  </p>
                </div>
              </div>
              <div className="brand-asset-row">
                <div className="brand-logo-preview">
                  {organizationLogoUrl ? (
                    <img src={organizationLogoUrl} alt="Organization logo" />
                  ) : (
                    <span>
                      <FiImage />
                      No logo uploaded
                    </span>
                  )}
                </div>
                <div>
                  <label className="brand-upload-button">
                    Choose logo
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(event) => uploadLogo(event.target.files?.[0])}
                    />
                  </label>
                  <small>
                    {logoUploading
                      ? "Uploading…"
                      : "PNG, JPG, or WEBP · maximum 8 MB"}
                  </small>
                  {organizationLogoUrl ? (
                    <button
                      className="brand-remove"
                      type="button"
                      onClick={() => {
                        setOrganizationLogoUrl("");
                        setSaved(false);
                      }}
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              </div>
            </section>

            <section className="settings-section">
              <div className="settings-section__heading">
                <FiBriefcase />
                <div>
                  <h3>Business details</h3>
                  <p>
                    Used in navigation and the compliance footer on campaign
                    email.
                  </p>
                </div>
              </div>
              <div className="account-profile-form account-profile-form--compact">
                <label className="form-field">
                  <span>Business / display name</span>
                  <input
                    value={workspaceName}
                    onChange={(event) => {
                      setWorkspaceName(event.target.value);
                      setSaved(false);
                    }}
                  />
                  <small>
                    Used in Lead Porch and as [Business name] in
                    invitations.
                  </small>
                </label>
                <label className="form-field">
                  <span>Legal business name</span>
                  <input
                    value={legalBusinessName}
                    onChange={(event) => {
                      setLegalBusinessName(event.target.value);
                      setSaved(false);
                    }}
                  />
                </label>
                <label className="form-field">
                  <span>Default invitation sender name</span>
                  <input
                    value={invitationIdentity.senderName}
                    onChange={(event) => {
                      setInvitationIdentity({
                        ...invitationIdentity,
                        senderName: event.target.value,
                      });
                      setSaved(false);
                    }}
                    placeholder={session?.user?.name || "Authenticated inviter"}
                  />
                  <small>
                    Optional. If blank, [Invited by] uses the person who created
                    the invitation.
                  </small>
                </label>
                <label className="form-field">
                  <span>Invitation reply-to email</span>
                  <input
                    type="email"
                    value={invitationIdentity.replyToEmail}
                    onChange={(event) => {
                      setInvitationIdentity({
                        ...invitationIdentity,
                        replyToEmail: event.target.value,
                      });
                      setSaved(false);
                    }}
                    placeholder={session?.user?.email || "name@example.com"}
                  />
                  <small>
                    Optional. Replies to invitation emails are directed here
                    when configured.
                  </small>
                </label>
                <label className="form-field">
                  <span>Business website</span>
                  <input
                    type="url"
                    value={websiteUrl}
                    onChange={(event) => {
                      setWebsiteUrl(event.target.value);
                      setSaved(false);
                    }}
                    placeholder="https://elliescoaching.com"
                  />
                </label>
                <fieldset className="settings-address-fields">
                  <legend>Business mailing address</legend>
                  <p>
                    Saved automatically in the compliance footer of campaign
                    emails.
                  </p>
                  <label className="form-field settings-address-fields__wide">
                    <span>Street address</span>
                    <input
                      value={address.line1}
                      onChange={(event) => {
                        setAddress({ ...address, line1: event.target.value });
                        setSaved(false);
                      }}
                      placeholder="123 Main Street"
                    />
                  </label>
                  <label className="form-field settings-address-fields__wide">
                    <span>Unit, suite, or mailbox</span>
                    <input
                      value={address.line2}
                      onChange={(event) => {
                        setAddress({ ...address, line2: event.target.value });
                        setSaved(false);
                      }}
                      placeholder="Suite 200 (optional)"
                    />
                  </label>
                  <label className="form-field">
                    <span>City</span>
                    <input
                      value={address.city}
                      onChange={(event) => {
                        setAddress({ ...address, city: event.target.value });
                        setSaved(false);
                      }}
                    />
                  </label>
                  <label className="form-field">
                    <span>State / region</span>
                    <input
                      value={address.region}
                      onChange={(event) => {
                        setAddress({ ...address, region: event.target.value });
                        setSaved(false);
                      }}
                    />
                  </label>
                  <label className="form-field">
                    <span>Postal code</span>
                    <input
                      value={address.postalCode}
                      onChange={(event) => {
                        setAddress({
                          ...address,
                          postalCode: event.target.value,
                        });
                        setSaved(false);
                      }}
                    />
                  </label>
                  <label className="form-field">
                    <span>Country</span>
                    <input
                      value={address.country}
                      onChange={(event) => {
                        setAddress({ ...address, country: event.target.value });
                        setSaved(false);
                      }}
                    />
                  </label>
                </fieldset>
              </div>
            </section>

            <section className="settings-section">
              <div className="settings-section__heading">
                <FiMail />
                <div>
                  <h3>Email connection</h3>
                  <p>Mailbox access is managed from Integrations.</p>
                </div>
              </div>
              <div className="settings-email-row">
                <span>{accountEmail || "No Gmail account connected"}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate("/integrations/gmail")}
                >
                  Manage connection
                </Button>
              </div>
            </section>

            <section className="settings-section">
              <div className="settings-section__heading">
                <FiImage />
                <div>
                  <h3>Campaign brands</h3>
                  <p>
                    Give each event or program its own replaceable logo,
                    website, and email color.
                  </p>
                </div>
              </div>
              <div className="program-brand-links">
                {campaigns.length ? (
                  campaigns.map((campaign) => (
                    <button
                      key={campaign._id}
                      onClick={() => navigate(`/campaigns/${campaign._id}`)}
                    >
                      <span>
                        {campaign.brand?.logoUrl ? (
                          <img src={campaign.brand.logoUrl} alt="" />
                        ) : (
                          <FiImage />
                        )}
                        <span className="campaign-brand-name">
                          <small>
                            {campaign.campaignKind === "program"
                              ? "Program"
                              : "Event"}
                          </small>
                          <strong>
                            {campaign.programName || campaign.name}
                          </strong>
                        </span>
                      </span>
                      <em>
                        Manage brand <FiArrowUpRight />
                      </em>
                    </button>
                  ))
                ) : (
                  <p>
                    No campaigns yet. Create an event or program campaign first.
                  </p>
                )}
              </div>
            </section>

            <footer>
              <Button
                loading={saving}
                disabled={workspaceName.trim().length < 2}
                onClick={save}
              >
                Save organization profile
              </Button>
            </footer>
          </div>
        ) : activeSection === "login" ? (
          <form
            className="account-settings-panel account-settings-panel--refined"
            onSubmit={(event) => {
              event.preventDefault();
              savePassword();
            }}
          >
            <header>
              <p className="page-eyebrow">Login & password</p>
              <h2>Sign-in details</h2>
              <p>
                Change the password for {session?.user?.email}. Your other
                signed-in devices will be logged out.
              </p>
            </header>
            <section className="settings-section">
              <div className="settings-section__heading">
                <FiLock />
                <div>
                  <h3>Change password</h3>
                  <p>
                    Use at least 12 characters and a password unique to Growth
                    Operator.
                  </p>
                </div>
              </div>
              <div className="account-profile-form account-profile-form--compact">
                <label className="form-field">
                  <span>Current password</span>
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={passwords.currentPassword}
                    onChange={(event) =>
                      setPasswords({
                        ...passwords,
                        currentPassword: event.target.value,
                      })
                    }
                  />
                </label>
                <span />
                <label className="form-field">
                  <span>New password</span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={passwords.newPassword}
                    onChange={(event) =>
                      setPasswords({
                        ...passwords,
                        newPassword: event.target.value,
                      })
                    }
                  />
                </label>
                <label className="form-field">
                  <span>Confirm new password</span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={passwords.confirmPassword}
                    onChange={(event) =>
                      setPasswords({
                        ...passwords,
                        confirmPassword: event.target.value,
                      })
                    }
                  />
                </label>
              </div>
            </section>
            <footer>
              <Button
                type="submit"
                loading={saving}
                disabled={
                  !passwords.currentPassword ||
                  passwords.newPassword.length < 12 ||
                  passwords.newPassword !== passwords.confirmPassword
                }
              >
                Update password
              </Button>
            </footer>
          </form>
        ) : activeSection === "security" ? (
          <div className="account-settings-panel account-settings-panel--refined">
            <header>
              <p className="page-eyebrow">Security</p>
              <h2>Account protection</h2>
              <p>
                Review the security controls currently protecting this
                workspace.
              </p>
            </header>
            <section className="settings-section security-check-list">
              <p>
                <FiShield />
                <span>
                  <strong>Secure server-side sessions</strong>
                  <small>Sessions expire automatically after 14 days.</small>
                </span>
                <em>Active</em>
              </p>
              <p>
                <FiLock />
                <span>
                  <strong>Protected account changes</strong>
                  <small>
                    Passwords are hashed and current-password verification is
                    required.
                  </small>
                </span>
                <em>Active</em>
              </p>
              <p>
                <FiUsers />
                <span>
                  <strong>Capability-based workspace access</strong>
                  <small>
                    Your roles are{" "}
                    {(session?.roles || [session?.role || "member"]).join(", ")}
                    .
                  </small>
                </span>
                <em>Active</em>
              </p>
            </section>
          </div>
        ) : activeSection === "ai" ? (
          <div className="account-settings-panel account-settings-panel--refined">
            <header>
              <p className="page-eyebrow">Lead Porch connections</p>
              <h2>
                Connect Lead Porch to ChatGPT, Claude, Codex, or an MCP
                client
              </h2>
              <p>
                Lead Porch receives controlled access to Lead Porch
                research and ranked lead lists. Email sending is not available
                through this connection.
              </p>
            </header>
            <section className="settings-section">
              <div className="settings-section__heading">
                <FiCpu />
                <div>
                  <h3>Connect Codex</h3>
                  <p>
                    Sign in with your Lead Porch account once. Codex stores
                    and refreshes its own authorization—there is no secret token
                    to copy or remember.
                  </p>
                </div>
              </div>
              <div className="settings-connection-details">
                <label>
                  <span>MCP server URL</span>
                  <div className="settings-copy-row">
                    <code>{mcpEndpoint}</code>
                    <button
                      type="button"
                      onClick={() => copyValue("endpoint", mcpEndpoint)}
                    >
                      {copiedValue === "endpoint" ? <FiCheck /> : <FiCopy />}
                      {copiedValue === "endpoint" ? "Copied" : "Copy URL"}
                    </button>
                  </div>
                </label>
                <label>
                  <span>Codex setup commands</span>
                  <div className="settings-copy-row">
                    <code className="settings-command-lines">
                      {codexCommand}
                      <br />
                      {codexLoginCommand}
                    </code>
                    <button
                      type="button"
                      onClick={() => copyValue("codex", codexSetupCommands)}
                    >
                      {copiedValue === "codex" ? <FiCheck /> : <FiCopy />}
                      {copiedValue === "codex" ? "Copied" : "Copy commands"}
                    </button>
                  </div>
                </label>
                <ol>
                  <li>Run both commands in Terminal.</li>
                  <li>
                    Your browser opens Lead Porch. Sign in and approve the
                    requested access.
                  </li>
                  <li>
                    Restart Codex once. Lead Porch will then be available
                    whenever you need it.
                  </li>
                </ol>
                <p className="settings-oauth-note">
                  <FiShield />
                  <span>
                    <strong>Professional OAuth connection</strong>
                    <small>
                      Short-lived access, automatic refresh, workspace-scoped
                      permissions, and one-click revocation from this page.
                    </small>
                  </span>
                </p>
              </div>
            </section>
            <section className="settings-section settings-section--secondary">
              <div className="settings-section__heading">
                <FiLock />
                <div>
                  <h3>Manual token for Custom GPTs</h3>
                  <p>
                    Use this only when a client cannot sign in with OAuth.
                    Tokens expire after 90 days and are shown once.
                  </p>
                </div>
              </div>
              <div className="settings-ai-create">
                <input
                  value={mcpName}
                  onChange={(event) => setMcpName(event.target.value)}
                  placeholder="Connection name"
                />
                <Button
                  loading={saving}
                  disabled={mcpName.trim().length < 2}
                  onClick={connectAi}
                >
                  Create manual token
                </Button>
              </div>
              {newMcpToken ? (
                <div className="settings-token-reveal">
                  <strong>
                    Copy this token now—it will not be shown again.
                  </strong>
                  <div className="settings-copy-row">
                    <code>{newMcpToken.token}</code>
                    <button
                      type="button"
                      onClick={() => copyValue("token", newMcpToken.token)}
                    >
                      {copiedValue === "token" ? <FiCheck /> : <FiCopy />}
                      {copiedValue === "token" ? "Copied" : "Copy token"}
                    </button>
                  </div>
                  <small>
                    ChatGPT Actions schema: {getGptActionsSchemaEndpoint()}
                  </small>
                  <small>
                    Keep this connection private. Anyone with its token can use
                    your Lead Porch permissions.
                  </small>
                </div>
              ) : null}
              {mcpTokens.length && !newMcpToken ? (
                <p className="settings-token-warning">
                  <strong>Lost an existing manual token?</strong> For security,
                  it cannot be recovered. Revoke it below and create a
                  replacement.
                </p>
              ) : null}
            </section>
            <section className="settings-section">
              <div className="settings-section__heading">
                <FiShield />
                <div>
                  <h3>Active connections</h3>
                  <p>
                    Every tool call is workspace-scoped and recorded in Growth
                    Operator's audit log.
                  </p>
                </div>
              </div>
              <div className="team-member-list">
                {oauthConnections.map((connection) => (
                  <div key={connection.id}>
                    <span>
                      <strong>{connection.name}</strong>
                      <small>
                        OAuth connection · {connection.scopes.join(" · ")}
                      </small>
                    </span>
                    <button
                      className="settings-revoke"
                      onClick={() => disconnectAiApp(connection.clientId)}
                      aria-label={`Disconnect ${connection.name}`}
                    >
                      <FiTrash2 />
                    </button>
                  </div>
                ))}
                {mcpTokens.map((token) => (
                  <div key={token._id || token.id}>
                    <span>
                      <strong>{token.name}</strong>
                      <small>
                        {token.prefix}… · expires{" "}
                        {new Date(token.expiresAt).toLocaleDateString()} ·
                        secret hidden after creation
                      </small>
                    </span>
                    <button
                      className="settings-revoke"
                      onClick={() => revokeAi(token._id || token.id)}
                      aria-label={`Revoke ${token.name}`}
                    >
                      <FiTrash2 />
                    </button>
                  </div>
                ))}
                {!oauthConnections.length && !mcpTokens.length ? (
                  <p>No AI assistants connected yet.</p>
                ) : null}
              </div>
            </section>
          </div>
        ) : activeSection === "payments" ? (
          <PaymentSettings />
        ) : activeSection === "public" ? (
          <WebsiteBrandManager websiteUrl={websiteUrl} />
        ) : activeSection === "applications" ? (
          <div className="account-settings-content">
            <ApplicationImageSettings />
            <ApplicationRouting />
            <ApplicationNotificationSettings />
          </div>
        ) : activeSection === "readiness" ? (
          <LaunchReadiness />
        ) : activeSection === "privacy" ? (
          <PrivacyRequests />
        ) : activeSection === "invitations" ? (
          <InvitationTemplates />
        ) : (
          <TeamAccess
            canManage={hasPermission(session, "team.manage")}
            actorRoles={session?.roles || [session?.role].filter(Boolean)}
          />
        )}
      </section>
    </div>
  );
}
