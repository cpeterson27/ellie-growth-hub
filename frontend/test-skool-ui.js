import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const integrations = fs.readFileSync(path.join(__dirname, "src/pages/Integrations.jsx"), "utf8");
const admin = fs.readFileSync(path.join(__dirname, "src/pages/CoachingAdmin.jsx"), "utf8");
const coach = fs.readFileSync(path.join(__dirname, "src/pages/CoachPortal.jsx"), "utf8");
assert.match(integrations, /Zapier adapter/);
assert.match(integrations, /type="password"/);
assert.match(admin, /Provision \/ retry access/);
assert.match(admin, /Map Skool/);
assert.match(coach, /Skool access:/);
assert.doesNotMatch(coach, /adapterSecret|zapierHookUrl|Map Skool|Provision \/ retry/);
console.log("Skool UI contract tests passed");
