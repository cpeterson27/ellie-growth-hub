import { NavLink } from "react-router-dom";
import {
  FiActivity,
  FiBriefcase,
  FiCalendar,
  FiFolder,
  FiUsers,
  FiMessageSquare,
  FiZap,
  FiBarChart2,
  FiTrendingUp,
  FiSettings,
  FiLink,
  FiCpu,
  FiFileText,
  FiList,
  FiLogOut,
} from "react-icons/fi";
import useAuth from "../context/useAuth.js";
import "./Sidebar.css";

const navGroups = [
  { label: "Operate", items: [
    { label: "Command Center", path: "/command-center", icon: <FiActivity /> },
    { label: "CRM", path: "/crm/contacts", icon: <FiUsers /> },
    { label: "Opportunities", path: "/opportunities", icon: <FiBriefcase /> },
    { label: "Conversations", path: "/conversations", icon: <FiMessageSquare /> },
    { label: "Tasks", path: "/tasks", icon: <FiList /> },
  ] },
  { label: "Grow", items: [
    { label: "Campaigns", path: "/campaigns", icon: <FiZap /> },
    { label: "Discovery", path: "/discovery", icon: <FiTrendingUp /> },
    { label: "Events", path: "/events", icon: <FiCalendar /> },
    { label: "Content", path: "/content", icon: <FiFileText /> },
    { label: "Partners", path: "/partners", icon: <FiFolder /> },
  ] },
  { label: "Understand", items: [
    { label: "Analytics", path: "/analytics", icon: <FiBarChart2 /> },
    { label: "AI Operators", path: "/operators/jarvis", icon: <FiCpu /> },
  ] },
  { label: "Configure", items: [
    { label: "Integrations", path: "/integrations", icon: <FiLink /> },
    { label: "Settings", path: "/settings/workspace", icon: <FiSettings /> },
  ] },
];

export default function Sidebar({ isOpen, isCollapsed, onClose }) {
  const { logout, session } = useAuth();
  return (
    <aside className={`${isOpen ? "sidebar sidebar--open" : "sidebar"} ${isCollapsed ? "sidebar--collapsed" : ""}`}>
      <div className="sidebar__brand">
        <div className="sidebar__logo">G</div>
        <div>
          <p>Growth Operator</p>
          <small>Growth intelligence</small>
        </div>
      </div>
      <nav className="sidebar__nav" aria-label="Primary">
        {navGroups.map((group) => <section className="sidebar__group" key={group.label} aria-label={group.label}>
          <p className="sidebar__group-label">{group.label}</p>
          {group.items.map((item) => item.planned ? (
            <div className="sidebar__link sidebar__link--planned" key={item.label} aria-label={`${item.label}, planned`}>
              <span className="sidebar__icon">{item.icon}</span>
              <span>{item.label}</span>
              <small>Planned</small>
            </div>
          ) : (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `sidebar__link ${isActive ? "sidebar__link--active" : ""}`}
              onClick={onClose}
            >
              <span className="sidebar__icon">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </section>)}
      </nav>
      <div className="sidebar__footer">
        <button className="sidebar__logout" type="button" onClick={async () => { await logout(); window.location.assign("/"); }} title={`Sign out ${session?.user?.email || ""}`}>
          <FiLogOut /><span>Sign out</span>
        </button>
        <p>Private growth operating system.</p>
      </div>
    </aside>
  );
}
