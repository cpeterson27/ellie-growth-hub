import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("./src/pages/CampaignWorkspace.jsx", import.meta.url), "utf8");
const styles = fs.readFileSync(new URL("./src/pages/CampaignWorkspace.css", import.meta.url), "utf8");

assert.match(source, /Email campaign studio/);
assert.match(source, /Live campaign email preview/);
assert.doesNotMatch(source, /Preview complete email/);
assert.match(source, /previewTemplate\(\{ silent: true \}\)[\s\S]*450/);
assert.match(source, /uploadBrandAsset\("flyerUrl"/);
assert.match(source, /uploadBrandAsset\("logoUrl"/);
assert.match(source, /Event date saved\. Every campaign template now uses the updated date\./);
assert.match(source, /brand saved\./);
assert.match(source, /Links shown as buttons/);
assert.match(source, /Personalize the message/);
assert.match(source, /Insert into message/);
assert.match(source, /Preview updated/);
assert.match(styles, /\.campaign-template-editor\{[^}]*grid-template-columns:/);
assert.match(styles, /\.campaign-live-preview\{[^}]*position:sticky/);
assert.match(styles, /@media\(max-width:900px\)/);
assert.match(styles, /@media\(max-width:560px\)/);

console.log("Campaign email studio UI tests passed.");
