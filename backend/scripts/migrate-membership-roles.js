require("dotenv").config();
const mongoose = require("mongoose");
const WorkspaceMembership = require("../models/WorkspaceMembership");
const { legacyRoleFor, normalizeRoles } = require("../authorization/capabilities");

async function migrate({ apply = process.argv.includes("--apply"), Model = WorkspaceMembership } = {}) {
  const rows = await Model.find({});
  const counts = { scanned: rows.length, changed: 0, unchanged: 0, applied: 0 };
  for (const row of rows) {
    const roles = normalizeRoles(row);
    const same = Array.isArray(row.roles) && row.roles.length === roles.length && roles.every((role) => row.roles.includes(role));
    if (same && row.role === legacyRoleFor(roles)) { counts.unchanged += 1; continue; }
    counts.changed += 1;
    if (apply) { row.roles = roles; row.role = legacyRoleFor(roles); await row.save(); counts.applied += 1; }
  }
  return counts;
}

if (require.main === module) {
  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI is required");
    process.exitCode = 1;
    return;
  }
  mongoose.connect(process.env.MONGO_URI).then(async () => {
    const result = await migrate();
    console.log(JSON.stringify({ mode: process.argv.includes("--apply") ? "apply" : "audit", ...result }, null, 2));
  }).catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => mongoose.disconnect());
}
module.exports = { migrate };
