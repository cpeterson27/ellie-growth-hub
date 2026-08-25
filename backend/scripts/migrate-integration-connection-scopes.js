/*
 * One-time deployment migration for Phase 4A.
 * Run explicitly after a database backup; this script makes no provider calls.
 */
require("dotenv").config();
const mongoose = require("mongoose");
const IntegrationConnection = require("../models/IntegrationConnection");

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  await IntegrationConnection.collection.updateMany(
    { accountScope: { $exists: false } },
    { $set: { accountScope: "workspace", ownerUserId: null, coachProfileId: null } },
  );
  const indexes = await IntegrationConnection.collection.indexes();
  const legacy = indexes.find((index) => index.unique && JSON.stringify(index.key) === JSON.stringify({ workspaceId: 1, provider: 1 }));
  if (legacy) await IntegrationConnection.collection.dropIndex(legacy.name);
  await IntegrationConnection.syncIndexes();
  await mongoose.disconnect();
}

run().catch(async (error) => { console.error(error.message); await mongoose.disconnect(); process.exitCode = 1; });
