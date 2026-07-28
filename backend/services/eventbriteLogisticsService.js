const axios = require("axios");
const Event = require("../models/Event");
const EventbriteSyncHistory = require("../models/EventbriteSyncHistory");
const { accessToken } = require("./eventbriteOAuthService");

const api = axios.create({ baseURL: "https://www.eventbriteapi.com/v3" });

function money(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function request(token, path) {
  const response = await api.get(path, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data || {};
}

async function requestAll(token, path, collectionKey) {
  const items = [];
  let page = 1;
  let objectCount = 0;
  do {
    const separator = path.includes("?") ? "&" : "?";
    const data = await request(token, `${path}${separator}page=${page}`);
    items.push(...(data[collectionKey] || []));
    objectCount = Number(data.pagination?.object_count || items.length);
    if (!data.pagination?.has_more_items) break;
    page += 1;
  } while (page <= 100);
  return { items, objectCount };
}

async function syncEvent(localEventId) {
  const startedAt = new Date();
  const localEvent = await Event.findById(localEventId);
  if (!localEvent) throw new Error("Event not found");
  const eventId = localEvent.integrations?.eventbrite?.eventId;
  if (!eventId) throw new Error("This event is not linked to Eventbrite");

  try {
    const token = await accessToken();
    if (!token) throw new Error("Connect Eventbrite before syncing");
    const [event, ticketData, orderData, attendeeData] = await Promise.all([
      request(token, `/events/${eventId}/?expand=venue,organizer,ticket_availability,category,format`),
      requestAll(token, `/events/${eventId}/ticket_classes/`, "ticket_classes"),
      requestAll(token, `/events/${eventId}/orders/?status=all_not_deleted`, "orders"),
      requestAll(token, `/events/${eventId}/attendees/`, "attendees"),
    ]);

    const ticketClasses = ticketData.items.map((ticket) => ({
      id: ticket.id,
      name: ticket.name,
      free: Boolean(ticket.free),
      cost: money(ticket.cost?.major_value),
      quantityTotal: Number(ticket.quantity_total || 0),
      quantitySold: Number(ticket.quantity_sold || 0),
      salesStatus: ticket.sales_status || "",
    }));
    const orders = orderData.items;
    const attendees = attendeeData.items;
    const ticketsSold = ticketClasses.reduce((total, ticket) => total + ticket.quantitySold, 0);
    const grossRevenue = orders.reduce(
      (total, order) => total + money(order.costs?.gross?.major_value),
      0,
    );
    const capacity = Number(event.capacity || localEvent.capacity || localEvent.ticketGoal || 0);
    const availability = event.ticket_availability || {};

    localEvent.name = event.name?.text || localEvent.name;
    localEvent.description = event.description?.text || localEvent.description;
    localEvent.startDate = event.start?.utc || localEvent.startDate;
    localEvent.endDate = event.end?.utc || localEvent.endDate;
    localEvent.timeZone = event.start?.timezone || localEvent.timeZone;
    localEvent.capacity = capacity;
    localEvent.ticketsSold = ticketsSold;
    localEvent.locationType = event.online_event ? "online" : "venue";
    localEvent.location = event.online_event ? "Online" : event.venue?.name || localEvent.location;
    localEvent.onlineUrl = event.online_event ? event.url || localEvent.onlineUrl : localEvent.onlineUrl;
    localEvent.eventbriteLogistics = {
      status: event.status || "",
      organizerName: event.organizer?.name || "",
      organizerId: String(event.organizer?.id || ""),
      currency: availability.minimum_ticket_price?.currency || "USD",
      minimumCheckoutPrice: money(availability.minimum_ticket_price?.major_value) || null,
      maximumCheckoutPrice: money(availability.maximum_ticket_price?.major_value) || null,
      ticketClassCount: ticketClasses.length,
      ticketsSold,
      ticketsRemaining: Math.max(0, capacity - ticketsSold),
      orderCount: orderData.objectCount,
      attendeeCount: attendeeData.objectCount,
      checkedInCount: attendees.filter((attendee) => attendee.checked_in).length,
      grossRevenue,
      isSoldOut: Boolean(availability.is_sold_out),
      hasAvailableTickets: Boolean(availability.has_available_tickets),
      ticketClasses,
      lastSyncedAt: new Date(),
      lastSyncStatus: "success",
      lastSyncError: "",
    };
    await localEvent.save();

    const endedAt = new Date();
    await EventbriteSyncHistory.create({
      syncId: `event-${localEvent._id}-${Date.now()}`,
      startTime: startedAt,
      endTime: endedAt,
      durationMs: endedAt - startedAt,
      status: "success",
      updated: 1,
      totalProcessed: 1,
      message: `Synchronized ${localEvent.name}`,
    });
    return localEvent;
  } catch (error) {
    const endedAt = new Date();
    const safeError = error.response?.data?.error_description || error.message;
    localEvent.eventbriteLogistics = {
      ...(localEvent.eventbriteLogistics?.toObject?.() || localEvent.eventbriteLogistics || {}),
      lastSyncedAt: endedAt,
      lastSyncStatus: "failed",
      lastSyncError: safeError,
    };
    await localEvent.save();
    await EventbriteSyncHistory.create({
      syncId: `event-${localEvent._id}-${Date.now()}`,
      startTime: startedAt,
      endTime: endedAt,
      durationMs: endedAt - startedAt,
      status: "failed",
      totalProcessed: 1,
      error: safeError,
      message: `Could not synchronize ${localEvent.name}`,
    });
    throw error;
  }
}

module.exports = { syncEvent };
