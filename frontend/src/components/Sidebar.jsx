import { NavLink } from "react-router-dom";
import {
  FiActivity,
  FiFolder,
  FiUsers,
  FiMail,
  FiZap,
  FiBarChart2,
  FiTrendingUp,
  FiSettings,
  FiCpu,
} from "react-icons/fi";
import "./Sidebar.css";

const navItems = [
  { label: "Dashboard", path: "/dashboard", icon: <FiActivity /> },
  { label: "Events", path: "/events", icon: <FiFolder /> },
  { label: "Campaigns", path: "/campaigns", icon: <FiZap /> },
  { label: "Discovery", path: "/discovery", icon: <FiTrendingUp /> },
  { label: "Contacts", path: "/contacts", icon: <FiUsers /> },
  { label: "Outreach", path: "/outreach", icon: <FiMail /> },
  { label: "Marketing", path: "/marketing", icon: <FiTrendingUp /> },
  { label: "Partners", path: "/partners", icon: <FiUsers /> },
  { label: "AI Content", path: "/content", icon: <FiZap /> },
  { label: "Jarvis", path: "/jarvis", icon: <FiCpu /> },
  { label: "Analytics", path: "/analytics", icon: <FiBarChart2 /> },
  { label: "Integrations", path: "/integrations", icon: <FiSettings /> },
  { label: "Settings", path: "/settings", icon: <FiSettings /> },
];

export default function Sidebar({ isOpen, onClose }) {
  return (
    <aside className={isOpen ? "sidebar sidebar--open" : "sidebar"}>
      <div className="sidebar__brand">
        <div className="sidebar__logo">E</div>
        <div>
          <p>Ellie AI</p>
          <small>Growth Operator</small>
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
        <p>Manage events, partners, and revenue from one dashboard.</p>
      </div>
    </aside>
  );
}
