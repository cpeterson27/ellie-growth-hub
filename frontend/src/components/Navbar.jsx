import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { FiSearch, FiMenu, FiCpu, FiLogOut } from "react-icons/fi";
import { getWorkspaceSettings } from "../utils/workspaceSettings.js";
import { useInitiative } from "../context/InitiativeContext.jsx";
import { fetchWorkspaceConfig } from "../services/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import "./Navbar.css";

export default function Navbar({ onMenuClick }) {
  const navigate = useNavigate();
  const { logout, session } = useAuth();
  const location = useLocation();
  const [workspaceName, setWorkspaceName] = useState(() => getWorkspaceSettings().workspaceName);
  const { campaigns, selected, selectedId, setSelectedId } = useInitiative();
  const pageKey = location.pathname.split("/")[1] || "dashboard";
  const pageMeta = {
    dashboard: ["Command center", "Today’s priorities, pipeline, and next best actions."],
    events: ["Events", "Plan, promote, and measure every event."],
    campaigns: ["Campaigns", "Build focused campaigns that move prospects."],
    discovery: ["Discovery", "Find and qualify the right organizations."],
    contacts: ["Contacts", "Keep every relationship organized and actionable."],
    outreach: ["Outreach", "Turn approved prospects into thoughtful conversations."],
    inbox: ["Conversations", "Keep campaign replies and personal follow-up in one place."],
    marketing: ["Marketing", "Coordinate channels, content, and performance."],
    partners: ["Partners", "Grow through aligned operators and affiliates."],
    content: ["AI Content", "Create polished campaign assets with confidence."],
    jarvis: ["Jarvis", "Your voice-first growth intelligence workspace."],
    "development-requests": ["Development requests", "Approve and hand software changes to Codex safely."],
    analytics: ["Analytics", "See what is working and where to focus next."],
    integrations: ["Integrations", "Connect the systems behind Ellie’s growth engine."],
    settings: ["Settings", "Personalize the workspace and operating rules."],
  }[pageKey] || ["Growth workspace", "Operate Ellie’s growth engine from one place."];
  const changeInitiative = (value) => {
    setSelectedId(value);
    if (value !== "all") navigate(`/campaigns/${value}`);
  };

  useEffect(() => {
    const refresh = () => setWorkspaceName(getWorkspaceSettings().workspaceName);
    window.addEventListener("ellie-settings-changed", refresh);
    fetchWorkspaceConfig().then((config) => setWorkspaceName(config.workspaceName)).catch(() => {});
    return () => window.removeEventListener("ellie-settings-changed", refresh);
  }, []);


  return (
    <header className="navbar">
      <div className="navbar__left">
        <button
          className="navbar__menu"
          type="button"
          onClick={onMenuClick}
          aria-label="Open sidebar"
        >
          <FiMenu />
          <span className="navbar__menu-label">Menu</span>
        </button>
        <div className="navbar__context">
          <p className="navbar__eyebrow"><span>{workspaceName}</span><i />{pageMeta[0]}</p>
          <h1 className="navbar__title">{pageMeta[1]}</h1>
        </div>
        <label className="initiative-switcher">
          <span>Current workspace</span>
          <select value={selectedId} onChange={(event) => changeInitiative(event.target.value)}>
            <option value="all">All business activity</option>
            <optgroup label="Events">
              {campaigns.filter((campaign) => campaign.campaignKind !== "program").map((campaign) => <option key={campaign._id} value={campaign._id}>{campaign.name}</option>)}
            </optgroup>
            <optgroup label="Programs & offers">
              {campaigns.filter((campaign) => campaign.campaignKind === "program").map((campaign) => <option key={campaign._id} value={campaign._id}>{campaign.programName || campaign.name}</option>)}
            </optgroup>
          </select>
          {selected ? <i className={selected.campaignKind === "program" ? "is-offer" : "is-event"} /> : null}
        </label>
      </div>

      <div className="navbar__actions">
        <button className="navbar__search" type="button" aria-label="Search contacts" onClick={() => navigate("/contacts")}>
          <FiSearch /><span>Search workspace</span><kbd>⌘ K</kbd>
        </button>
        <button className="navbar__jarvis" type="button" onClick={() => navigate("/jarvis")}>
          <FiCpu /><span>Jarvis</span><i />
        </button>
        <button className="navbar__logout" type="button" onClick={async () => { await logout(); window.location.assign("/"); }} title={`Sign out ${session?.user?.email || ""}`} aria-label="Sign out">
          <FiLogOut />
        </button>
      </div>
    </header>
  );
}
