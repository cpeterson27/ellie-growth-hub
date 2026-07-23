#!/usr/bin/env node

/**
 * Growth Operator Orchestration Tests
 */

require("dotenv").config();
const mongoose = require("mongoose");

const GrowthOperator = require("./models/GrowthOperator");
const GrowthOpportunity = require("./models/GrowthOpportunity");
const Audience = require("./models/Audience");
const Organization = require("./models/Organization");
const OrganizationRelationship = require("./models/OrganizationRelationship");

const API_BASE = "http://localhost:5001";
let passed = 0;
let failed = 0;

async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✓ Connected to MongoDB\n");
  } catch (error) {
    console.error("Failed to connect:", error.message);
    process.exit(1);
  }
}

async function cleanup() {
  try {
    await Promise.all([
      GrowthOperator.deleteMany({}),
      GrowthOpportunity.deleteMany({}),
      OrganizationRelationship.deleteMany({}),
    ]);
  } catch (error) {
    console.error("Cleanup error:", error.message);
  }
}

async function setupTestData() {
  // Get or create test audience
  let audience = await Audience.findOne({ name: "Growth Operator Test" });
  if (!audience) {
    audience = new Audience({
      name: "Growth Operator Test",
      description: "Test audience for growth operator",
    });
    await audience.save();
  }

  // Get organizations with priority scores
  const orgs = await Organization.find({
    priorityScore: { $exists: true, $ne: null },
  })
    .limit(5)
    .lean();

  if (orgs.length === 0) {
    throw new Error("No organizations with priority scores found");
  }

  // Link organizations to audience
  audience.organizationIds = orgs.map((o) => o._id);
  await audience.save();

  // Create some relationships
  if (orgs.length > 0) {
    const rel = new OrganizationRelationship({
      organizationId: orgs[0]._id,
      audienceId: audience._id,
      status: "reviewing",
      notes: "Initial contact made",
    });
    await rel.save();
  }

  return { audience, orgs };
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (error) {
    console.error(`✗ ${name}`);
    console.error(`  ${error.message}`);
    failed++;
  }
}

async function runTests() {
  console.log("════════════════════════════════════════════════");
  console.log("Growth Operator Orchestration Tests");
  console.log("════════════════════════════════════════════════\n");

  await connectDB();
  await cleanup();

  let testData;
  try {
    testData = await setupTestData();
    console.log(
      `✓ Setup: Audience and ${testData.orgs.length} organizations\n`,
    );
  } catch (error) {
    console.error("Setup failed:", error.message);
    await mongoose.connection.close();
    process.exit(1);
  }

  const { audience, orgs } = testData;

  console.log(
    "═══ PHASE 1: POST /api/growth-operators/analyze/:audienceId ═══\n",
  );

  let operatorId;

  // Test 1: Start analysis
  await test("POST /analyze/:audienceId - Start analysis", async () => {
    const res = await fetch(
      `${API_BASE}/api/growth-operators/analyze/${audience._id}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: {
            minPriorityScore: 0,
            maxOrganizationsToProcess: 10,
            campaignTypes: ["email", "social"],
          },
        }),
      },
    );

    if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);
    const data = await res.json();
    if (!data.success) throw new Error("Response not successful");
    if (!data.data.operatorId) throw new Error("Missing operatorId");
    if (data.data.status !== "active")
      throw new Error("Status should be active");
    operatorId = data.data.operatorId;
  });

  // Test 2: Invalid audience ID
  await test("POST /analyze/:audienceId - Invalid audience ID (404)", async () => {
    const fakeId = "507f1f77bcf86cd799439011";
    const res = await fetch(
      `${API_BASE}/api/growth-operators/analyze/${fakeId}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
    );

    if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
  });

  // Test 3: Invalid format
  await test("POST /analyze/:audienceId - Invalid format (400)", async () => {
    const res = await fetch(
      `${API_BASE}/api/growth-operators/analyze/invalid`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
    );

    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
  });

  // Wait for analysis to complete
  console.log("\nWaiting for analysis to complete (3 seconds)...\n");
  await new Promise((resolve) => setTimeout(resolve, 3000));

  console.log("═══ PHASE 2: GET /api/growth-operators/:operatorId ═══\n");

  // Test 4: Get operator status
  await test("GET /:operatorId - Get operator status", async () => {
    const res = await fetch(`${API_BASE}/api/growth-operators/${operatorId}`);

    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const data = await res.json();
    if (!data.success) throw new Error("Response not successful");
    if (!data.data.metrics) throw new Error("Missing metrics");
    if (data.data.status !== "completed") {
      console.log(`    (Status: ${data.data.status}, still processing)`);
    }
  });

  // Test 5: Invalid operator ID
  await test("GET /:operatorId - Invalid ID (400)", async () => {
    const res = await fetch(`${API_BASE}/api/growth-operators/invalid`);

    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
  });

  // Test 6: Non-existent operator
  await test("GET /:operatorId - Non-existent (404)", async () => {
    const fakeId = "507f1f77bcf86cd799439011";
    const res = await fetch(`${API_BASE}/api/growth-operators/${fakeId}`);

    if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
  });

  console.log(
    "\n═══ PHASE 3: GET /api/growth-operators/:operatorId/opportunities ═══\n",
  );

  // Test 7: List opportunities
  await test("GET /:operatorId/opportunities - List all opportunities", async () => {
    const res = await fetch(
      `${API_BASE}/api/growth-operators/${operatorId}/opportunities`,
    );

    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const data = await res.json();
    if (!data.success) throw new Error("Response not successful");
    if (!Array.isArray(data.data.opportunities)) {
      throw new Error("Missing opportunities array");
    }
    console.log(`    Found ${data.data.opportunities.length} opportunities`);
  });

  // Test 8: Filter by status
  await test("GET /:operatorId/opportunities - Filter by status", async () => {
    const res = await fetch(
      `${API_BASE}/api/growth-operators/${operatorId}/opportunities?status=identified`,
    );

    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const data = await res.json();
    if (!data.success) throw new Error("Response not successful");
  });

  // Test 9: Filter by min priority
  await test("GET /:operatorId/opportunities - Filter by minPriority", async () => {
    const res = await fetch(
      `${API_BASE}/api/growth-operators/${operatorId}/opportunities?minPriority=60`,
    );

    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const data = await res.json();
    if (!data.success) throw new Error("Response not successful");
  });

  // Test 10: Invalid minPriority
  await test("GET /:operatorId/opportunities - Invalid minPriority (400)", async () => {
    const res = await fetch(
      `${API_BASE}/api/growth-operators/${operatorId}/opportunities?minPriority=999`,
    );

    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
  });

  // Test 11: Pagination
  await test("GET /:operatorId/opportunities - Pagination works", async () => {
    const res = await fetch(
      `${API_BASE}/api/growth-operators/${operatorId}/opportunities?page=1&limit=10`,
    );

    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const data = await res.json();
    if (!data.data.pagination) throw new Error("Missing pagination");
    if (data.data.pagination.page !== 1) throw new Error("Page should be 1");
  });

  console.log(
    "\n═══ PHASE 4: GET /api/growth-operators/organizations/:organizationId/opportunities ═══\n",
  );

  // Test 12: Get opportunities for organization
  await test("GET /organizations/:organizationId/opportunities - Get org opportunities", async () => {
    const orgId = orgs[0]._id;
    const res = await fetch(
      `${API_BASE}/api/growth-operators/organizations/${orgId}/opportunities`,
    );

    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const data = await res.json();
    if (!data.success) throw new Error("Response not successful");
    console.log(
      `    Found ${data.data.opportunities.length} opportunities for org`,
    );
  });

  // Test 13: Get opportunities with audience filter
  await test("GET /organizations/:organizationId/opportunities - With audienceId filter", async () => {
    const orgId = orgs[0]._id;
    const res = await fetch(
      `${API_BASE}/api/growth-operators/organizations/${orgId}/opportunities?audienceId=${audience._id}`,
    );

    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const data = await res.json();
    if (!data.success) throw new Error("Response not successful");
  });

  console.log(
    "\n═══ PHASE 5: PATCH /api/growth-operators/opportunities/:opportunityId/action ═══\n",
  );

  // Get an opportunity to test with
  let opportunityId;
  const oppRes = await fetch(
    `${API_BASE}/api/growth-operators/${operatorId}/opportunities?limit=1`,
  );
  const oppData = await oppRes.json();
  if (oppData.data.opportunities.length > 0) {
    opportunityId = oppData.data.opportunities[0]._id;

    // Test 14: Mark as actioned
    await test("PATCH /opportunities/:opportunityId/action - Mark as actioned", async () => {
      const res = await fetch(
        `${API_BASE}/api/growth-operators/opportunities/${opportunityId}/action`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "actioned",
            actionDetails: {
              campaignId: "507f1f77bcf86cd799439011",
              note: "Campaign created",
            },
          }),
        },
      );

      if (res.status !== 200)
        throw new Error(`Expected 200, got ${res.status}`);
      const data = await res.json();
      if (data.data.status !== "actioned")
        throw new Error("Status should be actioned");
    });

    // Test 15: Mark as skipped
    await test("PATCH /opportunities/:opportunityId/action - Mark as skipped", async () => {
      const res = await fetch(
        `${API_BASE}/api/growth-operators/opportunities/${opportunityId}/action`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "skipped",
            actionDetails: { reason: "Not relevant for this quarter" },
          }),
        },
      );

      if (res.status !== 200)
        throw new Error(`Expected 200, got ${res.status}`);
      const data = await res.json();
      if (data.data.status !== "skipped")
        throw new Error("Status should be skipped");
    });

    // Test 16: Invalid action type
    await test("PATCH /opportunities/:opportunityId/action - Invalid action (400)", async () => {
      const res = await fetch(
        `${API_BASE}/api/growth-operators/opportunities/${opportunityId}/action`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "invalid_action",
          }),
        },
      );

      if (res.status !== 400)
        throw new Error(`Expected 400, got ${res.status}`);
    });

    // Test 17: Invalid opportunity ID
    await test("PATCH /opportunities/:opportunityId/action - Invalid ID (400)", async () => {
      const res = await fetch(
        `${API_BASE}/api/growth-operators/opportunities/invalid/action`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "actioned",
          }),
        },
      );

      if (res.status !== 400)
        throw new Error(`Expected 400, got ${res.status}`);
    });

    // Test 18: Non-existent opportunity
    await test("PATCH /opportunities/:opportunityId/action - Non-existent (404)", async () => {
      const fakeId = "507f1f77bcf86cd799439011";
      const res = await fetch(
        `${API_BASE}/api/growth-operators/opportunities/${fakeId}/action`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "actioned",
          }),
        },
      );

      if (res.status !== 404)
        throw new Error(`Expected 404, got ${res.status}`);
    });
  } else {
    console.log("⊘ Skipping opportunity action tests (no opportunities found)");
  }

  console.log("\n════════════════════════════════════════════════");
  console.log("Test Summary");
  console.log("════════════════════════════════════════════════");
  console.log(`✓ Passed: ${passed}`);
  console.log(`✗ Failed: ${failed}`);
  console.log(`Total: ${passed + failed}`);

  if (failed === 0) {
    console.log("\n🎉 ALL TESTS PASSED!");
  } else {
    console.log("\n⚠️  Some tests failed");
  }

  await cleanup();
  await mongoose.connection.close();
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
