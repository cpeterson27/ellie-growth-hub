#!/usr/bin/env node
/**
 * Test Eventbrite attendee filtering with actual Eventbrite API response formats
 */

const mongoose = require("mongoose");
require("dotenv").config();
const EventbriteAdapter = require("./services/integrations/EventbriteAdapter");

async function runTests() {
  try {
    console.log("════════════════════════════════════════════════");
    console.log("Eventbrite Filtering Tests");
    console.log("════════════════════════════════════════════════\n");

    await mongoose.connect(process.env.MONGO_URI);
    console.log("✓ Connected to MongoDB\n");

    const adapter = new EventbriteAdapter();

    // Test 1: Old capitalized format (should still work)
    console.log("═══ Test 1: Capitalized Status Format ═══\n");
    const capitalizedData = [
      {
        id: "evt-001",
        status: "Attending",
        checked_in: false,
        profile: {
          name: "Alice Smith",
          first_name: "Alice",
          last_name: "Smith",
          email: "alice@example.com",
          company: "Tech Co",
        },
      },
      {
        id: "evt-002",
        status: "Checked In",
        checked_in: true,
        profile: {
          name: "Bob Jones",
          first_name: "Bob",
          last_name: "Jones",
          email: "bob@example.com",
          company: "Growth Inc",
        },
      },
      {
        id: "evt-003",
        status: "Not Attending",
        checked_in: false,
        profile: {
          name: "Carol White",
          first_name: "Carol",
          last_name: "White",
          email: "carol@example.com",
          company: "Other",
        },
      },
    ];

    const result1 = adapter.mapEventbriteAttendees(capitalizedData);
    console.log(`Mapped ${result1.length} attendees (expected 2)\n`);
    if (result1.length !== 2) {
      throw new Error(
        `Expected 2 attendees from capitalized format, got ${result1.length}`,
      );
    }
    console.log("✓ Capitalized format works\n");

    // Test 2: Lowercase format (actual Eventbrite API format)
    console.log("═══ Test 2: Lowercase Status Format ═══\n");
    const lowercaseData = [
      {
        id: "evt-101",
        status: "attending",
        checked_in: false,
        profile: {
          name: "Diana Garcia",
          first_name: "Diana",
          last_name: "Garcia",
          email: "diana@example.com",
          company: "Tech Co",
        },
      },
      {
        id: "evt-102",
        status: "checked_in",
        checked_in: true,
        profile: {
          name: "Eve Johnson",
          first_name: "Eve",
          last_name: "Johnson",
          email: "eve@example.com",
          company: "Growth Inc",
        },
      },
      {
        id: "evt-103",
        status: "not_attending",
        checked_in: false,
        profile: {
          name: "Frank Miller",
          first_name: "Frank",
          last_name: "Miller",
          email: "frank@example.com",
          company: "Other",
        },
      },
      {
        id: "evt-104",
        status: "tentative",
        checked_in: false,
        profile: {
          name: "Grace Lee",
          first_name: "Grace",
          last_name: "Lee",
          email: "grace@example.com",
          company: "Other",
        },
      },
    ];

    const result2 = adapter.mapEventbriteAttendees(lowercaseData);
    console.log(`Mapped ${result2.length} attendees (expected 2)\n`);
    if (result2.length !== 2) {
      throw new Error(
        `Expected 2 attendees from lowercase format, got ${result2.length}`,
      );
    }
    console.log("✓ Lowercase format works\n");

    // Test 3: Mixed format
    console.log("═══ Test 3: Mixed Status Formats ═══\n");
    const mixedData = [
      {
        id: "evt-201",
        status: "Attending",
        checked_in: false,
        profile: {
          name: "Henry Brown",
          first_name: "Henry",
          last_name: "Brown",
          email: "henry@example.com",
          company: "Tech Co",
        },
      },
      {
        id: "evt-202",
        status: "checked_in",
        checked_in: true,
        profile: {
          name: "Iris Wilson",
          first_name: "Iris",
          last_name: "Wilson",
          email: "iris@example.com",
          company: "Growth Inc",
        },
      },
      {
        id: "evt-203",
        status: "attending",
        checked_in: false,
        profile: {
          name: "Jack Davis",
          first_name: "Jack",
          last_name: "Davis",
          email: "jack@example.com",
          company: "Other",
        },
      },
    ];

    const result3 = adapter.mapEventbriteAttendees(mixedData);
    console.log(`Mapped ${result3.length} attendees (expected 3)\n`);
    if (result3.length !== 3) {
      throw new Error(
        `Expected 3 attendees from mixed format, got ${result3.length}`,
      );
    }
    console.log("✓ Mixed format works\n");

    // Test 4: Email validation still works
    console.log("═══ Test 4: Email Validation ═══\n");
    const noEmailData = [
      {
        id: "evt-301",
        status: "attending",
        checked_in: false,
        profile: {
          name: "Kate Brown",
          first_name: "Kate",
          last_name: "Brown",
          email: "",
          company: "Tech Co",
        },
      },
      {
        id: "evt-302",
        status: "attending",
        checked_in: false,
        profile: {
          name: "Leo Martin",
          first_name: "Leo",
          last_name: "Martin",
          email: "leo@example.com",
          company: "Growth Inc",
        },
      },
    ];

    const result4 = adapter.mapEventbriteAttendees(noEmailData);
    console.log(
      `Mapped ${result4.length} attendees (expected 1 - no email filtered)\n`,
    );
    if (result4.length !== 1) {
      throw new Error(
        `Expected 1 attendee (1 should be filtered for no email), got ${result4.length}`,
      );
    }
    console.log("✓ Email validation works\n");

    // Test 5: Checked in flag works
    console.log("═══ Test 5: Checked In Flag ═══\n");
    const checkedInData = [
      {
        id: "evt-401",
        status: "not_attending",
        checked_in: true,
        profile: {
          name: "Mia Clark",
          first_name: "Mia",
          last_name: "Clark",
          email: "mia@example.com",
          company: "Tech Co",
        },
      },
      {
        id: "evt-402",
        status: "tentative",
        checked_in: false,
        profile: {
          name: "Noah Lewis",
          first_name: "Noah",
          last_name: "Lewis",
          email: "noah@example.com",
          company: "Growth Inc",
        },
      },
    ];

    const result5 = adapter.mapEventbriteAttendees(checkedInData);
    console.log(
      `Mapped ${result5.length} attendees (expected 1 - checked_in=true overrides status)\n`,
    );
    if (result5.length !== 1) {
      throw new Error(
        `Expected 1 attendee (checked_in flag should include even if status is not_attending), got ${result5.length}`,
      );
    }
    console.log("✓ Checked in flag works\n");

    console.log("════════════════════════════════════════════════");
    console.log("Test Summary");
    console.log("════════════════════════════════════════════════");
    console.log("✓ Passed: 5");
    console.log("✗ Failed: 0");
    console.log("Total: 5");
    console.log("\n🎉 ALL FILTERING TESTS PASSED!");

    process.exit(0);
  } catch (error) {
    console.error("\n❌ TEST FAILED:", error.message);
    process.exit(1);
  }
}

runTests();
