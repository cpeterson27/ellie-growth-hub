# Coaching CRM Expansion Progress

Last updated: 2026-08-24  
Current phase: Phase 4 complete; waiting for explicit Phase 5 approval.

## Permanent safety rules

- No paid or credit-consuming provider tests without explicit approval.
- Default to unit tests, mocks, fixtures, local contract tests, lint, syntax and build checks.
- Never send real SMS, place real calls, send bulk/real test email, create live Zoom meetings, create paid Eventbrite operations, charge Stripe, or trigger unnecessary paid LLM requests.
- Before a live provider test: identify the exact test and provider, estimate the number of actions, and wait for explicit approval.
- One controlled live end-to-end test per provider is enough after mocked verification.

## Phase status

| Phase | Status | Notes |
|---|---|---|
| 0 — Repository architecture audit | COMPLETE | Audit at `docs/coaching-crm-spec.md`; no application/schema/provider changes. |
| 1 — Roles, authorization, coaching foundation and basic portal | COMPLETE | Spurts 1–4 complete. Owner/admin Coaching CRM and restricted Coach Portal are available. |
| 2 — Notes, activities, handoffs and student detail | COMPLETE | Internal notes, explicit handoffs, authorized history and recoverable assignment transitions. |
| 3 — Referrals and immutable commissions | COMPLETE | First-touch coach attribution, configurable rules and immutable commission ledger. |
| 4A — Per-coach Google Calendar + scheduling | COMPLETE | Coach-owned encrypted OAuth connections, calendar selection, free/busy and session lifecycle. |
| 4B — Per-coach Zoom | COMPLETE | Coach-owned encrypted OAuth, optional meeting lifecycle, Calendar coordination and secure webhook foundation. |
| 5 — Skool enrollment/course sync | NOT STARTED | Prefer official/narrow bridge; no student Growth Operator portal. |
| 6 — Coaching communications | NOT STARTED | Reuse Conversation, Gmail/Resend and Twilio. |
| 7 — Social automation | NOT STARTED | Extend native Meta first; ManyChat deferred. |
| 8 — Automation, analytics and operational hardening | NOT STARTED | Build only around proven workflows. |

## Phase 0 completed work

- [x] Inventoried backend models, route controllers, services, middleware, tenancy, worker and integration adapters.
- [x] Inventoried frontend routes, layout, navigation, shared components and API client.
- [x] Inventoried safe local tests and identified integration scripts that must not run by default.
- [x] Traced workspace authentication, role enforcement and record-access gaps.
- [x] Confirmed Contact as the canonical person record.
- [x] Defined the Sales CRM / Coaching CRM boundary.
- [x] Defined required Phase 1 models and rejected duplicate Student/Note/Message/Task models.
- [x] Defined Ellie/Admin, Coach and Closer record-level policies.
- [x] Assessed Skool, Google Calendar, Zoom, Twilio, Resend, Meta, ManyChat, Stripe and Eventbrite.
- [x] Assessed safe Eventbrite affiliate-pattern reuse and unsafe commission-ledger reuse.
- [x] Assessed Conversation/Message/Activity reuse.
- [x] Documented migrations, security risks, conflicts and Phase 1 file plan.
- [x] Issued recommendation: READY FOR PHASE 1 under authorization-first sequencing.

## Phase 1 planned spurts

1. Identity/RBAC/record-policy foundation and negative authorization tests. **COMPLETE**
2. CoachProfile, CoachingProgram, Enrollment and CoachAssignment models/services. **COMPLETE**
3. Coaching APIs plus tenancy/CRM authorization coverage. **COMPLETE**
4. Role-aware navigation, basic admin Coaching CRM and basic Coach Portal. **COMPLETE**

## Existing capability decisions

- Keep and extend: Contact, SalesOpportunity, CrmActivity, ConversationThread/Message, communication consent, Gmail/Resend, Twilio, Meta, Eventbrite, workspace tenancy, authentication, shared dashboard/UI, Jarvis for admins.
- Restore: Outreach sidebar link; its route/page still exist.
- Do not build: separate Student/person database, student Growth Operator portal, separate coaching messages/notes/tasks, duplicate email/SMS stack, coach clone of Jarvis, or ManyChat integration without a proven native-Meta gap.
- Defer: Google Calendar, Zoom, Skool, Stripe, commissions and provider webhooks to their scheduled phases.

## Phase 1 Spurt 1 completed work

- [x] Added canonical `createAuthContext` and `authenticatedUserId(req)` behavior.
- [x] Replaced every incorrect production `req.auth.userId` read after individually reviewing each use.
- [x] Added coach and closer membership roles while preserving legacy member/viewer roles.
- [x] Added reusable workspace, sales-owner, assigned-record and direct-record access policies.
- [x] Added fail-closed route exposure for coach/closer roles until a route has a record policy.
- [x] Allowed closers to reach Sales Opportunities only through a workspace + `ownerId` query filter.
- [x] Restricted integration-management and generic credential routes to owner/admin.
- [x] Changed generic integration credential writes from legacy plaintext to the existing encrypted envelope.
- [x] Restricted Gmail and Eventbrite credential-changing operations to owner/admin.
- [x] Added local RBAC/security regression tests and a package script.
- [x] Passed RBAC, workspace isolation, CRM core, communications core and social conversation suites.
- [x] Made no provider calls and consumed no provider credits.

## Phase 1 Spurt 2 completed work

- [x] Added workspace-scoped `CoachProfile` linked to existing User and active workspace membership.
- [x] Added flexible `CoachingProgram` with configurable stages, duration, operational price metadata and versioning.
- [x] Added `Enrollment` linked to canonical Contact, CoachingProgram and optional source SalesOpportunity.
- [x] Added immutable-history `CoachAssignment` records with denormalized Contact/User IDs for safe authorization queries.
- [x] Added program snapshots to protect active enrollment history when program definitions change.
- [x] Added service operations for coach lifecycle, program lifecycle, enrollment transitions and assignment transitions.
- [x] Connected active/upcoming CoachAssignments to the Spurt 1 assigned-record filter through `coachingAuthorizationService`.
- [x] Reused CrmActivity with typed `metadata.eventType` values; no coaching timeline model was created.
- [x] Added local domain/tenancy/integrity/history/resolver tests.
- [x] Passed coaching domain, RBAC, workspace isolation, CRM core, communications and social conversation suites.
- [x] Added no APIs, UI, notes, referrals, commissions or provider integrations.
- [x] Made no provider calls and consumed no provider credits.

## Phase 1 Spurt 3 completed work

- [x] Added one authenticated `/api/coaching` namespace; no production frontend was added.
- [x] Added owner/admin coach-management endpoints and coach self-profile reads.
- [x] Added owner/admin program administration and assignment-derived coach program reads with internal fields excluded.
- [x] Added owner/admin enrollment management and assignment-scoped coach enrollment reads.
- [x] Added owner/admin assignment lifecycle endpoints and current/upcoming assignment-scoped coach reads.
- [x] Added a composed coaching-student endpoint returning canonical Contact + authorized Enrollment + authorized CoachAssignment records.
- [x] Kept coaches blocked from the general `/api/contacts` and Sales CRM surfaces.
- [x] Kept closers blocked from the Coaching CRM namespace.
- [x] Routed every mutation through Spurt 2 domain services with server-derived workspace/user ownership.
- [x] Added practical program/status/coach/date/search and assignment view filters.
- [x] Added mocked in-process Express security/contract tests, including malicious ownership input tests.
- [x] Passed coaching API, coaching domain, RBAC, workspace isolation, Sales CRM, communications and social conversation suites.
- [x] Made no provider calls and consumed no provider credits.

## Phase 1 gates

- [x] Explicit owner approval to start Phase 1 Spurt 1.
- [x] Standardize authenticated user ID usage before ownership filters.
- [x] Add backend record-level authorization foundation before enabling coach/closer accounts.
- [x] Keep existing member/viewer roles during role expansion.
- [x] Require workspace ownership on every new model and validate cross-model workspace identity.
- [x] No live provider verification in Phase 1.

## Phase 1 Spurt 4 completed work

- [x] Added owner/admin Coaching dashboard, Students, Coaches, Programs, Enrollments and Coach Assignments screens.
- [x] Added role-aware route trees: coaches receive only Coach Portal routes; owner/admin retain Growth Operator plus Coaching; closer/member/viewer retain their existing non-coaching experience.
- [x] Restored the valid Outreach sidebar link.
- [x] Added coach dashboard, current students, upcoming assignments and assignment-backed student detail views.
- [x] Added honest Schedule, Referrals and Commissions placeholders without fabricated data.
- [x] Ensured coach student detail uses only `/api/coaching/students/:contactId`; coach UI never calls the general Contacts API.
- [x] Added program create/edit/version/archive UI driven by CoachingProgram records rather than hard-coded offers.
- [x] Added CoachProfile create/edit/activate/deactivate UI using existing workspace users.
- [x] Added enrollment create/status-transition and assignment create/complete/coach-transition UI through domain-backed APIs.
- [x] Exposed the existing workspace User ID in the owner/admin member-list response so CoachProfile creation can reference the canonical User.
- [x] Passed frontend role-policy tests, lint and production build plus coaching API security, RBAC, workspace isolation and Sales CRM core regressions.
- [x] Made no provider calls and consumed no provider credits.

## Deferred after Phase 1

- Phase 2: coaching notes, activity presentation and structured handoffs.
- Phase 3: referrals and immutable commissions.
- Phase 4: scheduling, Google Calendar and Zoom.
- Later phases: Skool synchronization, coaching communications, automation and analytics.
- Public-site migration remains separately approved as an architecture direction but is intentionally deferred until the Coaching CRM foundation is complete and a new implementation approval is given.

## Phase 2 completed work

- [x] Added workspace-scoped `CoachingNote` records linked to canonical Contact, Enrollment, optional CoachAssignment, author User and optional author CoachProfile.
- [x] Added a dedicated auditable `CoachingHandoff` lifecycle linking the preserved outgoing assignment/coach/stage to the incoming assignment/coach/stage.
- [x] Added internal note categories: general, progress, concern, action item and handoff.
- [x] Preserved server-derived authorship and allowed coaches to edit only their own notes; owner/admin may correct notes under explicit policy.
- [x] Defined historical visibility: owner/admin see all workspace coaching history; a current/upcoming coach sees notes and handoffs only for assignment-authorized enrollments.
- [x] Added secure notes and handoff endpoints inside `/api/coaching`; no public or student API exposes internal notes.
- [x] Added submitted-handoff enforcement before assignment transition.
- [x] Added transaction-first assignment transitions with an idempotent, recoverable create-next-first fallback for standalone Mongo deployments.
- [x] Added a unique workspace/previous-assignment index so transition retries cannot create duplicate successors.
- [x] Added `coaching.note.created`, `coaching.note.updated`, `coaching.handoff.created`, `coaching.handoff.completed` and `coach.assignment.transitioned` CrmActivity events.
- [x] Extended owner/admin student detail with internal notes, preserved handoffs and coaching activity history.
- [x] Extended Coach Portal student detail with authorized historical context, internal note creation and handoff submission.
- [x] Extended admin assignment transition UI to preserve a submitted handoff before creating the next assignment.
- [x] Added focused schema, authorship, authorization, history, handoff and recoverable-transition tests.
- [x] Made no provider calls and consumed no provider credits.

## Current blockers

There is no implementation blocker to the next approved phase. Production activation of Phase 4 requires Google and Zoom OAuth credentials, configured redirect/webhook URLs, and the explicit integration-connection index migration after a database backup. Phase 5 activation requires the separately documented Skool Pro/Zapier setup. No live OAuth, Calendar, Zoom, Skool, or Zapier call has been approved or performed.

## Phase 5 completed work

- [x] Added workspace-scoped Skool configuration to the encrypted `IntegrationConnection` vault; hook URL and adapter signing secret are never returned.
- [x] Extended each `CoachingProgram` with optional Skool group/course mapping and configurable retain-on-completion/cancellation policy.
- [x] Extended canonical `Enrollment.externalRefs` with bounded Skool membership/access status; no Student model was created.
- [x] Added idempotent access requests, adapter-event receipts and Skool purchase records.
- [x] Added a signed narrow Zapier adapter boundary for documented invite/custom-course/unlock/paid-member workflows.
- [x] Kept undocumented retain/revoke/reconciliation operations explicitly manual.
- [x] Connected add-on purchase events to the Phase 3 idempotent referral/commission ledger.
- [x] Added owner/admin integration setup, program mapping, student access status/provisioning and retry APIs; coaches receive only assignment-authorized status and group links.
- [x] Added mocked credential, signature, payload-minimization, dispatch, RBAC/API and UI contract tests.
- [x] Made no Skool, Zapier, email, payment or other live provider call and consumed no provider credits.

Production activation remains pending: a Skool Pro plan (for official Zapier integration), a Zapier workflow, an administrator-created random adapter secret, and one explicitly approved controlled end-to-end test. Phase 5 code does not claim a live connection before that activation.

## Phase 6 completed work

- [x] Extended existing `MarketingCampaign` for email/SMS/multi-channel communication purpose, preview text, dynamic segment definition and approval state rather than creating a newsletter database.
- [x] Added dynamic Sales, Eventbrite, Coaching, coach-assignment, alumni, add-on-purchaser and upcoming-session segment resolution from canonical records.
- [x] Preserved Eventbrite registration/check-in participation on canonical Contacts so registrant, checked-in attendee and completed-event no-show segments remain distinguishable without another attendee CRM.
- [x] Added idempotent `CommunicationJob` scheduling for campaigns, session reminders and onboarding actions with cancellation, retry-safe claiming and provider-message identity.
- [x] Reused Resend, Twilio, `CommunicationConsent`, `EmailSuppression`, quiet hours, A2P policy, STOP/START handling and existing provider delivery webhooks.
- [x] Reused canonical `ConversationThread` / `ConversationMessage` for every successfully dispatched email/SMS; no coaching inbox or timeline was created.
- [x] Extended existing Resend webhook handling to update canonical ConversationMessage delivery/read/failure state and provider-neutral MessageDeliveryEvent receipts alongside legacy Outreach metrics.
- [x] Added configurable session reminder offsets/channels; the UI offers 24-hour and 1-hour defaults while the API accepts bounded configuration.
- [x] Bound reminder validity to the exact session start snapshot. Reschedule/cancel immediately cancels pending reminders and processing revalidates state before provider dispatch.
- [x] Added reusable active-Enrollment onboarding actions containing safe Skool group/status context without creating a Phase 8 automation engine.
- [x] Added Owner/Admin communication drafts, audience preview, approval/scheduling, recipient-job status and session reminder controls.
- [x] Added assignment-authorized canonical email/SMS history and reminder state to Coach Portal without bulk/global messaging rights.
- [x] Added coaching communication scheduled/cancelled/reminder-sent CrmActivity events while preserving provider delivery events.
- [x] Added mocked/local segmentation, consent, suppression, reminder, stale-session, idempotency, RBAC and UI tests. No email, SMS or provider call was made.

Production activation requires existing Resend credentials/domain, active Twilio sender/A2P configuration, an external worker mode or the built-in singleton runner, verified workspace postal address, and an explicitly approved one-message live test per provider. Public newsletter consent collection remains deferred to the approved public-site migration.

## Phase 7 completed work

- [x] Added workspace-scoped `SocialIdentity` records linking Instagram, Facebook, TikTok, LinkedIn and X provider identities to one canonical Contact; no second lead/contact database was created.
- [x] Added safe social-only Contact creation so email/phone may be captured later through a known tracked-link handoff without fabricating identity data.
- [x] Added idempotent `SocialProviderEvent` receipts keyed by workspace + provider + provider event ID.
- [x] Extended the existing Meta webhook to normalize inbound Facebook/Instagram DMs, Instagram story replies and supported comment events into the social lead service.
- [x] Reused `ConversationThread` / `ConversationMessage` for inbound/outbound social messages and preserved provider thread continuity.
- [x] Added owner/admin-configurable Meta comment-any, comment-keyword, DM-keyword and Instagram story-reply automations. Normal posts have no automation unless a matching enabled rule exists.
- [x] Added allowed response templates, CTA metadata, CRM tags and bounded qualification metadata without adding AI classification or a Phase 8 workflow engine.
- [x] Added first/latest social attribution on canonical Contact while leaving Phase 3 `ReferralAttribution`, closer ownership and current coach relationships untouched.
- [x] Added allowlisted, random-token `TrackedLink` records for Ellie Coaching/Eventbrite HTTPS destinations with campaign/content/platform/referral/UTM context and known-versus-anonymous click handling.
- [x] Added `social.identity.linked`, `social.lead.created`, DM/comment/story/keyword, `social.link.generated` and `social.link.clicked` activity metadata through existing CrmActivity.
- [x] Added an Owner/Admin Social Leads UI for connected assets, honest provider capability warnings, automation configuration and recent attributed leads.
- [x] Kept Coach Portal and closer roles out of global social lead controls through both route authorization and navigation policy.
- [x] Determined ManyChat is not required for Phase 7: native Meta covers supported DM, story reply, comment webhook/keyword and private-comment-reply flows. Optional beta follow-to-DM remains deliberately unimplemented.
- [x] Kept TikTok to a documented lead-form capability boundary, LinkedIn human-assisted/approved-partner only, and X unconfigured. Likes/views/saves/shares/reactions/follows never trigger automation.
- [x] Passed focused social automation, conversation, OAuth, RBAC, UI, lint and production-build checks using local contracts/mocks only.
- [x] Made no live Meta, TikTok, LinkedIn, X, ManyChat or paid provider call and consumed no provider credits.

Production activation requires Meta App Review/approved permissions, current Graph API version, OAuth/callback variables, selected Page/Instagram professional assets, webhook subscriptions and one explicitly approved controlled test. TikTok lead-form ingestion is a capability boundary only; no TikTok connection or webhook was added. Public application consumption of `go_link`, UTM and referral parameters remains deferred to the approved public-site migration.

## Phase 8 completed work

- [x] Added workspace-scoped, Owner/Admin-only structured automations with allowlisted triggers, conditions and actions; clients cannot submit executable code.
- [x] Reused `CrmActivity.metadata.eventType` as the canonical event stream rather than creating a competing event system.
- [x] Added durable, idempotent automation executions with ordered step history, delayed continuation, bounded retry, stale-condition revalidation and disabled-workflow cancellation.
- [x] Delegated actions to existing Contact, CRM activity/task, closer assignment, communication job, coaching enrollment/assignment, onboarding, Skool, commission, tracked-link and Meta services.
- [x] Added starter workflows for application completed, call booked, closed won, coach assignment, coach handoff, social lead, Eventbrite lead and session reminders.
- [x] Added an Owner/Admin Automation Builder, enable/disable controls, execution history and safe failed-run retry.
- [x] Added canonical growth analytics for funnel conversion, attribution, revenue, coaching operations, referrals/commissions and communication delivery/replies/failures.
- [x] Extended Jarvis with read-only aggregate answers from the same canonical analytics service and restricted Jarvis to Owner/Admin.
- [x] Added actual CRM activity producers for opportunity outcomes, manual Contact creation, Eventbrite registration/attendance, Twilio inbound/delivery and Resend delivery/open/click/bounce events.
- [x] Added focused local/mocked automation, analytics, RBAC, integration-regression, UI, lint and production-build checks. No provider or paid API was called.

Production requires the automation runner (`start:worker` or the guarded in-process runner), MongoDB indexes, existing provider credentials, and one explicitly approved controlled test per provider after mock verification. `application.completed` remains a supported but dormant contract until the approved public application emits that activity. No public-site migration, deployment, DNS or provider configuration was performed.

## Ellie Production Launch — Work Unit 1 completed work

- [x] Added backward-compatible `WorkspaceMembership.roles[]`, permission allow/deny overrides and bounded program/application/pipeline responsibilities while retaining legacy `role`.
- [x] Added one canonical backend capability catalog, role defaults and server-computed effective permissions.
- [x] Protected owner team/workspace recovery capabilities, owner role and active membership from self-lockout.
- [x] Added capability middleware and migrated Team, Coaching, Sales Opportunities, integrations, social automation, automation administration, analytics and Jarvis boundaries.
- [x] Preserved workspace-first and assignment/ownership record authorization. Coach+closer receives only the union of assigned Coaching and Sales Opportunity namespaces, not general CRM/global access.
- [x] Added safe CoachProfile activation/creation when coach is added and historical-profile deactivation without deletion when coach is removed.
- [x] Added Settings → Team & Access for multiple roles, status, effective permissions, overrides, CoachProfile status and program/application responsibilities.
- [x] Replaced coach-only frontend branching with server-permission navigation; coach+closer can reach both authorized Coach Portal and Sales Opportunities.
- [x] Added an idempotent audit/apply membership migration script but did not run it against production.
- [x] Passed focused local/mocked migration, permissions, owner safety, RBAC, Coaching, Sales, Calendar, Zoom, referral/commission, UI, lint and build checks. No provider call was made.

Production migration remains deferred to Work Unit 5. Audit with `npm run memberships:roles:audit`; after backup/deployment approval, apply with `npm run memberships:roles:migrate` from the backend service environment.

## Ellie Production Launch — Work Unit 2 completed work

- [x] Extended the canonical workspace configuration with bounded public branding, color, logo, favicon, site-copy, CTA, contact, footer and social-link settings.
- [x] Added a responsive public Ellie Coaching route tree and a dedicated public layout without exposing authenticated application navigation.
- [x] Reused canonical CoachingProgram records for moderated public program presentations instead of creating a second catalog.
- [x] Added workspace-scoped testimonials with consent, pending/approved/rejected moderation and featured ordering. Public submission always enters pending state.
- [x] Added explicitly allowlisted coach and student public profiles with draft/published moderation; private CRM, coaching, payment and contact fields are never projected.
- [x] Added expiring, revocable, hashed student profile-edit tokens and a bounded token editor that cannot authenticate to private APIs.
- [x] Added coach self-service editing through authenticated CoachProfile identity and Owner/Admin management through `workspace.manage`.
- [x] Added Settings → Public Website administration and permission-aware Coach Portal public-profile navigation.
- [x] Applied workspace theme variables and favicon handling to the internal shell while retaining a restrained “Powered by Growth Operator” treatment.
- [x] Reserved `/apply` and `/ref/:code` without creating the application producer or referral capture flow assigned to Work Unit 3.
- [x] Passed focused public security/UI contracts, multi-role/RBAC regressions, lint and production build checks with no provider or paid call.

No local Ellie logo asset was present in the repository or supplied attachment. The implementation safely reuses an existing configured organization logo or accepts a workspace-managed HTTPS logo URL and retains an “EC” fallback until the approved asset is configured. No deployment, DNS, provider setting or production data was changed.

### Work Unit 2 logo correction

- [x] Copied the user-provided `elliescoachinglogo.png` into the active frontend public assets unchanged.
- [x] Set `/elliescoachinglogo.png` as the Ellie-workspace-only default for public and authenticated branding.
- [x] Preserved WorkspaceConfig logo overrides and neutral/default branding for every non-Ellie workspace.
- [x] Verified the source PNG, charcoal-theme presentation, mobile constraints, focused branding contracts, lint and production build.

## Ellie Production Launch — Work Unit 3 completed work

- [x] Replaced the reserved `/apply` screen with a responsive, validated coaching application using published canonical CoachingProgram choices.
- [x] Added workspace-scoped CoachingApplication records linked to canonical Contact, SalesOpportunity, selected CoachingProgram and assigned employee.
- [x] Upserts one canonical Contact by workspace/email, captures bounded answers and stores marketing/SMS/privacy consent through existing consent structures.
- [x] Resolves validated coach referral codes plus trusted tracked-link campaign/social/UTM attribution without trusting client workspace or CRM identifiers.
- [x] Creates a Sales Opportunity but deliberately does not create Enrollment, CoachAssignment or CoachingSession at application time.
- [x] Emits one canonical CrmActivity `application.completed` event containing Contact, Opportunity, Program and safe attribution context for the existing Phase 8 engine.
- [x] Added Owner/Admin application content and program/default employee routing settings; assignees must be active workspace Owner/Admin/Closer members.
- [x] Reused the existing editable Phase 8 application template for confirmation, staff notification, task and consent-aware email/SMS actions. Submission itself sends nothing.
- [x] Added focused local application/security/UI contracts, lint and a production build with no provider call or paid action.

No production automation was enabled, no email/SMS was sent, and no deployment/provider/domain configuration changed.

## Ellie Production Launch — Work Unit 4 completed work

- [x] Extended canonical ContentBrief social records with human/Jarvis/campaign source, destinations, HTTPS media/CTA, approval, scheduling, edit audit, provider receipts and attempt history.
- [x] Enforced draft → pending approval → approved → scheduled → publishing → published/failed, with rejection, cancellation and retry paths. Jarvis drafts enter pending approval and cannot approve or schedule themselves.
- [x] Added an Owner/Admin social content queue for edit, approve, reject, duplicate, schedule, cancel, retry and receipt review.
- [x] Added durable worker polling with atomic scheduled-content claims, receipt-based duplicate suppression, workspace-selected asset validation and bounded retry history.
- [x] Implemented official API adapter boundaries for Facebook Page feed posts, Instagram professional-account image publishing and LinkedIn organization text/link posts, gated by connected selected assets and required scopes.
- [x] Marked X and TikTok as human-assisted/unavailable because no supported customer publishing connection exists in this application.
- [x] Connected provider post IDs back to Phase 7 inbound social attribution through canonical ContentBrief/Campaign IDs; no second attribution system was created.
- [x] Kept Phase 8 reporting grounded in canonical campaign/content attribution and publish receipts without fabricating engagement metrics.
- [x] Added configurable application question labels, timeline options and next-step CTA to existing application settings.
- [x] Added Settings → Launch Readiness using canonical workspace records for team, programs, per-coach Calendar/Zoom, Skool, social, site, application, automation, Twilio and Resend setup state.
- [x] Passed focused mocked publishing/idempotency/failure/isolation/RBAC/inbound-attribution tests, Phase 7/application/multi-role regressions, UI contracts, lint and production build.

No provider connection, API publish, post, email, SMS, deployment or DNS operation occurred. Production publishing remains disabled until approved scopes, credentials, selected assets and worker deployment are verified in Work Unit 5.

## Phase 3 completed work

- [x] Added unique coach referral codes/slugs without creating public referral routes.
- [x] Added workspace-scoped first-valid-coach referral attribution linked to canonical Contact.
- [x] Preserved lead source, closer and current coach as separate relationships.
- [x] Added audited owner/admin attribution correction; later marketing touches do not overwrite first attribution.
- [x] Added default, coach, program and product/add-on commission rules using bounded basis points.
- [x] Added immutable commission ledger snapshots using integer minor currency units.
- [x] Added idempotent commission generation keyed by workspace + sale type + sale reference.
- [x] Connected closed-won SalesOpportunity as the current qualifying trigger boundary and prepared Stripe/Skool/manual trigger types for later adapters.
- [x] Added pending, approved, paid and reversed status workflow with required reversal reason.
- [x] Added owner/admin Referral, Commission Rule and Commission Ledger UI.
- [x] Replaced Coach Portal referral/commission placeholders with coach-scoped working views.
- [x] Reused CrmActivity for referral and commission audit events.
- [x] Passed focused referral/rule/ledger/idempotency tests, API authorization, lint/build and final Phase 1/2/Sales CRM regressions.
- [x] Made no provider calls, payouts or paid tests.

## Phase 4A completed work

- [x] Extended `IntegrationConnection` with explicit workspace/user account scope, owner User and CoachProfile while preserving existing Gmail as workspace-scoped by default.
- [x] Added `google_calendar` as a coach-owned provider and kept all access/refresh tokens inside the existing AES-256-GCM encrypted credential envelope.
- [x] Added signed, ten-minute OAuth state bound to authenticated workspace User + CoachProfile and revalidated active coach membership during callback.
- [x] Added coach-only connect, reconnect, disconnect, writable-calendar list and calendar selection APIs. Owner/admin receive connection status only; secrets are excluded.
- [x] Added workspace-scoped `CoachingSession` linked to canonical Contact, Enrollment, CoachProfile and CoachingProgram, with selected calendar/event identity and lifecycle state.
- [x] Added owner/admin scheduling, free/busy check, reschedule and cancellation operations that always use the session coach's connection and original external event.
- [x] Added participant-safe Google event payloads with Contact name and program/stage context; internal coaching notes are never copied.
- [x] Added Coaching CRM Sessions UI with coach connection readiness, session creation, availability, reschedule and cancel controls.
- [x] Replaced the Coach Schedule placeholder with upcoming sessions plus self-service Google Calendar integration and calendar/timezone selection.
- [x] Added `google.calendar.connected`, `google.calendar.disconnected`, `coaching.session.scheduled`, `coaching.session.rescheduled` and `coaching.session.cancelled` CrmActivity events without secrets.
- [x] Added an explicit, unrun integration-connection scope/index migration script. Existing records are backfilled to workspace scope before the legacy singleton index is replaced.
- [x] Passed mocked scheduling/provider tests, API security tests, Coaching RBAC/API regressions, Sales CRM core contracts, frontend UI contracts, lint and production build.
- [x] Made no Google, Zoom or other provider call and consumed no provider credits.

## Phase 4B completed work

- [x] Added `zoom` as a user-scoped `IntegrationConnection` provider tied to authenticated workspace User + CoachProfile.
- [x] Added signed, ten-minute Zoom OAuth state and active coach membership/profile callback revalidation.
- [x] Stored Zoom access/refresh credentials exclusively in the existing encrypted envelope; owner/admin status responses exclude secrets.
- [x] Extended `CoachingSession` with optional video mode and Zoom connection, meeting, join URL, host identity, status and bounded attendance metadata.
- [x] Kept Zoom optional. `none`, `zoom` and future `external` modes are supported; Zoom selection fails before Calendar creation if the assigned coach is not connected.
- [x] Added a scheduling orchestration layer that creates/updates/cancels the correct coach Zoom meeting and synchronizes its join URL into the existing Google Calendar event.
- [x] Added coach-only Zoom connect/reconnect/disconnect APIs and owner/admin readiness status.
- [x] Added Zoom readiness and optional video selection to owner/admin Sessions UI, plus safe meeting links.
- [x] Added coach Zoom integration controls and authorized join links to `/coach/schedule`.
- [x] Added HMAC timestamp/signature verification, Zoom endpoint validation, safe account/connection/session resolution and idempotent webhook receipts.
- [x] Added minimal non-host participant join/leave metadata and reliable meeting-ended attended/no-show classification; no engagement analytics were added.
- [x] Added `zoom.connected`, `zoom.disconnected`, `coaching.zoom.meeting.created`, `coaching.zoom.meeting.updated`, `coaching.zoom.meeting.cancelled`, `coaching.session.attended` and `coaching.session.no_show` activities.
- [x] Passed mocked per-coach Zoom, OAuth state, encrypted token, lifecycle, Calendar coordination, webhook/idempotency, attendance, API security and UI contract tests.
- [x] Made no live Zoom meeting, OAuth, webhook registration or provider call and consumed no provider credits.
