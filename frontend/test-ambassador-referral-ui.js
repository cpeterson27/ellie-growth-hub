import assert from "node:assert/strict";
import fs from "node:fs";
import { communityUrlError, copyReferralLink } from "./src/utils/ambassadorReferralFields.js";

assert.equal(communityUrlError(""), "", "community URL is optional");
assert.equal(communityUrlError("https://community.example/group"), "");
assert.match(communityUrlError("not-a-url"), /http/);
let copied = "";
await copyReferralLink("https://app.example/ref/ambassador", { writeText: async (value) => { copied = value; } });
assert.equal(copied, "https://app.example/ref/ambassador");

const admin = fs.readFileSync(new URL("./src/pages/AmbassadorAdmin.jsx", import.meta.url), "utf8");
const team = fs.readFileSync(new URL("./src/components/TeamAccess.jsx", import.meta.url), "utf8");
const styles = fs.readFileSync(new URL("./src/pages/AmbassadorPortal.css", import.meta.url), "utf8");
assert.match(admin, /Copy referral link/);
assert.match(admin, /Changing the referral code may invalidate previously shared\s+links/);
assert.match(admin, /Community or group URL \(optional\)/);
assert.match(admin, /codeChanged && !confirmedChange/);
assert.doesNotMatch(team, /name="referralCode"/);
assert.match(team, /generates a unique referral code from the ambassador.s name/i);
assert.match(team, /Community or group URL \(optional\)/);
assert.match(styles, /@media\(max-width:700px\)/);
assert.match(styles, /grid-template-columns:1fr/);
console.log("Ambassador referral link copy, optional community validation, warning, automatic-code onboarding, and responsive UI checks passed.");
