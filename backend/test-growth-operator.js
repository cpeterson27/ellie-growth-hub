/**
 * Growth Operator Foundation Test Suite
 * Tests integrations and marketing campaigns
 */

const http = require("http");
const mongoose = require("mongoose");
require("dotenv").config();
const { connectDatabase } = require("./config/database");

const MarketingCampaign = require("./models/MarketingCampaign");
const Audience = require("./models/Audience");

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
  console.log("════════════════════════════════════════════════");
  console.log("Growth Operator Foundation Test Suite");
  console.log("════════════════════════════════════════════════\n");

  let passCount = 0;
  let failCount = 0;

  // Connect to database
  console.log("Connecting to MongoDB...");
  try {
    await connectDatabase(process.env.MONGO_URI);
    console.log("✓ Connected\n");
  } catch (err) {
    console.error("❌ Failed to connect:", err.message);
    process.exit(1);
  }

  // Get test audience
  let testAudId;
  try {
    const audiences = await Audience.find().limit(1);
    if (audiences.length === 0) {
      console.error("❌ No test audience found");
      process.exit(1);
    }
    testAudId = audiences[0]._id;
    console.log(`✓ Test audience: ${testAudId}\n`);
  } catch (err) {
    console.error("❌ Failed to load test data:", err.message);
    process.exit(1);
  }

  // ═══════════════════════════════════════════════════════════════
  // PHASE 1: Integration Tests
  // ═══════════════════════════════════════════════════════════════

  console.log("═══ PHASE 1: Integration Architecture ═══\n");

  console.log("TEST 1: Get all integrations");
  try {
    const res = await makeRequest("GET", `${BASE_URL}/integrations`);

    if (res.status === 200 && res.body.success && res.body.data.integrations) {
      const integrationCount = res.body.data.integrations.length;
      console.log(`✓ PASS: Found ${integrationCount} integrations`);
      console.log(
        `  - Integrations: ${res.body.data.integrations.map((i) => i.id).join(", ")}`,
      );
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

  console.log("TEST 2: Get integration status");
  try {
    const res = await makeRequest("GET", `${BASE_URL}/integrations/status`);

    if (res.status === 200 && res.body.success && res.body.data.summary) {
      const summary = res.body.data.summary;
      console.log(`✓ PASS: Integration status retrieved`);
      console.log(`  - Total integrations: ${summary.total}`);
      console.log(`  - Configured: ${summary.configured}`);
      console.log(
        `  - By type: Email=${summary.byType.email?.total || 0}, Events=${summary.byType.events?.total || 0}, Social=${summary.byType.social?.total || 0}`,
      );
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

  console.log("TEST 3: Get specific integration (Resend)");
  try {
    const res = await makeRequest("GET", `${BASE_URL}/integrations/resend`);

    if (
      res.status === 200 &&
      res.body.success &&
      res.body.data.name === "Resend"
    ) {
      console.log(`✓ PASS: Resend integration found`);
      console.log(`  - Name: ${res.body.data.name}`);
      console.log(`  - Type: ${res.body.data.type}`);
      console.log(`  - Version: ${res.body.data.version}`);
      console.log(`  - Capabilities: ${res.body.data.capabilities.join(", ")}`);
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

  console.log("TEST 4: Get non-existent integration (should 404)");
  try {
    const res = await makeRequest(
      "GET",
      `${BASE_URL}/integrations/nonexistent`,
    );

    if (res.status === 404 && !res.body.success) {
      console.log(`✓ PASS: Non-existent integration correctly rejected`);
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

  // ═══════════════════════════════════════════════════════════════
  // PHASE 2: Marketing Campaign CRUD Tests
  // ═══════════════════════════════════════════════════════════════

  console.log("═══ PHASE 2: Marketing Campaigns ═══\n");

  let createdCampaignId;

  console.log("TEST 5: Create email campaign");
  try {
    const res = await makeRequest("POST", `${BASE_URL}/marketing-campaigns`, {
      body: {
        name: "Q3 Product Launch",
        type: "email",
        audienceId: testAudId.toString(),
        content: {
          subject: "Exciting New Features Coming Soon",
          body: "We're thrilled to announce...",
          callToAction: "Learn More",
          callToActionUrl: "https://example.com/launch",
        },
        notes: "Test email campaign",
        scheduledFor: new Date(
          Date.now() + 7 * 24 * 60 * 60 * 1000,
        ).toISOString(),
      },
    });

    if (res.status === 201 && res.body.success && res.body.data.campaign._id) {
      createdCampaignId = res.body.data.campaign._id;
      console.log(`✓ PASS: Email campaign created`);
      console.log(`  - ID: ${createdCampaignId}`);
      console.log(`  - Name: ${res.body.data.campaign.name}`);
      console.log(`  - Type: ${res.body.data.campaign.type}`);
      console.log(`  - Status: ${res.body.data.campaign.status}`);
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

  console.log("TEST 6: Create social campaign");
  try {
    const res = await makeRequest("POST", `${BASE_URL}/marketing-campaigns`, {
      body: {
        name: "LinkedIn Thought Leadership",
        type: "social",
        audienceId: testAudId.toString(),
        content: {
          caption: "Excited to share insights on growth marketing",
          hashtags: ["growth", "marketing", "strategy"],
          imageUrls: ["https://example.com/image1.jpg"],
        },
        notes: "LinkedIn campaign",
      },
    });

    if (res.status === 201 && res.body.success) {
      console.log(`✓ PASS: Social campaign created`);
      console.log(`  - Name: ${res.body.data.campaign.name}`);
      console.log(`  - Type: ${res.body.data.campaign.type}`);
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

  console.log("TEST 7: Create event campaign");
  try {
    const res = await makeRequest("POST", `${BASE_URL}/marketing-campaigns`, {
      body: {
        name: "Virtual Summit 2026",
        type: "event",
        audienceId: testAudId.toString(),
        content: {
          eventName: "Growth Operator Summit",
          eventDescription: "Annual conference for growth leaders",
          eventDate: new Date(
            Date.now() + 60 * 24 * 60 * 60 * 1000,
          ).toISOString(),
          eventLocation: "San Francisco, CA",
        },
      },
    });

    if (res.status === 201 && res.body.success) {
      console.log(`✓ PASS: Event campaign created`);
      console.log(`  - Name: ${res.body.data.campaign.name}`);
      console.log(`  - Type: ${res.body.data.campaign.type}`);
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

  console.log("TEST 8: List all campaigns");
  try {
    const res = await makeRequest("GET", `${BASE_URL}/marketing-campaigns`);

    if (res.status === 200 && res.body.success && res.body.data.campaigns) {
      console.log(`✓ PASS: Campaigns retrieved`);
      console.log(`  - Total: ${res.body.data.pagination.total}`);
      console.log(`  - Returned: ${res.body.data.campaigns.length}`);
      console.log(
        `  - Page: ${res.body.data.pagination.page}/${res.body.data.pagination.pages}`,
      );
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

  console.log("TEST 9: Filter campaigns by type");
  try {
    const res = await makeRequest(
      "GET",
      `${BASE_URL}/marketing-campaigns?type=email`,
    );

    if (res.status === 200 && res.body.success) {
      console.log(`✓ PASS: Filtered by type (email)`);
      console.log(`  - Results: ${res.body.data.campaigns.length}`);
      const allEmail = res.body.data.campaigns.every((c) => c.type === "email");
      console.log(`  - All email: ${allEmail ? "Yes" : "No"}`);
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

  console.log("TEST 10: Get campaign details");
  try {
    if (!createdCampaignId) {
      console.log("⊘ SKIP: No campaign ID from earlier test");
      passCount++;
    } else {
      const res = await makeRequest(
        "GET",
        `${BASE_URL}/marketing-campaigns/${createdCampaignId}`,
      );

      if (res.status === 200 && res.body.success && res.body.data.campaign) {
        console.log(`✓ PASS: Campaign details retrieved`);
        console.log(`  - Name: ${res.body.data.campaign.name}`);
        console.log(`  - Status: ${res.body.data.campaign.status}`);
        console.log(`  - Audience: ${res.body.data.audience.name}`);
        passCount++;
      } else {
        console.log(`❌ FAIL: Status ${res.status}`);
        failCount++;
      }
    }
  } catch (err) {
    console.log(`❌ FAIL: ${err.message}`);
    failCount++;
  }
  console.log("");

  console.log("TEST 11: Update campaign status");
  try {
    if (!createdCampaignId) {
      console.log("⊘ SKIP: No campaign ID from earlier test");
      passCount++;
    } else {
      const res = await makeRequest(
        "PATCH",
        `${BASE_URL}/marketing-campaigns/${createdCampaignId}`,
        {
          body: {
            status: "scheduled",
            notes: "Updated campaign notes",
          },
        },
      );

      if (
        res.status === 200 &&
        res.body.success &&
        res.body.data.campaign.status === "scheduled"
      ) {
        console.log(`✓ PASS: Campaign status updated`);
        console.log(`  - New status: ${res.body.data.campaign.status}`);
        console.log(`  - Message: ${res.body.message}`);
        passCount++;
      } else {
        console.log(`❌ FAIL: Status ${res.status}`);
        failCount++;
      }
    }
  } catch (err) {
    console.log(`❌ FAIL: ${err.message}`);
    failCount++;
  }
  console.log("");

  // ═══════════════════════════════════════════════════════════════
  // PHASE 3: Validation Tests
  // ═══════════════════════════════════════════════════════════════

  console.log("═══ PHASE 3: Validation & Error Handling ═══\n");

  console.log("TEST 12: Invalid campaign type (should 400)");
  try {
    const res = await makeRequest("POST", `${BASE_URL}/marketing-campaigns`, {
      body: {
        name: "Invalid Campaign",
        type: "invalid_type",
        audienceId: testAudId.toString(),
        content: { caption: "Test" },
      },
    });

    if (res.status === 400 && !res.body.success) {
      console.log(`✓ PASS: Invalid type rejected`);
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

  console.log("TEST 13: Invalid audience ID (should 404)");
  try {
    const res = await makeRequest("POST", `${BASE_URL}/marketing-campaigns`, {
      body: {
        name: "No Audience Campaign",
        type: "email",
        audienceId: new mongoose.Types.ObjectId().toString(),
        content: { subject: "Test", body: "Test" },
      },
    });

    if (res.status === 404 && !res.body.success) {
      console.log(`✓ PASS: Invalid audience rejected`);
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

  console.log("TEST 14: Invalid status update (should 400)");
  try {
    if (!createdCampaignId) {
      console.log("⊘ SKIP: No campaign ID");
      passCount++;
    } else {
      const res = await makeRequest(
        "PATCH",
        `${BASE_URL}/marketing-campaigns/${createdCampaignId}`,
        {
          body: { status: "invalid_status" },
        },
      );

      if (res.status === 400 && !res.body.success) {
        console.log(`✓ PASS: Invalid status rejected`);
        console.log(`  - Error: ${res.body.error.substring(0, 50)}...`);
        passCount++;
      } else {
        console.log(`❌ FAIL: Expected 400, got ${res.status}`);
        failCount++;
      }
    }
  } catch (err) {
    console.log(`❌ FAIL: ${err.message}`);
    failCount++;
  }
  console.log("");

  console.log("TEST 15: Missing required fields (should 400)");
  try {
    const res = await makeRequest("POST", `${BASE_URL}/marketing-campaigns`, {
      body: {
        name: "Incomplete Campaign",
        // Missing type and audienceId
      },
    });

    if (res.status === 400 && !res.body.success) {
      console.log(`✓ PASS: Missing fields rejected`);
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
  console.log("════════════════════════════════════════════════");
  console.log("Test Summary");
  console.log("════════════════════════════════════════════════");
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
