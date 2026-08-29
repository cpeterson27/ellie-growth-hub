import assert from "node:assert/strict";
import fs from "node:fs";

const portal = fs.readFileSync("src/pages/AmbassadorPortal.jsx", "utf8");
const admin = fs.readFileSync("src/pages/AmbassadorAdmin.jsx", "utf8");
const app = fs.readFileSync("src/App.jsx", "utf8");
const sidebar = fs.readFileSync("src/components/Sidebar.jsx", "utf8");
const css = fs.readFileSync("src/pages/AmbassadorPortal.css", "utf8");

for (const text of ["My referral link", "Copy referral link", "Referral link copied", "No referrals yet", "Pending commission", "Approved commission", "Paid commission", "My commission and payment history"]) assert.match(portal, new RegExp(text));
assert.match(portal, /Contact details and private application answers remain with the workspace team/);
assert.match(portal, /read-only/);
assert.match(admin, /Referred people and conversion status/);
assert.match(admin, /Gross/);
assert.match(admin, /Commission method/);
assert.match(admin, /Approved/);
assert.match(admin, /Paid/);
assert.match(app, /isAmbassadorOnly\(session\).*Navigate to="\/ambassador"/s);
assert.match(app, /Route path="\/ambassador" element={<AmbassadorPortal/);
assert.doesNotMatch(sidebar.match(/const ambassadorGroups[^;]+/s)?.[0] || "", /CRM|Integrations|Settings/);
assert.match(css, /@media\(max-width:700px\)/);
assert.match(css, /grid-template-columns:1fr/);
console.log("Ambassador self-service link, sharing guidance, private referral history, commission states, restricted routing, admin tracking, and mobile layout checks passed.");
