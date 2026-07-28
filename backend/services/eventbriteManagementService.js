const axios = require("axios");
const Campaign = require("../models/Campaign");
const Event = require("../models/Event");
const { accessToken, organizationId } = require("./eventbriteOAuthService");
const { syncEvent } = require("./eventbriteLogisticsService");

const api = axios.create({ baseURL: "https://www.eventbriteapi.com/v3" });

function html(value = "") {
  return String(value)
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`)
    .join("");
}

async function post(path, payload = {}) {
  const token = await accessToken();
  if (!token) throw new Error("Connect Eventbrite before managing listings");
  const response = await api.post(path, payload, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data || {};
}

function eventPayload(input, { includeCurrency = false } = {}) {
  const payload = {};
  if (input.name) payload.name = { html: input.name };
  if (input.summary !== undefined) payload.summary = String(input.summary).slice(0, 140);
  if (input.description !== undefined) payload.description = { html: html(input.description) };
  if (input.startDate) {
    payload.start = {
      timezone: input.timeZone || "America/Los_Angeles",
      utc: new Date(input.startDate).toISOString(),
    };
  }
  if (input.endDate) {
    payload.end = {
      timezone: input.timeZone || "America/Los_Angeles",
      utc: new Date(input.endDate).toISOString(),
    };
  }
  if (input.locationType) payload.online_event = input.locationType === "online";
  if (input.capacity || input.ticketGoal) {
    payload.capacity = Number(input.capacity || input.ticketGoal);
  }
  if (includeCurrency || input.currency) payload.currency = input.currency || "USD";
  return payload;
}

async function createManagedEvent(input) {
  const orgId = await organizationId(input.organizationId);
  if (!orgId) {
    throw new Error("Choose an Eventbrite organization before publishing");
  }
  if (!input.name || !input.startDate || !input.endDate) {
    throw new Error("Name, start time, and end time are required");
  }

  const externalEvent = await post(`/organizations/${orgId}/events/`, {
    event: eventPayload(input, { includeCurrency: true }),
  });

  if (Number(input.ticketGoal) > 0) {
    const ticketClass = {
      name: input.ticketName || "General Admission",
      quantity_total: Number(input.ticketGoal),
    };
    if (Number(input.ticketPrice) > 0) {
      ticketClass.cost = `${input.currency || "USD"},${Math.round(Number(input.ticketPrice) * 100)}`;
    } else {
      ticketClass.free = true;
    }
    await post(`/events/${externalEvent.id}/ticket_classes/`, { ticket_class: ticketClass });
  }

  if (input.publishNow) {
    await post(`/events/${externalEvent.id}/publish/`);
  }

  const localEvent = await Event.create({
    name: input.name,
    summary: input.summary || "",
    description: input.description || "",
    startDate: input.startDate,
    endDate: input.endDate,
    timeZone: input.timeZone || "America/Los_Angeles",
    locationType: input.locationType || "online",
    location: input.locationType === "online" ? "Online" : input.location || "",
    ticketPrice: Number(input.ticketPrice || 0),
    ticketGoal: Number(input.ticketGoal || 0),
    capacity: Number(input.ticketGoal || 0),
    audience: input.audience || [],
    channels: ["Eventbrite"],
    status: input.publishNow ? "active" : "draft",
    integrations: {
      eventbrite: {
        enabled: true,
        eventId: String(externalEvent.id),
        url: externalEvent.url || "",
      },
    },
  });
  return syncEvent(localEvent._id);
}

async function createEventbriteDraft(localEventId) {
  const localEvent = await Event.findById(localEventId);
  if (!localEvent) throw new Error("Event not found");
  if (localEvent.integrations?.eventbrite?.eventId) {
    return syncEvent(localEvent._id);
  }
  if (!localEvent.name || !localEvent.startDate || !localEvent.endDate) {
    throw new Error("Complete the event name, start time, and end time first");
  }
  const orgId = await organizationId();
  if (!orgId) throw new Error("Choose an Eventbrite organization before creating the draft");

  const externalEvent = await post(`/organizations/${orgId}/events/`, {
    event: eventPayload(localEvent.toObject(), { includeCurrency: true }),
  });
  if (Number(localEvent.ticketGoal) > 0) {
    const ticketClass = {
      name: localEvent.planning?.ticketClasses?.[0]?.name || "General Admission",
      quantity_total: Number(localEvent.ticketGoal),
    };
    if (Number(localEvent.ticketPrice) > 0) {
      ticketClass.cost = `USD,${Math.round(Number(localEvent.ticketPrice) * 100)}`;
    } else {
      ticketClass.free = true;
    }
    await post(`/events/${externalEvent.id}/ticket_classes/`, { ticket_class: ticketClass });
  }
  localEvent.integrations.eventbrite = {
    enabled: true,
    eventId: String(externalEvent.id),
    url: externalEvent.url || "",
  };
  await localEvent.save();
  return syncEvent(localEvent._id);
}

async function updateManagedEvent(localEventId, input) {
  const localEvent = await Event.findById(localEventId);
  if (!localEvent) throw new Error("Event not found");
  const externalId = localEvent.integrations?.eventbrite?.eventId;
  const eventbriteFields = [
    "name", "summary", "startDate", "endDate", "timeZone",
    "locationType", "capacity", "ticketGoal", "currency",
  ];
  const changesEventbrite = eventbriteFields.some((field) => input[field] !== undefined);
  if (externalId && changesEventbrite) {
    await post(`/events/${externalId}/`, { event: eventPayload(input) });
  }

  const allowed = [
    "name", "summary", "description", "startDate", "endDate", "timeZone",
    "locationType", "location", "ticketPrice", "ticketGoal", "audience",
    "planning", "audienceSuggestions", "audienceRecommendationDetails",
    "audienceRecommendationSource",
  ];
  allowed.forEach((field) => {
    if (input[field] !== undefined) localEvent[field] = input[field];
  });
  if (input.ticketGoal !== undefined) localEvent.capacity = Number(input.ticketGoal);
  if (input.audienceConfirmed === true) localEvent.audienceConfirmedAt = new Date();
  if (input.audienceConfirmed === false) localEvent.audienceConfirmedAt = null;
  await localEvent.save();

  if (input.audience !== undefined || input.audienceConfirmed !== undefined) {
    await Campaign.updateMany(
      { eventId: localEvent._id },
      {
        $set: {
          audience: localEvent.audienceConfirmedAt ? localEvent.audience : [],
        },
      }
    );
  }

  return externalId ? syncEvent(localEvent._id) : localEvent;
}

async function publishManagedEvent(localEventId) {
  const localEvent = await Event.findById(localEventId);
  if (!localEvent) throw new Error("Event not found");
  const externalId = localEvent.integrations?.eventbrite?.eventId;
  if (!externalId) throw new Error("Publish this event to Eventbrite first");
  await post(`/events/${externalId}/publish/`);
  localEvent.status = "active";
  await localEvent.save();
  return syncEvent(localEvent._id);
}

module.exports = {
  createEventbriteDraft,
  createManagedEvent,
  updateManagedEvent,
  publishManagedEvent,
};
