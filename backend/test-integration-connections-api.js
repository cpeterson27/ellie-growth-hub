#!/usr/bin/env node

/**
 * Integration Connection API Tests
 */

require("dotenv").config();
const mongoose = require("mongoose");

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
    await IntegrationConnection.deleteMany({});
  } catch (error) {
    console.error("Cleanup error:", error.message);
  }
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
  console.log("Integration Connection API Tests");
  console.log("════════════════════════════════════════════════\n");

  await connectDB();
  await cleanup();

  console.log("═══ PHASE 1: POST /api/integration-connections/connect ═══\n");

  // Test 1: Connect first provider
  await test("POST /connect - Connect resend", async () => {
    const res = await fetch(`${API_BASE}/api/integration-connections/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "resend",
        credentials: { apiKey: "re_test_key_12345" },
        config: { rateLimit: 100 },
      }),
    });

    if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);
    const data = await res.json();
    if (!data.success) throw new Error("Response not successful");
    if (data.data.provider !== "resend") throw new Error("Provider mismatch");
    if (data.data.status !== "configured")
      throw new Error("Status should be configured");
    if (data.data.credentials)
      throw new Error("Credentials should not be in response");
  });

  // Test 2: Connect eventbrite
  await test("POST /connect - Connect eventbrite", async () => {
    const res = await fetch(`${API_BASE}/api/integration-connections/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "eventbrite",
        credentials: { apiKey: "eventbrite_key_abc123" },
        config: { organizationId: "org_123" },
      }),
    });

    if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);
    const data = await res.json();
    if (data.data.provider !== "eventbrite")
      throw new Error("Provider mismatch");
  });

  // Test 3: Update existing connection
  await test("POST /connect - Update existing connection", async () => {
    const res = await fetch(`${API_BASE}/api/integration-connections/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "resend",
        credentials: { apiKey: "re_new_key_67890" },
        config: { rateLimit: 200 },
      }),
    });

    if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);
    const data = await res.json();
    if (data.message.includes("configured")) {
      // Success - connection updated
    } else {
      throw new Error("Should indicate update");
    }
  });

  // Test 4: Missing provider
  await test("POST /connect - Missing provider (400)", async () => {
    const res = await fetch(`${API_BASE}/api/integration-connections/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        credentials: { apiKey: "test" },
      }),
    });

    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
    const data = await res.json();
    if (!data.error.includes("provider"))
      throw new Error("Error message should mention provider");
  });

  // Test 5: Invalid provider
  await test("POST /connect - Invalid provider (400)", async () => {
    const res = await fetch(`${API_BASE}/api/integration-connections/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "invalid_provider",
        credentials: { apiKey: "test" },
      }),
    });

    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
    const data = await res.json();
    if (!data.error.includes("Invalid provider"))
      throw new Error("Error should mention invalid provider");
  });

  // Test 6: Missing credentials
  await test("POST /connect - Missing credentials (400)", async () => {
    const res = await fetch(`${API_BASE}/api/integration-connections/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "linkedin",
      }),
    });

    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
  });

  console.log("\n═══ PHASE 2: GET /api/integration-connections ═══\n");

  // Test 7: List all connections
  await test("GET / - List all connections", async () => {
    const res = await fetch(`${API_BASE}/api/integration-connections`);

    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const data = await res.json();
    if (!data.success) throw new Error("Response not successful");
    if (data.data.total < 2)
      throw new Error("Should have at least 2 connections");
    if (!data.data.connections || !Array.isArray(data.data.connections)) {
      throw new Error("Missing connections array");
    }

    // Verify no credentials in response
    for (const conn of data.data.connections) {
      if (conn.credentials)
        throw new Error("Credentials should not be in response");
    }
  });

  // Test 8: List includes all fields
  await test("GET / - Response includes all fields", async () => {
    const res = await fetch(`${API_BASE}/api/integration-connections`);
    const data = await res.json();
    const conn = data.data.connections[0];

    const requiredFields = ["provider", "status", "config", "updatedAt"];
    for (const field of requiredFields) {
      if (!(field in conn)) throw new Error(`Missing field: ${field}`);
    }
  });

  console.log(
    "\n═══ PHASE 3: GET /api/integration-connections/:provider ═══\n",
  );

  // Test 9: Get specific provider
  await test("GET /:provider - Get resend connection", async () => {
    const res = await fetch(`${API_BASE}/api/integration-connections/resend`);

    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const data = await res.json();
    if (!data.success) throw new Error("Response not successful");
    if (data.data.provider !== "resend") throw new Error("Provider mismatch");
    if (data.data.credentials)
      throw new Error("Credentials should not be in response");
  });

  // Test 10: Get eventbrite
  await test("GET /:provider - Get eventbrite connection", async () => {
    const res = await fetch(
      `${API_BASE}/api/integration-connections/eventbrite`,
    );

    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const data = await res.json();
    if (data.data.provider !== "eventbrite")
      throw new Error("Provider mismatch");
  });

  // Test 11: Provider not connected (404)
  await test("GET /:provider - Non-existent provider (404)", async () => {
    const res = await fetch(`${API_BASE}/api/integration-connections/linkedin`);

    if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
    const data = await res.json();
    if (!data.error.includes("not connected"))
      throw new Error("Error should mention not connected");
  });

  // Test 12: Invalid provider (400)
  await test("GET /:provider - Invalid provider (400)", async () => {
    const res = await fetch(
      `${API_BASE}/api/integration-connections/invalid_provider`,
    );

    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
  });

  console.log(
    "\n═══ PHASE 4: DELETE /api/integration-connections/:provider ═══\n",
  );

  // Test 13: Delete connection
  await test("DELETE /:provider - Delete resend", async () => {
    const res = await fetch(`${API_BASE}/api/integration-connections/resend`, {
      method: "DELETE",
    });

    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const data = await res.json();
    if (!data.success) throw new Error("Response not successful");
    if (data.data.provider !== "resend") throw new Error("Provider mismatch");
  });

  // Test 14: Verify deleted
  await test("GET /:provider - Verify deleted (404)", async () => {
    const res = await fetch(`${API_BASE}/api/integration-connections/resend`);

    if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
  });

  // Test 15: Delete non-existent (404)
  await test("DELETE /:provider - Non-existent provider (404)", async () => {
    const res = await fetch(
      `${API_BASE}/api/integration-connections/linkedin`,
      {
        method: "DELETE",
      },
    );

    if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
  });

  // Test 16: Invalid provider (400)
  await test("DELETE /:provider - Invalid provider (400)", async () => {
    const res = await fetch(`${API_BASE}/api/integration-connections/invalid`, {
      method: "DELETE",
    });

    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
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
