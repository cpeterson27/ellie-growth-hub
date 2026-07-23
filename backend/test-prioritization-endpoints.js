/**
 * Test script for Organization Prioritization Retrieval API
 * Tests 8 scenarios covering Endpoint A and B
 */

const http = require("http");

const BASE_URL = "http://localhost:5001/api";

// Helper function to make HTTP requests
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

// Test suite
async function runTests() {
  console.log("========================================");
  console.log("Organization Prioritization API Tests");
  console.log("========================================\n");

  let passCount = 0;
  let failCount = 0;

  // First, get a real audience ID from the database
  console.log("Fetching test audience...");
  let audienceId = null;
  let organizationId = null;

  try {
    const audiencesRes = await makeRequest("GET", `${BASE_URL}/audience`);
    if (
      audiencesRes.status === 200 &&
      audiencesRes.body.audiences &&
      audiencesRes.body.audiences.length > 0
    ) {
      audienceId = audiencesRes.body.audiences[0]._id;
      console.log(`✓ Found audience: ${audienceId}\n`);

      // Get an organization for this audience
      const orgsRes = await makeRequest(
        "GET",
        `${BASE_URL}/audience/${audienceId}/organizations/prioritized`,
      );
      if (
        orgsRes.status === 200 &&
        orgsRes.body.organizations &&
        orgsRes.body.organizations.length > 0
      ) {
        organizationId = orgsRes.body.organizations[0]._id;
        console.log(
          `✓ Found organization: ${organizationId} with priority tier: ${orgsRes.body.organizations[0].priorityTier}\n`,
        );
      }
    } else {
      console.log("❌ No audiences found. Please run discovery first.\n");
      process.exit(1);
    }
  } catch (err) {
    console.log(`❌ Failed to fetch test data: ${err.message}\n`);
    process.exit(1);
  }

  if (!audienceId || !organizationId) {
    console.log("❌ Could not find valid test audience or organization.\n");
    process.exit(1);
  }

  // Test 1: Basic GET /audience/:id/organizations/prioritized
  console.log("TEST 1: Basic GET /audience/:id/organizations/prioritized");
  try {
    const res = await makeRequest(
      "GET",
      `${BASE_URL}/audience/${audienceId}/organizations/prioritized`,
    );

    if (
      res.status === 200 &&
      res.body.success &&
      Array.isArray(res.body.organizations) &&
      res.body.summary &&
      res.body.pagination
    ) {
      console.log("✓ PASS: Response structure correct");
      console.log(`  - Found ${res.body.organizations.length} organizations`);
      console.log(
        `  - Summary: hot=${res.body.summary.byTier.hot}, warm=${res.body.summary.byTier.warm}, cold=${res.body.summary.byTier.cold}`,
      );
      console.log(
        `  - Pagination: page ${res.body.pagination.page} of ${res.body.pagination.totalPages}`,
      );
      passCount++;
    } else {
      console.log("❌ FAIL: Unexpected response structure");
      console.log(`  - Status: ${res.status}`);
      console.log(`  - Body:`, res.body);
      failCount++;
    }
  } catch (err) {
    console.log(`❌ FAIL: ${err.message}`);
    failCount++;
  }
  console.log("");

  // Test 2: Tier filter (hot)
  console.log("TEST 2: Tier filter - GET with tier=hot");
  try {
    const res = await makeRequest(
      "GET",
      `${BASE_URL}/audience/${audienceId}/organizations/prioritized?tier=hot`,
    );

    if (res.status === 200 && res.body.success) {
      const allHot = res.body.organizations.every(
        (org) => org.priorityTier === "hot",
      );
      if (allHot) {
        console.log("✓ PASS: All organizations filtered to tier=hot");
        console.log(
          `  - Found ${res.body.organizations.length} hot organizations`,
        );
        passCount++;
      } else {
        console.log("❌ FAIL: Non-hot organizations found in results");
        failCount++;
      }
    } else {
      console.log(`❌ FAIL: Status ${res.status}`);
      failCount++;
    }
  } catch (err) {
    console.log(`❌ FAIL: ${err.message}`);
    failCount++;
  }
  console.log("");

  // Test 3: Score filter (minScore=80)
  console.log("TEST 3: Score filter - GET with minScore=80");
  try {
    const res = await makeRequest(
      "GET",
      `${BASE_URL}/audience/${audienceId}/organizations/prioritized?minScore=80`,
    );

    if (res.status === 200 && res.body.success) {
      const allAbove80 = res.body.organizations.every(
        (org) => org.priorityScore >= 80,
      );
      if (allAbove80) {
        console.log("✓ PASS: All scores >= 80");
        console.log(
          `  - Found ${res.body.organizations.length} organizations with score >= 80`,
        );
        passCount++;
      } else {
        console.log("❌ FAIL: Organizations below minScore found");
        failCount++;
      }
    } else {
      console.log(`❌ FAIL: Status ${res.status}`);
      failCount++;
    }
  } catch (err) {
    console.log(`❌ FAIL: ${err.message}`);
    failCount++;
  }
  console.log("");

  // Test 4: Pagination (page=1, limit=10)
  console.log("TEST 4: Pagination - GET with page=1&limit=10");
  try {
    const res = await makeRequest(
      "GET",
      `${BASE_URL}/audience/${audienceId}/organizations/prioritized?page=1&limit=10`,
    );

    if (res.status === 200 && res.body.success) {
      if (
        res.body.pagination.page === 1 &&
        res.body.pagination.limit === 10 &&
        res.body.organizations.length <= 10
      ) {
        console.log("✓ PASS: Pagination parameters correct");
        console.log(`  - Page: ${res.body.pagination.page}`);
        console.log(`  - Limit: ${res.body.pagination.limit}`);
        console.log(`  - Returned: ${res.body.organizations.length} items`);
        console.log(`  - Total results: ${res.body.pagination.totalResults}`);
        passCount++;
      } else {
        console.log("❌ FAIL: Pagination values incorrect");
        console.log(`  - Page: ${res.body.pagination.page}, expected 1`);
        console.log(`  - Limit: ${res.body.pagination.limit}, expected 10`);
        failCount++;
      }
    } else {
      console.log(`❌ FAIL: Status ${res.status}`);
      failCount++;
    }
  } catch (err) {
    console.log(`❌ FAIL: ${err.message}`);
    failCount++;
  }
  console.log("");

  // Test 5: Single organization priority - GET /audience/organizations/:id/priority
  console.log(
    "TEST 5: Single organization - GET /audience/organizations/:id/priority",
  );
  try {
    const res = await makeRequest(
      "GET",
      `${BASE_URL}/audience/organizations/${organizationId}/priority`,
    );

    if (
      res.status === 200 &&
      res.body.success &&
      res.body.organization &&
      res.body.priority
    ) {
      const hasRequiredFields =
        res.body.priority.score !== undefined &&
        res.body.priority.tier &&
        res.body.priority.signals &&
        res.body.priority.calculatedAt;

      if (hasRequiredFields) {
        console.log("✓ PASS: Organization priority details retrieved");
        console.log(`  - Organization: ${res.body.organization.name}`);
        console.log(
          `  - Priority: ${res.body.priority.score}/100 (${res.body.priority.tier})`,
        );
        console.log(`  - Calculated: ${res.body.priority.calculatedAt}`);
        console.log(
          `  - Signals: ${Object.keys(res.body.priority.signals).join(", ")}`,
        );
        passCount++;
      } else {
        console.log("❌ FAIL: Missing required fields in priority response");
        failCount++;
      }
    } else {
      console.log(`❌ FAIL: Status ${res.status}`);
      console.log(`  - Body:`, res.body);
      failCount++;
    }
  } catch (err) {
    console.log(`❌ FAIL: ${err.message}`);
    failCount++;
  }
  console.log("");

  // Test 6: Invalid audience ID
  console.log("TEST 6: Invalid audience ID - 404 error");
  try {
    const res = await makeRequest(
      "GET",
      `${BASE_URL}/audience/invalid123/organizations/prioritized`,
    );

    if (res.status === 404 && !res.body.success) {
      console.log("✓ PASS: Correctly returned 404 for invalid audience");
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

  // Test 7: Invalid tier
  console.log("TEST 7: Invalid tier parameter - 400 error");
  try {
    const res = await makeRequest(
      "GET",
      `${BASE_URL}/audience/${audienceId}/organizations/prioritized?tier=invalid`,
    );

    if (res.status === 400 && !res.body.success) {
      console.log("✓ PASS: Correctly rejected invalid tier");
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

  // Test 8: Invalid score
  console.log("TEST 8: Invalid score parameter - 400 error");
  try {
    const res = await makeRequest(
      "GET",
      `${BASE_URL}/audience/${audienceId}/organizations/prioritized?minScore=150`,
    );

    if (res.status === 400 && !res.body.success) {
      console.log("✓ PASS: Correctly rejected out-of-range score");
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

// Run tests with delay to ensure server is ready
setTimeout(runTests, 1000);
