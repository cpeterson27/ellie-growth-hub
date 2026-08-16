require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { connectDatabase } = require("../config/database");
const Workspace = require("../models/Workspace");

const COLLECTIONS = [
  "affiliatesales", "audiences",
  "campaigns", "campaigntemplateversions", "contacts", "content_briefs",
  "contactfieldupdateaudits", "contactimportreceipts",
  "development_requests", "discoveryruns", "email_events", "emailsuppressions",
  "emailverificationbatches", "events", "eventbritesynchistories", "growth_operators",
  "growth_opportunities", "growthactionapprovals", "inappnotifications", "integration_connections",
  "intentemaildrafts", "intentsignals", "jarvis_memory_notes", "jarvis_profiles",
  "marketresearchjobs", "mcpaccesstokens", "mcpauditlogs", "monitoractivities",
  "mondaysynchistories", "organizationrelationships", "outreaches",
  "oauthcredentials", "organizations", "partners", "peopleresearchpreviews",
  "researchmonitors", "socialconnections", "workspaceconfigs",
];

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

async function resolveWorkspace() {
  const requestedId = option("--workspace-id");
  if (requestedId) {
    if (!mongoose.isValidObjectId(requestedId)) throw new Error("--workspace-id is not a valid MongoDB ID");
    const workspace = await Workspace.findById(requestedId).lean();
    if (!workspace) throw new Error("The requested workspace does not exist");
    return workspace;
  }

  const workspaces = await Workspace.find({}).select("_id name slug status").lean();
  if (workspaces.length !== 1) {
    throw new Error(`Found ${workspaces.length} workspaces. Re-run with an explicit --workspace-id only after records have been attributed; no data was changed.`);
  }
  return workspaces[0];
}

async function main() {
  const apply = process.argv.includes("--apply");
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is required");
  await connectDatabase(process.env.MONGO_URI);
  const workspace = await resolveWorkspace();
  const report = {
    mode: apply ? "apply" : "dry-run",
    generatedAt: new Date().toISOString(),
    workspace: { id: String(workspace._id), name: workspace.name, slug: workspace.slug },
    collections: [],
    totalUnassigned: 0,
    totalModified: 0,
  };

  const reportDir = path.resolve(__dirname, "../migration-reports");
  fs.mkdirSync(reportDir, { recursive: true });
  const stamp = Date.now();
  const reportPath = path.join(reportDir, `workspace-ownership-${stamp}.json`);
  const rollbackPath = path.join(reportDir, `workspace-ownership-${stamp}.rollback.json`);

  const rollback = { workspaceId: String(workspace._id), generatedAt: report.generatedAt, collections: [] };
  for (const collectionName of COLLECTIONS) {
    const collection = mongoose.connection.collection(collectionName);
    const missing = { $or: [{ workspaceId: { $exists: false } }, { workspaceId: null }] };
    const ids = await collection.find(missing, { projection: { _id: 1 } }).map((entry) => String(entry._id)).toArray();
    rollback.collections.push({ collection: collectionName, ids });
  }
  if (apply) fs.writeFileSync(rollbackPath, `${JSON.stringify(rollback, null, 2)}\n`, { flag: "wx", mode: 0o600 });

  for (const collectionName of COLLECTIONS) {
    const collection = mongoose.connection.collection(collectionName);
    const missing = { $or: [{ workspaceId: { $exists: false } }, { workspaceId: null }] };
    const unassigned = await collection.countDocuments(missing);
    let modified = 0;
    if (apply && unassigned) {
      const result = await collection.updateMany(missing, { $set: { workspaceId: workspace._id } });
      modified = result.modifiedCount;
    }
    const remaining = apply ? await collection.countDocuments(missing) : unassigned;
    report.collections.push({ collection: collectionName, unassigned, modified, remaining });
    report.totalUnassigned += unassigned;
    report.totalModified += modified;
  }

  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify({ ...report, reportPath, rollbackPath: apply ? rollbackPath : null }, null, 2));
  if (apply && report.collections.some((entry) => entry.remaining !== 0)) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
}).finally(() => mongoose.disconnect());
