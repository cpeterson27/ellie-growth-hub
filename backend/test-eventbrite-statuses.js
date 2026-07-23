#!/usr/bin/env node
/**
 * Test script to inspect actual Eventbrite attendee statuses
 */

require("dotenv").config();

const eventId = process.env.EVENTBRITE_EVENT_IDS?.split(",")[0];
const apiKey = process.env.EVENTBRITE_PRIVATE_TOKEN;

if (!apiKey) {
  console.error("❌ EVENTBRITE_PRIVATE_TOKEN not set in .env");
  process.exit(1);
}

if (!eventId) {
  console.error("❌ EVENTBRITE_EVENT_IDS not set in .env");
  process.exit(1);
}

async function inspectEventbriteAttendees() {
  console.log("════════════════════════════════════════════════");
  console.log("Eventbrite Attendee Status Inspector");
  console.log("════════════════════════════════════════════════\n");

  try {
    const endpoint = "https://www.eventbriteapi.com/v3";
    const url = `${endpoint}/events/${eventId}/attendees/?page=1&expand=profile`;

    console.log(`📋 Event ID: ${eventId}`);
    console.log(`🔗 URL: ${url}\n`);
    console.log("Fetching attendees...\n");

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      console.error(`❌ API Error: ${response.status} ${response.statusText}`);
      const errorData = await response.text();
      console.error("Response:", errorData);
      process.exit(1);
    }

    const data = await response.json();

    if (!data.attendees || data.attendees.length === 0) {
      console.log("⚠️  No attendees found in event");
      process.exit(0);
    }

    console.log(`✓ Found ${data.attendees.length} attendees\n`);

    // Extract unique statuses
    const statusCounts = {};
    const attendeeDetails = [];

    data.attendees.forEach((attendee, index) => {
      const status = attendee.status;
      statusCounts[status] = (statusCounts[status] || 0) + 1;

      attendeeDetails.push({
        index: index + 1,
        status: status,
        email: attendee.profile?.email || "N/A",
        name: attendee.profile?.name || attendee.profile?.first_name || "N/A",
        checked_in: attendee.checked_in,
      });
    });

    console.log("📊 Status Distribution:");
    console.log("════════════════════════════════════════════════");
    Object.entries(statusCounts).forEach(([status, count]) => {
      console.log(`  ${status}: ${count}`);
    });

    console.log("\n📝 Sample Attendee Data (first 5):");
    console.log("════════════════════════════════════════════════");
    attendeeDetails.slice(0, 5).forEach((attendee) => {
      console.log(
        `  [${attendee.index}] Status: "${attendee.status}" | Name: ${attendee.name} | Email: ${attendee.email}`,
      );
    });

    console.log("\n✅ Analysis:");
    console.log("════════════════════════════════════════════════");
    console.log(`Current filter expects: "Attending" or "Checked In"`);
    console.log(
      `Actual statuses found: ${Object.keys(statusCounts).join(", ")}`,
    );

    const allStatuses = Object.keys(statusCounts);
    const filteredOut = allStatuses.filter(
      (s) => s !== "Attending" && s !== "Checked In",
    );

    if (filteredOut.length > 0) {
      console.log(
        `\n⚠️  These statuses would be FILTERED OUT: ${filteredOut.join(", ")}`,
      );
    }

    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

inspectEventbriteAttendees();
