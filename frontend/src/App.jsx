import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import DashboardLayout from "./layouts/DashboardLayout.jsx";

import { InitiativeProvider } from "./context/InitiativeContext.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import { WorkspaceThemeProvider } from "./context/WorkspaceThemeContext.jsx";
import useAuth from "./context/useAuth.js";
import { canManageCoaching, canUseCoachPortal, canUseSales, hasPermission, isAmbassadorOnly, isCoachOnly } from "./utils/roleAccess.js";

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
const AcceptInvitation = lazy(() => import("./pages/AcceptInvitation.jsx"));
const PublicHome = lazy(() => import("./pages/PublicSite.jsx").then((module) => ({ default: module.PublicHome })));
const AboutPage = lazy(() => import("./pages/PublicSite.jsx").then((module) => ({ default: module.AboutPage })));
const ProgramsPage = lazy(() => import("./pages/PublicSite.jsx").then((module) => ({ default: module.ProgramsPage })));
const ProgramDetail = lazy(() => import("./pages/PublicSite.jsx").then((module) => ({ default: module.ProgramDetail })));
const TestimonialsPage = lazy(() => import("./pages/PublicSite.jsx").then((module) => ({ default: module.TestimonialsPage })));
const ContactPage = lazy(() => import("./pages/PublicSite.jsx").then((module) => ({ default: module.ContactPage })));
const PublicProfilePage = lazy(() => import("./pages/PublicSite.jsx").then((module) => ({ default: module.PublicProfilePage })));
const PublicApplication = lazy(() => import("./pages/PublicApplication.jsx"));
const PrivacyPage = lazy(() => import("./pages/PublicLegal.jsx").then((module) => ({ default: module.PrivacyPage })));
const TermsPage = lazy(() => import("./pages/PublicLegal.jsx").then((module) => ({ default: module.TermsPage })));
const DataDeletionPage = lazy(() => import("./pages/PublicLegal.jsx").then((module) => ({ default: module.DataDeletionPage })));
const CoachPublicProfile = lazy(() => import("./pages/ProfileEditors.jsx").then((module) => ({ default: module.CoachProfileEditor })));
const StudentProfileEditor = lazy(() => import("./pages/ProfileEditors.jsx").then((module) => ({ default: module.StudentProfileEditor })));
const OAuthConsent = lazy(() => import("./pages/OAuthConsent.jsx"));
const CoachingAdmin = lazy(() => import("./pages/CoachingAdmin.jsx").then((module) => ({ default: module.CoachingDashboard })));
const CoachingStudents = lazy(() => import("./pages/CoachingAdmin.jsx").then((module) => ({ default: module.CoachingStudents })));
const CoachingStudentDetail = lazy(() => import("./pages/CoachingAdmin.jsx").then((module) => ({ default: module.CoachingStudentDetail })));
const CoachingCoaches = lazy(() => import("./pages/CoachingAdmin.jsx").then((module) => ({ default: module.CoachingCoaches })));
const CoachingPrograms = lazy(() => import("./pages/CoachingAdmin.jsx").then((module) => ({ default: module.CoachingPrograms })));
const CoachingEnrollments = lazy(() => import("./pages/CoachingAdmin.jsx").then((module) => ({ default: module.CoachingEnrollments })));
const CoachingAssignments = lazy(() => import("./pages/CoachingAdmin.jsx").then((module) => ({ default: module.CoachingAssignments })));
const CoachingReferrals = lazy(() => import("./pages/CoachingAdmin.jsx").then((module) => ({ default: module.CoachingReferrals })));
const CoachingCommissions = lazy(() => import("./pages/CoachingAdmin.jsx").then((module) => ({ default: module.CoachingCommissions })));
const CoachingSessions = lazy(() => import("./pages/CoachingAdmin.jsx").then((module) => ({ default: module.CoachingSessions })));
const CoachingCommunications = lazy(() => import("./pages/CoachingAdmin.jsx").then((module) => ({ default: module.CoachingCommunications })));
const CoachDashboard = lazy(() => import("./pages/CoachPortal.jsx").then((module) => ({ default: module.CoachDashboard })));
const CoachStudents = lazy(() => import("./pages/CoachPortal.jsx").then((module) => ({ default: module.CoachStudents })));
const CoachStudentDetail = lazy(() => import("./pages/CoachPortal.jsx").then((module) => ({ default: module.CoachStudentDetail })));
const CoachSchedule = lazy(() => import("./pages/CoachPortal.jsx").then((module) => ({ default: module.CoachSchedule })));
const CoachReferrals = lazy(() => import("./pages/CoachPortal.jsx").then((module) => ({ default: module.CoachReferrals })));
const CoachCommissions = lazy(() => import("./pages/CoachPortal.jsx").then((module) => ({ default: module.CoachCommissions })));
const SocialAutomation = lazy(() => import("./pages/SocialAutomation.jsx"));
const Automations = lazy(() => import("./pages/Automations.jsx"));
const AmbassadorPortal = lazy(() => import("./pages/AmbassadorPortal.jsx"));
const AmbassadorAdmin = lazy(() => import("./pages/AmbassadorAdmin.jsx"));
const MyProfile = lazy(() => import("./pages/MyProfile.jsx"));

const PageLoading = () => <div className="auth-loading">Opening Growth Operator…</div>;

function ProtectedApp() {
  const { loading, session } = useAuth();
  if (loading) return <div className="auth-loading">Opening your private workspace…</div>;
  if (!session) return <Navigate to="/login" replace />;
  if (isAmbassadorOnly(session)) return <InitiativeProvider enabled={false}><DashboardLayout><Routes><Route path="/ambassador" element={<AmbassadorPortal />} /><Route path="/profile" element={<MyProfile />} /><Route path="*" element={<Navigate to="/ambassador" replace />} /></Routes></DashboardLayout></InitiativeProvider>;
  if (isCoachOnly(session)) return (
    <InitiativeProvider enabled={false}>
      <DashboardLayout>
        <Routes>
          <Route path="/coach" element={<CoachDashboard />} />
          <Route path="/coach/students" element={<CoachStudents />} />
          <Route path="/coach/students/:contactId" element={<CoachStudentDetail />} />
          <Route path="/coach/upcoming" element={<CoachStudents upcoming />} />
          <Route path="/coach/schedule" element={<CoachSchedule />} />
          <Route path="/coach/referrals" element={<CoachReferrals />} />
          <Route path="/coach/commissions" element={<CoachCommissions />} />
          <Route path="/coach/profile" element={<CoachPublicProfile />} />
          <Route path="/profile" element={<MyProfile />} />
          <Route path="*" element={<Navigate to="/coach" replace />} />
        </Routes>
      </DashboardLayout>
    </InitiativeProvider>
  );
  const mayManageCoaching = canManageCoaching(session);
  const mayUseCoachPortal = canUseCoachPortal(session);
  const privateHome = !hasPermission(session, "crm.view") && canUseSales(session) ? "/opportunities" : "/command-center";
  return (
    <InitiativeProvider>
      <DashboardLayout>
        <Routes>
          <Route path="/" element={<Navigate to={privateHome} replace />} />
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
          <Route path="/profile" element={<MyProfile />} />
          <Route path="/settings/workspace" element={<Settings />} />
          <Route path="/settings/team" element={<Settings />} />
          <Route path="/settings/communications/invitations" element={<Settings />} />
          <Route path="/settings/privacy" element={<Settings />} />
          <Route path="/ambassadors/manage" element={<AmbassadorAdmin />} />
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
          {mayManageCoaching ? <>
            <Route path="/social-automation" element={<SocialAutomation />} />
            <Route path="/automations" element={<Automations />} />
            <Route path="/coaching" element={<CoachingAdmin />} />
            <Route path="/coaching/students" element={<CoachingStudents />} />
            <Route path="/coaching/students/:contactId" element={<CoachingStudentDetail />} />
            <Route path="/coaching/coaches" element={<CoachingCoaches />} />
            <Route path="/coaching/programs" element={<CoachingPrograms />} />
            <Route path="/coaching/enrollments" element={<CoachingEnrollments />} />
            <Route path="/coaching/assignments" element={<CoachingAssignments />} />
            <Route path="/coaching/sessions" element={<CoachingSessions />} />
            <Route path="/coaching/communications" element={<CoachingCommunications />} />
            <Route path="/coaching/referrals" element={<CoachingReferrals />} />
            <Route path="/coaching/commissions" element={<CoachingCommissions />} />
          </> : null}
          {mayUseCoachPortal ? <>
            <Route path="/coach" element={<CoachDashboard />} />
            <Route path="/coach/students" element={<CoachStudents />} />
            <Route path="/coach/students/:contactId" element={<CoachStudentDetail />} />
            <Route path="/coach/upcoming" element={<CoachStudents upcoming />} />
            <Route path="/coach/schedule" element={<CoachSchedule />} />
            <Route path="/coach/referrals" element={<CoachReferrals />} />
            <Route path="/coach/commissions" element={<CoachCommissions />} />
            <Route path="/coach/profile" element={<CoachPublicProfile />} />
          </> : null}
          <Route path="*" element={<Navigate to="/command-center" replace />} />
        </Routes>
      </DashboardLayout>
    </InitiativeProvider>
  );
}

function App() {
  return (
    <BrowserRouter>
      <WorkspaceThemeProvider><AuthProvider>
        <Suspense fallback={<PageLoading />}>
          <Routes>
            <Route path="/" element={<PublicHome />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/coaching-programs" element={<ProgramsPage />} />
            <Route path="/coaching-programs/:slug" element={<ProgramDetail />} />
            <Route path="/testimonials" element={<TestimonialsPage />} />
            <Route path="/contact" element={<ContactPage />} />
            <Route path="/people/:slug" element={<PublicProfilePage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/data-deletion" element={<DataDeletionPage />} />
            <Route path="/apply" element={<PublicApplication />} />
            <Route path="/ref/:code" element={<PublicApplication />} />
            <Route path="/profile/edit/:token" element={<StudentProfileEditor />} />
            <Route path="/login" element={<Login />} />
            <Route path="/accept-invitation/:token" element={<AcceptInvitation />} />
            <Route path="/oauth/consent" element={<OAuthConsent />} />
            <Route path="*" element={<ProtectedApp />} />
          </Routes>
        </Suspense>
      </AuthProvider></WorkspaceThemeProvider>
    </BrowserRouter>
  );
}


export default App;
