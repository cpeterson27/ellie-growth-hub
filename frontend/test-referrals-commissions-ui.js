import assert from "node:assert/strict"; import fs from "node:fs";
const read=p=>fs.readFileSync(new URL(p,import.meta.url),"utf8"); const app=read("./src/App.jsx"),admin=read("./src/pages/CoachingAdmin.jsx"),coach=read("./src/pages/CoachPortal.jsx"),api=read("./src/services/api.js");
for(const route of ["/coaching/referrals","/coaching/commissions","/coach/referrals","/coach/commissions"])assert(app.includes(route));
for(const method of ["fetchCoachingReferrals","fetchCoachingCommissions","saveCommissionRule","updateCommissionStatus"])assert(api.includes(method));
assert(admin.includes("First valid coach referral wins")); assert(admin.includes("Existing ledger rows remain unchanged")); assert(coach.includes("export function CoachReferrals")); assert(coach.includes("export function CoachCommissions"));
console.log("Referral and commission UI contract checks passed");
