#!/usr/bin/env node

/**
 * Bootcamp Marketing Workflow Tests
 * Tests: Templates, campaign creation, scheduling, and performance tracking
 */

require("dotenv").config();
const mongoose = require("mongoose");

const MarketingCampaign = require("./models/MarketingCampaign");
const Audience = require("./models/Audience");

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
      MarketingCampaign.deleteMany({}),
      Audience.deleteMany({}),
    ]);
  } catch (error) {
    console.error("Cleanup error:", error.message);
  }
}

async function setupTestData() {
  // Create test audience
  const audience = new Audience({
    name: "Bootcamp Workflow Test",
    description: "Test audience for bootcamp marketing",
  });

  await audience.save();

  return { audience };
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
  console.log("Bootcamp Marketing Workflow Tests");
  console.log("════════════════════════════════════════════════\n");

  await connectDB();
  await cleanup();

  let testData;
  try {
    testData = await setupTestData();
    console.log("✓ Setup: Test audience created\n");
  } catch (error) {
    console.error("Setup failed:", error.message);
    await mongoose.connection.close();
    process.exit(1);
  }

  const { audience } = testData;

  console.log("═══ PHASE 1: GET /api/bootcamp-campaigns/templates ═══\n");

  // Test 1: Get all templates
  let templates;
  await test("GET /templates - Get all templates", async () => {
    const res = await fetch(`${API_BASE}/api/bootcamp-campaigns/templates`);

    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const data = await res.json();
    if (!data.success) throw new Error("Response not successful");
    if (!data.data.templates) throw new Error("Missing templates");
    if (data.data.count === 0) throw new Error("No templates found");
    templates = data.data.templates;
    console.log(
      `    Found ${data.data.count} templates: ${data.data.available.join(", ")}`,
    );
  });

  // Test 2: Get specific template
  await test("GET /templates/:name - Get specific template", async () => {
    const res = await fetch(
      `${API_BASE}/api/bootcamp-campaigns/templates/announcement`,
    );

    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const data = await res.json();
    if (!data.success) throw new Error("Response not successful");
    if (!data.data.template) throw new Error("Missing template");
    if (!data.data.template.htmlBody) throw new Error("Missing template body");
  });

  // Test 3: Template not found
  await test("GET /templates/:name - Template not found (404)", async () => {
    const res = await fetch(
      `${API_BASE}/api/bootcamp-campaigns/templates/invalid`,
    );

    if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
  });

  console.log("\n═══ PHASE 2: POST /api/bootcamp-campaigns/create ═══\n");

  let campaignId1, campaignId2;

  // Test 4: Create campaign from template
  await test("POST /create - Create campaign from announcement template", async () => {
    const res = await fetch(`${API_BASE}/api/bootcamp-campaigns/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        audienceId: audience._id.toString(),
        templateName: "announcement",
        name: "Q3 Bootcamp Announcement",
        callToActionUrl: "https://example.com/bootcamp",
      }),
    });

    if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);
    const data = await res.json();
    if (!data.success) throw new Error("Response not successful");
    if (!data.data.campaignId) throw new Error("Missing campaignId");
    campaignId1 = data.data.campaignId;
    console.log(`    Created campaign: ${data.data.name}`);
  });

  // Test 5: Create early bird campaign with variables
  await test("POST /create - Create campaign with variables", async () => {
    const res = await fetch(`${API_BASE}/api/bootcamp-campaigns/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        audienceId: audience._id.toString(),
        templateName: "earlyBird",
        name: "Early Bird Campaign",
        callToActionUrl: "https://example.com/earlybird",
        variables: {
          expiryDate: "2026-08-21",
        },
      }),
    });

    if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);
    const data = await res.json();
    if (!data.success) throw new Error("Response not successful");
    campaignId2 = data.data.campaignId;
  });

  // Test 6: Missing audienceId
  await test("POST /create - Missing audienceId (400)", async () => {
    const res = await fetch(`${API_BASE}/api/bootcamp-campaigns/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templateName: "announcement",
      }),
    });

    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
  });

  // Test 7: Invalid templateName
  await test("POST /create - Invalid template (404)", async () => {
    const res = await fetch(`${API_BASE}/api/bootcamp-campaigns/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        audienceId: audience._id.toString(),
        templateName: "nonexistent",
      }),
    });

    if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
  });

  console.log(
    "\n═══ PHASE 3: PATCH /api/bootcamp-campaigns/:id/schedule ═══\n",
  );

  // Test 8: Schedule campaign
  await test("PATCH /:id/schedule - Schedule campaign", async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);

    const res = await fetch(
      `${API_BASE}/api/bootcamp-campaigns/${campaignId1}/schedule`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduledFor: futureDate.toISOString(),
        }),
      },
    );

    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const data = await res.json();
    if (!data.success) throw new Error("Response not successful");
    if (data.data.status !== "scheduled")
      throw new Error("Status should be scheduled");
  });

  // Test 9: Schedule in past (invalid)
  await test("PATCH /:id/schedule - Past date (400)", async () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 1);

    const res = await fetch(
      `${API_BASE}/api/bootcamp-campaigns/${campaignId2}/schedule`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduledFor: pastDate.toISOString(),
        }),
      },
    );

    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
  });

  console.log("\n═══ PHASE 4: POST /api/bootcamp-campaigns/workflow ═══\n");

  // Test 10: Create complete workflow
  let workflowCampaigns = 0;
  await test("POST /workflow - Create complete bootcamp workflow", async () => {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() + 1);
    const reminderDate = new Date();
    reminderDate.setDate(reminderDate.getDate() + 14);

    const res = await fetch(`${API_BASE}/api/bootcamp-campaigns/workflow`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        audienceId: audience._id.toString(),
        name: "Summer Bootcamp 2026",
        campaigns: [
          {
            template: "announcement",
            name: "Announcement",
            callToActionUrl: "https://example.com/bootcamp",
            scheduledFor: startDate.toISOString(),
          },
          {
            template: "earlyBird",
            name: "Early Bird Offer",
            callToActionUrl: "https://example.com/earlybird",
            scheduledFor: new Date(
              startDate.getTime() + 2 * 24 * 60 * 60 * 1000,
            ).toISOString(),
            variables: {
              expiryDate: "2026-09-01",
            },
          },
          {
            template: "reminder",
            name: "Pre-Bootcamp Reminder",
            callToActionUrl: "https://example.com/bootcamp",
            scheduledFor: reminderDate.toISOString(),
            variables: {
              startDate: "2026-09-15",
              duration: "8 weeks",
              format: "Virtual",
            },
          },
        ],
      }),
    });

    if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);
    const data = await res.json();
    if (!data.success) throw new Error("Response not successful");
    if (data.data.campaignsCreated !== 3) {
      throw new Error(
        `Expected 3 campaigns, got ${data.data.campaignsCreated}`,
      );
    }
    workflowCampaigns = data.data.campaignsCreated;
    console.log(`    Created ${workflowCampaigns} campaigns in workflow`);
  });

  console.log(
    "\n═══ PHASE 5: GET /api/bootcamp-campaigns/:id/performance ═══\n",
  );

  // Test 11: Get campaign performance
  await test("GET /:id/performance - Get campaign performance", async () => {
    const res = await fetch(
      `${API_BASE}/api/bootcamp-campaigns/${campaignId1}/performance`,
    );

    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const data = await res.json();
    if (!data.success) throw new Error("Response not successful");
    if (!data.data.metrics) throw new Error("Missing metrics");
    if (!data.data.performance) throw new Error("Missing performance");
    if (!data.data.performance.openRate) throw new Error("Missing openRate");
  });

  // Test 12: Performance for non-existent campaign
  await test("GET /:id/performance - Non-existent campaign (404)", async () => {
    const fakeId = "507f1f77bcf86cd799439011";
    const res = await fetch(
      `${API_BASE}/api/bootcamp-campaigns/${fakeId}/performance`,
    );

    if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
  });

  console.log(
    "\n═══ PHASE 6: GET /api/bootcamp-campaigns/audience/:id/summary ═══\n",
  );

  // Test 13: Get audience campaigns summary
  await test("GET /audience/:id/summary - Get campaigns summary", async () => {
    const res = await fetch(
      `${API_BASE}/api/bootcamp-campaigns/audience/${audience._id}/summary`,
    );

    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const data = await res.json();
    if (!data.success) throw new Error("Response not successful");
    if (!data.data.summary) throw new Error("Missing summary");
    if (data.data.summary.totalCampaigns === 0) {
      throw new Error("Should have campaigns");
    }
    if (!data.data.overallMetrics) throw new Error("Missing overallMetrics");
    console.log(`    Total campaigns: ${data.data.summary.totalCampaigns}`);
    console.log(`    By status: ${JSON.stringify(data.data.summary.byStatus)}`);
  });

  console.log(
    "\n═══ PHASE 7: POST /api/bootcamp-campaigns/execute-scheduled ═══\n",
  );

  // Test 14: Execute scheduled campaigns
  await test("POST /execute-scheduled - Execute scheduled campaigns", async () => {
    const res = await fetch(
      `${API_BASE}/api/bootcamp-campaigns/execute-scheduled`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      },
    );

    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const data = await res.json();
    if (!data.success) throw new Error("Response not successful");
    if (data.data.executedCount === undefined)
      throw new Error("Missing executedCount");
    console.log(
      `    Executed: ${data.data.executedCount}, Failed: ${data.data.failedCount}`,
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
