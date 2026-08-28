# Controlled Social Automation Production Test

Do not run this checklist until the owner explicitly approves a live test and confirms OpenAI billing, Meta authorization, and the intended tester account.

1. Confirm `SOCIAL_PUBLISHING_ENABLED=false` and `META_AUTOMATIC_REPLIES_ENABLED=false` for the initial analysis-only pass.
2. Confirm the Ellie workspace automation policy is enabled in dry-run mode, background Social AI is explicitly enabled, and human approval remains required.
3. Confirm the selected Facebook Page or Instagram professional account is healthy and belongs to the Ellie workspace.
4. Use one known authorized tester to create one known comment or message.
5. Verify exactly one normalized provider event, canonical Contact/SocialIdentity, Social Inbox thread/message, and automation action record.
6. Verify bounded Social AI analysis and usage attribution (`agent=social`, `actorType=system`, `principal=social_automation`) if the event needs AI.
7. Verify the proposed action, policy checks, dry-run status, CRM activity, and human-review notification. Confirm no provider mutation occurred.
8. After a separate explicit approval, enable only the required environment switch and disable workspace dry-run. Keep human approval required.
9. Prepare the action-specific approval, enter its exact short-lived confirmation, and execute through the existing provider service.
10. Verify one provider receipt, one outbound ConversationMessage, one CRM activity, and one succeeded action record. If the outcome is uncertain, stop and reconcile manually—do not retry blindly.
11. Return both environment switches to `false` immediately after the controlled test unless the owner separately approves production activation.
