import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("./src/App.jsx", import.meta.url), "utf8");
const sidebar = fs.readFileSync(new URL("./src/components/Sidebar.jsx", import.meta.url), "utf8");
const page = fs.readFileSync(new URL("./src/pages/SocialAutomation.jsx", import.meta.url), "utf8");
const api = fs.readFileSync(new URL("./src/services/api.js", import.meta.url), "utf8");

assert.ok(app.includes('path="/social-automation"') && app.includes("mayManageCoaching"));
assert.ok(sidebar.includes('permissions: ["social.manage"]') && sidebar.includes('label: "Social Leads"'));
for (const text of ["Native Meta · ManyChat not required", "Likes/views/saves never trigger DMs", "Normal social posts remain unaffected", "LinkedIn is human-assisted", "TikTok is lead-form-only"]) assert.ok(page.includes(text), `UI missing ${text}`);
for (const endpoint of ["/social-automation/overview", "/social-automation/automations", "/social-automation/leads", "/social-automation/tracked-links"]) assert.ok(api.includes(endpoint), `API client missing ${endpoint}`);

console.log("Social Automation owner/admin UI contracts passed.");
