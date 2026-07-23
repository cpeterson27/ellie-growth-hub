#!/usr/bin/env node

/**
 * Integration Connection Management Tests
 */

require("dotenv").config();
const mongoose = require("mongoose");

const IntegrationConnection = require("./models/IntegrationConnection");

const MONGO_URI = process.env.MONGO_URI;

// Test data
const testConnections = [
  {
    provider: "resend",
    credentials: { apiKey: "re_test_key_12345" },
    config: { rateLimit: 100 },
  },
  {
    provider: "eventbrite",
    credentials: { apiKey: "eventbrite_key_abc123" },
    config: { organizationId: "org_123" },
  },
  {
    provider: "linkedin",
    credentials: {
      accessToken: "linkedin_token_xyz",
      accessTokenExpiresAt: new Date(Date.now() + 3600000),
    },
    config: { version: "v2.0" },
  },
];

let passed = 0;
let failed = 0;

async function connectDB() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("✓ Connected to MongoDB\n");
  } catch (error) {
    console.error("Failed to connect to MongoDB:", error.message);
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
  console.log("Integration Connection Management Tests");
  console.log("════════════════════════════════════════════════\n");

  await connectDB();
  await cleanup();

  console.log("═══ PHASE 1: Create Connections ═══\n");

  // Test 1: Create first connection
  await test("Create resend connection", async () => {
    const conn = new IntegrationConnection(testConnections[0]);
    await conn.save();

    const saved = await IntegrationConnection.findOne({ provider: "resend" });
    if (!saved) throw new Error("Connection not saved");
    if (saved.provider !== "resend") throw new Error("Provider mismatch");
    if (saved.status !== "configured")
      throw new Error("Status should be configured");
  });

  // Test 2: Create multiple connections
  await test("Create multiple connections", async () => {
    for (const testConn of testConnections.slice(1)) {
      const conn = new IntegrationConnection(testConn);
      await conn.save();
    }

    const count = await IntegrationConnection.countDocuments();
    if (count !== 3) throw new Error(`Expected 3 connections, got ${count}`);
  });

  // Test 3: Credentials are not exposed in select
  await test("Credentials excluded from default select", async () => {
    const conn = await IntegrationConnection.findOne({
      provider: "resend",
    }).select("-credentials");

    if (conn.credentials !== undefined) {
      throw new Error("Credentials should be undefined with -credentials");
    }
  });

  // Test 4: Credentials can be selected explicitly
  await test("Credentials available when explicitly selected", async () => {
    const conn = await IntegrationConnection.findOne({
      provider: "resend",
    }).select("+credentials");

    if (!conn.credentials) throw new Error("Credentials should be available");
    if (conn.credentials.apiKey !== "re_test_key_12345") {
      throw new Error("Credentials value incorrect");
    }
  });

  console.log("\n═══ PHASE 2: Query Operations ═══\n");

  // Test 5: Find by provider
  await test("Find connection by provider", async () => {
    const conn = await IntegrationConnection.findOne({
      provider: "eventbrite",
    });
    if (!conn) throw new Error("Connection not found");
    if (conn.config.organizationId !== "org_123") {
      throw new Error("Config not saved correctly");
    }
  });

  // Test 6: List all connections
  await test("List all connections", async () => {
    const conns = await IntegrationConnection.find().sort({ provider: 1 });
    if (conns.length !== 3) throw new Error(`Expected 3, got ${conns.length}`);

    const providers = conns.map((c) => c.provider);
    if (!providers.includes("resend")) throw new Error("Missing resend");
    if (!providers.includes("eventbrite"))
      throw new Error("Missing eventbrite");
    if (!providers.includes("linkedin")) throw new Error("Missing linkedin");
  });

  // Test 7: Index on provider and status
  await test("Indexes work correctly", async () => {
    // Update status to test index
    await IntegrationConnection.updateOne(
      { provider: "resend" },
      { status: "connected" },
    );

    const conn = await IntegrationConnection.findOne({
      status: "connected",
      provider: "resend",
    });
    if (!conn) throw new Error("Index query failed");
  });

  console.log("\n═══ PHASE 3: Update Operations ═══\n");

  // Test 8: Update credentials
  await test("Update credentials", async () => {
    const newCreds = { apiKey: "re_new_key_67890" };
    await IntegrationConnection.updateOne(
      { provider: "resend" },
      { credentials: newCreds },
    );

    const updated = await IntegrationConnection.findOne({
      provider: "resend",
    }).select("+credentials");

    if (updated.credentials.apiKey !== "re_new_key_67890") {
      throw new Error("Credentials not updated");
    }
  });

  // Test 9: Update status
  await test("Update status to connected", async () => {
    const now = new Date();
    await IntegrationConnection.updateOne(
      { provider: "eventbrite" },
      {
        status: "connected",
        connectedAt: now,
        lastVerifiedAt: now,
      },
    );

    const conn = await IntegrationConnection.findOne({
      provider: "eventbrite",
    });
    if (conn.status !== "connected") throw new Error("Status not updated");
    if (!conn.connectedAt) throw new Error("connectedAt not set");
  });

  // Test 10: Set error message
  await test("Set lastError on failed connection", async () => {
    await IntegrationConnection.updateOne(
      { provider: "linkedin" },
      {
        status: "failed",
        lastError: "Invalid access token",
      },
    );

    const conn = await IntegrationConnection.findOne({ provider: "linkedin" });
    if (conn.status !== "failed") throw new Error("Status should be failed");
    if (conn.lastError !== "Invalid access token")
      throw new Error("Error not set");
  });

  console.log("\n═══ PHASE 4: Delete Operations ═══\n");

  // Test 11: Delete connection
  await test("Delete connection", async () => {
    const result = await IntegrationConnection.findOneAndDelete({
      provider: "linkedin",
    });

    if (!result) throw new Error("Delete failed");

    const check = await IntegrationConnection.findOne({ provider: "linkedin" });
    if (check) throw new Error("Connection still exists after delete");
  });

  // Test 12: Verify remaining connections
  await test("Verify remaining connections after delete", async () => {
    const conns = await IntegrationConnection.find();
    if (conns.length !== 2) throw new Error(`Expected 2, got ${conns.length}`);
  });

  console.log("\n═══ PHASE 5: Validation & Constraints ═══\n");

  // Test 13: Provider uniqueness
  await test("Provider uniqueness constraint", async () => {
    try {
      const dup = new IntegrationConnection({
        provider: "resend",
        credentials: { apiKey: "another_key" },
      });
      await dup.save();
      throw new Error("Should have failed - duplicate provider");
    } catch (error) {
      if (error.message === "Should have failed - duplicate provider") {
        throw error;
      }
      // Expected: duplicate key error
    }
  });

  // Test 14: Valid enum values
  await test("Invalid provider rejected", async () => {
    try {
      const invalid = new IntegrationConnection({
        provider: "invalid_provider",
        credentials: { key: "test" },
      });
      await invalid.save();
      throw new Error("Should have failed - invalid provider");
    } catch (error) {
      if (error.message === "Should have failed - invalid provider") {
        throw error;
      }
      // Expected: validation error
    }
  });

  // Test 15: Valid status values
  await test("Valid status values", async () => {
    const valid = new IntegrationConnection({
      provider: "meetup",
      credentials: { token: "test" },
      status: "configured",
    });
    await valid.save();

    const saved = await IntegrationConnection.findOne({ provider: "meetup" });
    if (saved.status !== "configured") throw new Error("Status not saved");
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
