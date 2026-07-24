import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import DashboardLayout from "./layouts/DashboardLayout.jsx";

import Dashboard from "./pages/Dashboard.jsx";
import Events from "./pages/Events.jsx";
import Campaigns from "./pages/Campaigns.jsx";
import CampaignWorkspace from "./pages/CampaignWorkspace.jsx";
import Outreach from "./pages/Outreach.jsx";
import Partners from "./pages/Partners.jsx";
import Marketing from "./pages/Marketing.jsx";
import Content from "./pages/Content.jsx";
import Contacts from "./pages/Contacts.jsx";
import Analytics from "./pages/Analytics.jsx";
import Settings from "./pages/Settings.jsx";
import Jarvis from "./pages/Jarvis.jsx";
import Integrations from "./pages/Integrations.jsx";
import Discovery from "./pages/Discovery.jsx";


function App() {
  return (
    <BrowserRouter>

      <DashboardLayout>

        <Routes>

          <Route
            path="/"
            element={<Navigate to="/dashboard" replace />}
          />


          <Route
            path="/dashboard"
            element={<Dashboard />}
          />


          <Route
            path="/events"
            element={<Events />}
          />


          <Route
            path="/campaigns"
            element={<Campaigns />}
          />


          <Route
            path="/campaigns/:id"
            element={<CampaignWorkspace />}
          />


          <Route
            path="/marketing-campaigns/:id"
            element={<CampaignWorkspace />}
          />


          <Route
            path="/marketing"
            element={<Marketing />}
          />


          <Route
            path="/outreach"
            element={<Outreach />}
          />

          <Route
            path="/contacts"
            element={<Contacts />}
          />
          <Route path="/discovery" element={<Discovery />} />


          <Route
            path="/partners"
            element={<Partners />}
          />


          <Route
            path="/content"
            element={<Content />}
          />


          <Route
            path="/analytics"
            element={<Analytics />}
          />


          <Route
            path="/settings"
            element={<Settings />}
          />

          <Route
            path="/integrations"
            element={<Integrations />}
          />


          <Route
            path="/jarvis"
            element={<Jarvis />}
          />


          <Route
            path="*"
            element={<Navigate to="/dashboard" replace />}
          />

        </Routes>

      </DashboardLayout>

    </BrowserRouter>
  );
}


export default App;
