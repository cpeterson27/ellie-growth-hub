const assert = require("assert");
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const WorkspaceMembership = require("./models/WorkspaceMembership");
const IntegrationConnection = require("./models/IntegrationConnection");
const {
  assignedRecordFilter,
  authenticatedUserId,
  canAccessRecord,
  salesOpportunityFilter,
  workspaceRecordFilter,
} = require("./authorization/accessPolicy");
const { createAuthContext, requireAuth, requireRole } = require("./middleware/auth");
const { requireRecordAccess, requireValidRole, restrictNewRoleSurface } = require("./middleware/authorization");
const { decryptCredentials, encryptCredentials } = require("./utils/credentialEncryption");

const ids = {
  workspace: new mongoose.Types.ObjectId(),
  otherWorkspace: new mongoose.Types.ObjectId(),
  user: new mongoose.Types.ObjectId(),
  otherUser: new mongoose.Types.ObjectId(),
  record: new mongoose.Types.ObjectId(),
  otherRecord: new mongoose.Types.ObjectId(),
};

function request(role, overrides = {}) {
  return {
    method: "GET",
    path: "/records",
    headers: {},
    auth: createAuthContext({
      user: { _id: ids.user },
      workspace: { _id: ids.workspace },
      role,
      session: {},
    }),
    ...overrides,
  };
}

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

async function invoke(middleware, req) {
  const res = response();
  let nextCalled = false;
  await middleware(req, res, () => { nextCalled = true; });
  return { res, nextCalled };
}

async function main() {
  const record = { _id: ids.record, workspaceId: ids.workspace, ownerId: ids.user };
  const otherRecord = { _id: ids.otherRecord, workspaceId: ids.workspace, ownerId: ids.otherUser };
  const foreignRecord = { _id: ids.record, workspaceId: ids.otherWorkspace, ownerId: ids.user };

  assert(canAccessRecord(request("owner"), record), "owner must access workspace records");
  assert(canAccessRecord(request("admin"), record), "admin must access workspace records");
  assert(canAccessRecord(request("coach"), record, { authorizedRecordIds: [ids.record] }), "coach must access explicitly authorized records");
  assert(!canAccessRecord(request("coach"), otherRecord, { authorizedRecordIds: [ids.record] }), "coach must not access unassigned records");
  assert(canAccessRecord(request("closer"), record, { ownerField: "ownerId" }), "closer must access owned sales records");
  assert(!canAccessRecord(request("closer"), otherRecord, { ownerField: "ownerId" }), "closer must not access another closer's records");
  assert(!canAccessRecord(request("owner"), foreignRecord), "cross-workspace access must be denied even to an owner");

  const scoped = workspaceRecordFilter(request("admin"), { workspaceId: ids.otherWorkspace, status: "active" });
  assert.strictEqual(String(scoped.workspaceId), String(ids.workspace), "workspace scope must override caller input");
  const assigned = assignedRecordFilter(request("coach"), [ids.record, "invalid"]);
  assert.deepStrictEqual(assigned._id.$in, [ids.record], "assigned filters must accept only valid record IDs");
  const closerFilter = salesOpportunityFilter(request("closer"), { stageKey: "qualified" });
  assert.strictEqual(String(closerFilter.workspaceId), String(ids.workspace));
  assert.strictEqual(String(closerFilter.ownerId), String(ids.user));
  assert.deepStrictEqual(salesOpportunityFilter(request("coach"))._id, { $in: [] }, "coaches must receive a fail-closed sales filter");
  assert.strictEqual(salesOpportunityFilter(request("owner"), { stageKey: "won" }).stageKey, "won", "owner sales filters must preserve existing queries");
  assert.strictEqual(salesOpportunityFilter(request("admin"), { stageKey: "won" }).stageKey, "won", "admin sales filters must preserve existing queries");

  const normalized = createAuthContext({ user: { _id: ids.user }, workspace: { _id: ids.workspace }, role: "admin", session: {} });
  assert.strictEqual(String(normalized.userId), String(ids.user), "auth context must expose normalized userId");
  assert.strictEqual(String(authenticatedUserId({ auth: normalized })), String(ids.user), "canonical helper must use auth.user._id");

  let result = await invoke(requireRole("owner", "admin"), request("owner"));
  assert(result.nextCalled, "owner role middleware must allow owner");
  result = await invoke(requireRole("owner", "admin"), request("admin"));
  assert(result.nextCalled, "admin role middleware must allow admin");
  result = await invoke(requireValidRole, { auth: { workspaceId: ids.workspace, user: { _id: ids.user } } });
  assert.strictEqual(result.res.statusCode, 403, "missing role must be denied safely");
  assert.strictEqual(result.res.body.code, "ROLE_INVALID");
  result = await invoke(requireValidRole, request("malformed"));
  assert.strictEqual(result.res.statusCode, 403, "malformed role must be denied safely");

  result = await invoke(requireAuth, { method: "GET", headers: {} });
  assert.strictEqual(result.res.statusCode, 401, "unauthenticated requests must be denied");
  assert.strictEqual(result.res.body.code, "AUTH_REQUIRED");

  result = await invoke(restrictNewRoleSurface, request("coach", { path: "/contacts" }));
  assert.strictEqual(result.res.statusCode, 403, "coach must fail closed until a route has record policy");
  result = await invoke(restrictNewRoleSurface, request("coach", { path: "/coaching/enrollments" }));
  assert(result.nextCalled, "coach must reach the assignment-scoped Coaching namespace");
  result = await invoke(restrictNewRoleSurface, request("closer", { path: "/opportunities" }));
  assert(result.nextCalled, "closer must reach owner-scoped Sales Opportunities");
  result = await invoke(restrictNewRoleSurface, request("closer", { path: "/contacts" }));
  assert.strictEqual(result.res.statusCode, 403, "closer must not reach an unscoped record surface");

  const recordMiddleware = requireRecordAccess({
    loadRecord: async () => record,
    authorizedRecordIds: async () => [ids.record],
  });
  result = await invoke(recordMiddleware, request("coach"));
  assert(result.nextCalled, "record middleware must allow explicitly authorized coach records");
  const deniedMiddleware = requireRecordAccess({
    loadRecord: async () => otherRecord,
    authorizedRecordIds: async () => [ids.record],
  });
  result = await invoke(deniedMiddleware, request("coach"));
  assert.strictEqual(result.res.statusCode, 403, "record middleware must deny unassigned coach records");

  const roleEnum = WorkspaceMembership.schema.path("role").enumValues;
  for (const role of ["owner", "admin", "coach", "closer", "ambassador", "member", "viewer"]) assert(roleEnum.includes(role));
  assert.strictEqual(IntegrationConnection.schema.path("credentials").options.select, false);
  assert.strictEqual(IntegrationConnection.schema.path("credentialsEncrypted").options.select, false);

  process.env.INTEGRATION_CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  const secret = { apiKey: "local-fixture-only" };
  const envelope = encryptCredentials(secret);
  assert.notStrictEqual(envelope.ciphertext, secret.apiKey);
  assert.deepStrictEqual(decryptCredentials(envelope), secret);

  const integrationRouteSource = fs.readFileSync(path.join(__dirname, "routes/integrationConnections.js"), "utf8");
  assert(integrationRouteSource.includes('router.use(requireCapability("integrations.manage"))'), "credential routes must require the integration-management capability");
  assert(integrationRouteSource.includes("credentialsEncrypted: encryptCredentials(credentials)"), "new credentials must be encrypted");
  assert(!integrationRouteSource.includes("connection.credentials = credentials"), "credential updates must not write plaintext");

  console.log("RBAC and record-level security checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
