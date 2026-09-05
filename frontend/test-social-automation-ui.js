import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("./src/App.jsx", import.meta.url), "utf8");
const sidebar = fs.readFileSync(
  new URL("./src/components/Sidebar.jsx", import.meta.url),
  "utf8",
);
const page = fs.readFileSync(
  new URL("./src/pages/SocialAutomation.jsx", import.meta.url),
  "utf8",
);
const fields = fs.readFileSync(
  new URL("./src/components/SocialAutomationFields.jsx", import.meta.url),
  "utf8",
);
const api = fs.readFileSync(
  new URL("./src/services/api.js", import.meta.url),
  "utf8",
);

assert.ok(
  app.includes('path="/social-automation"') &&
    app.includes("mayManageCoaching"),
);
assert.ok(
  sidebar.includes('permissions: ["social.manage"]') &&
    sidebar.includes('label: "Social Leads"'),
);
const readablePage = page.replace(/\s+/g, " ");
for (const text of [
  "Replies require administrator approval",
  "no automation runs from likes, views, saves",
  "Normal social posts remain unaffected",
  "LinkedIn is human-assisted",
  "TikTok is lead-form-only",
])
  assert.ok(readablePage.includes(text), `UI missing ${text}`);
for (const endpoint of [
  "/social-automation/overview",
  "/social-automation/automations",
  "/social-automation/contact-labels",
  "/social-automation/posts",
  "/social-automation/content-briefs",
  "/social-automation/leads",
  "/social-automation/tracked-links",
])
  assert.ok(api.includes(endpoint), `API client missing ${endpoint}`);
assert.ok(
  api.includes('.post("/social-automation/contact-labels"'),
  "Contact label creation must persist through the workspace catalog API",
);
for (const text of [
  "Contact labels",
  "Select an existing label",
  "Create a new label",
  "Selected contact labels",
  "Remove ${label}",
])
  assert.ok(fields.includes(text), `Contact label UI missing ${text}`);
for (const text of [
  "Button text (optional)",
  "Button link (optional)",
  'placeholder="Learn more"',
])
  assert.ok(page.includes(text), `Automation wording missing ${text}`);
assert.ok(
  page.includes("CampaignSelect") && page.includes("ContactLabelsControl"),
  "Social Automations must use shared campaign and Contact Label controls",
);
for (const text of [
  "Apply this automation to",
  "All posts",
  "Loading posts",
  "post.id",
  "post.text",
  "post.publishedAt",
])
  assert.ok(page.includes(text), `Post selector UI missing ${text}`);
for (const text of [
  "Lead Porch posts",
  "Already published posts",
  "contentBriefId",
  "brief:",
])
  assert.ok(
    page.includes(text),
    `Growth Operator post selector missing ${text}`,
  );
assert.equal(
  page.includes("Content/post ID"),
  false,
  "Raw provider post IDs must not be requested from users",
);

console.log("Social Automation owner/admin UI contracts passed.");
for (const category of [
  "Comment keyword automations",
  "Inbound message automations",
  "Mention automations",
  "Referral / postback automations",
  "Story-related automations",
  "Recent interaction history",
])
  assert(page.includes(category));
assert(page.includes("contextOnly"));
assert(page.includes("Delivery needs review"));
