const axios = require("axios");
const Event = require("../models/Event");
const EventbriteSyncHistory = require("../models/EventbriteSyncHistory");
const Partner = require("../models/Partner");
const AffiliateSale = require("../models/AffiliateSale");
const { accessToken } = require("./eventbriteOAuthService");
const { retrieveCompleteListing } = require("./eventbriteListingService");

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

function affiliateStatsForAttendees(attendees = []) {
  const stats = new Map();
  attendees.filter((attendee) => !attendee.cancelled && !attendee.refunded && attendee.affiliate).forEach((attendee) => {
    const rawAffiliate = typeof attendee.affiliate === "object" ? (attendee.affiliate.name || attendee.affiliate.id || "") : attendee.affiliate;
    const code = String(rawAffiliate || "").trim().toLowerCase();
    if (!code) return;
    const current = stats.get(code) || { tickets: 0, revenue: 0 };
    current.tickets += Math.max(1, Number(attendee.quantity) || 1);
    current.revenue += money(attendee.costs?.gross?.major_value);
    stats.set(code, current);
  });
  return stats;
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
    const [{ event, ticketClasses, listing, audienceSuggestions }, orderData, attendeeData] = await Promise.all([
      retrieveCompleteListing(eventId),
      requestAll(token, `/events/${eventId}/orders/?status=all_not_deleted`, "orders"),
      requestAll(token, `/events/${eventId}/attendees/`, "attendees"),
    ]);

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
    localEvent.summary = listing.summary || localEvent.summary;
    localEvent.description = listing.descriptionText || localEvent.description;
    localEvent.startDate = event.start?.utc || localEvent.startDate;
    localEvent.endDate = event.end?.utc || localEvent.endDate;
    localEvent.timeZone = event.start?.timezone || localEvent.timeZone;
    localEvent.capacity = capacity;
    localEvent.ticketsSold = ticketsSold;
    localEvent.locationType = event.online_event ? "online" : "venue";
    localEvent.location = event.online_event ? "Online" : event.venue?.name || localEvent.location;
    localEvent.onlineUrl = event.online_event ? event.url || localEvent.onlineUrl : localEvent.onlineUrl;
    localEvent.category = listing.category?.name || localEvent.category;
    localEvent.eventbriteListing = listing;
    localEvent.audienceSuggestions = audienceSuggestions;
    const legacyAudience = [
      "Airbnb investors",
      "Real estate investors",
      "House flippers",
      "Property management companies",
      "Multifamily investors",
    ];
    if (legacyAudience.every((item) => localEvent.audience?.includes(item)) &&
        localEvent.audience?.length === legacyAudience.length &&
        !localEvent.audienceConfirmedAt) {
      localEvent.audience = [];
    }
    localEvent.eventbriteLogistics = {
      status: event.status || "",
      organizerName: event.organizer?.name || "",
      organizerId: String(event.organizer?.id || ""),
      currency: availability.minimum_ticket_price?.currency ||
        ticketClasses.find((ticket) => ticket.currency)?.currency ||
        "USD",
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

    const affiliateStats = affiliateStatsForAttendees(attendees);
    const partners = await Partner.find({ eventbriteEventId: String(eventId), trackingProvider: "eventbrite" });
    await Promise.all(partners.map(async (partner) => {
      const code = String(partner.referralCode || "").toLowerCase();
      const matchingAttendees = attendees.filter((attendee) => {
        const raw = typeof attendee.affiliate === "object" ? (attendee.affiliate.name || attendee.affiliate.id || "") : attendee.affiliate;
        return String(raw || "").trim().toLowerCase() === code;
      });
      await Promise.all(matchingAttendees.filter((attendee) => attendee.id).map((attendee) => AffiliateSale.findOneAndUpdate(
        { partnerId: partner._id, eventbriteAttendeeId: String(attendee.id) },
        { $set: { workspaceId: partner.workspaceId || null, partnerId: partner._id, localEventId: localEvent._id, eventbriteEventId: String(eventId), eventbriteAttendeeId: String(attendee.id), eventbriteOrderId: String(attendee.order_id || ""), affiliateCode: partner.referralCode, buyerName: String(attendee.profile?.name || [attendee.profile?.first_name, attendee.profile?.last_name].filter(Boolean).join(" ") || ""), buyerEmail: String(attendee.profile?.email || ""), ticketClassName: String(attendee.ticket_class_name || ""), quantity: Math.max(1, Number(attendee.quantity) || 1), grossRevenue: money(attendee.costs?.gross?.major_value), currency: attendee.costs?.gross?.currency || localEvent.eventbriteLogistics.currency || "USD", status: attendee.refunded ? "refunded" : attendee.cancelled ? "cancelled" : "active", purchasedAt: attendee.created ? new Date(attendee.created) : null, lastSyncedAt: new Date() } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )));
      const stats = affiliateStats.get(String(partner.referralCode || "").toLowerCase()) || { tickets: 0, revenue: 0 };
      const currency = localEvent.eventbriteLogistics.currency || "USD";
      const latestSale = matchingAttendees.filter((attendee) => !attendee.cancelled && !attendee.refunded && attendee.created).sort((a, b) => new Date(b.created) - new Date(a.created))[0];
      return Partner.updateOne({ _id: partner._id }, { $set: { ticketsSold: stats.tickets, referrals: stats.tickets, grossRevenue: stats.revenue, revenue: new Intl.NumberFormat("en-US", { style: "currency", currency }).format(stats.revenue), currency, lastSyncedAt: new Date(), lastSaleAt: latestSale?.created ? new Date(latestSale.created) : null, lastSyncStatus: "success", lastSyncError: "" } });
    }));

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

module.exports = { affiliateStatsForAttendees, syncEvent };
