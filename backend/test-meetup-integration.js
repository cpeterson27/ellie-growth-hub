const assert = require("assert");
process.env.INTEGRATION_CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
process.env.MEETUP_CLIENT_ID = "client";
process.env.MEETUP_CLIENT_SECRET = "secret";
process.env.MEETUP_REDIRECT_URI = "https://api.example.com/api/meetup/oauth/callback";
delete process.env.MEETUP_OUTBOUND_ENABLED;
const service = require("./services/meetupService");

async function run() {
  const url = new URL(service.authorizationUrl("workspace-1", "user-1"));
  assert.equal(url.origin, "https://secure.meetup.com");
  assert.equal(url.pathname, "/oauth2/authorize");
  assert.equal(service.verifyState(url.searchParams.get("state")).workspaceId, "workspace-1");
  assert.equal(service.verifyState(`${url.searchParams.get("state")}x`), null);

  const graphClient = { post: async (endpoint, body, options) => { assert.equal(endpoint, service.GRAPHQL_URL); assert.equal(options.headers.Authorization, "Bearer token"); assert(!JSON.stringify(body).includes("password")); return { data: { data: { self: { id: "1", name: "Ellie" } } } }; } };
  assert.equal((await service.graphql("token", "query { self { id name } }", {}, graphClient)).self.name, "Ellie");

  let created = null; let activity = null;
  const requestModels = {
    IntegrationConnection: { findOne: async (query) => { assert.equal(query.status, "connected"); return { _id: "connection-1" }; } },
    MeetupActionRequest: { findOneAndUpdate: async (query, update) => { created = { _id: "request-1", ...update.$setOnInsert }; return created; } },
    CrmActivity: { findOneAndUpdate: async (_query, update) => { activity = update.$setOnInsert; return activity; } },
  };
  const first = await service.requestAction({ workspaceId: "workspace-1", action: "create_event", payload: { title: "Draft" }, idempotencyKey: "automation:1" }, requestModels);
  assert.equal(first.status, "pending_approval");
  assert.equal(activity.metadata.eventType, "meetup.action.approval_requested");

  let saved = 0;
  const pending = { status: "pending_approval", save: async () => { saved += 1; } };
  const approvalModels = { MeetupActionRequest: { findOne: async () => pending } };
  const approved = await service.executeApproved("request-1", "owner-1", approvalModels, { post: async () => { throw new Error("Provider must not be called while disabled"); } });
  assert.equal(approved.status, "approved");
  assert.equal(saved, 1);
  assert.equal(service.publicStatus({ status: "connected", settings: {}, oauth: {} }).outboundEnabled, false);
  console.log("Meetup integration mocked tests passed");
}
run().catch((error) => { console.error(error); process.exit(1); });
