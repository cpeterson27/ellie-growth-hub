import { NavLink } from "react-router-dom";
import {
  FiActivity,
  FiFolder,
  FiUsers,
  FiSend,
  FiMessageSquare,
  FiZap,
  FiBarChart2,
  FiTrendingUp,
  FiSettings,
  FiLink,
  FiCpu,
  FiCheckCircle,
} from "react-icons/fi";
import "./Sidebar.css";

const navItems = [
  { label: "Dashboard", path: "/dashboard", icon: <FiActivity /> },
  { label: "Events", path: "/events", icon: <FiFolder /> },
  { label: "Campaigns", path: "/campaigns", icon: <FiZap /> },
  { label: "Launch Campaign", path: "/launch", icon: <FiCheckCircle /> },
  { label: "Discovery", path: "/discovery", icon: <FiTrendingUp /> },
  { label: "Contacts", path: "/contacts", icon: <FiUsers /> },
  { label: "Outreach", path: "/outreach", icon: <FiSend /> },
  { label: "Conversations", path: "/inbox", icon: <FiMessageSquare /> },
  { label: "Marketing", path: "/marketing", icon: <FiTrendingUp /> },
  { label: "Partners", path: "/partners", icon: <FiUsers /> },
  { label: "AI Content", path: "/content", icon: <FiZap /> },
  { label: "Jarvis", path: "/jarvis", icon: <FiCpu /> },
  { label: "Analytics", path: "/analytics", icon: <FiBarChart2 /> },
  { label: "Integrations", path: "/integrations", icon: <FiLink /> },
  { label: "Settings", path: "/settings", icon: <FiSettings /> },
];

export default function Sidebar({ isOpen, isCollapsed, onClose }) {
  return (
    <aside className={`${isOpen ? "sidebar sidebar--open" : "sidebar"} ${isCollapsed ? "sidebar--collapsed" : ""}`}>
      <div className="sidebar__brand">
        <div className="sidebar__logo">E</div>
        <div>
          <p>Ellie</p>
          <small>Growth intelligence</small>
        </div>
      </div>
      <nav className="sidebar__nav" aria-label="Primary">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `sidebar__link ${isActive ? "sidebar__link--active" : ""}`
            }
            onClick={onClose}
          >
            <span className="sidebar__icon">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="sidebar__footer">
        <p>Private growth operating system.</p>
      </div>
    </aside>
  );
}
