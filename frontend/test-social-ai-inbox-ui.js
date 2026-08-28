import fs from "node:fs";
import assert from "node:assert";
const source = fs.readFileSync("src/components/SocialReplyComposer.jsx", "utf8");
for (const label of ["Summarize", "Identify intent", "Suggest reply", "Answer program question", "Handle objection", "Qualify lead", "Recommend next step"]) assert(source.includes(label));
assert(source.includes("Nothing is sent automatically"));
assert(source.includes("I approve sending this exact reply"));
assert(source.includes("initialAnalysis"));
console.log("Social AI Inbox UI checks passed");
