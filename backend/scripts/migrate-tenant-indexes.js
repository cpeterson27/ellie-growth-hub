require("dotenv").config();
const mongoose = require("mongoose");
const { connectDatabase } = require("../config/database");

const PLANS = [
  ["integration_connections", "provider_1", { workspaceId: 1, provider: 1 }, { unique: true }],
  ["email_events", "providerEventId_1", { workspaceId: 1, providerEventId: 1 }, { unique: true }],
  ["emailsuppressions", "email_1", { workspaceId: 1, email: 1 }, { unique: true }],
  ["emailverificationbatches", "providerBatchId_1", { workspaceId: 1, providerBatchId: 1 }, { unique: true }],
  ["jarvis_memory_notes", "source_1_path_1", { workspaceId: 1, source: 1, path: 1 }, { unique: true }],
  ["jarvis_profiles", "key_1", { workspaceId: 1, key: 1 }, { unique: true }],
  ["workspaceconfigs", "key_1", { workspaceId: 1, key: 1 }, { unique: true }],
  ["contacts", "email_1", { workspaceId: 1, email: 1 }, { unique: true, partialFilterExpression: { email: { $type: "string" } } }],
  ["contacts", "sourceProvider_1_providerContactId_1", { workspaceId: 1, sourceProvider: 1, providerContactId: 1 }, { unique: true, partialFilterExpression: { providerContactId: { $type: "string" } } }],
  ["outreaches", "campaignId_1_contactEmail_1", { workspaceId: 1, campaignId: 1, contactEmail: 1 }, { unique: true }],
  ["mondaysynchistories", "syncId_1", { workspaceId: 1, syncId: 1 }, { unique: true }],
  ["eventbritesynchistories", "syncId_1", { workspaceId: 1, syncId: 1 }, { unique: true }],
  ["organizationrelationships", "organizationId_1_audienceId_1", { workspaceId: 1, organizationId: 1, audienceId: 1 }, { unique: true }],
  ["campaigntemplateversions", "campaignId_1_version_1", { workspaceId: 1, campaignId: 1, version: 1 }, { unique: true }],
];

function sameKey(left, right) {
  const leftEntries = Object.entries(left || {});
  const rightEntries = Object.entries(right || {});
  return leftEntries.length === rightEntries.length && leftEntries.every(([key, value], index) => rightEntries[index]?.[0] === key && rightEntries[index]?.[1] === value);
}

function keyFromIndexName(name) {
  const parts = name.split("_");
  const key = {};
  for (let index = 0; index < parts.length; index += 2) key[parts[index]] = Number(parts[index + 1]);
  return key;
}

async function main() {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is required");
  const apply = process.argv.includes("--apply");
  await connectDatabase(process.env.MONGO_URI);
  const report = [];
  for (const [collectionName, legacyName, newKey, options] of PLANS) {
    const collection = mongoose.connection.collection(collectionName);
    const indexes = await collection.indexes();
    const legacy = indexes.find((index) => index.name === legacyName);
    if (legacy && !sameKey(legacy.key, keyFromIndexName(legacyName))) throw new Error(`${collectionName}.${legacyName} has an unexpected definition; no indexes were changed`);

    const duplicateGroups = await collection.aggregate([
      { $match: { workspaceId: { $ne: null }, ...(options.partialFilterExpression || {}) } },
      { $group: { _id: Object.fromEntries(Object.keys(newKey).map((key) => [key, `$${key}`])), count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $limit: 1 },
    ]).toArray();
    if (duplicateGroups.length) throw new Error(`${collectionName} contains duplicates for ${JSON.stringify(newKey)}; no indexes were changed`);
    const newName = Object.entries(newKey).map(([key, direction]) => `${key}_${direction}`).join("_");
    const existingWorkspaceIndex = indexes.find((index) => index.name === newName && sameKey(index.key, newKey));
    if (apply) {
      await collection.createIndex(newKey, { ...options, name: newName });
      if (legacy && legacy.name !== newName) await collection.dropIndex(legacy.name);
    }
    report.push({ collection: collectionName, legacyIndex: legacy?.name || null, workspaceIndex: newName, workspaceIndexPresent: Boolean(existingWorkspaceIndex || apply), action: apply ? "migrated" : existingWorkspaceIndex ? "verified" : "planned" });
  }
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", indexes: report }, null, 2));
}

main().catch((error) => { console.error(error.message || error); process.exitCode = 1; }).finally(() => mongoose.disconnect());
