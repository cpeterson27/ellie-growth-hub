import fs from "node:fs";
import assert from "node:assert";
const source = fs.readFileSync("src/components/SocialAutomationControls.jsx", "utf8");
for (const text of ["Automation safety", "Dry-run mode", "Allow background Social AI analysis", "Require human approval", "Recent automation decisions"]) assert(source.includes(text));
assert(source.includes('hasPermission(session, "workspace.manage")'));
console.log("Social automation Owner/Admin controls UI checks passed");
