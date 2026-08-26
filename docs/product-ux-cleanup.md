# Focused product UX cleanup

## 1. What was confusing
Existing capabilities were scattered: program website presentation looked like program administration, student enrollment was hard to discover, the welcome-post template looked like an independent product, and technical labels dominated invitations and automation configuration. Team status inherited arbitrary word wrapping.

## 2–3. Navigation and page changes
- Public website → Website & Brand, /settings/website.
- Application routing → Coaching Application, /settings/applications.
- Opportunities → Sales Pipeline; /opportunities remains compatible.
- Removed Ambassador Welcome Posts from the sidebar. /ambassadors/welcome-template redirects to /automations/content-template.
- Introduction content template is linked from Automations (ambassadors.manage) and the existing Social connections area.
- Team & Access retains its existing role controls; compact status badges no longer break into individual characters.

## 4. Infrastructure reused
No backend, schema, environment, OAuth or provider changes. Reused WorkspaceConfig/publicSite, public application settings, CoachingProgram, Enrollment, canonical Contact, CoachProfile/PublicProfile, existing memberships and invitation rendering/delivery, AmbassadorProfile/referrals/payout services, existing automation catalog/engine and ContentBrief/media welcome templates. No new authorization or automation engine.

## 5. Programs
/coaching/programs already supports new programs, editing/versioning, pricing and existing draft/active/archived states. Kept those operations, clarified labels and empty guidance, and linked website program presentation to this administration screen.

## 6. Enrollment
Students, student detail and the empty Coaching dashboard now offer Enroll in program. /coaching/enrollments?new=1 opens the existing form; student detail passes contactId to preselect the canonical Contact. Select the program, dates and existing enrollment status, then submit through the unchanged domain-backed API. Assign coaches through the existing Assignments screen. No Student model or duplicate Contact path added.

## 7. Ambassadors
+ Add ambassador opens /settings/team?role=ambassador#add-team-person with the shared Ambassador role selected. Existing profile fields, secure preview/send/activation flow and membership reuse remain. Referrals, commission entry, payout history and follow-up links are organized into sections. Empty commission entry explains that a referral is required. No money is transferred.

## 8. Welcome content
The existing introduction template editor is under Automations, not a top-level one-off feature. Brand/media rendering, AI instructions, canonical draft creation, revision history and review safeguards are unchanged. Old bookmarks redirect.

## 9. General workflows
The existing catalog is presented as WHEN / IF / THEN, with readable identifiers, disabled-draft messaging and existing starter workflows. Common tag/task/notification actions have a direct text field; complex/multi-action configuration remains in Advanced action settings.
Existing ambassador workflow: invitation accepted → delayed in-app incomplete-profile reminder; profile completed → team notification + welcome review draft, subject to existing workspace settings. This task does not create email requests, a new testimonial trigger, arbitrary media-receipt triggers, or a general visual multi-step canvas. Those require a separate extension of the same engine if desired. Publishing is not automatically enabled.

## 10. Social automation
Plain-language platform/account/interaction selection, keyword example DEAL, and THEN contact/tag/permitted reply guidance. Removed primary Native Meta/ManyChat implementation copy. Existing trigger values, provider messaging restrictions, disabled defaults, webhook processing and dispatch behavior are unchanged. Advanced post/campaign identifiers remain in disclosures.

## 11. Sales Pipeline
Represents qualified prospects progressing toward purchase. Existing publicApplicationService already creates a SalesOpportunity linked to the application and Contact; this remains unchanged. Added explanatory empty state, retained desktop board scrolling, and stacked stages on small screens with existing stage controls.

## 12–13. Website authorization and coach site boundary
Main business website operations still require backend workspace.manage. Existing Owner/Admin defaults retain access; Coach/Ambassador default roles do not. No permission expansion.
Coach /coach/profile already uses /profile/me with coaching.view_assigned and an active, workspace-scoped CoachProfile linked to the authenticated user. It edits their own PublicProfile (bio, headline, public photo URL, specialties, CTA, layout and visibility), rendered at /people/:slug. It does not edit the main business website.
Separate coach domains, a multipage site builder and expanded coach branding are not implemented; they need a separate task. No new builder was created.

## 14. Exact files changed
- frontend/src/App.jsx
- frontend/src/components/ApplicationRouting.jsx
- frontend/src/components/InvitationTemplates.jsx
- frontend/src/components/PublicSiteAdmin.css
- frontend/src/components/PublicSiteAdmin.jsx
- frontend/src/components/Sidebar.jsx
- frontend/src/components/SocialConnectedAccounts.jsx
- frontend/src/components/TeamAccess.css
- frontend/src/components/TeamAccess.jsx
- frontend/src/pages/AmbassadorAdmin.jsx
- frontend/src/pages/AmbassadorPortal.css
- frontend/src/pages/AmbassadorWelcomeSettings.jsx
- frontend/src/pages/Automations.css
- frontend/src/pages/Automations.jsx
- frontend/src/pages/CoachingAdmin.jsx
- frontend/src/pages/Opportunities.css
- frontend/src/pages/Opportunities.jsx
- frontend/src/pages/Settings.css
- frontend/src/pages/Settings.jsx
- frontend/src/pages/SocialAutomation.css
- frontend/src/pages/SocialAutomation.jsx
- frontend/test-ambassador-welcome-ui.js
- frontend/test-automation-analytics-ui.js
- frontend/test-social-automation-ui.js
- frontend/test-team-access-ui.js
- frontend/test-product-ux.js
- docs/product-ux-cleanup.md

## 15. Validation
Passed focused backend checks: security-rbac, workspace-isolation, coach-onboarding, invitation-templates, ambassador-onboarding, public-site-security, coaching-api-security, automation-analytics.
Passed frontend checks: product-ux (new), team-access (including actual SSR Owner/Admin component rendering), invitation-management, social-automation, automation-analytics, ambassador-welcome, public-site, public-application, coaching-role.
Frontend ESLint and production Vite build passed. git diff --check passed.
Responsive verification here is CSS/contract inspection, not an interactive desktop/tablet/mobile screenshot pass. No live provider or production verification was performed. A local loopback permission was required for the mocked coaching API test.

## 16. Inspect these routes
- /settings/team
- /settings/website
- /settings/applications
- /settings/communications/invitations
- /coaching/programs
- /coaching/students
- /coaching/enrollments?new=1
- /coaching/assignments
- /coach/profile (Coach)
- /ambassadors/manage
- /automations
- /automations/content-template
- /social-automation
- /opportunities

No commit, push, deployment, production writes, provider activation or live outbound messages.
