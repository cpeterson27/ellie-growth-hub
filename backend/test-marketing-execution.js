#!/usr/bin/env node

/**
 * Email Marketing Execution Layer Tests
 * Tests: Campaign execution, email delivery, status tracking
 */

require("dotenv").config();
const mongoose = require("mongoose");

const MarketingCampaign = require("./models/MarketingCampaign");
const Audience = require("./models/Audience");
const IntegrationConnection = require("./models/IntegrationConnection");

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
      IntegrationConnection.deleteMany({ provider: "resend" }),
    ]);
  } catch (error) {
    console.error("Cleanup error:", error.message);
  }
}

async function setupTestData() {
  // Get or create test audience
  let audience = await Audience.findOne({ name: "Campaign Execution Test" });
  if (!audience) {
    audience = new Audience({
      name: "Campaign Execution Test",
      description: "Test audience for campaign execution",
    });
    await audience.save();
  }

  // Setup Resend connection with test credentials
  const connection = await IntegrationConnection.findOneAndUpdate(
    { provider: "resend" },
    {
      provider: "resend",
      status: "connected",
      credentials: {
        apiKey: process.env.RESEND_API_KEY || "re_test_key",
      },
      config: {
        from: process.env.EMAIL_FROM || "onboarding@resend.dev",
      },
      connectedAt: new Date(),
    },
    { upsert: true, new: true },
  );

  // Create draft campaign
  const campaign = new MarketingCampaign({
    name: "Test Email Campaign",
    type: "email",
    status: "draft",
    audienceId: audience._id,
    content: {
      subject: "Welcome to our platform",
      body: "Thank you for joining us",
      htmlBody: "<h1>Welcome</h1><p>Thank you for joining us</p>",
      callToAction: "Get Started",
      callToActionUrl: "https://example.com/start",
    },
  });

  await campaign.save();

  return { audience, campaign };
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
  console.log("Email Marketing Execution Layer Tests");
  console.log("════════════════════════════════════════════════\n");

  await connectDB();
  await cleanup();

  let testData;
  try {
    testData = await setupTestData();
    console.log("✓ Setup: Audience, campaign, and Resend connection\n");
  } catch (error) {
    console.error("Setup failed:", error.message);
    await mongoose.connection.close();
    process.exit(1);
  }

  const { audience, campaign } = testData;

  console.log("═══ PHASE 1: POST /api/marketing-campaigns/:id/execute ═══\n");

  // Test 1: Execute campaign to single recipient
  await test("POST /:id/execute - Execute to single recipient", async () => {
    const res = await fetch(
      `${API_BASE}/api/marketing-campaigns/${campaign._id}/execute`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientEmail: "delivered@resend.dev",
        }),
      },
    );

    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const data = await res.json();
    if (!data.success) throw new Error("Response not successful");
    if (!data.data.messageId) throw new Error("Missing messageId");
    if (!data.data.campaignId) throw new Error("Missing campaignId");
    console.log(`    Message ID: ${data.data.messageId}`);
  });

  // Test 2: Missing recipient
  await test("POST /:id/execute - Missing recipient (400)", async () => {
    const res = await fetch(
      `${API_BASE}/api/marketing-campaigns/${campaign._id}/execute`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
    );

    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
  });

  // Test 3: Invalid email format
  await test("POST /:id/execute - Invalid email (400)", async () => {
    const res = await fetch(
      `${API_BASE}/api/marketing-campaigns/${campaign._id}/execute`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientEmail: "invalid-email",
        }),
      },
    );

    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
  });

  // Test 4: Invalid campaign ID
  await test("POST /:id/execute - Invalid campaign ID (400)", async () => {
    const res = await fetch(
      `${API_BASE}/api/marketing-campaigns/invalid/execute`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientEmail: "test@example.com",
        }),
      },
    );

    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
  });

  // Test 5: Non-existent campaign
  await test("POST /:id/execute - Non-existent campaign (404)", async () => {
    const fakeId = "507f1f77bcf86cd799439011";
    const res = await fetch(
      `${API_BASE}/api/marketing-campaigns/${fakeId}/execute`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientEmail: "test@example.com",
        }),
      },
    );

    if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
  });

  console.log(
    "\n═══ PHASE 2: POST /api/marketing-campaigns/:id/execute-batch ═══\n",
  );

  // Test 6: Execute batch to multiple recipients
  await test("POST /:id/execute-batch - Execute to multiple recipients", async () => {
    const res = await fetch(
      `${API_BASE}/api/marketing-campaigns/${campaign._id}/execute-batch`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipients: ["delivered@resend.dev", "bounced@resend.dev"],
        }),
      },
    );

    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const data = await res.json();
    if (!data.success) throw new Error("Response not successful");
    if (!data.data.recipientCount) throw new Error("Missing recipientCount");
    console.log(`    Recipients: ${data.data.recipientCount}`);
  });

  // Test 7: Missing recipients
  await test("POST /:id/execute-batch - Missing recipients (400)", async () => {
    const res = await fetch(
      `${API_BASE}/api/marketing-campaigns/${campaign._id}/execute-batch`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
    );

    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
  });

  // Test 8: Invalid recipient in batch
  await test("POST /:id/execute-batch - Invalid recipient email (400)", async () => {
    const res = await fetch(
      `${API_BASE}/api/marketing-campaigns/${campaign._id}/execute-batch`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipients: ["valid@example.com", "invalid-email"],
        }),
      },
    );

    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
  });

  console.log("\n═══ PHASE 3: GET /api/marketing-campaigns/:id/status ═══\n");

  // Test 9: Get campaign status
  await test("GET /:id/status - Get campaign status", async () => {
    const res = await fetch(
      `${API_BASE}/api/marketing-campaigns/${campaign._id}/status`,
    );

    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const data = await res.json();
    if (!data.success) throw new Error("Response not successful");
    if (!data.data) throw new Error("Missing campaign data");
    if (!data.data.metrics) throw new Error("Missing metrics");
    if (data.data.status !== "active") {
      console.log(`    (Status: ${data.data.status})`);
    }
  });

  // Test 10: Invalid campaign ID in status
  await test("GET /:id/status - Invalid ID (400)", async () => {
    const res = await fetch(
      `${API_BASE}/api/marketing-campaigns/invalid/status`,
    );

    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
  });

  console.log("\n═══ PHASE 4: PATCH /api/marketing-campaigns/:id/pause ═══\n");

  // Test 11: Pause campaign
  await test("PATCH /:id/pause - Pause campaign", async () => {
    const res = await fetch(
      `${API_BASE}/api/marketing-campaigns/${campaign._id}/pause`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
      },
    );

    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const data = await res.json();
    if (!data.success) throw new Error("Response not successful");
    if (data.data.status !== "paused")
      throw new Error("Status should be paused");
  });

  console.log("\n═══ PHASE 5: PATCH /api/marketing-campaigns/:id/resume ═══\n");

  // Test 12: Resume campaign
  await test("PATCH /:id/resume - Resume campaign", async () => {
    const res = await fetch(
      `${API_BASE}/api/marketing-campaigns/${campaign._id}/resume`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
      },
    );

    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const data = await res.json();
    if (!data.success) throw new Error("Response not successful");
    if (data.data.status !== "active")
      throw new Error("Status should be active");
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
