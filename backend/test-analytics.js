const http = require("http");

const BASE_URL = "http://localhost:5001/api/audience";

// Test helper
function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        "Content-Type": "application/json",
      },
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        resolve({
          status: res.statusCode,
          body: data ? JSON.parse(data) : null,
        });
      });
    });

    req.on("error", reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log(
    "═════════════════════════════════════════════════════════════════",
  );
  console.log("AUDIENCE ANALYTICS ENDPOINTS TESTING");
  console.log(
    "═════════════════════════════════════════════════════════════════\n",
  );

  try {
    // First, get an existing audience to test with
    console.log("📋 Step 1: Getting existing audiences...\n");
    const audiencesRes = await makeRequest("GET", `${BASE_URL}?limit=1`);
    if (!audiencesRes.body.audiences || audiencesRes.body.audiences.length === 0) {
      console.log("❌ No audiences found. Skipping tests.");
      return;
    }

    const testAudience = audiencesRes.body.audiences[0];
    const testId = testAudience._id;
    console.log(`✅ Found audience: ${testAudience.name} (ID: ${testId})\n`);

    // TEST 1: Analytics endpoint
    console.log(
      "═════════════════════════════════════════════════════════════════",
    );
    console.log("TEST 1: GET /api/audience/:id/analytics");
    console.log(
      "═════════════════════════════════════════════════════════════════\n",
    );

    const analyticsRes = await makeRequest("GET", `${BASE_URL}/${testId}/analytics`);
    console.log(`Status: ${analyticsRes.status}`);
    console.log("Response:");
    console.log(JSON.stringify(analyticsRes.body, null, 2));

    const test1Pass =
      analyticsRes.status === 200 &&
      analyticsRes.body.success &&
      analyticsRes.body.analytics?.summary &&
      analyticsRes.body.analytics?.quality &&
      analyticsRes.body.analytics?.latestRun !== undefined;

    console.log(`\n✅ TEST 1: ${test1Pass ? "PASS" : "FAIL"}\n`);

    // TEST 2: Runs endpoint with defaults
    console.log(
      "═════════════════════════════════════════════════════════════════",
    );
    console.log("TEST 2: GET /api/audience/:id/runs (defaults)");
    console.log(
      "═════════════════════════════════════════════════════════════════\n",
    );

    const runsRes = await makeRequest("GET", `${BASE_URL}/${testId}/runs`);
    console.log(`Status: ${runsRes.status}`);
    console.log("Response:");
    console.log(JSON.stringify(runsRes.body, null, 2));

    const test2Pass =
      runsRes.status === 200 &&
      runsRes.body.success &&
      Array.isArray(runsRes.body.runs) &&
      runsRes.body.pagination?.page === 1 &&
      runsRes.body.pagination?.limit === 25;

    console.log(`\n✅ TEST 2: ${test2Pass ? "PASS" : "FAIL"}\n`);

    // TEST 3: Runs with status filter (success)
    console.log(
      "═════════════════════════════════════════════════════════════════",
    );
    console.log("TEST 3: GET /api/audience/:id/runs?status=success");
    console.log(
      "═════════════════════════════════════════════════════════════════\n",
    );

    const runsFilterRes = await makeRequest(
      "GET",
      `${BASE_URL}/${testId}/runs?status=success`,
    );
    console.log(`Status: ${runsFilterRes.status}`);
    console.log("Response:");
    console.log(JSON.stringify(runsFilterRes.body, null, 2));

    const test3Pass =
      runsFilterRes.status === 200 &&
      runsFilterRes.body.success &&
      runsFilterRes.body.runs.every((run) => run.status === "success");

    console.log(`\n✅ TEST 3: ${test3Pass ? "PASS" : "FAIL"}\n`);

    // TEST 4: Organization summary
    console.log(
      "═════════════════════════════════════════════════════════════════",
    );
    console.log("TEST 4: GET /api/audience/:id/organizations/summary");
    console.log(
      "═════════════════════════════════════════════════════════════════\n",
    );

    const summaryRes = await makeRequest(
      "GET",
      `${BASE_URL}/${testId}/organizations/summary`,
    );
    console.log(`Status: ${summaryRes.status}`);
    console.log("Response:");
    console.log(JSON.stringify(summaryRes.body, null, 2));

    const test4Pass =
      summaryRes.status === 200 &&
      summaryRes.body.success &&
      summaryRes.body.organizationSummary?.totalOrganizations !== undefined &&
      summaryRes.body.organizationSummary?.scoreDistribution &&
      Array.isArray(summaryRes.body.topIndustries) &&
      Array.isArray(summaryRes.body.topLocations) &&
      Array.isArray(summaryRes.body.topOrganizations);

    console.log(`\n✅ TEST 4: ${test4Pass ? "PASS" : "FAIL"}\n`);

    // TEST 5: Organization summary with top parameter
    console.log(
      "═════════════════════════════════════════════════════════════════",
    );
    console.log("TEST 5: GET /api/audience/:id/organizations/summary?top=10");
    console.log(
      "═════════════════════════════════════════════════════════════════\n",
    );

    const summaryTopRes = await makeRequest(
      "GET",
      `${BASE_URL}/${testId}/organizations/summary?top=10`,
    );
    console.log(`Status: ${summaryTopRes.status}`);
    console.log("Response:");
    console.log(JSON.stringify(summaryTopRes.body, null, 2));

    const test5Pass =
      summaryTopRes.status === 200 &&
      summaryTopRes.body.success &&
      summaryTopRes.body.topIndustries.length <= 10 &&
      summaryTopRes.body.topLocations.length <= 10 &&
      summaryTopRes.body.topOrganizations.length <= 10;

    console.log(`\n✅ TEST 5: ${test5Pass ? "PASS" : "FAIL"}\n`);

    // TEST 6: Invalid audience ID
    console.log(
      "═════════════════════════════════════════════════════════════════",
    );
    console.log("TEST 6: Invalid audience ID");
    console.log(
      "═════════════════════════════════════════════════════════════════\n",
    );

    const invalidRes = await makeRequest("GET", `${BASE_URL}/invalid-id/analytics`);
    console.log(`Status: ${invalidRes.status}`);
    console.log("Response:");
    console.log(JSON.stringify(invalidRes.body, null, 2));

    const test6Pass = invalidRes.status === 404 && !invalidRes.body.success;

    console.log(`\n✅ TEST 6: ${test6Pass ? "PASS" : "FAIL"}\n`);

    // TEST 7: Invalid top parameter
    console.log(
      "═════════════════════════════════════════════════════════════════",
    );
    console.log("TEST 7: Invalid top parameter (top=999)");
    console.log(
      "═════════════════════════════════════════════════════════════════\n",
    );

    const invalidTopRes = await makeRequest(
      "GET",
      `${BASE_URL}/${testId}/organizations/summary?top=999`,
    );
    console.log(`Status: ${invalidTopRes.status}`);
    console.log("Response:");
    console.log(JSON.stringify(invalidTopRes.body, null, 2));

    const test7Pass = invalidTopRes.status === 400 && !invalidTopRes.body.success;

    console.log(`\n✅ TEST 7: ${test7Pass ? "PASS" : "FAIL"}\n`);

    // TEST 8: Invalid status filter
    console.log(
      "═════════════════════════════════════════════════════════════════",
    );
    console.log("TEST 8: Invalid status filter (status=invalid)");
    console.log(
      "═════════════════════════════════════════════════════════════════\n",
    );

    const invalidStatusRes = await makeRequest(
      "GET",
      `${BASE_URL}/${testId}/runs?status=invalid`,
    );
    console.log(`Status: ${invalidStatusRes.status}`);
    console.log("Response:");
    console.log(JSON.stringify(invalidStatusRes.body, null, 2));

    const test8Pass = invalidStatusRes.status === 400 && !invalidStatusRes.body.success;

    console.log(`\n✅ TEST 8: ${test8Pass ? "PASS" : "FAIL"}\n`);

    // Summary
    console.log(
      "═════════════════════════════════════════════════════════════════",
    );
    console.log("FINAL RESULTS");
    console.log(
      "═════════════════════════════════════════════════════════════════\n",
    );

    const allTests = [
      { name: "TEST 1: Analytics endpoint", pass: test1Pass },
      { name: "TEST 2: Runs endpoint (defaults)", pass: test2Pass },
      { name: "TEST 3: Runs with status filter", pass: test3Pass },
      { name: "TEST 4: Organization summary", pass: test4Pass },
      { name: "TEST 5: Organization summary (top=10)", pass: test5Pass },
      { name: "TEST 6: Invalid audience ID", pass: test6Pass },
      { name: "TEST 7: Invalid top parameter", pass: test7Pass },
      { name: "TEST 8: Invalid status filter", pass: test8Pass },
    ];

    allTests.forEach((test) => {
      console.log(`${test.pass ? "✅" : "❌"} ${test.name}`);
    });

    const passCount = allTests.filter((t) => t.pass).length;
    console.log(
      `\n✅ ${passCount}/${allTests.length} TESTS PASSED`,
    );

    if (passCount === allTests.length) {
      console.log("\n🎉 ALL TESTS PASSED!\n");
    } else {
      console.log(
        `\n⚠️  ${allTests.length - passCount} tests failed\n`,
      );
    }
  } catch (error) {
    console.error("Test error:", error);
  }
}

runTests();
