import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import DashboardLayout from "./layouts/DashboardLayout.jsx";

import { InitiativeProvider } from "./context/InitiativeContext.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import useAuth from "./context/useAuth.js";

const Dashboard = lazy(() => import("./pages/Dashboard.jsx"));
const Events = lazy(() => import("./pages/Events.jsx"));
const Campaigns = lazy(() => import("./pages/Campaigns.jsx"));
const CampaignLaunch = lazy(() => import("./pages/CampaignLaunch.jsx"));
const CampaignWorkspace = lazy(() => import("./pages/CampaignWorkspace.jsx"));
const Outreach = lazy(() => import("./pages/Outreach.jsx"));
const Partners = lazy(() => import("./pages/Partners.jsx"));
const Marketing = lazy(() => import("./pages/Marketing.jsx"));
const Content = lazy(() => import("./pages/Content.jsx"));
const Contacts = lazy(() => import("./pages/Contacts.jsx"));
const Companies = lazy(() => import("./pages/Companies.jsx"));
const Opportunities = lazy(() => import("./pages/Opportunities.jsx"));
const Tasks = lazy(() => import("./pages/Tasks.jsx"));
const Analytics = lazy(() => import("./pages/Analytics.jsx"));
const Settings = lazy(() => import("./pages/Settings.jsx"));
const Jarvis = lazy(() => import("./pages/Jarvis.jsx"));
const Integrations = lazy(() => import("./pages/Integrations.jsx"));
const EventbriteIntegration = lazy(() => import("./pages/EventbriteIntegration.jsx"));
const Discovery = lazy(() => import("./pages/Discovery.jsx"));
const DevelopmentRequests = lazy(() => import("./pages/DevelopmentRequests.jsx"));
const CrmSetup = lazy(() => import("./pages/CrmSetup.jsx"));
const GmailIntegration = lazy(() => import("./pages/GmailIntegration.jsx"));
const Login = lazy(() => import("./pages/Login.jsx"));
const Landing = lazy(() => import("./pages/Landing.jsx"));
const OAuthConsent = lazy(() => import("./pages/OAuthConsent.jsx"));

const PageLoading = () => <div className="auth-loading">Opening Growth Operator…</div>;

function ProtectedApp() {
  const { loading, session } = useAuth();
  if (loading) return <div className="auth-loading">Opening your private workspace…</div>;
  if (!session) return <Navigate to="/login" replace />;
  return (
    <InitiativeProvider>
      <DashboardLayout>
        <Routes>
          <Route path="/" element={<Navigate to="/command-center" replace />} />
          <Route path="/command-center" element={<Dashboard />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/events" element={<Events />} />
          <Route path="/campaigns" element={<Campaigns />} />
          <Route path="/campaigns/new" element={<CampaignLaunch />} />
          <Route path="/campaigns/outreach" element={<Outreach />} />
          <Route path="/launch" element={<CampaignLaunch />} />
          <Route path="/campaigns/:id" element={<CampaignWorkspace />} />
          <Route path="/campaigns/:id/overview" element={<CampaignWorkspace />} />
          <Route path="/marketing-campaigns/:id" element={<CampaignWorkspace />} />
          <Route path="/marketing" element={<Marketing />} />
          <Route path="/outreach" element={<Outreach />} />
          <Route path="/crm/contacts" element={<Contacts />} />
          <Route path="/crm/contacts/:id" element={<Contacts />} />
          <Route path="/crm/companies" element={<Companies />} />
          <Route path="/crm/companies/:id" element={<Companies />} />
          <Route path="/opportunities" element={<Opportunities />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/contacts" element={<Contacts />} />
          <Route path="/discovery" element={<Discovery />} />
          <Route path="/discovery/:workspace" element={<Discovery />} />
          <Route path="/partners" element={<Partners />} />
          <Route path="/content" element={<Content />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/settings/workspace" element={<Settings />} />
          <Route path="/integrations" element={<Integrations />} />
          <Route path="/integrations/eventbrite" element={<EventbriteIntegration />} />
          <Route path="/contacts/fields" element={<CrmSetup />} />
          <Route path="/settings/crm/fields" element={<CrmSetup />} />
          <Route path="/integrations/crm" element={<Navigate to="/settings/crm/fields" replace />} />
          <Route path="/integrations/gmail" element={<GmailIntegration />} />
          <Route path="/conversations" element={<GmailIntegration />} />
          <Route path="/inbox" element={<GmailIntegration />} />
          <Route path="/operators/jarvis" element={<Jarvis />} />
          <Route path="/operators/development-requests" element={<DevelopmentRequests />} />
          <Route path="/jarvis" element={<Jarvis />} />
          <Route path="/development-requests" element={<DevelopmentRequests />} />
          <Route path="*" element={<Navigate to="/command-center" replace />} />
        </Routes>
      </DashboardLayout>
    </InitiativeProvider>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<PageLoading />}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/oauth/consent" element={<OAuthConsent />} />
            <Route path="*" element={<ProtectedApp />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}


export default App;
