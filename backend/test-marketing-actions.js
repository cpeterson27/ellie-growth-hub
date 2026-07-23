#!/usr/bin/env node

/**
 * Marketing Action Layer Tests
 * Tests: Opportunity → Action conversion, action endpoints, filtering, summaries
 */

require("dotenv").config();
const mongoose = require("mongoose");

const GrowthOperator = require("./models/GrowthOperator");
const GrowthOpportunity = require("./models/GrowthOpportunity");
const Audience = require("./models/Audience");
const Organization = require("./models/Organization");
const OrganizationRelationship = require("./models/OrganizationRelationship");
const MarketingCampaign = require("./models/MarketingCampaign");

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
      MarketingCampaign.deleteMany({}),
    ]);
  } catch (error) {
    console.error("Cleanup error:", error.message);
  }
}

async function setupTestData() {
  // Get or create test audience
  let audience = await Audience.findOne({ name: "Marketing Action Test" });
  if (!audience) {
    audience = new Audience({
      name: "Marketing Action Test",
      description: "Test audience for marketing actions",
    });
    await audience.save();
  }

  // Get organizations
  const orgs = await Organization.find({
    priorityScore: { $exists: true, $ne: null },
  })
    .limit(3)
    .lean();

  if (orgs.length === 0) {
    throw new Error("No organizations with priority scores found");
  }

  // Link organizations to audience
  audience.organizationIds = orgs.map((o) => o._id);
  await audience.save();

  // Create relationships and campaigns
  if (orgs.length > 0) {
    // Relationship for first org
    const rel1 = new OrganizationRelationship({
      organizationId: orgs[0]._id,
      audienceId: audience._id,
      status: "reviewing",
    });
    await rel1.save();

    // Campaign for first org
    const camp1 = new MarketingCampaign({
      name: "Email campaign 1",
      type: "email",
      status: "active",
      audienceId: audience._id,
      organizationIds: [orgs[0]._id],
      content: { subject: "Test", body: "Test body" },
    });
    await camp1.save();
  }

  if (orgs.length > 1) {
    // Relationship for second org
    const rel2 = new OrganizationRelationship({
      organizationId: orgs[1]._id,
      audienceId: audience._id,
      status: "new",
    });
    await rel2.save();
  }

  // Start analysis to create operator and opportunities
  const res = await fetch(
    `${API_BASE}/api/growth-operators/analyze/${audience._id}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    },
  );

  const data = await res.json();
  const operatorId = data.data.operatorId;

  // Wait for analysis
  await new Promise((resolve) => setTimeout(resolve, 2000));

  return { audience, orgs, operatorId };
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
  console.log("Marketing Action Layer Tests");
  console.log("════════════════════════════════════════════════\n");

  await connectDB();
  await cleanup();

  let testData;
  try {
    testData = await setupTestData();
    console.log(
      `✓ Setup: Audience, ${testData.orgs.length} organizations, and operator\n`,
    );
  } catch (error) {
    console.error("Setup failed:", error.message);
    await mongoose.connection.close();
    process.exit(1);
  }

  const { audience, orgs, operatorId } = testData;

  console.log(
    "═══ PHASE 1: GET /api/growth-operators/:operatorId/actions ═══\n",
  );

  // Test 1: Get all actions
  await test("GET /:operatorId/actions - Get all actions", async () => {
    const res = await fetch(
      `${API_BASE}/api/growth-operators/${operatorId}/actions`,
    );

    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const data = await res.json();
    if (!data.success) throw new Error("Response not successful");
    if (!Array.isArray(data.data.actions))
      throw new Error("Missing actions array");
    console.log(`    Found ${data.data.actions.length} actions`);

    // Verify action structure
    if (data.data.actions.length > 0) {
      const action = data.data.actions[0];
      if (!action.organizationId) throw new Error("Missing organizationId");
      if (!action.organizationName) throw new Error("Missing organizationName");
      if (!action.opportunityType) throw new Error("Missing opportunityType");
      if (!action.recommendedAction)
        throw new Error("Missing recommendedAction");
      if (!action.priority && action.priority !== 0)
        throw new Error("Missing priority");
      if (!action.status) throw new Error("Missing status");
    }
  });

  // Test 2: Filter by opportunity type
  await test("GET /:operatorId/actions - Filter by opportunityType", async () => {
    const res = await fetch(
      `${API_BASE}/api/growth-operators/${operatorId}/actions?opportunityType=new_organization`,
    );

    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const data = await res.json();
    if (!data.success) throw new Error("Response not successful");

    // Verify all returned actions match filter
    for (const action of data.data.actions) {
      if (action.opportunityType !== "new_organization") {
        throw new Error(
          `Action has wrong opportunityType: ${action.opportunityType}`,
        );
      }
    }
  });

  // Test 3: Filter by min priority
  await test("GET /:operatorId/actions - Filter by minPriority", async () => {
    const res = await fetch(
      `${API_BASE}/api/growth-operators/${operatorId}/actions?minPriority=70`,
    );

    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const data = await res.json();
    if (!data.success) throw new Error("Response not successful");

    // Verify all returned actions meet min priority
    for (const action of data.data.actions) {
      if (action.priority < 70) {
        throw new Error(`Action priority ${action.priority} below 70`);
      }
    }
  });

  // Test 4: Pagination
  await test("GET /:operatorId/actions - Pagination", async () => {
    const res = await fetch(
      `${API_BASE}/api/growth-operators/${operatorId}/actions?page=1&limit=5`,
    );

    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const data = await res.json();
    if (!data.data.pagination) throw new Error("Missing pagination");
    if (data.data.pagination.limit !== 5) throw new Error("Limit should be 5");
    if (data.data.pagination.page !== 1) throw new Error("Page should be 1");
  });

  // Test 5: Invalid operatorId
  await test("GET /:operatorId/actions - Invalid operatorId (400)", async () => {
    const res = await fetch(`${API_BASE}/api/growth-operators/invalid/actions`);

    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
  });

  // Test 6: Non-existent operatorId
  await test("GET /:operatorId/actions - Non-existent (404)", async () => {
    const fakeId = "507f1f77bcf86cd799439011";
    const res = await fetch(
      `${API_BASE}/api/growth-operators/${fakeId}/actions`,
    );

    if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
  });

  console.log(
    "\n═══ PHASE 2: GET /api/growth-operators/:operatorId/actions/summary ═══\n",
  );

  // Test 7: Get action summary
  await test("GET /:operatorId/actions/summary - Get summary statistics", async () => {
    const res = await fetch(
      `${API_BASE}/api/growth-operators/${operatorId}/actions/summary`,
    );

    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const data = await res.json();
    if (!data.success) throw new Error("Response not successful");
    if (!data.data.summary) throw new Error("Missing summary");

    const { summary } = data.data;
    if (!summary.totalActions && summary.totalActions !== 0)
      throw new Error("Missing totalActions");
    if (!summary.byRecommendedAction)
      throw new Error("Missing byRecommendedAction");
    if (!summary.byStatus) throw new Error("Missing byStatus");
    if (!summary.byPriority) throw new Error("Missing byPriority");

    console.log(`    Total actions: ${summary.totalActions}`);
    console.log(
      `    By action: create_campaign=${summary.byRecommendedAction.create_campaign}, ` +
        `update_relationship=${summary.byRecommendedAction.update_relationship}, ` +
        `send_outreach=${summary.byRecommendedAction.send_outreach}, ` +
        `review_manually=${summary.byRecommendedAction.review_manually}`,
    );
    console.log(
      `    By status: ready=${summary.byStatus.ready}, ` +
        `in_progress=${summary.byStatus.in_progress}, ` +
        `completed=${summary.byStatus.completed}, ` +
        `skipped=${summary.byStatus.skipped}`,
    );
    console.log(
      `    By priority: high=${summary.byPriority.high}, ` +
        `medium=${summary.byPriority.medium}, ` +
        `low=${summary.byPriority.low}`,
    );
  });

  // Test 8: Invalid operatorId in summary
  await test("GET /:operatorId/actions/summary - Invalid ID (400)", async () => {
    const res = await fetch(
      `${API_BASE}/api/growth-operators/invalid/actions/summary`,
    );

    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
  });

  // Test 9: Non-existent in summary
  await test("GET /:operatorId/actions/summary - Non-existent (404)", async () => {
    const fakeId = "507f1f77bcf86cd799439011";
    const res = await fetch(
      `${API_BASE}/api/growth-operators/${fakeId}/actions/summary`,
    );

    if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
  });

  console.log("\n═══ PHASE 3: Action Details and Structure ═══\n");

  // Test 10: Verify action types have correct details
  await test("Action details - create_campaign has campaignDetails", async () => {
    const res = await fetch(
      `${API_BASE}/api/growth-operators/${operatorId}/actions`,
    );
    const data = await res.json();

    const campaignActions = data.data.actions.filter(
      (a) => a.recommendedAction === "create_campaign",
    );

    if (campaignActions.length === 0) {
      console.log("    (No create_campaign actions to verify)");
      return;
    }

    for (const action of campaignActions) {
      if (!action.campaignDetails) throw new Error("Missing campaignDetails");
      if (!action.campaignDetails.suggestedType)
        throw new Error("Missing suggestedType");
      if (!action.campaignDetails.existingCampaigns)
        throw new Error("Missing existingCampaigns");
    }

    console.log(
      `    Verified ${campaignActions.length} create_campaign actions`,
    );
  });

  // Test 11: Verify action statuses are set correctly
  await test("Action statuses - status field is set correctly", async () => {
    const res = await fetch(
      `${API_BASE}/api/growth-operators/${operatorId}/actions`,
    );
    const data = await res.json();

    const validStatuses = [
      "ready",
      "in_progress",
      "completed",
      "skipped",
      "pending",
    ];

    for (const action of data.data.actions) {
      if (!validStatuses.includes(action.status)) {
        throw new Error(`Invalid status: ${action.status}`);
      }
    }

    console.log(
      `    Verified all ${data.data.actions.length} actions have valid status`,
    );
  });

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
