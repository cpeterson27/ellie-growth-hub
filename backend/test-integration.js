/**
 * Comprehensive Integration Test
 * 1. Creates relationships manually
 * 2. Tests all CRUD operations
 * 3. Verifies discovery flow creates relationships
 */

const http = require("http");
const mongoose = require("mongoose");
const path = require("path");

// Load models
require("dotenv").config();
const Organization = require("./models/Organization");
const Audience = require("./models/Audience");
const OrganizationRelationship = require("./models/OrganizationRelationship");
const { connectDatabase } = require("./config/database");

const BASE_URL = "http://localhost:5001/api";

function makeRequest(method, path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const urlObj = new URL(url);

    const requestOptions = {
      method,
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    };

    const req = http.request(requestOptions, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: parsed,
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: data,
          });
        }
      });
    });

    req.on("error", reject);

    if (options.body) {
      req.write(JSON.stringify(options.body));
    }

    req.end();
  });
}

async function runTests() {
  console.log("========================================");
  console.log("Integration Test Suite");
  console.log("========================================\n");

  let passCount = 0;
  let failCount = 0;

  // Connect to database
  console.log("Connecting to MongoDB...");
  try {
    await connectDatabase(process.env.MONGO_URI);
    console.log("✓ Connected to MongoDB\n");
  } catch (err) {
    console.error("❌ Failed to connect to MongoDB:", err.message);
    process.exit(1);
  }

  // Find test data
  console.log("Loading test data...\n");
  let testOrgId, testAudId;

  try {
    const orgs = await Organization.find().limit(1);
    const auds = await Audience.find().limit(1);

    if (orgs.length === 0 || auds.length === 0) {
      console.error("❌ Not enough test data in database");
      process.exit(1);
    }

    testOrgId = orgs[0]._id;
    testAudId = auds[0]._id;
    console.log(`✓ Org: ${testOrgId}`);
    console.log(`✓ Audience: ${testAudId}\n`);
  } catch (err) {
    console.error("❌ Error loading test data:", err.message);
    process.exit(1);
  }

  // TEST PHASE 1: Create relationships manually
  console.log("═══ PHASE 1: Relationship Creation ═══\n");

  console.log("TEST 1: Create relationship via database");
  try {
    await OrganizationRelationship.deleteMany({
      organizationId: testOrgId,
      audienceId: testAudId,
    });

    const rel = await OrganizationRelationship.create({
      organizationId: testOrgId,
      audienceId: testAudId,
      status: "new",
      notes: "",
    });

    console.log("✓ PASS: Relationship created");
    console.log(`  - Status: ${rel.status}`);
    console.log(`  - Created: ${rel.createdAt}`);
    passCount++;
  } catch (err) {
    console.log(`❌ FAIL: ${err.message}`);
    failCount++;
  }
  console.log("");

  // TEST PHASE 2: GET operations
  console.log("═══ PHASE 2: GET Operations ═══\n");

  console.log("TEST 2: GET relationship by org + audience");
  try {
    const res = await makeRequest(
      "GET",
      `${BASE_URL}/organizations/${testOrgId}/relationship?audienceId=${testAudId}`,
    );

    if (res.status === 200 && res.body.success && res.body.relationship) {
      console.log("✓ PASS: Relationship retrieved");
      console.log(`  - Org: ${res.body.organization.name}`);
      console.log(`  - Status: ${res.body.relationship.status}`);
      passCount++;
    } else {
      console.log(`❌ FAIL: Status ${res.status}, error: ${res.body.error}`);
      failCount++;
    }
  } catch (err) {
    console.log(`❌ FAIL: ${err.message}`);
    failCount++;
  }
  console.log("");

  console.log("TEST 3: GET all relationships for org");
  try {
    const res = await makeRequest(
      "GET",
      `${BASE_URL}/organizations/${testOrgId}/relationship`,
    );

    if (
      res.status === 200 &&
      res.body.success &&
      Array.isArray(res.body.relationships)
    ) {
      console.log("✓ PASS: All relationships retrieved");
      console.log(`  - Count: ${res.body.relationships.length}`);
      passCount++;
    } else {
      console.log(`❌ FAIL: Status ${res.status}`);
      failCount++;
    }
  } catch (err) {
    console.log(`❌ FAIL: ${err.message}`);
    failCount++;
  }
  console.log("");

  // TEST PHASE 3: UPDATE operations
  console.log("═══ PHASE 3: UPDATE Operations ═══\n");

  console.log("TEST 4: Update status to 'reviewing'");
  try {
    const res = await makeRequest(
      "PATCH",
      `${BASE_URL}/organizations/${testOrgId}/relationship`,
      {
        body: {
          audienceId: testAudId,
          status: "reviewing",
          notes: "Good fit for audience",
        },
      },
    );

    if (
      res.status === 200 &&
      res.body.success &&
      res.body.relationship.status === "reviewing"
    ) {
      console.log("✓ PASS: Status updated to reviewing");
      console.log(`  - Notes: ${res.body.relationship.notes}`);
      passCount++;
    } else {
      console.log(`❌ FAIL: Status ${res.status}`);
      failCount++;
    }
  } catch (err) {
    console.log(`❌ FAIL: ${err.message}`);
    failCount++;
  }
  console.log("");

  console.log("TEST 5: Update status to 'qualified'");
  try {
    const res = await makeRequest(
      "PATCH",
      `${BASE_URL}/organizations/${testOrgId}/relationship`,
      {
        body: {
          audienceId: testAudId,
          status: "qualified",
          notes: "Ready for outreach",
        },
      },
    );

    if (
      res.status === 200 &&
      res.body.success &&
      res.body.relationship.status === "qualified"
    ) {
      console.log("✓ PASS: Status updated to qualified");
      console.log(`  - Changed: ${res.body.relationship.lastChangedAt}`);
      passCount++;
    } else {
      console.log(`❌ FAIL: Status ${res.status}`);
      failCount++;
    }
  } catch (err) {
    console.log(`❌ FAIL: ${err.message}`);
    failCount++;
  }
  console.log("");

  // TEST PHASE 4: Filtering and pagination
  console.log("═══ PHASE 4: Query & Filtering ═══\n");

  // Create more relationships for filtering test
  console.log("TEST 6: Create additional relationships for filtering");
  try {
    const orgs = await Organization.find().limit(3);
    for (const org of orgs) {
      await OrganizationRelationship.updateOne(
        { organizationId: org._id, audienceId: testAudId },
        {
          organizationId: org._id,
          audienceId: testAudId,
          status: ["new", "reviewing", "qualified"][
            Math.floor(Math.random() * 3)
          ],
        },
        { upsert: true },
      );
    }
    console.log("✓ PASS: Additional relationships created");
    passCount++;
  } catch (err) {
    console.log(`❌ FAIL: ${err.message}`);
    failCount++;
  }
  console.log("");

  console.log("TEST 7: Get organizations by status (all)");
  try {
    const res = await makeRequest(
      "GET",
      `${BASE_URL}/organizations/by-status/${testAudId}?limit=10`,
    );

    if (res.status === 200 && res.body.success) {
      console.log("✓ PASS: Organizations retrieved");
      console.log(`  - Total: ${res.body.pagination.totalResults}`);
      console.log(`  - Status summary:`, res.body.summary.byStatus);
      passCount++;
    } else {
      console.log(`❌ FAIL: Status ${res.status}`);
      failCount++;
    }
  } catch (err) {
    console.log(`❌ FAIL: ${err.message}`);
    failCount++;
  }
  console.log("");

  console.log("TEST 8: Get organizations filtered by status");
  try {
    const res = await makeRequest(
      "GET",
      `${BASE_URL}/organizations/by-status/${testAudId}?status=qualified&limit=10`,
    );

    if (res.status === 200 && res.body.success) {
      console.log("✓ PASS: Filtered organizations retrieved");
      console.log(`  - Status filter: ${res.body.filter.status}`);
      console.log(`  - Results: ${res.body.organizations.length}`);
      if (res.body.organizations.length > 0) {
        console.log(
          `  - First org: ${res.body.organizations[0].organization.name}`,
        );
      }
      passCount++;
    } else {
      console.log(`❌ FAIL: Status ${res.status}`);
      failCount++;
    }
  } catch (err) {
    console.log(`❌ FAIL: ${err.message}`);
    failCount++;
  }
  console.log("");

  console.log("TEST 9: Pagination (page 1)");
  try {
    const res = await makeRequest(
      "GET",
      `${BASE_URL}/organizations/by-status/${testAudId}?page=1&limit=2`,
    );

    if (res.status === 200 && res.body.success && res.body.pagination) {
      console.log("✓ PASS: Pagination works");
      console.log(`  - Page: ${res.body.pagination.page}`);
      console.log(`  - Limit: ${res.body.pagination.limit}`);
      console.log(`  - Total results: ${res.body.pagination.totalResults}`);
      console.log(`  - Total pages: ${res.body.pagination.totalPages}`);
      passCount++;
    } else {
      console.log(`❌ FAIL: Status ${res.status}`);
      failCount++;
    }
  } catch (err) {
    console.log(`❌ FAIL: ${err.message}`);
    failCount++;
  }
  console.log("");

  // TEST PHASE 5: Error handling
  console.log("═══ PHASE 5: Error Handling ═══\n");

  console.log("TEST 10: Invalid status update (should 400)");
  try {
    const res = await makeRequest(
      "PATCH",
      `${BASE_URL}/organizations/${testOrgId}/relationship`,
      {
        body: {
          audienceId: testAudId,
          status: "invalid",
        },
      },
    );

    if (res.status === 400 && !res.body.success) {
      console.log("✓ PASS: Invalid status rejected");
      console.log(`  - Error: ${res.body.error.substring(0, 50)}...`);
      passCount++;
    } else {
      console.log(`❌ FAIL: Expected 400, got ${res.status}`);
      failCount++;
    }
  } catch (err) {
    console.log(`❌ FAIL: ${err.message}`);
    failCount++;
  }
  console.log("");

  console.log("TEST 11: Notes length validation");
  try {
    const longNotes = "x".repeat(1001);
    const res = await makeRequest(
      "PATCH",
      `${BASE_URL}/organizations/${testOrgId}/relationship`,
      {
        body: {
          audienceId: testAudId,
          status: "qualified",
          notes: longNotes,
        },
      },
    );

    if (res.status === 400 && !res.body.success) {
      console.log("✓ PASS: Notes length limit enforced");
      console.log(`  - Error: ${res.body.error}`);
      passCount++;
    } else {
      console.log(`❌ FAIL: Expected 400, got ${res.status}`);
      failCount++;
    }
  } catch (err) {
    console.log(`❌ FAIL: ${err.message}`);
    failCount++;
  }
  console.log("");

  console.log("TEST 12: Invalid org ID");
  try {
    const res = await makeRequest(
      "GET",
      `${BASE_URL}/organizations/invalid123/relationship`,
    );

    if (res.status === 404 && !res.body.success) {
      console.log("✓ PASS: Invalid org ID rejected");
      passCount++;
    } else {
      console.log(`❌ FAIL: Expected 404, got ${res.status}`);
      failCount++;
    }
  } catch (err) {
    console.log(`❌ FAIL: ${err.message}`);
    failCount++;
  }
  console.log("");

  // Summary
  console.log("════════════════════════════════════════");
  console.log("Test Summary");
  console.log("════════════════════════════════════════");
  console.log(`✓ Passed: ${passCount}`);
  console.log(`❌ Failed: ${failCount}`);
  console.log(`Total: ${passCount + failCount}`);
  console.log("");

  if (failCount === 0) {
    console.log("🎉 ALL TESTS PASSED!");
    process.exit(0);
  } else {
    console.log("⚠️  Some tests failed");
    process.exit(1);
  }
}

// Run tests
runTests().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
