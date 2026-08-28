const assert = require("node:assert/strict");
const { TARGET, duplicatesPipeline, indexState, isMissingCollectionError, malformedPipeline, migrate, safeDiagnostic, tagOperation } = require("./scripts/migrate-automation-action-indexes");

function fixture({ rows = [], indexes = [{ name: "_id_", key: { _id: 1 } }, { name: "unrelated", key: { unrelated: 1 } }], malformedIds = [], failCreate = false, missingCollection = false } = {}) {
  const stored = [...indexes], creates = [], reads = [];
  return {
    creates, stored, reads,
    collection(name) {
      assert.equal(name, TARGET.collection);
      return {
        options: async () => { if (missingCollection) throw Object.assign(new Error("collection ellie-ai.automation_action_runs not found"), { name: "MongoAPIError" }); return {}; },
        indexes: async () => stored,
        aggregate(pipeline, options) {
          assert.equal(options.allowDiskUse, false); assert.equal(options.maxTimeMS, 60000); assert(!pipeline.some(stage => stage.$out || stage.$merge));
          const malformed = Boolean(pipeline[0].$match);
          assert.deepEqual(pipeline, malformed ? malformedPipeline() : duplicatesPipeline()); reads.push(malformed ? "malformed" : "duplicates");
          if (malformed) return { toArray: async () => [{ total: malformedIds.length ? [{ count: malformedIds.length }] : [], sample: malformedIds.slice(0, 20).map(_id => ({ _id })) }] };
          const groups = new Map();
          for (const row of rows) { const key = JSON.stringify([row.workspaceId, row.idempotencyKey]); groups.set(key, [...(groups.get(key) || []), row]); }
          const duplicates = [...groups.values()].filter(group => group.length > 1).map(group => ({ workspaceId: group[0].workspaceId, count: group.length, firstRecordId: group[0]._id, lastRecordId: group.at(-1)._id }));
          return { toArray: async () => [{ total: duplicates.length ? [{ count: duplicates.length }] : [], sample: duplicates.slice(0, 20) }] };
        },
        createIndex: async (key, options) => { assert.deepEqual(reads, ["malformed", "duplicates"]); creates.push({ key, options }); if (failCreate) throw Object.assign(new Error("Sensitive duplicate value"), { code: 11000 }); stored.push({ key, ...options }); return options.name; },
      };
    },
  };
}

async function run() {
  assert.deepEqual(TARGET.key, { workspaceId: 1, idempotencyKey: 1 }); assert.equal(TARGET.options.unique, true);
  assert.equal(isMissingCollectionError(Object.assign(new Error("collection ellie-ai.automation_action_runs not found"), { name: "MongoAPIError" })), true);
  assert.equal(isMissingCollectionError(Object.assign(new Error("another Mongo API failure"), { name: "MongoAPIError" })), false);
  let db = fixture({ missingCollection: true }); let result = await migrate(db); assert.equal(result.ready, true); assert.equal(result.index.status, "missing"); assert.equal(db.creates.length, 0, "Missing-collection preflight remains read-only");
  const safeRows = [{ _id: "a", workspaceId: "workspace-a", idempotencyKey: "same" }, { _id: "b", workspaceId: "workspace-b", idempotencyKey: "same" }];
  db = fixture({ rows: safeRows }); result = await migrate(db); assert.equal(result.ready, true); assert.equal(result.mode, "preflight"); assert.equal(db.creates.length, 0);
  db = fixture({ rows: safeRows }); result = await migrate(db, { apply: true }); assert.equal(result.ready, true); assert.equal(result.result, "created_and_verified"); assert.equal(db.creates.length, 1); assert(db.stored.some(index => index.name === "unrelated"));
  result = await migrate(db, { apply: true }); assert.equal(result.result, "unchanged"); assert.equal(db.creates.length, 1, "Repeated apply does not recreate the index");
  db = fixture({ rows: [...safeRows, { _id: "duplicate", workspaceId: "workspace-a", idempotencyKey: "same" }] }); result = await migrate(db, { apply: true }); assert.equal(result.ready, false); assert.equal(result.duplicates.count, 1); assert.equal(db.creates.length, 0); assert(!JSON.stringify(result).includes('"idempotencyKey":"same"'));
  db = fixture({ malformedIds: ["bad-record"] }); result = await migrate(db, { apply: true }); assert.equal(result.ready, false); assert.equal(result.malformed.count, 1); assert.equal(result.duplicates.skipped, true); assert.equal(db.creates.length, 0);
  db = fixture({ indexes: [{ name: "existing_correct", key: TARGET.key, unique: true }] }); result = await migrate(db, { apply: true }); assert.equal(result.ready, true); assert.equal(result.result, "unchanged");
  assert.equal(indexState([{ name: TARGET.options.name, key: TARGET.key, unique: false }]).status, "conflict");
  db = fixture({ failCreate: true }); result = await migrate(db, { apply: true }); assert.equal(result.ready, false); assert.equal(result.result, "failed"); assert(!JSON.stringify(result).includes("Sensitive duplicate value"));
  const diagnostics = [
    safeDiagnostic(Object.assign(new Error("querySrv ENOTFOUND _mongodb._tcp.private-host"), { code: "ENOTFOUND" })),
    safeDiagnostic(Object.assign(new Error("Authentication failed for mongodb+srv://user:password@private-host/database"), { code: 18, codeName: "AuthenticationFailed" })),
    safeDiagnostic(Object.assign(new Error("E11000 duplicate key idempotencyKey: very-sensitive-value"), { code: 11000 })),
    safeDiagnostic(Object.assign(new Error("Invalid $strLenCP aggregation expression"), { code: 40324 })),
  ];
  assert.deepEqual(diagnostics.map(item => item.category), ["dns_resolution_failed", "database_authentication_failed", "duplicate_key_conflict", "preflight_query_rejected"]);
  const diagnosticText = JSON.stringify(diagnostics);
  for (const secret of ["private-host", "user:password", "very-sensitive-value", "idempotencyKey"]) assert(!diagnosticText.includes(secret));
  const nestedApiError = Object.assign(new Error("Mongo API option serverApi cannot be specified with mongodb+srv://user:secret@private-host/db"), { name: "MongoAPIError", errorLabels: ["ResetPool", "unsafe label value"], errorResponse: { code: 323, codeName: "APIStrictError", message: "private-host" } });
  tagOperation(nestedApiError, "connection_open");
  const nestedDiagnostic = safeDiagnostic(nestedApiError);
  assert.equal(nestedDiagnostic.category, "mongo_driver_api_error"); assert.equal(nestedDiagnostic.operation, "connection_open"); assert.equal(nestedDiagnostic.code, 323); assert.equal(nestedDiagnostic.codeName, "APIStrictError"); assert.deepEqual(nestedDiagnostic.errorLabels, ["ResetPool"]); assert.equal(nestedDiagnostic.name, "MongoAPIError");
  assert(!JSON.stringify(nestedDiagnostic).includes("private-host")); assert(!JSON.stringify(nestedDiagnostic).includes("user:secret"));
  const aggregateError = tagOperation(Object.assign(new Error("Invalid aggregation expression containing sensitive-data"), { name: "MongoServerError", code: 40324, codeName: "Location40324" }), "aggregate_malformed_preflight");
  const aggregateDiagnostic = safeDiagnostic(aggregateError); assert.equal(aggregateDiagnostic.operation, "aggregate_malformed_preflight"); assert.equal(aggregateDiagnostic.category, "preflight_query_rejected"); assert(!JSON.stringify(aggregateDiagnostic).includes("sensitive-data"));
  console.log("AutomationActionRun index migration tests passed: preflight, workspace-scoped duplicates, malformed records, apply/verify, existing index, repeat safety, conflicting options, unrelated-index preservation, and sanitized creation failure.");
}
run().catch(error => { console.error(error); process.exitCode = 1; });
