# Social implementation — current audit and remaining work

Audit baseline: 2026-08-25. Original master specification and welcome addendum read in full. No production/provider execution is authorized. Existing welcome work is preserved, not the completion of this project.

| Specification section | Existing canonical architecture | Remaining work / acceptance |
|---|---|---|
| Primary goal / business model | ContentBrief separate from Campaign, CoachingProgram and Event | Optional explicit offering/event links; never infer enrollment |
| Provider architecture | SocialConnection, socialOAuthService, socialPublishingService, legacy stub adapters | Capability-aware single surface; remove false capability claims; direct Instagram login and X implementation |
| Meta configuration | Facebook Login with encrypted grants, selected assets and subscriptions | Separate Instagram Business Login without breaking Facebook |
| Social workspace / overview | Fragmented Content, SocialAutomation, Integrations | Top-level navigable workspace with real counts/action states |
| Connected accounts | OAuth status/start/select/disconnect endpoints | Social-specific UI, safe setup/permission/expiry health |
| Content Studio | Basic Content.jsx caption/image/destination editor | AI operations, uploads/media selection, variants, previews, optional relations |
| AI generation | llmService/Jarvis | Workspace-context generation actions, existing communication source, editable draft only |
| Media | imageAssetService/Cloudinary; ContentBrief media | Reuse uploader, canonical library references; no raw bytes in DB |
| Content library | ContentBrief list, edit, duplicate | Search/filter/detail/archive, relation and distribution filters |
| Calendar | Persisted requestedPublishAt + existing worker | Calendar/list, filter, reschedule/cancel/open |
| Publishing | Facebook text, Instagram image, LinkedIn organization text | Durable attempt safety, partial states, supported media variants, publish-now approval |
| Inbox | ConversationThread/Message; Meta message ingestion | Social-only conversation UI, comments, filters, sender labels |
| Canonical audit | CrmActivity, SocialProviderEvent, ConversationMessage | Exact incoming/outgoing body and actor, content linkage, safe errors |
| Social CRM / qualification | SocialIdentity unique keys, canonical Contact, attribution | Preserve identity scope; no display-name merging or auto course classification |
| Keyword automation | SocialAutomation matching/response, UI | Safe test, action/history presentation; existing engine integration |
| Comments | Meta webhook parser + SocialProviderEvent | Conversation integration and policy-safe responses |
| DMs | MetaMessagingAdapter and message windows | Bind recipient/asset to authenticated workspace thread; sender attribution |
| Likes/follows | Unsupported Meta trigger block | Official per-provider audit; never turn likes/follows into unsolicited DM permission |
| Automation builder | Automation/Execution, CrmActivity discovery | Social publication and ambassador lifecycle triggers/actions, reminder conditions |
| Ambassador distribution | Existing profile/referral/commission identity | Content tasks, admin assignment, self-only portal, status and audit |
| Invitations / communications | Shared invitation + communication services | Reuse lifecycle activity; reminders through approved existing engine |
| Profile / completeness | Canonical User avatar, self edit, completeness | Settings UI for required fields, completion transitions/history |
| Welcome generation/template | SocialGraphicTemplate + ContentBrief + Cloudinary | Integrate into library/calendar; safe regeneration and automation |
| Ambassador content generation | Existing llmService and content | Reviewed ambassador version with disclosure/instructions/referral link |
| Email → content | Canonical ConversationMessage | Workspace-scoped source selection, never copy unrelated/private records |
| Approval/safety | Pending approval, approve/reject/schedule | Fail closed on unsupported media/account; no default autonomous publishing |
| Analytics/attribution | SocialIdentity, TrackedLink, Application/Enrollment | Known content attribution only; unavailable metrics explicit |
| Notifications | InAppNotification + CrmActivity | Targeted account/publication/task/onboarding notifications |
| RBAC | social.manage, ambassadors.manage/view_own | Backend enforcement for every new route and self-only tasks |
| Webhook security | HMAC, unique event IDs | Retry failure recovery and durable outbound attempt handling |
| Setup center / diagnostics | OAuth status and subscription records | Human-readable setup vs app review vs unsupported vs unimplemented |
| Compatibility | Canonical users/CRM/communications/events/programs/automations | Preserve existing routes and invitation/referral/commission flows |
| Validation / final report | Existing focused regression scripts | Add tests, run relevant backend/frontend/RBAC/isolation/lint/build; honest row-by-row report |

## Official capability research

Implementation checkpoint and requirement-by-requirement acceptance status: see social-implementation-checkpoint.md. The overall task remains in progress; this audit is not a completion claim.

- Meta official Instagram collection: https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api
- LinkedIn Comments API: https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/comments-api
- X OAuth PKCE: https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code
- X DM integration: https://docs.x.com/x-api/direct-messages/manage/integrate
- X account activity: https://docs.x.com/x-api/account-activity/introduction

External setup must not be used to label an unimplemented adapter as complete. X can expose DMs/activity under access entitlements; LinkedIn community comments need approved Community Management access. Neither is equivalent to unrestricted messaging. Meta like/follow-to-unsolicited-DM remains disabled.
