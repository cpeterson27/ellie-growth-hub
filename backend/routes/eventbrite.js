const express = require("express");
const Event = require("../models/Event");

const { getEvent, getEvents } = require("../services/eventbrite");

const router = express.Router();

// ==================================
// GET AVAILABLE EVENTBRITE EVENTS
// Used for dropdown selection
// ==================================
router.get("/events", async (req, res) => {
  try {
    const events = await getEvents();

    res.status(200).json(events);
  } catch (error) {
    console.error(
      "EVENTBRITE FETCH ERROR:",
      error.response?.data || error.message,
    );

    res.status(500).json({
      error: "Failed to fetch Eventbrite events",
    });
  }
});

// ==================================
// IMPORT EVENTBRITE EVENT
// Eventbrite -> Mongo Event
// ==================================
router.post("/import/:eventId", async (req, res) => {
  try {
    const { eventId } = req.params;

    if (!eventId) {
      return res.status(400).json({
        error: "Eventbrite event ID is required",
      });
    }

    // Fetch event from Eventbrite
    const eventbriteEvent = await getEvent(eventId);

    // Prevent duplicate imports
    const existingEvent = await Event.findOne({
      "integrations.eventbrite.eventId": eventbriteEvent.id,
    });

    if (existingEvent) {
      return res.status(200).json({
        message: "Event already imported",

        event: existingEvent,
      });
    }

    // Create local event record
    const newEvent = await Event.create({
      name: eventbriteEvent.name?.text || "Untitled Event",

      description: eventbriteEvent.description?.text || "",

      startDate: eventbriteEvent.start?.utc || null,

      endDate: eventbriteEvent.end?.utc || null,

      ticketPrice: 497,

      ticketGoal: 50,

      ticketsSold: 0,

      audience: [
        "Airbnb investors",

        "Real estate investors",

        "House flippers",

        "Property management companies",

        "Multifamily investors",
      ],

      channels: ["Eventbrite", "Email", "Partners"],

      location: eventbriteEvent.online_event
        ? "Online"
        : eventbriteEvent.venue?.name || "",

      integrations: {
        eventbrite: {
          enabled: true,

          eventId: eventbriteEvent.id,

          url: eventbriteEvent.url,
        },
      },

      status: "active",
    });

    return res.status(201).json({
      message: "Event imported successfully",

      event: newEvent,
    });
  } catch (error) {
    console.error(
      "EVENTBRITE IMPORT ERROR:",

      error.response?.data || error.message,
    );

    return res.status(500).json({
      error: "Failed to import Eventbrite event",
    });
  }
});

// ==================================
// SYNC EVENTBRITE ATTENDEES
// Eventbrite attendees -> Contacts
// ==================================

const eventbriteSyncService = require("../services/eventbriteSyncService");

/**
 * POST /api/eventbrite/sync-attendees
 * Trigger Eventbrite attendee sync to contacts
 */
router.post("/sync-attendees", async (req, res) => {
  try {
    const result = await eventbriteSyncService.syncEventbriteAttendees();

    res.json({
      success: true,
      data: result,
      message: result.message,
    });
  } catch (error) {
    console.error("POST /eventbrite/sync-attendees error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to sync Eventbrite attendees",
    });
  }
});

/**
 * POST /api/eventbrite/test-connection
 * Test Eventbrite API connection
 */
router.post("/test-connection", async (req, res) => {
  try {
    const result = await eventbriteSyncService.testConnection();

    if (result.connected) {
      res.json({
        success: true,
        data: result,
        message: result.message,
      });
    } else {
      res.status(400).json({
        success: false,
        data: result,
        message: result.message,
      });
    }
  } catch (error) {
    console.error("POST /eventbrite/test-connection error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to test Eventbrite connection",
    });
  }
});

/**
 * GET /api/eventbrite/attendee-sync-status
 * Get Eventbrite attendee sync status
 */
router.get("/attendee-sync-status", async (req, res) => {
  try {
    const status = await eventbriteSyncService.getSyncStatus();

    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    console.error("GET /eventbrite/attendee-sync-status error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to retrieve sync status",
    });
  }
});

/**
 * GET /api/eventbrite/sync-history
 * Get Eventbrite sync history
 */
router.get("/sync-history", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 10, 100);
    const history = await eventbriteSyncService.getSyncHistory(limit);

    res.json({
      success: true,
      data: history,
    });
  } catch (error) {
    console.error("GET /eventbrite/sync-history error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to retrieve sync history",
    });
  }
});

module.exports = router;
