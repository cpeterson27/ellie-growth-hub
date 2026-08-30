import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.dirname(fileURLToPath(import.meta.url)),
  source = (file) => fs.readFileSync(path.join(root, "src", file), "utf8");
const app = source("App.jsx"),
  site = source("pages/PublicSite.jsx"),
  legal = source("pages/PublicLegal.jsx"),
  css = source("pages/PublicSite.css"),
  editors = source("pages/ProfileEditors.jsx"),
  admin = source("components/PublicSiteAdmin.jsx"),
  theme = source("context/WorkspaceThemeContext.jsx");
for (const route of [
  'path="/"',
  'path="/about"',
  'path="/coaching-programs"',
  'path="/coaching-programs/:slug"',
  'path="/testimonials"',
  'path="/contact"',
  'path="/people/:slug"',
  'path="/privacy"',
  'path="/privacy-policy"',
  'path="/terms"',
  'path="/data-deletion"',
  'path="/login"',
  'path="/apply"',
  'path="/ref/:code"',
  'path="/profile/edit/:token"',
])
  assert(app.includes(route), `missing ${route}`);
for (const value of [
  "Effective date:",
  "AI-assisted analysis",
  "does not sell personal information",
  'to="/data-deletion"',
])
  assert(legal.includes(value), `privacy policy missing ${value}`);
assert(
  app.indexOf('path="/privacy-policy"') <
    app.indexOf('path="*" element={<ProtectedApp'),
  "privacy policy must be declared before the authenticated catch-all",
);
assert(
  app.indexOf('path="/data-deletion"') <
    app.indexOf('path="*" element={<ProtectedApp'),
  "data deletion must be declared before the authenticated catch-all",
);
assert(app.includes("<WorkspaceThemeProvider><AuthProvider>"));
for (const value of [
  "featuredTestimonials",
  "upcomingEvent",
  "ProgramCards",
  "Staff login",
  "VideoFeature",
  "Student perspectives",
  "journeyTitle",
  "communityTitle",
  "team-section",
  "public-skip",
])
  assert(site.includes(value), `public site missing ${value}`);
for (const value of ["prefers-reduced-motion", "--workspace-accent"])
  assert(css.includes(value), `public CSS missing ${value}`);
for (const width of [1024, 850, 520])
  assert(new RegExp(`@media\\s*\\(max-width:\\s*${width}px\\)`).test(css), `public CSS missing ${width}px breakpoint`);
assert(/overflow-x:\s*hidden/.test(css));
for (const value of [
  "Only the fields on this page can become public",
  "updateStudentProfile",
  "updateMyPublicProfile",
  "Private draft",
  "Published",
])
  assert(editors.includes(value));
for (const value of [
  "introVideoUrl",
  "trustMetrics",
  "sectionVisibility",
  "publicTitle",
  "sortOrder",
  "Approve",
  "Reject",
  "Feature",
  "Create private edit link",
  "Public website settings saved",
])
  assert(admin.includes(value), `admin missing ${value}`);
assert(theme.includes('setProperty("--workspace-primary"'));
for (const size of [16, 32, 48, 180, 192, 512])
  assert(theme.includes(String(size)), `favicon handling missing ${size}px size`);
assert(theme.includes("apple-touch-icon") && theme.includes("app?.faviconUrl"));
assert(site.includes("ApplicationButton") && site.includes('embed:"1"'));
console.log(
  "Public routes, privacy-policy/data-deletion public routing, legal content, responsive breakpoints, accessibility motion controls, workspace tokens and moderation UI contracts passed.",
);
assert(fs.existsSync(path.join(root, "public", "elliescoachinglogo-dark.png")));
assert(
  fs.existsSync(path.join(root, "public", "elliescoachinglogo-white.png")),
);
assert(
  site
    .slice(site.indexOf("function Brand"), site.indexOf("function SmartLink"))
    .includes("publicSiteLogoUrl"),
);
