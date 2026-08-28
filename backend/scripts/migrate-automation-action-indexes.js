/* Explicit, opt-in AutomationActionRun index rollout. No data repair, model sync, or provider calls. */
const mongoose = require("mongoose");
const { isDeepStrictEqual } = require("node:util");

const TARGET = Object.freeze({
  collection: "automation_action_runs",
  key: Object.freeze({ workspaceId: 1, idempotencyKey: 1 }),
  options: Object.freeze({ name: "workspace_automation_action_idempotency", unique: true }),
});

function malformedPipeline() {
  return [
    { $match: { $expr: { $not: [{ $and: [
      { $eq: [{ $type: "$workspaceId" }, "objectId"] },
      { $eq: [{ $type: "$idempotencyKey" }, "string"] },
      { $gt: [{ $strLenCP: { $ifNull: ["$idempotencyKey", ""] } }, 0] },
    ] }] } } },
    { $project: { _id: 1 } },
    { $facet: { total: [{ $count: "count" }], sample: [{ $limit: 20 }] } },
  ];
}

function duplicatesPipeline() {
  return [
    { $group: { _id: { workspaceId: "$workspaceId", idempotencyKey: "$idempotencyKey" }, count: { $sum: 1 }, firstRecordId: { $first: "$_id" }, lastRecordId: { $last: "$_id" } } },
    { $match: { count: { $gt: 1 } } },
    // Never print the idempotency value, proposed payload, target, or provider data.
    { $project: { _id: 0, workspaceId: "$_id.workspaceId", count: 1, firstRecordId: 1, lastRecordId: 1 } },
    { $facet: { total: [{ $count: "count" }], sample: [{ $limit: 20 }] } },
  ];
}

async function existingIndexes(collection) {
  try { return await collection.indexes(); }
  catch (error) { if (error.code === 26) return []; throw tagOperation(error, "list_indexes"); }
}

function indexState(indexes, target = TARGET) {
  const sameKey = index => isDeepStrictEqual(index.key, target.key);
  const exact = indexes.find(index => sameKey(index) && index.unique === true && !index.sparse && !index.hidden && !index.partialFilterExpression && (!index.collation || index.collation.locale === "simple"));
  if (exact) return { status: "exists", name: exact.name };
  if (indexes.some(index => index.name === target.options.name || sameKey(index))) return { status: "conflict", reason: "An index with this name or key has different options. Manual review required; nothing will be dropped." };
  return { status: "missing" };
}

function tagOperation(error, operation) {
  if (error && typeof error === "object" && !error.migrationOperation) Object.defineProperty(error, "migrationOperation", { value: operation, enumerable: false, configurable: true });
  return error;
}

function isMissingCollectionError(error, collectionName = TARGET.collection) {
  if (error?.code === 26 || error?.codeName === "NamespaceNotFound") return true;
  // MongoDB Node driver 7.x uses a code-less MongoAPIError for Collection.options()
  // when listCollections returns no matching namespace. Match only its exact template.
  return error?.name === "MongoAPIError" && new RegExp(`^collection [^.\\s]+\\.${collectionName.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")} not found$`).test(String(error.message || ""));
}

async function summary(collection, pipeline, operation) {
  try {
    const [result] = await collection.aggregate(pipeline, { allowDiskUse: false, maxTimeMS: 60000, collation: { locale: "simple" } }).toArray();
    return { count: result?.total?.[0]?.count || 0, sample: result?.sample || [] };
  } catch (error) { throw tagOperation(error, operation); }
}

async function migrate(db, { apply = false } = {}) {
  const collection = db.collection(TARGET.collection);
  let collectionOptions = {};
  try { collectionOptions = await collection.options(); } catch (error) { if (!isMissingCollectionError(error)) throw tagOperation(error, "collection_lookup"); }
  const malformed = await summary(collection, malformedPipeline(), "aggregate_malformed_preflight");
  const duplicates = malformed.count ? { count: 0, sample: [], skipped: true } : await summary(collection, duplicatesPipeline(), "aggregate_duplicate_preflight");
  const index = indexState(await existingIndexes(collection));
  const report = {
    mode: apply ? "apply" : "preflight",
    ready: false,
    collection: TARGET.collection,
    key: TARGET.key,
    options: TARGET.options,
    index,
    malformed,
    duplicates,
    ...(collectionOptions.collation && collectionOptions.collation.locale !== "simple" ? { blocker: "Non-simple collection collation requires manual review" } : {}),
  };
  report.ready = !report.blocker && !malformed.count && !duplicates.count && index.status !== "conflict";
  if (!report.ready || !apply) return report;
  if (index.status === "exists") { report.result = "unchanged"; return report; }
  try {
    await collection.createIndex(TARGET.key, TARGET.options);
    const verified = indexState(await existingIndexes(collection));
    if (verified.status !== "exists") throw new Error("INDEX_VERIFICATION_FAILED");
    report.result = "created_and_verified";
    report.index = verified;
  } catch (error) {
    report.ready = false;
    report.result = "failed";
    report.error = { code: typeof error.code === "number" ? error.code : "INDEX_CREATION_FAILED", message: "Index creation or verification failed. Data may have changed after preflight. Re-run preflight and inspect the collection; no records were repaired and no indexes were dropped." };
  }
  return report;
}

function safeDiagnostic(error = {}) {
  const chain = [], seen = new Set(), visit = value => { if (!value || typeof value !== "object" || seen.has(value) || chain.length >= 12) return; seen.add(value); chain.push(value); for (const key of ["cause", "reason", "errorResponse", "originalError"]) visit(value[key]); };
  visit(error);
  const codes = chain.map(item => item.code).filter(value => value !== undefined && value !== null);
  const codeNames = chain.map(item => item.codeName).filter(Boolean), names = chain.map(item => item.name).filter(Boolean);
  const labels = [...new Set(chain.flatMap(item => Array.isArray(item.errorLabels) ? item.errorLabels : item.errorLabelSet instanceof Set ? [...item.errorLabelSet] : []).filter(label => /^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(String(label))).map(String))];
  const operation = chain.map(item => item.migrationOperation).find(Boolean) || "unknown";
  const hasCode = (...values) => values.some(value => codes.includes(value));
  const hasText = pattern => chain.some(item => pattern.test(String(item.message || "")));
  const optionMatch = chain.map(item => String(item.message || "").match(/(?:option|parameter)\s+["']?([A-Za-z][A-Za-z0-9_-]{0,79})["']?\s+(?:is not supported|cannot be specified|must be)/i)).find(Boolean);
  let category = "migration_preflight_failed", explanation = "The read-only preflight failed before it could produce a report. Review the safe error code/name below and verify MongoDB connectivity, permissions, and server compatibility.";
  if (hasCode("ENOTFOUND") || hasText(/ENOTFOUND|querySrv/i)) { category = "dns_resolution_failed"; explanation = "MongoDB DNS/SRV resolution failed. Verify network access and the hostname in the securely stored MONGO_URI."; }
  else if (hasCode("EAI_AGAIN")) { category = "dns_temporarily_unavailable"; explanation = "MongoDB DNS resolution was temporarily unavailable. Retry after verifying network/DNS access."; }
  else if (hasCode("ECONNREFUSED")) { category = "connection_refused"; explanation = "The MongoDB endpoint refused the connection. Verify cluster availability, port/network access, and Atlas IP access rules."; }
  else if (hasCode("ETIMEDOUT", "ESOCKETTIMEDOUT") || names.includes("MongoServerSelectionError") || hasText(/server selection|timed?\s*out/i)) { category = "database_unreachable"; explanation = "MongoDB could not be reached within the configured timeout. Verify cluster availability, DNS, network access, and Atlas IP access rules."; }
  else if (hasCode(18) || codeNames.includes("AuthenticationFailed") || hasText(/authentication failed|bad auth/i)) { category = "database_authentication_failed"; explanation = "MongoDB rejected authentication. Verify the securely configured database username/password and authentication database."; }
  else if (hasCode(13) || codeNames.includes("Unauthorized") || hasText(/not authorized|unauthorized/i)) { category = "database_permission_denied"; explanation = "The MongoDB user lacks permission for the identified read-only migration operation."; }
  else if (hasCode(26) || codeNames.includes("NamespaceNotFound")) { category = "collection_not_found"; explanation = "The AutomationActionRun collection does not exist in the selected database yet. No index or collection was created by preflight."; }
  else if (hasCode(50) || codeNames.includes("MaxTimeMSExpired")) { category = "preflight_timed_out"; explanation = "A read-only duplicate or malformed-record check exceeded its 60-second limit. No index was created."; }
  else if (hasCode(292) || codeNames.includes("QueryExceededMemoryLimitNoDiskUseAllowed")) { category = "preflight_memory_limit"; explanation = "The read-only aggregation exceeded MongoDB's in-memory limit. Disk use remains intentionally disabled."; }
  else if (hasCode(11000, 11001) || codeNames.includes("DuplicateKey")) { category = "duplicate_key_conflict"; explanation = "MongoDB reported a duplicate-key conflict. No conflicting key value is included in this diagnostic and no record was repaired."; }
  else if (hasCode(40323, 40324, 15999) || hasText(/aggregation|pipeline|operator|\$strLenCP/i)) { category = "preflight_query_rejected"; explanation = "MongoDB rejected a read-only preflight aggregation expression. Verify the server version/compatibility; no index was created."; }
  else if (hasText(/certificate|tls|ssl/i)) { category = "tls_connection_failed"; explanation = "MongoDB TLS/certificate validation failed. Verify the cluster certificate and secure client environment."; }
  else if (names.includes("MongoCompatibilityError") || hasText(/wire version|not supported by this version/i)) { category = "server_version_incompatible"; explanation = "The MongoDB server and installed driver are not protocol-compatible."; }
  else if (names.includes("MongoParseError")) { category = "mongo_client_configuration_invalid"; explanation = "The MongoDB driver rejected the connection configuration before opening a connection."; }
  else if (names.includes("MongoAPIError") || names.includes("MongoInvalidArgumentError")) { category = "mongo_driver_api_error"; explanation = optionMatch ? `The MongoDB driver rejected the safe configuration option named ${optionMatch[1]}.` : "The MongoDB driver rejected an API option or operation before the preflight completed."; }
  else if (names.some(name => /Network|Socket/i.test(name))) { category = "mongo_network_error"; explanation = "The MongoDB driver reported a network/socket failure during the identified operation."; }
  return { category, operation, code: codes[0] ?? "UNAVAILABLE", codeName: codeNames[0] || "UNAVAILABLE", name: names[0] || "Error", errorLabels: labels, explanation };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => !["--apply", "--preflight"].includes(arg)) || (args.includes("--apply") && args.includes("--preflight"))) throw new Error("Use --preflight (default) OR --apply");
  require("dotenv").config({ quiet: true });
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI must be configured securely");
  const client = new mongoose.mongo.MongoClient(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  try {
    try { await client.connect(); } catch (error) { throw tagOperation(error, "connection_open"); }
    const report = await migrate(client.db(), { apply: args.includes("--apply") });
    console.log(JSON.stringify(report, null, 2));
    if (!report.ready) process.exitCode = 1;
  } finally { await client.close(); }
}

if (require.main === module) main().catch(error => {
  // Never print the original provider/driver message: it may contain a URI, credentials, or duplicate key values.
  console.error(JSON.stringify({ error: "AUTOMATION_ACTION_INDEX_MIGRATION_STOPPED", ...safeDiagnostic(error), dataChanged: false, indexesChanged: false }, null, 2));
  process.exitCode = 1;
});

module.exports = { TARGET, duplicatesPipeline, indexState, isMissingCollectionError, malformedPipeline, migrate, safeDiagnostic, tagOperation };
