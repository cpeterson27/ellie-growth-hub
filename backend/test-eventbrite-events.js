#!/usr/bin/env node
/**
 * Test script to list Eventbrite user's events and check for attendees
 */

require("dotenv").config();

const apiKey = process.env.EVENTBRITE_PRIVATE_TOKEN;

if (!apiKey) {
  console.error("❌ EVENTBRITE_PRIVATE_TOKEN not set in .env");
  process.exit(1);
}

async function inspectEventbriteEvents() {
  console.log("════════════════════════════════════════════════");
  console.log("Eventbrite Events Inspector");
  console.log("════════════════════════════════════════════════\n");

  try {
    const endpoint = "https://www.eventbriteapi.com/v3";

    // First, get user info
    console.log("Fetching user info...");
    const userResponse = await fetch(`${endpoint}/users/me/`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!userResponse.ok) {
      console.error(
        `❌ User API Error: ${userResponse.status} ${userResponse.statusText}`,
      );
      process.exit(1);
    }

    const userData = await userResponse.json();
    console.log(`✓ User: ${userData.name}`);
    console.log(`✓ User ID: ${userData.id}\n`);

    // Get user's organizations
    console.log("Fetching organizations...");
    const orgsResponse = await fetch(`${endpoint}/users/me/organizations/`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!orgsResponse.ok) {
      console.error(
        `❌ Organizations API Error: ${orgsResponse.status} ${orgsResponse.statusText}`,
      );
      process.exit(1);
    }

    const orgsData = await orgsResponse.json();
    if (!orgsData.organizations || orgsData.organizations.length === 0) {
      console.log("⚠️  No organizations found");
      process.exit(0);
    }

    console.log(`✓ Found ${orgsData.organizations.length} organization(s)\n`);

    // Get events from first organization
    const orgId = orgsData.organizations[0].id;
    console.log(`Fetching events for organization ${orgId}...`);

    const eventsResponse = await fetch(
      `${endpoint}/organizations/${orgId}/events/`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      },
    );

    if (!eventsResponse.ok) {
      console.error(
        `❌ Events API Error: ${eventsResponse.status} ${eventsResponse.statusText}`,
      );
      process.exit(1);
    }

    const eventsData = await eventsResponse.json();
    if (!eventsData.events || eventsData.events.length === 0) {
      console.log("⚠️  No events found in organization");
      process.exit(0);
    }

    console.log(`✓ Found ${eventsData.events.length} event(s)\n`);

    // List events and their attendee counts
    console.log("📊 Events with potential attendees:");
    console.log("════════════════════════════════════════════════");

    for (const event of eventsData.events) {
      // Fetch attendees for this event
      const attendeesResponse = await fetch(
        `${endpoint}/events/${event.id}/attendees/?page=1`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
        },
      );

      if (attendeesResponse.ok) {
        const attendeesData = await attendeesResponse.json();
        const attendeeCount = attendeesData.pagination?.total_items || 0;

        console.log(`\n  Event: ${event.name}`);
        console.log(`  ID: ${event.id}`);
        console.log(`  Status: ${event.status}`);
        console.log(`  Attendees: ${attendeeCount}`);

        if (attendeeCount > 0) {
          // Log statuses for events with attendees
          const statuses = attendeesData.attendees
            .map((a) => a.status)
            .reduce((acc, status) => {
              acc[status] = (acc[status] || 0) + 1;
              return acc;
            }, {});

          console.log(`  Status breakdown:`);
          Object.entries(statuses).forEach(([status, count]) => {
            console.log(`    - ${status}: ${count}`);
          });
        }
      }
    }

    console.log("\n════════════════════════════════════════════════\n✓ Done\n");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

inspectEventbriteEvents();
