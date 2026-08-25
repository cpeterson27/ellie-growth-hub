import assert from "node:assert/strict";
import { draftFromMonitorPreset, sourcesFromMonitorPreset } from "./src/utils/researchMonitorPreset.js";
import fs from "node:fs";

const preset = {
  monitorType: "community_partner",
  name: "Complete preset",
  query: "Complete description",
  sources: ["meetup_public", "community_directories"],
  negativeKeywords: ["Ignore one", "Ignore two"],
  intentCategories: [{ name: "Signal", phrases: ["phrase one", "phrase two"] }],
  feedUrls: ["https://example.com/feed"],
  intervalMinutes: 60,
};
const draft = draftFromMonitorPreset(preset);
assert.deepEqual(draft, {
  monitorType: "community_partner",
  name: "Complete preset",
  query: "Complete description",
  keywords: "phrase one, phrase two",
  negativeKeywords: "Ignore one, Ignore two",
  feedUrls: "https://example.com/feed",
  intervalMinutes: 60,
  intentCategories: [{ name: "Signal", phrases: ["phrase one", "phrase two"] }],
});
assert.deepEqual(sourcesFromMonitorPreset(preset, ["bing_web"]), ["meetup_public", "community_directories"]);

preset.intentCategories[0].phrases.push("later mutation");
preset.sources.push("bing_web");
assert.deepEqual(draft.intentCategories[0].phrases, ["phrase one", "phrase two"], "draft must not share editable phrase arrays with the preset response");
assert.deepEqual(sourcesFromMonitorPreset({ monitorType: "buyer_intent" }, ["bing_web", "reddit_rss"]), ["bing_web", "reddit_rss"]);
const discovery = fs.readFileSync(new URL("./src/pages/Discovery.jsx", import.meta.url), "utf8");
assert.ok(discovery.includes('<option value="buyer_intent">Individual student / buyer intent</option>'));
assert.ok(discovery.includes("setMonitorDraft(draftFromMonitorPreset(preset))"), "selection must replace the entire draft rather than merge stale fields");
assert.ok(discovery.includes("Advanced source options"), "advanced source controls must remain available");

console.log("New-monitor complete preset draft checks passed");
