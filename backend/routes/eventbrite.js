const express = require("express");
const crypto = require("crypto");
const axios = require("axios");
const Event = require("../models/Event");
const IntegrationConnection = require("../models/IntegrationConnection");
const WorkspaceMembership = require("../models/WorkspaceMembership");
const { runWithWorkspace } = require("../tenancy/workspaceContext");

const { getEvent, getEvents } = require("../services/eventbrite");
const eventbriteOAuthService = require("../services/eventbriteOAuthService");
const eventbriteLogisticsService = require("../services/eventbriteLogisticsService");
const eventbriteManagementService = require("../services/eventbriteManagementService");
const { retrieveCompleteListing } = require("../services/eventbriteListingService");

const router = express.Router();

const EVENTBRITE_WEBHOOK_ACTIONS = [
  "attendee.updated",
  "barcode.checked_in",
  "barcode.un_checked_in",
  "event.created",
  "event.published",
  "event.unpublished",
  "event.updated",
  "order.placed",
  "order.refunded",
  "order.updated",
  "organizer.updated",
  "ticket_class.created",
  "ticket_class.deleted",
  "ticket_class.updated",
  "venue.updated",
];

function webhookToken() {
  return String(process.env.EVENTBRITE_WEBHOOK_TOKEN || "").trim();
}

function backendBaseUrl(req) {
  const configured = String(process.env.PUBLIC_BACKEND_URL || process.env.BACKEND_URL || "").trim().replace(/\/$/, "");
  if (configured) return configured;
  const host = req.get("x-forwarded-host") || req.get("host");
  const protocol = req.get("x-forwarded-proto") || req.protocol || "https";
  return `${protocol}://${host}`.replace(/\/$/, "");
}

function webhookReceiverUrl(req) {
  const url = new URL(`${backendBaseUrl(req)}/api/eventbrite/webhook`);
  url.searchParams.set("token", webhookToken());
  return url.toString();
}

function maskedWebhookReceiverUrl(req) {
  const url = new URL(`${backendBaseUrl(req)}/api/eventbrite/webhook`);
  url.searchParams.set("token", "••••");
  return url.toString();
}

function isEventbriteTestRequest(req) {
  const action = String(req.body?.config?.action || req.get("x-eventbrite-event") || "").toLowerCase();
  const apiUrl = String(req.body?.api_url || "");
  return action === "test" || apiUrl.includes("{api-endpoint-to-fetch-object-details}");
}

async function recordWebhookStatus(req, status, details = {}) {
  try {
    const now = new Date();
    await IntegrationConnection.findOneAndUpdate(
      { provider: "eventbrite" },
      {
        $set: {
          lastVerifiedAt: now,
          "metadata.webhook.configured": Boolean(webhookToken()),
          "metadata.webhook.lastReceivedAt": now,
          "metadata.webhook.lastStatus": status,
          "metadata.webhook.lastAction":
            req.get("x-eventbrite-event") || req.body?.config?.action || "",
          "metadata.webhook.lastDeliveryId": req.get("x-eventbrite-delivery") || "",
          "metadata.webhook.lastEventbriteResource": req.body?.api_url || "",
          "metadata.webhook.lastLocalEventId": details.localEventId || "",
          "metadata.webhook.lastMessage": details.message || "",
        },
        $setOnInsert: {
          provider: "eventbrite",
          status: "configured",
        },
      },
      { upsert: true, new: true },
    );
  } catch (error) {
    console.error("EVENTBRITE WEBHOOK STATUS RECORD ERROR:", error.message);
  }
}

function eventbriteHeaders(accessToken) {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

async function findExistingWebhook(accessToken, organizationId, receiverUrl) {
  const response = await axios.get(
    `https://www.eventbriteapi.com/v3/organizations/${organizationId}/webhooks/`,
    { headers: eventbriteHeaders(accessToken) },
  );
  const receiverPath = new URL(receiverUrl).pathname;
  return (response.data?.webhooks || []).find((webhook) => {
    const endpointUrl = String(webhook.endpoint_url || webhook.endpointUrl || "");
    try {
      const parsed = new URL(endpointUrl);
      return parsed.pathname === receiverPath;
    } catch {
      return endpointUrl.includes(receiverPath);
    }
  });
}

async function createEventbriteWebhook(accessToken, organizationId, receiverUrl) {
  const endpoint = `https://www.eventbriteapi.com/v3/organizations/${organizationId}/webhooks/`;
  const payload = {
    endpoint_url: receiverUrl,
    actions: EVENTBRITE_WEBHOOK_ACTIONS.join(","),
  };
  try {
    const response = await axios.post(endpoint, payload, {
      headers: eventbriteHeaders(accessToken),
    });
    return response.data;
  } catch (error) {
    if (error.response?.status !== 400) throw error;
    const response = await axios.post(endpoint, { webhook: payload }, {
      headers: eventbriteHeaders(accessToken),
    });
    return response.data;
  }
}

async function recordWebhookConfiguration(req, details) {
  const now = new Date();
  await IntegrationConnection.findOneAndUpdate(
    { provider: "eventbrite" },
    {
      $set: {
        lastVerifiedAt: now,
        "metadata.webhook.configured": Boolean(webhookToken()),
        "metadata.webhook.autoConfiguredAt": now,
        "metadata.webhook.providerWebhookId": details.providerWebhookId || "",
        "metadata.webhook.providerOrganizationId": details.organizationId || "",
        "metadata.webhook.lastMessage": details.message || "",
      },
      $setOnInsert: {
        provider: "eventbrite",
        status: "configured",
      },
    },
    { upsert: true, new: true },
  );
}

router.post("/webhook", async (req, res) => {
  const expected = webhookToken();
  const provided = String(req.query.token || req.get("x-ellie-webhook-token") || "");
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  if (!expected || providedBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(providedBuffer, expectedBuffer)) {
    return res.status(401).json({ error: "Invalid webhook token" });
  }

  if (isEventbriteTestRequest(req)) {
    await recordWebhookStatus(req, "verified", {
      message: "Test received. Eventbrite can reach Growth Operator automatically.",
    });
    return res.status(202).json({ accepted: true, test: true });
  }

  const apiUrl = String(req.body?.api_url || "");
  let parsed;
  try {
    parsed = new URL(apiUrl);
  } catch {
    return res.status(400).json({ error: "Invalid Eventbrite resource URL" });
  }
  if (parsed.hostname !== "www.eventbriteapi.com") {
    return res.status(400).json({ error: "Unexpected webhook source resource" });
  }

  await recordWebhookStatus(req, "accepted", { message: "Webhook accepted by Growth Operator." });
  res.status(202).json({ accepted: true });
  setImmediate(async () => {
    try {
      let eventbriteId = parsed.pathname.match(/\/events\/(\d+)/)?.[1] || "";
      if (!eventbriteId) {
        const { get } = require("../services/eventbriteListingService");
        const resource = await get(`${parsed.pathname}${parsed.search}`);
        eventbriteId = String(resource.event_id || resource.event?.id || "");
      }
      if (!eventbriteId) return;
      const localEvent = await Event.findOne({
        "integrations.eventbrite.eventId": eventbriteId,
      });
      if (localEvent) {
        await eventbriteLogisticsService.syncEvent(localEvent._id);
        await recordWebhookStatus(req, "synced", {
          localEventId: String(localEvent._id),
          message: `Synced ${localEvent.name}`,
        });
      } else {
        await recordWebhookStatus(req, "accepted", {
          message: "Webhook accepted; no matching Growth Operator event was found yet.",
        });
      }
    } catch (error) {
      console.error("EVENTBRITE WEBHOOK SYNC ERROR:", error.response?.data || error.message);
      await recordWebhookStatus(req, "sync_failed", {
        message: error.response?.data?.error_description || error.message,
      });
    }
  });
});

router.get("/webhook/status", async (req, res) => {
  try {
    const connection = await IntegrationConnection.findOne({ provider: "eventbrite" }).lean();
    const webhook = connection?.metadata?.webhook || {};
    res.json({
      configured: Boolean(webhookToken() && webhook.providerWebhookId),
      receiverReady: Boolean(webhookToken()),
      providerWebhookId: webhook.providerWebhookId || "",
      lastReceivedAt: webhook.lastReceivedAt || null,
      lastStatus: webhook.lastStatus || "",
      lastAction: webhook.lastAction || "",
      lastDeliveryId: webhook.lastDeliveryId || "",
      lastLocalEventId: webhook.lastLocalEventId || "",
      lastMessage: webhook.lastMessage || "",
    });
  } catch (error) {
    console.error("EVENTBRITE WEBHOOK STATUS ERROR:", error.message);
    res.status(500).json({ error: "Unable to read Eventbrite webhook status" });
  }
});

router.post("/webhook/configure", async (req, res) => {
  try {
    if (!webhookToken()) {
      return res.status(409).json({
        configured: false,
        manualSetupRequired: true,
        error: "Growth Operator’s backend webhook token is not configured yet.",
        receiverUrl: maskedWebhookReceiverUrl(req),
      });
    }

    const token = await eventbriteOAuthService.accessToken();
    if (!token) {
      return res.status(409).json({
        configured: false,
        manualSetupRequired: true,
        error: "Connect Eventbrite before configuring automatic updates.",
        receiverUrl: maskedWebhookReceiverUrl(req),
      });
    }

    const status = await eventbriteOAuthService.status();
    const organizationId = status.defaultOrganizationId || status.organizations?.[0]?.id || "";
    if (!organizationId) {
      return res.status(409).json({
        configured: false,
        manualSetupRequired: true,
        error: "Growth Operator could not find an Eventbrite organization for this account.",
        receiverUrl: maskedWebhookReceiverUrl(req),
      });
    }

    const receiverUrl = webhookReceiverUrl(req);
    const existing = await findExistingWebhook(token, organizationId, receiverUrl).catch((error) => {
      if (error.response?.status === 404) return null;
      throw error;
    });
    const webhook = existing || await createEventbriteWebhook(token, organizationId, receiverUrl);
    const providerWebhookId = String(webhook.id || webhook.webhook?.id || existing?.id || "");
    const message = existing
      ? "Webhook already exists. Growth Operator can receive automatic Eventbrite updates."
      : "Webhook created. Growth Operator can receive automatic Eventbrite updates.";

    await recordWebhookConfiguration(req, { providerWebhookId, organizationId, message });
    res.json({
      configured: true,
      manualSetupRequired: false,
      providerWebhookId,
      organizationId,
      receiverUrl: maskedWebhookReceiverUrl(req),
      message,
    });
  } catch (error) {
    console.error("EVENTBRITE WEBHOOK CONFIGURE ERROR:", error.response?.data || error.message);
    res.status(502).json({
      configured: false,
      manualSetupRequired: true,
      error: error.response?.data?.error_description ||
        error.response?.data?.error ||
        "Eventbrite did not allow Growth Operator to create the webhook automatically.",
      receiverUrl: maskedWebhookReceiverUrl(req),
      message: "Use the manual screen-share setup if Eventbrite requires the webhook to be created from the client’s Developer Links page.",
    });
  }
});

router.get("/oauth/status", async (req, res) => {
  try {
    res.json(await eventbriteOAuthService.status());
  } catch (error) {
    console.error("EVENTBRITE OAUTH STATUS ERROR:", error.message);
    res.status(500).json({ error: "Unable to read the Eventbrite connection status" });
  }
});

router.get("/oauth/start", async (req, res) => {
  try {
    res.json({ authorizationUrl: eventbriteOAuthService.authorizationUrl(req.auth.workspaceId, req.auth.user._id) });
  } catch (error) {
    console.error("EVENTBRITE OAUTH START ERROR:", error.message);
    res.status(503).json({
      error: "Eventbrite OAuth is not configured yet. Add the Eventbrite app credentials to the backend.",
    });
  }
});

router.get("/oauth/callback", async (req, res) => {
  const frontendUrl = String(process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");
  try {
    if (req.query.error) throw new Error("authorization_denied");
    const state = eventbriteOAuthService.verifyState(req.query.state);
    if (!req.query.code || !state) {
      throw new Error("invalid_oauth_response");
    }
    const membership = await WorkspaceMembership.findOne({ workspaceId: state.workspaceId, userId: state.userId, status: "active", role: { $in: ["owner", "admin"] } });
    if (!membership) throw new Error("workspace_permission_unavailable");
    await runWithWorkspace(state.workspaceId, () => eventbriteOAuthService.exchangeCode(String(req.query.code)));
    res.redirect(`${frontendUrl}/events?eventbrite=connected`);
  } catch (error) {
    console.error("EVENTBRITE OAUTH CALLBACK ERROR:", error.response?.data || error.message);
    res.redirect(`${frontendUrl}/events?eventbrite=error`);
  }
});

router.post("/oauth/disconnect", async (req, res) => {
  try {
    res.json(await eventbriteOAuthService.disconnect());
  } catch (error) {
    console.error("EVENTBRITE DISCONNECT ERROR:", error.message);
    res.status(500).json({ error: "Unable to disconnect Eventbrite" });
  }
});

router.post("/events/:eventId/sync", async (req, res) => {
  try {
    const event = await eventbriteLogisticsService.syncEvent(req.params.eventId);
    res.json({ success: true, event });
  } catch (error) {
    console.error("EVENTBRITE EVENT SYNC ERROR:", error.response?.data || error.message);
    const status = error.message === "Event not found" ? 404 : 502;
    res.status(status).json({
      error: error.response?.data?.error_description || error.message || "Unable to synchronize Eventbrite",
    });
  }
});

router.post("/managed-events", async (req, res) => {
  try {
    const event = await eventbriteManagementService.createManagedEvent(req.body);
    res.status(201).json({ success: true, event });
  } catch (error) {
    console.error("EVENTBRITE CREATE EVENT ERROR:", error.response?.data || error.message);
    res.status(400).json({
      error: error.response?.data?.error_description || error.message || "Unable to create Eventbrite event",
    });
  }
});

router.post("/managed-events/:eventId/create-draft", async (req, res) => {
  try {
    const event = await eventbriteManagementService.createEventbriteDraft(req.params.eventId);
    res.status(201).json({ success: true, event });
  } catch (error) {
    console.error("EVENTBRITE CREATE DRAFT ERROR:", error.response?.data || error.message);
    res.status(400).json({
      error: error.response?.data?.error_description || error.message || "Unable to create Eventbrite draft",
    });
  }
});

router.patch("/managed-events/:eventId", async (req, res) => {
  try {
    const event = await eventbriteManagementService.updateManagedEvent(req.params.eventId, req.body);
    res.json({ success: true, event });
  } catch (error) {
    console.error("EVENTBRITE UPDATE EVENT ERROR:", error.response?.data || error.message);
    const status = error.message === "Event not found" ? 404 : 400;
    res.status(status).json({
      error: error.response?.data?.error_description || error.message || "Unable to update Eventbrite event",
    });
  }
});

router.post("/managed-events/:eventId/publish", async (req, res) => {
  try {
    const event = await eventbriteManagementService.publishManagedEvent(req.params.eventId);
    res.json({ success: true, event });
  } catch (error) {
    console.error("EVENTBRITE PUBLISH EVENT ERROR:", error.response?.data || error.message);
    res.status(400).json({
      error: error.response?.data?.error_description || error.message || "Unable to publish Eventbrite event",
    });
  }
});

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

    // Fetch the complete listing. Audience is intentionally not imported as
    // Eventbrite data because it is an Growth Operator campaign decision.
    const {
      event: eventbriteEvent,
      ticketClasses,
      listing,
      audienceSuggestions,
    } = await retrieveCompleteListing(eventId);

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

      summary: listing.summary || "",

      description: listing.descriptionText || "",

      startDate: eventbriteEvent.start?.utc || null,

      endDate: eventbriteEvent.end?.utc || null,

      ticketPrice: ticketClasses[0]?.basePrice || 0,

      ticketGoal: Number(eventbriteEvent.capacity || 0),

      ticketsSold: 0,

      audience: [],

      audienceSuggestions,

      channels: ["Eventbrite"],

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

      eventbriteListing: listing,
    });

    const synchronizedEvent = await eventbriteLogisticsService.syncEvent(newEvent._id);

    return res.status(201).json({
      message: "Event imported successfully",

      event: synchronizedEvent,
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
