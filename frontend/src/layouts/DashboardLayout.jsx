import { useState } from "react";
import Sidebar from "../components/Sidebar.jsx";
import Navbar from "../components/Navbar.jsx";
import "./DashboardLayout.css";

export default function DashboardLayout({ children }) {
  const [isSidebarOpen, setSidebarOpen] = useState(false);

  const toggleSidebar = () => setSidebarOpen((value) => !value);
  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className="dashboard-shell">
      <Sidebar isOpen={isSidebarOpen} onClose={closeSidebar} />
      {isSidebarOpen ? (
        <div className="dashboard-overlay" onClick={closeSidebar} />
      ) : null}
      <div className="dashboard-view">
        <Navbar onMenuClick={toggleSidebar} />
        <main className="dashboard-content" onClick={closeSidebar}>
          {children}
        </main>
      </div>
    </div>
  );
}
