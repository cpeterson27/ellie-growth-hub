/**
 * Test script for Organization Relationship Management Layer
 * Tests all 3 endpoints and integration with discovery flow
 */

const http = require("http");

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
  console.log("Organization Relationship Layer Tests");
  console.log("========================================\n");

  let passCount = 0;
  let failCount = 0;

  // Setup: Fetch test data
  console.log("Setting up test data...\n");
  let audienceId = null;
  let organizationId = null;

  try {
    // Get an audience with organizations
    const audiencesRes = await makeRequest("GET", `${BASE_URL}/audience`);
    if (
      audiencesRes.status === 200 &&
      audiencesRes.body.audiences &&
      audiencesRes.body.audiences.length > 0
    ) {
      audienceId = audiencesRes.body.audiences[0]._id;
      console.log(`✓ Found audience: ${audienceId}`);

      // Get organizations for this audience
      const orgsRes = await makeRequest(
        "GET",
        `${BASE_URL}/audience/${audienceId}/organizations/prioritized?limit=1`,
      );
      if (
        orgsRes.status === 200 &&
        orgsRes.body.organizations &&
        orgsRes.body.organizations.length > 0
      ) {
        organizationId = orgsRes.body.organizations[0]._id;
        console.log(`✓ Found organization: ${organizationId}\n`);
      }
    }
  } catch (err) {
    console.log(`❌ Setup failed: ${err.message}\n`);
    process.exit(1);
  }

  if (!audienceId || !organizationId) {
    console.log("❌ Could not find test data.\n");
    process.exit(1);
  }

  // TEST 1: Get Organization Relationship (by org + audience)
  console.log("TEST 1: GET /organizations/:id/relationship?audienceId=...");
  try {
    const res = await makeRequest(
      "GET",
      `${BASE_URL}/organizations/${organizationId}/relationship?audienceId=${audienceId}`,
    );

    if (res.status === 200 && res.body.success && res.body.relationship) {
      console.log("✓ PASS: Relationship retrieved");
      console.log(`  - Organization: ${res.body.organization.name}`);
      console.log(`  - Audience: ${res.body.audience.name}`);
      console.log(`  - Status: ${res.body.relationship.status}`);
      console.log(`  - Created: ${res.body.relationship.createdAt}`);
      passCount++;
    } else {
      console.log(`❌ FAIL: Status ${res.status}, response:`, res.body);
      failCount++;
    }
  } catch (err) {
    console.log(`❌ FAIL: ${err.message}`);
    failCount++;
  }
  console.log("");

  // TEST 2: Get All Relationships for Organization (no audienceId filter)
  console.log(
    "TEST 2: GET /organizations/:id/relationship (no audience filter)",
  );
  try {
    const res = await makeRequest(
      "GET",
      `${BASE_URL}/organizations/${organizationId}/relationship`,
    );

    if (
      res.status === 200 &&
      res.body.success &&
      Array.isArray(res.body.relationships)
    ) {
      console.log("✓ PASS: All relationships retrieved");
      console.log(`  - Organization: ${res.body.organization.name}`);
      console.log(`  - Relationships: ${res.body.relationships.length}`);
      if (res.body.relationships.length > 0) {
        console.log(
          `  - Sample statuses: ${res.body.relationships.map((r) => r.status).join(", ")}`,
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

  // TEST 3: Update Relationship Status to "reviewing"
  console.log(
    "TEST 3: PATCH /organizations/:id/relationship (status: reviewing)",
  );
  try {
    const res = await makeRequest(
      "PATCH",
      `${BASE_URL}/organizations/${organizationId}/relationship`,
      {
        body: {
          audienceId,
          status: "reviewing",
          notes: "Initial review started",
        },
      },
    );

    if (res.status === 200 && res.body.success && res.body.relationship) {
      console.log("✓ PASS: Relationship status updated");
      console.log(`  - Old status: new`);
      console.log(`  - New status: ${res.body.relationship.status}`);
      console.log(`  - Notes: ${res.body.relationship.notes}`);
      console.log(`  - Changed at: ${res.body.relationship.lastChangedAt}`);
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

  // TEST 4: Update to "qualified"
  console.log(
    "TEST 4: PATCH /organizations/:id/relationship (status: qualified)",
  );
  try {
    const res = await makeRequest(
      "PATCH",
      `${BASE_URL}/organizations/${organizationId}/relationship`,
      {
        body: {
          audienceId,
          status: "qualified",
          notes: "Excellent fit for multifamily investor audience",
        },
      },
    );

    if (res.status === 200 && res.body.success) {
      console.log("✓ PASS: Status updated to qualified");
      console.log(`  - Status: ${res.body.relationship.status}`);
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

  // TEST 5: Invalid status (should fail)
  console.log("TEST 5: PATCH with invalid status (should return 400)");
  try {
    const res = await makeRequest(
      "PATCH",
      `${BASE_URL}/organizations/${organizationId}/relationship`,
      {
        body: {
          audienceId,
          status: "invalid_status",
          notes: "This should fail",
        },
      },
    );

    if (res.status === 400 && !res.body.success) {
      console.log("✓ PASS: Invalid status correctly rejected");
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

  // TEST 6: Invalid organization ID (should return 404)
  console.log("TEST 6: GET with invalid org ID (should return 404)");
  try {
    const res = await makeRequest(
      "GET",
      `${BASE_URL}/organizations/invalid123/relationship?audienceId=${audienceId}`,
    );

    if (res.status === 404 && !res.body.success) {
      console.log("✓ PASS: Invalid org ID correctly rejected");
      console.log(`  - Error: ${res.body.error}`);
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

  // TEST 7: Get organizations by status
  console.log(
    "TEST 7: GET /organizations/by-status/:audienceId?status=qualified",
  );
  try {
    const res = await makeRequest(
      "GET",
      `${BASE_URL}/organizations/by-status/${audienceId}?status=qualified&limit=10`,
    );

    if (
      res.status === 200 &&
      res.body.success &&
      Array.isArray(res.body.organizations)
    ) {
      console.log("✓ PASS: Organizations by status retrieved");
      console.log(`  - Audience: ${res.body.audience.name}`);
      console.log(`  - Filter: status=qualified`);
      console.log(`  - Results: ${res.body.organizations.length}`);
      console.log(`  - Total: ${res.body.pagination.totalResults}`);
      console.log(`  - Summary by status:`, res.body.summary.byStatus);
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

  // TEST 8: Get organizations with all statuses
  console.log("TEST 8: GET /organizations/by-status/:audienceId (no filter)");
  try {
    const res = await makeRequest(
      "GET",
      `${BASE_URL}/organizations/by-status/${audienceId}?limit=5&page=1`,
    );

    if (res.status === 200 && res.body.success) {
      console.log("✓ PASS: Organizations retrieved (all statuses)");
      console.log(`  - Total: ${res.body.pagination.totalResults}`);
      console.log(`  - Returned: ${res.body.organizations.length}`);
      console.log(`  - Status distribution:`, res.body.summary.byStatus);
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

  // TEST 9: Invalid status filter
  console.log(
    "TEST 9: GET /organizations/by-status with invalid status filter",
  );
  try {
    const res = await makeRequest(
      "GET",
      `${BASE_URL}/organizations/by-status/${audienceId}?status=bad_status`,
    );

    if (res.status === 400 && !res.body.success) {
      console.log("✓ PASS: Invalid status filter correctly rejected");
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

  // TEST 10: Invalid audience ID for by-status
  console.log("TEST 10: GET /organizations/by-status with invalid audience ID");
  try {
    const res = await makeRequest(
      "GET",
      `${BASE_URL}/organizations/by-status/invalid123`,
    );

    if (res.status === 404 && !res.body.success) {
      console.log("✓ PASS: Invalid audience ID correctly rejected");
      console.log(`  - Error: ${res.body.error}`);
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
  console.log("========================================");
  console.log("Test Summary");
  console.log("========================================");
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

// Run tests with delay
setTimeout(runTests, 1000);
