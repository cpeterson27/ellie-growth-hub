# Coaching CRM Expansion — Phase 0 Architecture Audit

Audit date: 2026-08-23  
Audited commit: `7e7fe5b`  
Scope: inspection and planning only. No application code, schema, provider, or production changes were made.

## Phase 2 implementation architecture — notes and coach handoffs

Phase 2 adds two bounded coaching-history models while continuing to reuse canonical Contact, Enrollment, CoachAssignment and CrmActivity.

### CoachingNote

`CoachingNote` is an internal-only, workspace-scoped record linked to Contact and Enrollment, with optional CoachAssignment stage context. Authorship is server-derived from the authenticated User and, for coaches, the authorized CoachProfile/assignment. Categories remain deliberately small: general, progress, concern, action item and handoff. Records are not destructively deleted. Coaches may update only notes they authored; owner/admin may correct any workspace note under explicit administrative policy.

### CoachingHandoff

Handoffs use a dedicated model rather than mutable fields on CoachAssignment. This preserves the outgoing coach, assignment and stage; structured continuity context; submission/completion timestamps; and the eventual incoming coach, assignment and stage. There is one handoff per outgoing assignment. The prior CoachAssignment remains immutable history and the next assignment references it through `previousAssignmentId`.

### Historical visibility policy

- Owner/Admin: all notes, handoffs, assignments and coaching activities inside the authenticated workspace.
- Coach: only students with a current or near-term upcoming assignment. For those authorized Enrollment IDs, the coach may read historical notes and handoffs needed for continuity, including prior-coach context. This does not grant access to other enrollments for the Contact, unrelated students, Sales CRM opportunities, campaigns or owner data.
- Closer and all other roles: no Coaching CRM access.
- Cross-workspace and public/student access: always denied.

### Safe assignment transition

The service first attempts a MongoDB multi-document transaction when the connected deployment supports sessions/transactions. The transaction completes the outgoing assignment, creates the successor, completes the submitted handoff and records activities atomically.

For standalone MongoDB deployments that reject transactions, the fallback is recoverable and idempotent: create the successor as scheduled first, complete the outgoing assignment second, then activate the successor when appropriate. A unique `(workspaceId, previousAssignmentId)` index prevents duplicate successors. Retrying resumes the existing transition. A partial failure therefore leaves either the outgoing coach active or an incoming scheduled assignment, never a permanently unassigned student.

### Activity reuse

No duplicate timeline was created. Phase 2 writes typed metadata events into `CrmActivity`: `coaching.note.created`, `coaching.note.updated`, `coaching.handoff.created`, `coaching.handoff.completed`, and `coach.assignment.transitioned`. Coaching student detail composes the coaching records and these activity events; Sales CRM history remains separate while sharing the canonical Contact.

## Phase 3 implementation architecture — referrals and commissions

Coach referral identity lives on CoachProfile as workspace-unique normalized code and slug. The future public site may resolve either value server-side, but no public route exists yet. Partner/Eventbrite normalization and idempotency concepts were reused; Eventbrite AffiliateSale remains a separate event-specific domain.

ReferralAttribution is one workspace-scoped record per canonical Contact. The default policy is **first valid coach referral wins**. Lead source, closer, current coach, campaign and enrollment remain independent relationships. Owner/Admin may explicitly correct attribution with reason, prior coach, timestamp and actor preserved through the record and `coaching.referral.corrected` activity.

CommissionRule stores rates in basis points and resolves in this order: product/add-on override, program override, coach override, workspace default. Rates are bounded from 0–100%. CommissionLedger stores integer minor units, snapshots the resolved rule/rate and calculated amount, and never recalculates old rows after rule changes.

The qualifying trigger is a completed sale/payment—not a click, application or booking. Phase 3 calls the idempotent service from closed-won SalesOpportunity. Future Stripe payment-completed and Skool add-on adapters call the same service using their provider-stable sale reference. The unique workspace/sale-type/sale-reference index prevents duplicate ledger rows.

Owner/Admin manage identities, attribution corrections, rules and ledger statuses. Coaches receive read-only server-filtered access to their own referrals and commissions. Closer and cross-workspace access remain denied. No payouts or Stripe Connect were added.

## Executive recommendation

**READY FOR PHASE 1**, provided Phase 1 begins with the authorization foundation described below. No external provider account is required for Phase 1.

The existing Growth Operator is a substantial foundation and should be expanded, not rebuilt. It already has workspace tenancy, authentication, a canonical Contact, sales CRM records, activity history, provider-neutral conversations, email/SMS/social infrastructure, Eventbrite operations, integrations, and Jarvis. The Coaching CRM should be a separate bounded module centered on `Enrollment` and `CoachAssignment`, while referencing the same canonical `Contact`.

The principal risks are not missing screens. They are record-level authorization, the current role vocabulary, an authentication-ID inconsistency in several route handlers, provider credentials that are not uniformly encrypted, and the danger of treating Eventbrite affiliate records as a proper commission ledger.

## 1. Existing architecture map

### Runtime and tenancy

| Concern | Existing implementation | Finding |
|---|---|---|
| API composition | `backend/server.js` | Express API; mounts public callbacks/webhooks and then authenticated application routes. |
| Authentication/RBAC primitives | `backend/middleware/auth.js` | Cookie/Bearer sessions, CSRF checks, workspace membership lookup, `requireRole`. Roles are only owner/admin/member/viewer. |
| Tenant request context | `backend/tenancy/workspaceContext.js` | `AsyncLocalStorage` carries the active workspace. |
| Tenant query enforcement | `backend/tenancy/workspacePlugin.js` | Adds `workspaceId` and scopes common Mongoose queries/aggregations. Background work must explicitly establish a workspace context. |
| Workspace membership | `backend/models/Workspace.js`, `backend/models/WorkspaceMembership.js`, `backend/models/User.js` | One user can have memberships, but sign-in currently resolves the first active membership rather than offering a workspace switcher. |
| Workspace administration | `backend/routes/workspace.js` | Workspace config and member creation. Member listing/config mutation need stronger role restrictions. |
| Background work | `backend/worker.js` | Existing worker entry point; any new job must run in an explicit workspace context. |

### Data models

Existing models are in `backend/models/`:

- Identity/tenancy: `User.js`, `AuthSession.js`, `Workspace.js`, `WorkspaceMembership.js`, `WorkspaceConfig.js`.
- Canonical CRM: `Contact.js`, `Organization.js`, `OrganizationRelationship.js`, `SalesOpportunity.js`, `PipelineStage.js`, `CrmActivity.js`, `ContactFieldUpdateAudit.js`, `ContactImportReceipt.js`.
- Conversations/communications: `ConversationMailbox.js`, `ConversationThread.js`, `ConversationMessage.js`, `MessageDeliveryEvent.js`, `CommunicationConsent.js`, `MessagingSender.js`, `CallRecord.js`, `EmailEvent.js`, `EmailSuppression.js`.
- Campaigns/audiences/outreach: `Campaign.js`, `MarketingCampaign.js`, `CampaignTemplateVersion.js`, `Audience.js`, `Outreach.js`.
- Events/affiliates: `Event.js`, `Partner.js`, `AffiliateSale.js`, `EventbriteSyncHistory.js`.
- Integrations/OAuth: `IntegrationConnection.js`, `SocialConnection.js`, `OAuthCredential.js`.
- Growth/Jarvis/research: `GrowthOperator.js`, `GrowthOpportunity.js`, `GrowthActionApproval.js`, `JarvisProfile.js`, `JarvisMemoryNote.js`, `IntentSignal.js`, `IntentEmailDraft.js`, `ResearchMonitor.js`, `MonitorActivity.js`, `MarketResearchJob.js`, `BusinessIndexRecord.js`, `DiscoveryRun.js`, `PeopleResearchPreview.js`, `ContentBrief.js`, `DevelopmentRequest.js`, `InAppNotification.js`.
- MCP: `McpAccessToken.js`, `McpAuditLog.js`, `OAuthClient.js`.

There is no `Student`, `Coach`, `Enrollment`, `CoachingProgram`, `CoachAssignment`, `CoachingSession`, `Purchase`, immutable commission ledger, or generic provider-webhook receipt model.

### Routes and controller structure

The application uses route modules as thin-to-medium controllers rather than a separate `controllers/` directory. Existing route controllers are:

`backend/routes/activities.js`, `audience.js`, `auth.js`, `bootcampCampaigns.js`, `businessIndex.js`, `campaigns.js`, `chat.js`, `contacts.js`, `content.js`, `conversations.js`, `developmentRequests.js`, `emails.js`, `eventbrite.js`, `events.js`, `gmail.js`, `gptActions.js`, `growthOperators.js`, `integrationConnections.js`, `integrations.js`, `jarvis.js`, `marketingCampaigns.js`, `mcp.js`, `mcpAccess.js`, `monday.js`, `oauth.js`, `opportunities.js`, `organizationRelationships.js`, `outreach.js`, `partners.js`, `social.js`, `socialMessaging.js`, `telephony.js`, `unsubscribe.js`, `webhooks.js`, and `workspace.js`.

The absence of a controller layer is not a reason to introduce a new architectural style only for coaching. New coaching routes should delegate policy and business rules to services, consistent with the stronger existing modules.

### Services

- Contacts and organizations: `backend/services/contactService.js`, `contactIngestionService.js`, `contactFieldUpdateService.js`, `contactResearchService.js`, `companyCanonicalizationService.js`, `organizationImportService.js`, `organizationRelationship.js`, `organizationPriority.js`.
- Conversations: `backend/services/conversations/conversationIngestionService.js`, `channelAdapters.js`, `gmailConversationAdapter.js`, `metaMessagingAdapter.js`, `twilioConversationAdapter.js`, `websiteChatAdapter.js`.
- Communications: `backend/services/email.js`, `communicationPolicyService.js`, `emailRiskService.js`, `emailVerificationService.js`, `gmailOAuthService.js`, `replyIntelligence.js`.
- Eventbrite: `backend/services/eventbrite.js`, `eventbriteOAuthService.js`, `eventbriteListingService.js`, `eventbriteManagementService.js`, `eventbriteSyncService.js`, `eventbriteLogisticsService.js`, `eventAudienceRecommendationService.js`.
- Integrations/social: `backend/services/integrationHub.js`, `backend/services/integrations/providerCatalog.js`, `backend/services/integrations/providerAdapters.js`, `backend/services/socialOAuthService.js`, `social.js`, `monday.js`, `mondaySyncService.js`, `meetup.js`.
- Growth/AI/research: `backend/services/growthOperator.js`, `jarvisService.js`, `jarvisProfileService.js`, `jarvisMemoryService.js`, `llmService.js`, `marketResearchService.js`, `marketingAction.js`, `marketingCampaignExecution.js`, and the research/intent/business-data services in `backend/services/`.

### Frontend routes and navigation

`frontend/src/App.jsx` defines authenticated routes inside a shared `frontend/src/layouts/DashboardLayout.jsx`. Authentication state comes from `frontend/src/context/AuthContext.jsx`; there are no role-based route guards.

Current primary application routes include `/command-center`, `/dashboard`, `/events`, `/campaigns`, `/campaigns/new`, `/campaigns/:id`, `/marketing`, `/outreach`, `/crm/contacts`, `/crm/contacts/:id`, `/crm/companies`, `/crm/companies/:id`, `/opportunities`, `/tasks`, `/discovery`, `/partners`, `/content`, `/analytics`, `/settings`, `/integrations`, `/integrations/eventbrite`, `/settings/crm/fields`, `/integrations/gmail`, `/conversations`, `/inbox`, `/operators/jarvis`, and `/operators/development-requests`.

`frontend/src/components/Sidebar.jsx` groups navigation into Operate, Grow, Understand, and Configure. The `/outreach` route and `frontend/src/pages/Outreach.jsx` still exist, but the Outreach sidebar item is missing. Restore the menu item; do not rebuild Outreach.

`/conversations` and `/inbox` currently render `frontend/src/pages/GmailIntegration.jsx`, so the provider-neutral conversation backend does not yet have a true unified-inbox frontend.

### Relevant tests

Safe, local suites that directly support the expansion include:

- `backend/test-workspace-isolation.js`
- `backend/test-crm-core.js`
- `backend/test-communications-core.js`
- `backend/test-social-conversations.js`
- `backend/test-social-oauth-security.js`
- `backend/test-contact-ingestion.js`
- `backend/test-contact-field-update-service.js`
- `backend/test-relationships.js`
- `backend/test-eventbrite-filtering.js`
- `backend/test-integration-connections.js`
- `frontend` scripts `npm run lint` and `npm run build`

Tests that may use real credentials, local servers, or provider operations must not be run by default: `backend/test-resend-integration.js`, `test-eventbrite-events.js`, `test-eventbrite-statuses.js`, `test-eventbrite-sync.js`, `test-monday.js`, `test-monday-curl.js`, `test-monday-verbose.js`, `test-manual-monday-sync.js`, and similarly named integration scripts. Phase 1 requires new mocked authorization and contract tests, not live provider tests.

## 2. Requirement reuse matrix

Status meanings: **ALREADY EXISTS** means the required core capability exists; **PARTIALLY EXISTS** means an existing subsystem should be extended; **MISSING** means a new bounded capability is required; **CONFLICTS WITH EXISTING ARCHITECTURE** means the stated approach would duplicate or weaken an existing system.

| Coaching CRM requirement | Status | Evidence and decision |
|---|---|---|
| One canonical person/contact | **ALREADY EXISTS** | Reuse `backend/models/Contact.js`; do not create Student/Lead/Attendee person tables. |
| Keep Sales CRM separate from Coaching CRM | **PARTIALLY EXISTS** | `SalesOpportunity.js` and sales pipeline exist. Add coaching records keyed by Contact; do not add coaching stages to sales opportunities. |
| Ellie/Admin, Coach, Closer roles | **PARTIALLY EXISTS** | Memberships and `requireRole` exist; coach/closer roles and policies do not. |
| Record-level coach/closer authorization | **MISSING** | Current authenticated CRM and conversation routes generally expose the whole workspace. |
| Coach profile and coach management | **MISSING** | A user/membership is not a coach business profile. |
| Configurable coaching programs | **MISSING** | `Campaign` is marketing/event execution, not a coaching product or delivery plan. |
| Student enrollment | **MISSING** | Must reference canonical Contact and CoachingProgram. |
| Stage-specific coach assignments/handoffs | **MISSING** | No assignment history or stage-scoped access exists. |
| Coach portal | **MISSING** | Shared dashboard exists and should be reused with role-aware routes/navigation. |
| Separate student Growth Operator portal | **CONFLICTS WITH EXISTING ARCHITECTURE** | The specification says students use Skool. Do not create a duplicate student portal. |
| Student profile | **PARTIALLY EXISTS** | Contact detail and ActivityTimeline exist; compose enrollment/assignment/session data onto the Contact profile. |
| Coaching notes | **PARTIALLY EXISTS** | Reuse and extend `CrmActivity.js`; do not create a disconnected StudentNote model. |
| Coaching tasks | **PARTIALLY EXISTS** | Tasks already use `CrmActivity` type `task`; add coaching references and authorization. |
| Coaching session history | **PARTIALLY EXISTS** | Generic meeting activity exists, but a scheduled session needs lifecycle/provider IDs. Add `CoachingSession` in the scheduling phase. |
| Referral attribution | **PARTIALLY EXISTS** | Reuse Partner referral-code/URL/idempotency patterns, but create coaching attribution linked to Contact/Enrollment. |
| Coach commissions | **PARTIALLY EXISTS** | Existing Eventbrite UI calculates commissions from current rate; immutable snapshots, approval, reversals, and payment state are missing. |
| Google Calendar | **MISSING** | Gmail OAuth patterns are reusable, but current scopes and storage are Gmail-only. |
| Zoom | **MISSING** | No model, service, route, OAuth, or webhook exists. |
| Skool enrollment/course sync | **MISSING** | No supported Skool integration exists in this repository. |
| Email conversations | **ALREADY EXISTS** | Gmail + ConversationThread/Message are provider-neutral and should be reused. Record scoping is still required. |
| Newsletters/segmentation | **PARTIALLY EXISTS** | Campaign/Audience/Resend foundations exist; coaching audience predicates and templates do not. |
| SMS/MMS/voice/WhatsApp | **PARTIALLY EXISTS** | Twilio adapters, senders, consent, STOP/quiet-hours policy, calls, and webhooks exist. Coaching permissions/automations do not. |
| Meta/Facebook/Instagram messaging | **PARTIALLY EXISTS** | Meta OAuth/connections and inbound/outbound conversations exist; comment-keyword and story automation are not present. |
| ManyChat | **UNNECESSARY NOW** | Extend native Meta first. Add ManyChat only if a verified required trigger cannot be supported reliably through native Meta APIs. |
| Eventbrite operations | **ALREADY EXISTS** | Preserve existing OAuth, events, logistics, attendee/contact sync, and webhook flows. |
| Stripe payments | **MISSING** | Stripe appears only as a planned catalog entry; no payment record, SDK flow, or webhook handler exists. |
| Activity timeline | **ALREADY EXISTS** | `CrmActivity.js`, `/api/activities`, and `ActivityTimeline.jsx` are the canonical timeline. Extend them. |
| Conversations/messages | **ALREADY EXISTS** | Reuse thread/message/mailbox/delivery/ingestion architecture; add coaching access filters. |
| Automation/workflow engine | **PARTIALLY EXISTS** | Workers, monitors, provider webhooks, and action approvals exist, but there is no general durable workflow engine. Add only when Phase 8 use cases require it. |
| Webhook reliability/idempotency | **PARTIALLY EXISTS** | Provider-specific patterns exist; a generic receipt/deduplication record and job dispatch layer are missing. |
| Coaching analytics | **PARTIALLY EXISTS** | Analytics UI and sales/marketing data exist; coaching metrics require Enrollment/Assignment/Session/Commission records. |
| Jarvis for coaches | **UNNECESSARY / UNSAFE** | Jarvis exists and should remain owner/admin-only initially. Do not expose business-wide memory/actions to coaches. |
| Fixed six-week or $10K program logic | **CONFLICTS WITH REQUIRED FLEXIBILITY** | Use configurable program/stage definitions and price snapshots. Never hard-code a single offer. |
| One coach for all stages | **CONFLICTS WITH REQUIRED HANDOFFS** | CoachAssignment must be stage/time scoped and historical. |
| Separate coach/student conversation system | **CONFLICTS WITH EXISTING ARCHITECTURE** | Reuse ConversationThread/Message with policy filters. |
| Separate coaching email/SMS providers | **CONFLICTS WITH EXISTING ARCHITECTURE** | Reuse Resend/Gmail/Twilio/provider adapters and consent controls. |

## 3. Systems to reuse or extend

1. Treat `Contact` as the only person record. Enrollment, referral, purchase, conversation, activity, and session records reference it.
2. Preserve `SalesOpportunity` as the Sales CRM aggregate. Coaching is not a new pipeline stage or opportunity type.
3. Reuse `CrmActivity` as the audit/timeline/task/note system; add typed coaching references and visibility rather than inventing parallel notes/tasks.
4. Reuse `ConversationThread`, `ConversationMessage`, `ConversationMailbox`, `MessageDeliveryEvent`, and `conversationIngestionService`; enforce contact-based record access.
5. Reuse `CommunicationConsent`, `MessagingSender`, `CallRecord`, and `communicationPolicyService` for all coaching communications.
6. Reuse workspace tenancy, sessions, CSRF, `requireRole`, and the workspace plugin, adding central record policies rather than route-by-route role guesses.
7. Reuse `DashboardLayout`, Sidebar, shared UI components, `AuthContext`, `useApi`, CRM styles, and `ActivityTimeline` for the coach experience.
8. Reuse OAuth state/encryption patterns from Gmail/Eventbrite/Social. Do not create another plaintext credential store.
9. Reuse Eventbrite attribution/idempotency conventions, not its data model, for coaching referrals and commissions.
10. Reuse current campaign/audience/email delivery machinery for coaching broadcasts after adding coaching segments and authorization.

## 4. Necessary data additions

### Phase 1 models

All new models must require `workspaceId`, apply the workspace plugin, use compound workspace indexes, include timestamps, and use service-controlled writes.

**CoachProfile**

- `workspaceId`, `userId` (unique together)
- `displayName`, `status: active|inactive`
- optional operational fields such as `timezone`, `capacity`, `bio`
- No duplicated login credentials and no commission balance.

**CoachingProgram**

- `workspaceId`, `name`, `status`, `currency`, `defaultPrice`
- configurable stage definitions: stable `key`, label, order, optional default duration
- version or immutable program-plan snapshot so future edits do not rewrite active enrollment history

**Enrollment**

- `workspaceId`, `contactId`, `coachingProgramId`
- `status`, `startedAt`, `expectedEndAt`, `completedAt`, `currentStageKey`
- program/stage snapshot version
- provider metadata is added later; no duplicated student name/email

**CoachAssignment**

- `workspaceId`, `enrollmentId`, `contactId`, `coachProfileId`
- `stageKey`, `status`, `startsAt`, `endsAt`
- `handoffFromAssignmentId`, `handoffReason`
- service-level prevention of overlapping active assignments for the same enrollment/stage unless explicitly allowed

### Later-phase models that are genuinely necessary

- `CoachingSession`: scheduled time, enrollment/contact/coach, status, Calendar event ID, Zoom meeting UUID/ID, attendance, cancellation/reschedule metadata.
- `ReferralAttribution`: referrer CoachProfile, referred Contact, source, code/link, first/last-touch timestamps, attribution status, eventual enrollment/purchase links.
- `CommissionRule` and `CommissionLedgerEntry`: immutable rate/amount/currency snapshot, source event, pending/approved/paid/reversed state, approver and payment audit fields.
- `Purchase`: provider-neutral payment/order identity, Contact/Enrollment, amount/currency/status/refund state, Stripe IDs, optional Skool offer metadata.
- `ProviderWebhookEvent` (or equivalent): provider event ID, workspace, type, received/processed state, attempt/error metadata for durable idempotency.

Do not add Student, CoachingContact, StudentNote, CoachingMessage, CoachingTask, or CoachingEmail models.

## 5. RBAC and record-level authorization plan

### Role capability summary

| Capability | Ellie/Owner/Admin | Coach | Closer |
|---|---:|---:|---:|
| Manage workspace, integrations, programs, coaches | Yes | No | No |
| View all sales/coaching records | Yes | No | No |
| View assigned students/enrollments | Yes | Only active/allowed CoachAssignments | No, unless separately assigned as coach |
| Add coaching notes/tasks/session outcomes | Yes | Only assigned records | No |
| Change coach assignment/referral/commission | Yes | No | No |
| View sales opportunities | Yes | No by default | Only opportunities owned by that closer |
| View related contacts/conversations | Yes | Only assigned coaching contacts | Only contacts tied to owned opportunities |
| Use Jarvis/admin integrations | Yes | No initially | No initially |

### Enforcement design

- Extend `WorkspaceMembership.role` without removing legacy `member` and `viewer` values. Existing memberships remain valid; assignment to coach/closer is explicit.
- Add a centralized authorization module, not scattered UI checks. It returns Mongo filters and assertion helpers for enrollment, contact, activity, conversation, and sales opportunity access.
- Every list endpoint adds an authorized server-side filter. Every direct-ID endpoint queries with both `_id` and the authorized filter. Never fetch a record and trust a client-supplied coach ID.
- A coach's allowed contacts derive from active (and explicitly configured upcoming) `CoachAssignment` records through Enrollment. Ended-assignment access defaults to no access, except immutable audit records they authored if an administrator deliberately exposes them.
- A closer's allowed opportunities use `SalesOpportunity.ownerId === req.auth.user._id`; allowed contacts derive from those opportunities. Closer access does not grant coaching access.
- Conversation access is restricted by authorized `contactIds`; notes and messages cannot be used to traverse into another coach's records.
- `createdBy`, assignment ownership, commission ownership, and workspace IDs are always server-derived.
- Frontend route guards and hidden navigation are usability measures only; backend policy remains authoritative.
- Add negative IDOR tests: coach A cannot list/read/update coach B's student, note, session, task, or conversation; a closer cannot read unowned opportunities; suspended membership cannot authenticate.

### Required foundational correction

`backend/middleware/auth.js` exposes the authenticated user at `req.auth.user._id`. Several handlers use `req.auth.userId`, including CRM activity creator/owner paths in `backend/routes/activities.js`, `contacts.js`, `opportunities.js`, and `organizationRelationships.js`. Phase 1 must standardize this before relying on ownership filters or audit authorship.

## 6. Sales CRM and Coaching CRM boundary

```text
                         canonical Contact
                         /               \
             Sales CRM /                 \ Coaching CRM
 SalesOpportunity -> closer/             Enrollment -> CoachingProgram
 pipeline/stage/value                     |
                                          +-> CoachAssignment history
                                          +-> CoachingSession (later)
                                          +-> Referral/Purchase/Commission (later)

 Shared cross-cutting records: CrmActivity, ConversationThread/Message,
 CommunicationConsent, provider identities, audit fields.
```

Rules:

- Sales conversion creates or links an Enrollment; it does not turn the SalesOpportunity into a coaching record.
- `Contact` can simultaneously be a prospect, buyer, event attendee, and student without duplication.
- Sales stage definitions stay in `PipelineStage`; coaching stages stay in `CoachingProgram`/Enrollment snapshots.
- Closer ownership stays on SalesOpportunity. Coach responsibility stays in CoachAssignment. Referrer attribution stays in ReferralAttribution. These are distinct relationships.
- Shared activity/conversation queries use typed references and authorization policies so the Contact timeline can be comprehensive for admins but safely filtered for restricted users.

## 7. Integration assessment

| Provider | Current state | Reuse/extension plan | Account/cost needed for Phase 1? |
|---|---|---|---|
| Skool | Missing | Official Skool Zapier supports selected membership triggers/actions on Skool Pro. Use a narrow Zapier bridge only for invite/unlock/paid-member workflows if required; do not use third-party credential-scraping APIs. Keep Skool as the student community/course UI. | No |
| Google Calendar | Missing; Gmail OAuth exists | Extend encrypted OAuth patterns with least-privilege Calendar scopes. Later support per-coach connections and `events.insert`; store Calendar event IDs on CoachingSession. Current workspace-singleton connection design is insufficient for multiple coaches. | No |
| Zoom | Missing | Add per-coach OAuth, meeting creation, registrant/participant webhooks, signature validation, idempotent receipts, and attendance reconciliation. Participant email may be absent, so retain provider IDs and matching exceptions. | No |
| Twilio | Strong partial | Reuse existing adapters, sender config, consent, STOP/quiet-hours checks, SMS/MMS/WhatsApp/voice, delivery and call webhooks. Add coaching templates/triggers only after RBAC. | No |
| Resend | Strong partial | Reuse send service, provider adapter, delivery/bounce/suppression events, outreach approvals. Add coaching audience segments/templates and authorization. | No |
| Meta/Facebook/Instagram | Partial | Reuse `SocialConnection`, OAuth, Meta adapter, inbound webhooks, outbound approval. Add native comment/story triggers only when exact permissions and review requirements are defined. | No |
| ManyChat | Missing and not currently necessary | Defer. Introduce only if a required trigger cannot be delivered reliably via native Meta; then integrate by signed webhook/API, not as a second CRM. | No |
| Stripe | Catalog placeholder only | Add Purchase and signed, raw-body Stripe webhooks in a later phase. Use one business account initially. Stripe Connect is unnecessary unless the product later pays third-party coaches as a marketplace. | No |
| Eventbrite | Existing | Preserve current OAuth, listing, management, attendee/contact sync, logistics, webhook, and affiliate paths. Attach relevant purchases/enrollments through canonical Contact rather than changing the Eventbrite domain. | No |

Official implementation references: [Google Calendar authorization](https://developers.google.com/workspace/calendar/api/auth), [Google Calendar event creation](https://developers.google.com/workspace/calendar/api/guides/create-events), [Zoom Meetings API](https://developers.zoom.us/docs/api/meetings/), [Zoom webhooks](https://developers.zoom.us/docs/api/webhooks/), [Skool Zapier integration](https://help.skool.com/article/56-zapier-integration), [Stripe webhooks](https://docs.stripe.com/webhooks), and [Stripe signature verification](https://docs.stripe.com/webhooks/signature).

### Credential architecture conflict

`backend/models/IntegrationConnection.js` is unique on workspace + provider and includes both legacy plaintext `credentials` and encrypted `credentialsEncrypted`. `backend/routes/integrationConnections.js` can write plaintext credentials and is not consistently owner/admin restricted. Scheduling needs multiple coach-owned Google/Zoom accounts, which conflicts with the singleton index. Extend the existing connection abstraction with `accountScope`/`ownerUserId` and encrypted-only writes, then update existing provider lookups deliberately. Do not create a parallel credential vault.

## 8. Eventbrite affiliate/commission reuse

Safe to reuse:

- referral code normalization and unique-code behavior from `backend/models/Partner.js`
- tracked-link attribution concepts
- external provider IDs and event/order status mapping
- idempotent affiliate-sale upsert patterns in `backend/services/eventbriteLogisticsService.js`
- reversal/cancellation reconciliation concepts
- workspace-scoped summary UI patterns in `frontend/src/pages/Partners.jsx`

Not safe to reuse as the coaching commission ledger:

- `Partner` combines Eventbrite and general partner concerns and is not a CoachProfile
- `AffiliateSale` is attendee/event-specific
- commission is calculated from the partner's current mutable `commissionRate`, so changing a rate can change historical totals
- there is no immutable rate/amount snapshot, approval state, payment state, payout reference, or general source-event key

Therefore coaching referrals should reference CoachProfile and Contact/Enrollment, while commission entries snapshot money and rules at the time they are earned. Eventbrite-generated sales may later be one source into that ledger without replacing it.

## 9. Conversation, Message, and Activity reuse

`ConversationThread` already supports provider-neutral channels, participants, contact IDs, organization/opportunity links, assignments, status, SLA and metadata. `ConversationMessage` supports inbound/outbound/internal messages, drafts/notes, attachments, delivery status and authorship. `conversationIngestionService` supplies provider idempotency. Coaching should add Enrollment/CoachAssignment references only where needed and filter threads through authorized contacts.

`CrmActivity` already handles notes, calls, meetings, tasks, status changes, email, campaigns, research, and system events. Extend it later with `eventKey` for idempotency, `enrollmentId`, `coachAssignmentId`, optional `coachingSessionId`, and a visibility classification. It should remain the Contact timeline and task/note audit source.

The current conversations, activities, telephony consents/calls, and some email routes are workspace-wide for ordinary authenticated users. Those routes must use the centralized access policy before coach/closer accounts are enabled.

## 10. Risks, conflicts, migrations, and security concerns

| Priority | Finding | Required treatment |
|---|---|---|
| Critical | Authenticated workspace members can generally access all CRM, activities, conversations, consents and calls. | Add record-level policies and negative authorization tests before restricted accounts are enabled. |
| Critical | `req.auth.userId` is used although auth exposes `req.auth.user._id`. | Standardize identity access and test ownership/audit fields. |
| High | IntegrationConnection permits legacy plaintext credentials and weak role restriction. | Owner/admin-only encrypted writes; migration planned separately, with no secrets logged. |
| High | Singleton workspace/provider integration index cannot represent per-coach Calendar/Zoom. | Safely migrate to workspace + provider + account scope/owner before Phase 4. |
| High | Background jobs can run without an active tenant context. | Require explicit workspace context/filter in every coaching job/webhook path. |
| High | Commission history is derived from a mutable partner rate. | Introduce immutable ledger snapshots; never reuse displayed Eventbrite math as accounting truth. |
| High | Provider webhooks are not uniformly captured/deduplicated before processing. | Add signature verification, unique provider event IDs, quick acknowledgement, retries and dead-letter visibility. |
| Medium | New models could allow cross-workspace references even when each query is scoped. | Service validation must verify every referenced document belongs to the same workspace. |
| Medium | Program edits could rewrite historical expectations. | Snapshot/version program stages and price terms at enrollment/purchase. |
| Medium | Sensitive coaching notes need bounded visibility and auditability. | Visibility classification, immutable authorship, least privilege, retention/export policy. |
| Medium | Current frontend has authentication but no role guards. | Add role-aware routes/navigation, while treating backend checks as authoritative. |
| Medium | User login selects the first active workspace membership. | Not a Phase 1 blocker for one workspace, but add a workspace selector before multi-workspace rollout. |
| Medium | Legacy Partner queries can include records without workspace ownership. | Do not base coach access on legacy partner records; audit legacy tenancy separately. |
| Medium | `Organization` domain uniqueness and some legacy indexes may not be workspace-qualified. | Audit indexes before any multi-tenant migration; do not mix this cleanup into Coaching Phase 1 without need. |
| Low | Unified conversation backend has no unified-inbox UI. | Useful later, not a blocker for the Phase 1 coach portal. |

Migration approach: additive models and role values first; backfill only when necessary; preserve legacy roles; deploy server authorization before exposing restricted navigation; create indexes with audit scripts and rollback notes; do not mutate Eventbrite or SalesOpportunity history.

## 11. Phase 1 file-by-file implementation plan

### First spurt — identity and authorization foundation

- Modify `backend/models/WorkspaceMembership.js`: add `coach` and `closer`; retain existing values.
- Modify `backend/middleware/auth.js`: expose one canonical authenticated user ID helper and keep existing session/CSRF semantics.
- Create `backend/authorization/accessPolicy.js`: common role assertions and safe identity helpers.
- Create `backend/authorization/coachingAccess.js`: authorized filters/assertions for coach enrollments/contacts/activities/conversations.
- Modify `backend/routes/workspace.js`: owner/admin-only member management and coach/closer role assignment; validate status changes.
- Correct authenticated-user references in `backend/routes/activities.js`, `contacts.js`, `opportunities.js`, and `organizationRelationships.js` without refactoring unrelated behavior.
- Create `backend/test-coaching-authorization.js`: role matrix, cross-coach/closer IDOR, suspended membership, and server-derived ownership tests using fixtures/mocks.

### Second spurt — coaching domain foundation

- Create `backend/models/CoachProfile.js`.
- Create `backend/models/CoachingProgram.js` with versioned/configurable stages.
- Create `backend/models/Enrollment.js`, referencing canonical Contact.
- Create `backend/models/CoachAssignment.js` with assignment/handoff history.
- Create `backend/services/coachingService.js`: cross-workspace reference validation, enrollment lifecycle and stage rules.
- Create `backend/services/coachAssignmentService.js`: assignment overlap checks and handoff operations.
- Create `backend/test-coaching-core.js`: program flexibility, enrollment uniqueness/lifecycle, assignment access windows and handoff history.

### Third spurt — Phase 1 API

- Create `backend/routes/coaching.js`: admin program/coach/enrollment/assignment endpoints and coach-scoped read/update endpoints.
- Modify `backend/server.js`: mount `/api/coaching` behind existing auth; apply policy per endpoint.
- Modify `backend/routes/conversations.js` and `backend/routes/activities.js` only as needed to prevent new coach/closer accounts from traversing workspace-wide records.
- Extend `backend/test-workspace-isolation.js` and `backend/test-crm-core.js` with coaching references and cross-workspace rejection cases.

### Fourth spurt — role-aware frontend shell and basic portal

- Create `frontend/src/components/RoleRoute.jsx`.
- Modify `frontend/src/App.jsx`: add admin coaching routes and coach portal routes with explicit allowed roles; keep Jarvis owner/admin-only.
- Modify `frontend/src/components/Sidebar.jsx`: role-filter navigation, add Coaching CRM/Coach Portal, and restore the existing `/outreach` menu item.
- Reuse `frontend/src/layouts/DashboardLayout.jsx`; do not add a separate design system.
- Modify `frontend/src/services/api.js`: add coaching API methods.
- Create `frontend/src/pages/CoachingAdmin.jsx` and `CoachingAdmin.css`: basic programs/coaches/enrollments/assignments management.
- Create `frontend/src/pages/CoachDashboard.jsx` and `CoachDashboard.css`: assigned-student queue and basic status overview.
- Create `frontend/src/pages/CoachingStudents.jsx` and `CoachingStudents.css`: authorized student list/detail composed from Contact + Enrollment + Assignment.
- Reuse `frontend/src/components/ActivityTimeline.jsx` on the student view; no new note timeline in Phase 1.

### Phase 1 verification, with no provider credits

- Run only dependency-free/unit/fixture authorization/domain tests.
- Run `frontend` lint and production build.
- Use mocked HTTP/provider boundaries; Phase 1 has no reason to call Skool, Google, Zoom, Twilio, Resend, Meta, Stripe, or Eventbrite.
- Do not run the live integration scripts identified in the test inventory.
- Manually verify local role navigation and forbidden-record responses with fixtures, not production data.

## 12. Phase 1 entry criteria

Phase 1 may begin when the owner explicitly approves it. Its non-negotiable order is:

1. identity-field correction and backend record policy,
2. role vocabulary and authorization tests,
3. coaching models/services,
4. APIs,
5. role-aware UI.

Choices such as the initial six-week program labels, coach capacity defaults, upcoming-assignment visibility window, and post-handoff read policy can remain configurable and do not block the foundation. Provider credentials, paid plans, live messages, calendar events, Zoom meetings, and payment tests are not needed.

## Phase 1 Spurt 1 implementation note

Implemented on 2026-08-23:

- `backend/authorization/accessPolicy.js` is now the central pure policy layer for canonical identity, valid roles, mandatory workspace filters, closer-owned Sales Opportunity filters, assigned-record filters, and record assertions.
- `backend/middleware/authorization.js` supplies valid-role and record middleware plus a fail-closed surface for newly restricted roles.
- Authentication now builds one normalized context containing both the canonical populated `user` and compatibility `userId`, derived from `user._id`. Application writers use `authenticatedUserId(req)`.
- Coach and closer roles exist. Coach access is intentionally closed until CoachAssignment exists. Closer access is limited to Sales Opportunities filtered by both workspace and `ownerId`.
- Generic integration credential writes now use the existing AES-256-GCM encrypted envelope, and integration administration plus Gmail/Eventbrite credential mutations require owner/admin.
- Legacy member/viewer roles remain to prevent an unplanned migration or regression. Their later capability mapping should be decided independently of coaching.

## Phase 1 Spurt 2 implementation note

Implemented on 2026-08-24 without APIs, UI, migrations, or provider operations.

### Implemented schemas

- `CoachProfile`: workspace/user identity link, optional display override, active/inactive status, timezone/capacity operations metadata, and deactivation timestamp. Unique on workspace + user. It contains no authentication or provider credentials.
- `CoachingProgram`: name/internal summary, draft/active/archived status, flexible duration, operational default price, ordered configurable stages, version and archive timestamp. Skool content remains outside Growth Operator.
- `Enrollment`: canonical Contact, CoachingProgram, optional source SalesOpportunity, lifecycle dates/status/current stage, immutable program version/snapshot, minimal future Skool identity placeholders and creator audit ID. Multiple historical enrollments per Contact are allowed.
- `CoachAssignment`: Enrollment, denormalized canonical Contact, CoachProfile, denormalized coach User, stage/sequence, time window, scheduled/active/completed/cancelled status, previous assignment and creator audit ID. Transitions complete the existing record and create a new record.

The denormalized `contactId` and `coachUserId` on CoachAssignment are deliberate authorization indexes; service validation derives them from workspace-validated Enrollment and CoachProfile records, so clients cannot choose them independently.

### Implemented services

- `backend/services/coachingDomainService.js`: coach create/update/deactivate, program create/update/archive with normalization/versioning, enrollment create/transition with Contact/Program/Opportunity validation and program snapshots.
- `backend/services/coachAssignmentService.js`: assignment validation/create/complete/transition, conflict protection and historical handoff chaining.
- `backend/services/coachingAuthorizationService.js`: resolves unique active/upcoming Contact, Enrollment and Assignment IDs for a workspace + coach User and feeds them to the Spurt 1 assigned-record filter. Missing/inactive profiles and non-coach roles return empty access.

### Activity reuse

No new activity model was created. Domain services write `CrmActivity` records with type `system` and stable `metadata.eventType` values including `student.enrolled`, `coaching.enrollment.transitioned`, `coaching.program.completed`, `coach.assigned`, and `coach.assignment.completed`.

### Integrity and migration notes

- All references are queried with both `_id` and `workspaceId`; ObjectId validity alone is never treated as authorization.
- Source Opportunity must belong to the same workspace and, when it has a primary Contact, match the Enrollment Contact.
- CoachProfile creation requires an active same-workspace owner/admin/coach membership.
- Assignment creation requires an active same-workspace CoachProfile and open same-workspace Enrollment, and derives Contact/User IDs from those records.
- No data backfill is required. Deployment must build the four new collections and indexes. Index creation should follow the existing tenant-index audit/deployment procedure.
- Multi-document domain operations currently use ordered validated writes but not a MongoDB transaction. A database failure between assignment completion and successor creation could require administrative retry/reconciliation. Add transaction or compensating-operation support before high-volume handoff automation.

## Phase 1 Spurt 3 implementation note

Implemented on 2026-08-24 under `backend/routes/coaching.js`, mounted at `/api/coaching` after existing authentication and restricted-role middleware.

### API surface

- Coaches: `GET /coaches`, `GET /coaches/me`, `GET /coaches/:id`, plus owner/admin-only create, update and status endpoints.
- Programs: list/get; owner/admin-only create, update/version and archive.
- Enrollments: list/get; owner/admin-only create and lifecycle transition.
- Assignments: list/get; owner/admin-only create, complete and transition.
- Coaching student composition: `GET /students/:contactId` returns canonical Contact plus authorized Enrollment and CoachAssignment records. It does not create or persist a Student record.

### Authorization behavior

- Owner/admin queries always include authenticated `workspaceId` and may administer all coaching records in that workspace.
- Coach profile reads are restricted to the authenticated User.
- Coach program reads are derived from authorized Enrollment IDs and omit internal summary/default-price administration fields.
- Coach enrollment, assignment and Contact reads use IDs resolved from active/upcoming CoachAssignments. Unauthorized IDs return not-found responses and do not disclose record existence.
- Coach responses use narrow Contact and Enrollment field projections; Sales Opportunity IDs and internal program snapshots are not exposed through coach reads.
- Coach entry through the global role boundary is allowed only for `/api/coaching`; general Contacts, Conversations, Sales CRM and other route surfaces remain denied.
- Closer is not an allowed role on the Coaching router and remains limited to owner-scoped Sales Opportunities.

### Mutation boundary

All mutations call Spurt 2 domain services. Routes derive `workspaceId` and `createdBy` from authentication. Assignment creation forwards only Enrollment, CoachProfile, stage, sequence and scheduling inputs; client `workspaceId`, `coachUserId`, and `contactId` are discarded. Cross-workspace validation remains inside domain services as a second enforcement layer.

### Filtering

Enrollment lists support program, status, coach, start-date window, Contact name/email search and bounded result limits. Assignment lists support coach, enrollment, program, status and current/upcoming/history views. This is operational filtering only, not a reporting engine.

### Testing and deployment

`backend/test-coaching-api-security.js` runs an in-process Express router with mocked persistence and services. It covers owner/admin management access, coach self/assigned/unassigned behavior, closer denial, cross-workspace denial and malicious ownership fields. Existing domain, RBAC, tenancy, Sales CRM, communications and social conversation suites remain green.

No additional schema migration was introduced by Spurt 3. Deployment requires the Spurt 2 collections/indexes and the new route mount. No provider configuration or credentials are required.

## Phase 1 Spurt 4 implementation note

Implemented on 2026-08-24 as the visible frontend over the Spurt 3 API. No provider, public-site, domain or schema work was included.

### Frontend route architecture

- Owner/admin retain the existing Growth Operator route tree and gain `/coaching`, `/coaching/students`, `/coaching/students/:contactId`, `/coaching/coaches`, `/coaching/programs`, `/coaching/enrollments` and `/coaching/assignments`.
- Coach receives a separate fail-closed frontend route tree under `/coach`; unmatched paths redirect to `/coach` and Sales CRM pages are never mounted for that role.
- Closer and legacy roles retain the prior Growth Operator UI but no Coaching route is registered for them.
- Coach layout disables campaign initialization and removes workspace search, create actions, approvals, campaign selection and Jarvis controls. This avoids incidental calls to unrelated Sales/Growth surfaces while preserving the shared layout.
- Frontend role gating is a usability layer only. Spurt 1–3 backend policies remain authoritative.

### Owner/admin behavior

- `frontend/src/pages/CoachingAdmin.jsx` provides dashboard, student composition/detail, CoachProfile lifecycle, CoachingProgram lifecycle/versioning, Enrollment lifecycle and CoachAssignment lifecycle screens.
- Program forms are data-driven and include configurable ordered stages, duration, default price and status. No coaching offer or price is hard-coded.
- Enrollment creation may use the general Contacts list only in the owner/admin screen. It passes selected Contact/Program IDs to the domain-backed Coaching API.
- Workspace member listing now includes the populated canonical `userId` for owner/admin callers. This is required to create CoachProfile from an existing User; no new identity or login system was added.

### Coach behavior

- `frontend/src/pages/CoachPortal.jsx` provides dashboard, current students, upcoming assignments and assignment-backed student detail.
- Coach student detail calls only `GET /api/coaching/students/:contactId`; the Coach Portal imports no general Contact API method.
- Schedule, referrals and commissions are explicit placeholders with no generated counts, balances, meetings or other fabricated data.
- Coaching notes, handoffs beyond assignment transition, activity editing, referrals, commissions, scheduling and providers remain deferred to their planned phases.

### Verification

- Added a dependency-free role UI policy test and passed frontend ESLint and production build.
- Passed Coaching API security, RBAC, workspace isolation and Sales CRM core suites.
- No live provider call or credit-consuming action was performed.

## Phase 4A implementation note

Implemented on 2026-08-24 without live Google calls, production configuration changes, Zoom, Skool or public-site work.

### Scoped integration architecture

`IntegrationConnection` now supports `accountScope: workspace | user`, optional `ownerUserId` and optional `coachProfileId`. Existing integrations, including Gmail, retain the default workspace scope. Google Calendar requires user scope plus both owner and CoachProfile identities. The unique key is workspace + provider + scope + owner, allowing multiple coaches to connect separate Google accounts in the same workspace without creating another credential vault.

The deployment migration `backend/scripts/migrate-integration-connection-scopes.js` backfills existing records to workspace scope, removes the legacy workspace/provider singleton index, and synchronizes the new indexes. It is intentionally not run automatically and must be executed once after a production database backup.

### OAuth and credential behavior

Calendar OAuth reuses the Gmail signed-state and AES-256-GCM patterns but uses separate Calendar client/secret/redirect environment variables and Calendar scopes. OAuth start derives User and CoachProfile from the authenticated request. The callback validates signed ten-minute state plus active same-workspace coach membership/profile before saving. Calendar tokens are encrypted in `credentialsEncrypted`, excluded from normal queries/responses, and refreshed only through the coach-owned connection.

Required environment names are `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`, `GOOGLE_CALENDAR_REDIRECT_URI`, and the existing `INTEGRATION_CREDENTIAL_ENCRYPTION_KEY`. Gmail's `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI` behavior is unchanged.

### Session and provider lifecycle

`CoachingSession` links canonical Contact, Enrollment, CoachProfile and CoachingProgram and stores start, duration, timezone, stage, status, connection/calendar/event IDs, cancellation metadata and actor IDs. Scheduling validates every domain reference inside the authenticated workspace, derives Contact/Program from Enrollment, resolves the selected coach-owned connection, and creates exactly one event on that coach calendar. Reschedule and cancellation use the stored original connection, calendar and event IDs and fail closed if the connection no longer matches.

Event content is intentionally narrow: `Coaching — <Contact name>` plus program and stage context. Notes, handoffs, private coaching history, OAuth tokens and secrets are never sent to Google. The free/busy foundation checks the selected calendar for a proposed interval; it is not a public booking page or Calendly replacement.

### Authorization and API surface

- Coach self-service: `GET /calendar/connection`, `GET /calendar/oauth/start`, `DELETE /calendar/connection`, `GET /calendar/calendars`, `PATCH /calendar/selection`.
- Public OAuth return with signed-state revalidation: `GET /calendar/oauth/callback`.
- Owner/admin status: `GET /calendar/connections`; status/profile/settings only, never credential fields.
- Sessions: `GET /sessions` is all-workspace for owner/admin and own-CoachProfile only for coach. `POST /sessions`, `POST /sessions/availability`, `PATCH /sessions/:id/reschedule`, and `POST /sessions/:id/cancel` are owner/admin-only.
- Closer is rejected by the Coaching router. Every query/mutation is workspace scoped.

The configured production redirect for the current Render backend is `https://ellie-ai-backend.onrender.com/api/coaching/calendar/oauth/callback`. If the approved future API custom domain is activated, register and configure `https://api.elliescoaching.com/api/coaching/calendar/oauth/callback` at that time; do not switch it before DNS/deployment migration.

### Verification boundary

Mock adapters cover two coaches with distinct calendars, encrypted credential storage, state tampering, cross-workspace denial, selected-calendar preservation, free/busy, event creation, reschedule and cancellation. API contracts verify coach self-only status, owner status without secrets, closer denial and session/UI routing. No live OAuth exchange or Calendar API request was performed.

## Phase 4B implementation note

Implemented on 2026-08-24 without live Zoom OAuth, meetings, webhook registration, provider calls, Skool or public-site work.

### Per-coach Zoom identity

Zoom reuses Phase 4A's user-scoped `IntegrationConnection`. Every record is `provider: zoom`, `accountScope: user`, and carries the authenticated owner User and CoachProfile inside the authenticated workspace. OAuth start never accepts a client-supplied coach identity. Its signed state contains workspace, User, CoachProfile, nonce and a ten-minute expiry; the callback revalidates active coach membership/profile before storing credentials.

Access/refresh tokens remain in the AES-256-GCM `credentialsEncrypted` envelope. Ordinary queries, connection-status APIs, UI and CrmActivity never expose tokens. The app deliberately does not store Zoom's host `start_url`; authorized coaches use the meeting join URL and their connected Zoom identity.

### Session lifecycle coordination

`CoachingSession` now has `videoMode: none | zoom | external` plus Zoom connection/meeting/join/host/status metadata and bounded attendance state. Zoom is optional. When selected, orchestration verifies the assigned coach's Zoom connection before creating any Calendar event, then creates the Phase 4A session/event, creates the meeting through the same coach's Zoom connection, saves stable IDs, and patches the existing Calendar description/location with the join URL.

Reschedule updates the existing Calendar event and existing Zoom meeting, retaining IDs. Cancellation deletes the correct coach-owned Zoom meeting, cancels the existing Calendar event, and preserves the CoachingSession audit record. Creation has a bounded compensation path: if Zoom creation fails after Calendar creation, the just-created session/event is cancelled rather than left as an apparently valid Zoom session.

### OAuth/API surface

- Coach self-service: `GET /zoom/connection`, `GET /zoom/oauth/start`, `DELETE /zoom/connection`.
- Public signed callback: `GET /zoom/oauth/callback`.
- Owner/admin status only: `GET /zoom/connections`.
- Secure webhook receiver: `POST /zoom/webhook`.
- Existing session create accepts optional `videoMode`; existing reschedule/cancel endpoints coordinate both providers.

Closer remains rejected by the Coaching router. Coaches see only their own CoachingSession records and Zoom links. Owner/admin can see connection readiness and manage scheduling but never credential fields.

### Webhook and attendance foundation

The Zoom receiver verifies `x-zm-request-timestamp` freshness and `x-zm-signature` HMAC using the raw request body and supports Zoom endpoint URL validation. It resolves globally unique meeting ID → CoachingSession → stored coach connection, then verifies the webhook account against that connection. This remains correct when multiple coaches belong to the same Zoom organization/account. It records a unique workspace/provider event receipt before mutation, making duplicate delivery idempotent.

The minimum supported events are meeting started/ended and participant joined/left. Host joins are excluded from student attendance. A non-host participant join marks attended and records bounded participant/join/leave metadata. Meeting-ended with no non-host joins marks no-show. Those conclusions create the corresponding CrmActivity events. Full engagement analytics and public exposure of participant details remain out of scope.

### Production configuration

Required environment variable names are `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`, `ZOOM_REDIRECT_URI`, `ZOOM_WEBHOOK_SECRET_TOKEN`, and the existing `INTEGRATION_CREDENTIAL_ENCRYPTION_KEY` and `PUBLIC_BACKEND_URL` conventions.

Current callback: `https://ellie-ai-backend.onrender.com/api/coaching/zoom/oauth/callback`.

Future callback after approved API-domain migration: `https://api.elliescoaching.com/api/coaching/zoom/oauth/callback`.

Current webhook endpoint: `https://ellie-ai-backend.onrender.com/api/coaching/zoom/webhook`. Future custom-domain endpoint: `https://api.elliescoaching.com/api/coaching/zoom/webhook`.

No production OAuth setting, webhook registration, DNS or environment configuration was changed.

## Phase 8 implementation note

Phase 8 uses existing `CrmActivity` records as the internal event ledger. An Automation selects one allowlisted `metadata.eventType`, structured field/operator/value conditions and ordered allowlisted actions. `AutomationExecution` supplies the unique workspace/automation/trigger-activity idempotency boundary, durable delay state, bounded attempts and auditable per-step outcomes. The worker polls unprocessed activity/execution work; it never holds an HTTP request open for a delay.

Automation actions call existing domain services instead of reproducing business rules. Communication actions create `CommunicationJob` records and therefore retain consent, suppression, quiet-hour, provider and stale-session protections. Enrollment, coach assignment, Skool, commission, tracked-link and Meta actions retain their existing workspace and idempotency validation. A delayed execution re-loads canonical context and re-evaluates both workflow and action conditions before continuing; disabling the workflow cancels pending continuation.

The analytics route and Jarvis aggregate handler query canonical Sales CRM, Coaching CRM, referrals/commissions, communications, social attribution and campaign records. Program revenue is limited to won opportunities linked from Enrollments; add-on/Skool revenue and commission expense remain separate. Jarvis is read-only and Owner/Admin-only. It does not execute automations or mutate records.

Supported producer-backed events include Contact creation, opportunity stage/outcome, coaching enrollment/assignment/handoff/session lifecycle, referral/commission lifecycle, Skool purchase/access, communication provider outcomes, Eventbrite registration/attendance and Phase 7 social events. `application.completed` is retained as the requested public-application contract but has no producer until the separately approved public-site migration. Unsupported engagement signals and an Eventbrite no-show event were deliberately excluded.

## Ellie Production Launch — Work Unit 1 authorization note

`WorkspaceMembership.role` remains temporarily as a legacy primary-role projection. `roles[]` is authoritative after migration and supports combinations such as coach+closer. Authentication normalizes both fields and returns `roles`, `effectivePermissions`, legacy `role` and active membership status. The client never calculates authoritative access.

Effective permissions are the union of canonical role defaults plus valid explicit allows minus valid explicit denies. Owner recovery capabilities (`team.view`, `team.manage`, `workspace.manage`) are restored even if submitted as denies. Owner membership cannot be suspended or stripped of owner. Capability permission is evaluated before existing workspace/record filters; it never converts assigned access into workspace-wide access.

Restricted coach/closer combinations remain fail-closed at the global API boundary. Coach grants the assignment-scoped Coaching namespace; closer grants owner-assigned Sales Opportunities; holding both grants those two namespaces only. Admin/owner retain workspace management. Google Calendar and Zoom OAuth identity checks now recognize coach within `roles[]`, and CoachProfile lifecycle follows role activation without deleting history.

## Ellie Production Launch — Work Unit 2 public experience note

The public site remains part of the Growth Operator frontend, with explicit unauthenticated routes separated from the authenticated application shell. Workspace branding is canonical in `WorkspaceConfig`; Ellie defaults apply only to the configured Ellie workspace, while other workspaces remain unpublished and use neutral Growth Operator defaults.

Public programs are projections of canonical `CoachingProgram.publicPresentation`. Testimonials and PublicProfiles are workspace-scoped moderation records because neither concept previously had a safe canonical aggregate. PublicProfile deliberately stores only publishable fields and never mirrors Contact email, phone, notes, coaching history, enrollment, payments or private User fields. Public reads require approved testimonials and published programs/profiles.

Student self-edit uses a random token shown once, stores only its SHA-256 digest, expires after 30 days and can be revoked. The token authorizes one bounded PublicProfile only; it is not an application session and cannot access `/api/public-management`, Coaching CRM or Sales CRM. Coaches edit only the profile resolved from their authenticated active CoachProfile. Owner/Admin moderation uses the existing `workspace.manage` capability.

The `/apply` and `/ref/:code` routes are honest reserved screens. They do not emit `application.completed`, bind attribution, assign closers or call providers; those behaviors remain explicitly deferred to Work Unit 3. No Supabase or duplicate public data store was introduced.

## Ellie Production Launch — Work Unit 3 application note

`/apply` and `/ref/:code` now use the Growth Operator public application service. The service resolves the trusted public workspace server-side, permits only published canonical CoachingPrograms, validates identity/acknowledgement fields, and upserts the canonical Contact by workspace/email. A CoachingApplication preserves bounded application answers and consent evidence while a linked SalesOpportunity represents the sales workflow. Enrollment remains exclusively a later accepted/closed-won/payment transition.

Attribution accepts public UTM text, but campaign/social identity is trusted only when resolved from an existing unexpired TrackedLink token. Referral codes are validated against the existing active CoachProfile referral service and preserve its first-valid-coach rule. Client-supplied workspace, Contact, Opportunity, Campaign, owner or assignee IDs are not used.

Owner/Admin application settings provide open/closed state, bounded heading/intro/confirmation copy, a default assignee and per-program assignments. Each assignee is revalidated as an active Owner/Admin/Closer member in the authenticated workspace. Round-robin remains a future configurable routing mode; current behavior is deterministic program-specific → default → unassigned.

After Contact, CoachingApplication and SalesOpportunity persistence, the service creates the canonical `application.completed` CrmActivity with the Opportunity and Program IDs required by Phase 8 context loading. The existing editable automation template may then tag, create tasks/notifications and schedule consent-aware communication. The submission request itself performs no provider action, which preserves idempotent automation execution and the explicit production-activation boundary.

## Ellie Production Launch — Work Unit 4 outbound social note

Outbound social extends canonical ContentBrief rather than introducing a competing content library. Social ContentBrief records have a mandatory human approval lifecycle and carry destinations, public HTTPS media, CTA, Campaign, requested time, editor/approver/rejector metadata and per-destination publication receipts. Jarvis-created social content is always `pending_approval`; no Jarvis route or action can change approval, scheduling or publication state.

The social publishing runner uses the existing durable worker process and atomically claims only scheduled, due records. A receipt is unique in practice by ContentBrief/provider/asset idempotency key; an already published provider post ID is skipped on later worker execution. Failures retain every attempt and remain manually retryable. Scheduled content is cancellable before claim. Credentials remain in encrypted SocialConnection envelopes and are decrypted only inside the provider adapter after workspace, connection, selected-asset and scope validation.

Current supported boundaries: Facebook Page text/link through the Page feed endpoint when `pages_manage_posts` is approved; Instagram professional image/caption through container creation and media publishing when `instagram_content_publish` is approved; LinkedIn organization text/link through the versioned Posts API when `w_organization_social` and an eligible organization asset are approved. X and TikTok have no customer publishing connection in this repository and remain honestly human-assisted/unavailable. No browser automation or scraping is permitted.

Inbound Phase 7 processing now looks up a published ContentBrief receipt using provider + workspace-selected asset + provider post ID. When found, canonical Contact social attribution and CrmActivity carry the ContentBrief and Campaign association. Phase 8 can therefore relate post → campaign → leads → applications → sales/revenue using existing canonical records; impressions, reach, likes and similar metrics remain absent unless later supplied by an official authorized provider API.

Settings → Launch Readiness is a configuration view, not another analytics datastore. It derives setup states from active memberships, programs, CoachProfiles, IntegrationConnections, SocialConnections, WorkspaceConfig, Automations and pending ContentBrief approvals. Environment-variable checks expose only configured/not-configured state and never secrets.

## Phase 5 implementation note

Implemented on 2026-08-24 without live Skool/Zapier calls or provider configuration. Skool's current official help documents a Pro-plan Zapier integration with a new-paid-member trigger and invite-member/unlock-course actions; it does not document a general REST API or general outbound webhook surface. Growth Operator therefore uses a narrow signed adapter rather than inventing endpoints.

`IntegrationConnection(provider: skool, accountScope: workspace)` holds encrypted Zapier hook/signing credentials and non-secret group settings. `CoachingProgram.skoolMapping` holds group/course mappings and lifecycle-retention policy. Canonical `Enrollment.externalRefs` holds membership state. `SkoolAccessRequest`, `SkoolAdapterEvent`, and `SkoolPurchase` provide idempotent workflow/audit records; they do not duplicate Contact, Enrollment, notes, or activities.

Owner/admin may configure Skool, map programs, provision/retry access and inspect requests/purchases. Coaches can only see safe Skool status and group links through their existing assignment-authorized Coaching student response. Closer has no Coaching access. Incoming adapter events require workspace identity plus an HMAC over the raw body. Client workspace IDs are never trusted.

Documented automation boundary: invite and course unlock may use Zapier; paid-member data may enter through Zapier. Retain/revoke and complete membership reconciliation remain manual until Skool publishes an official supported capability. Internal notes, handoffs and private coaching history never enter adapter payloads.

## Phase 6 implementation note

Phase 6 extends the provider-neutral communications domain. `MarketingCampaign` remains the draft/content/approval/metrics aggregate. Its communication metadata now identifies transactional versus marketing purpose, email/SMS channels and a dynamic segment definition. `CommunicationJob` is the minimum durable scheduling boundary: one workspace/contact/channel/action, one unique idempotency key, explicit pending/processing/sent/blocked/failed/cancelled lifecycle, scheduled time and optional exact CoachingSession start snapshot.

Segments resolve canonical Contact IDs from SalesOpportunity stage, Eventbrite-ingested Contact source, Enrollment status/program/stage, active CoachAssignment, SkoolPurchase and upcoming CoachingSession. No program price, coach identity or fixed six-week duration is hard-coded. Existing program records provide those distinctions dynamically.

Marketing email requires active Contact marketing consent and is excluded by unsubscribe, suppression, bounce, invalid or archived state. Transactional email may continue after marketing unsubscribe but is still blocked by invalid/archive/suppression/bounce. SMS always goes through the existing Twilio policy, including normalized E.164 destination, STOP/START consent ledger, marketing opt-in, A2P status and recipient-local quiet hours.

Every dispatched email/SMS is ingested into canonical ConversationThread/ConversationMessage with communication job, campaign/session and purpose metadata. Coaches see this history only after the existing assignment-backed student authorization succeeds. Bulk campaign, segment, scheduled-job and reminder mutation endpoints are Owner/Admin only; closer remains denied from Coaching.

The communication job runner uses atomic pending-to-processing claims, bounded batches and idempotency indexes. Session reminders contain only Contact first name, program/session name, coach display name, localized date/time/timezone and the participant Zoom join URL. They never contain Zoom host URLs, notes or handoffs. Reschedule/cancel marks old reminders cancelled; processing rechecks session status and exact startsAt before any provider action.

## Phase 7 implementation note

Phase 7 extends the existing native Meta and canonical conversation architecture; it does not add a social inbox or publishing suite. `SocialIdentity` is the provider-identity edge to canonical Contact. Its workspace/provider/asset/provider-user unique key permits the same person to retain separate Facebook and Instagram identities while Contact remains the CRM person. `SocialProviderEvent` supplies at-least-once webhook idempotency. A social-only Contact uses the provider handle/display name until an application or approved merge supplies verified email/phone.

`SocialAutomation` is deliberately narrower than the future Phase 8 workflow engine. Owner/Admin may attach one enabled Meta rule to a selected asset and optional content ID, choosing supported comment-any, comment-keyword, DM-keyword or Instagram story-reply input plus response template, CTA metadata, CRM tags and qualification labels. Exact-content rules outrank asset-wide rules and keyword rules outrank any-comment rules. Unsupported engagement events fail closed. Coaches and closers cannot access this namespace.

Meta webhook signatures and selected-asset resolution remain the trust boundary. DM/story messages flow through the existing `ingestProviderMessage` service and therefore reuse `ConversationThread` / `ConversationMessage`. Enabled response templates use the existing Meta adapter; free-form replies remain subject to the 24-hour customer-service window. Private comment replies are limited to one provider-permitted initial response within the supported comment window; continued messaging requires the recipient to respond and reopen the normal service window.

Contact `socialAttribution.first` is write-once for the first social touch and `socialAttribution.latest` advances on later identified social events. Each holds platform, Campaign, content, automation, time and UTM context. This is intentionally separate from Phase 3 `ReferralAttribution`, SalesOpportunity owner/closer and CoachAssignment. Social code does not mutate referral attribution.

`TrackedLink` uses a random non-PII token and allows only HTTPS Ellie Coaching or Eventbrite destinations. It preserves known Contact when available, Campaign, content, platform, automation, referral code and UTMs. Redirects add `go_link` so the future public application can resolve a known social Contact without exposing a Contact ID. Anonymous link clicks are counted and marked anonymous; the system does not claim an anonymous viewer's identity.

Current capability policy: Facebook/Instagram native Meta supports inbound DMs and replies, comment webhook/keyword capture, and permitted comment private replies; Instagram story replies arrive as messaging events. Generic follow-to-DM, likes, views, saves, shares and reactions are not automation triggers. TikTok is documented as lead-form-capable but remains unconnected. LinkedIn stays human-assisted unless restricted partner APIs are separately approved. X remains unconfigured. ManyChat is not a Phase 7 dependency; only an optional future beta follow-to-DM adapter could justify it, and that limitation is not important enough to introduce another live system now.

Production Meta setup requires `META_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI`, `META_GRAPH_API_VERSION`, `META_WEBHOOK_VERIFY_TOKEN`, `PUBLIC_BACKEND_URL`, `INTEGRATION_CREDENTIAL_ENCRYPTION_KEY`, and approved minimum scopes appropriate to the selected assets (`pages_show_list`, `pages_read_engagement`, `pages_manage_metadata`, `pages_messaging`, `instagram_basic`, `instagram_manage_messages`, `instagram_manage_comments`). Configure the existing `/api/webhooks/meta` callback for messaging and comment fields, reconnect Meta after scope approval, select assets in Growth Operator, and perform only one explicitly approved controlled end-to-end test. No provider setup or call occurred during implementation.
