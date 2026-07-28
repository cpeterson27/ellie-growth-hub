const axios = require("axios");
const { accessToken } = require("./eventbriteOAuthService");

const api = axios.create({ baseURL: "https://www.eventbriteapi.com/v3" });

function text(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value.text || value.html || "";
}

function plainText(value = "") {
  return String(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|h[1-6]|div)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, "\"")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function get(path) {
  const token = await accessToken();
  if (!token) throw new Error("Connect Eventbrite before synchronizing listings");
  const response = await api.get(path, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data || {};
}

async function optionalGet(path) {
  try {
    return await get(path);
  } catch (error) {
    if ([400, 403, 404].includes(error.response?.status)) return null;
    throw error;
  }
}

async function getAll(path, collectionKey) {
  const items = [];
  let page = 1;
  let objectCount = 0;
  while (page <= 100) {
    const separator = path.includes("?") ? "&" : "?";
    const data = await get(`${path}${separator}page=${page}`);
    items.push(...(data[collectionKey] || []));
    objectCount = Number(data.pagination?.object_count || items.length);
    if (!data.pagination?.has_more_items) break;
    page += 1;
  }
  return { items, objectCount };
}

function moduleBody(module = {}) {
  return module.data?.body || module.body || {};
}

function normalizeModules(structured = {}) {
  const modules = structured.modules || structured.page?.modules || [];
  return modules.map((module, index) => {
    const body = moduleBody(module);
    const moduleType = module.type || module.data?.type || "unknown";
    const rawText = body.text || body.caption || module.data?.text || "";
    const image = body.image || module.data?.image || {};
    const video = body.video || module.data?.video || {};
    return {
      id: String(module.id || index),
      type: moduleType,
      semanticPurpose: module.semantic_purpose || module.data?.semantic_purpose || "",
      textHtml: typeof rawText === "string" ? rawText : text(rawText),
      text: plainText(typeof rawText === "string" ? rawText : text(rawText)),
      imageUrl: image.url || image.original?.url || body.url || "",
      videoUrl: video.url || (moduleType === "video" ? body.url : "") || "",
      displaySize: image.display_size || video.display_size || body.display_size || "",
    };
  });
}

function extractAgenda(modules) {
  const agenda = [];
  modules.forEach((module) => {
    if (!module.text) return;
    const lines = module.text.split("\n").map((line) => line.trim()).filter(Boolean);
    lines.forEach((line, index) => {
      const match = line.match(/^(\d{1,2}:\d{2}\s*(?:AM|PM)?)\s*(?:-|–|—|to)?\s*(\d{1,2}:\d{2}\s*(?:AM|PM)?)?\s*(.*)$/i);
      if (!match) return;
      const following = lines[index + 1] && !/^\d{1,2}:\d{2}/.test(lines[index + 1])
        ? lines[index + 1]
        : "";
      agenda.push({
        startsAt: match[1] || "",
        endsAt: match[2] || "",
        title: (match[3] || following || "Agenda item").trim(),
        description: match[3] && following ? following : "",
      });
    });
  });
  return agenda;
}

function extractPresenters(modules) {
  const presenters = [];
  modules.forEach((module) => {
    if (!/lineup|speaker|instructor|presenter|headliner/i.test(`${module.semanticPurpose} ${module.text}`)) {
      return;
    }
    const lines = module.text.split("\n").map((line) => line.trim()).filter(Boolean);
    lines.forEach((line, index) => {
      if (!/^(headliner|speaker|instructor|presenter)$/i.test(line)) return;
      const name = lines[index + 1] || "";
      if (name && name.length <= 80) {
        presenters.push({ name, role: line });
      }
    });
  });
  return presenters.filter(
    (presenter, index, all) => all.findIndex((item) => item.name === presenter.name) === index,
  );
}

function widget(structured, type) {
  return (structured?.widgets || []).find((item) => item.type === type);
}

function widgetAgenda(structured) {
  const agendaWidget = widget(structured, "agenda");
  return (agendaWidget?.data?.tabs || []).flatMap((tab) =>
    (tab.slots || []).map((slot) => ({
      startsAt: slot.startTime || "",
      endsAt: slot.endTime || "",
      title: slot.title || "Agenda item",
      description: slot.description || "",
      hosts: slot.hosts || [],
      track: tab.name || "",
    })),
  );
}

function widgetFaqs(structured) {
  const faqWidget = widget(structured, "faqs") || widget(structured, "faq");
  return (faqWidget?.data?.faqs || []).map((faq) => ({
    question: faq.question || "",
    answer: faq.answer || "",
  }));
}

function widgetImage(structured) {
  const carousel = widget(structured, "herocarousel");
  return carousel?.data?.slides?.[0]?.image || {};
}

async function widgetPresenters(structured) {
  const lineup = widget(structured, "lineup");
  const artists = lineup?.data?.artist_list || [];
  const resolved = await Promise.all(artists.map(async (artist) => {
    const artistId = String(artist.artist_id || "");
    const response = artistId ? await optionalGet(`/artists/${artistId}/`) : null;
    const details = response?.artist || {};
    return {
      id: artistId,
      name: details.name || "",
      role: artist.tagline || (artist.artist_is_live_performance ? "Headliner" : "Speaker"),
    };
  }));
  return resolved.filter((artist) => artist.name);
}

function extractHighlights(event, modules) {
  const values = new Set();
  if (event.online_event) values.add("Online");
  const duration = event.start?.utc && event.end?.utc
    ? Math.max(0, Math.round((new Date(event.end.utc) - new Date(event.start.utc)) / 60000))
    : 0;
  if (duration) {
    const hours = duration / 60;
    values.add(Number.isInteger(hours) ? `${hours} hours` : `${duration} minutes`);
  }
  modules.forEach((module) => {
    if (!/highlight|good.to.know/i.test(`${module.semanticPurpose} ${module.text}`)) return;
    module.text.split("\n").map((item) => item.trim()).filter(Boolean).forEach((item) => {
      if (item.length <= 80) values.add(item);
    });
  });
  return { highlights: [...values].slice(0, 12), durationMinutes: duration };
}

function extractAudienceSuggestions(modules, description) {
  const source = `${description}\n${modules.map((module) => module.text).join("\n")}`;
  const marker = source.search(/who this event is for|perfect for|ideal for/i);
  if (marker < 0) return [];
  const section = source.slice(marker).split(
    /\n(?:what(?:'s| is) included|limited to|agenda|event details|refund policy)\b/i,
  )[0];
  const candidates = section
    .split(/\n|•|·/)
    .map((item) => item
      .replace(/^(who this event is for|perfect for|ideal for)\s*:?\s*/i, "")
      .replace(/[.!]+$/, "")
      .trim())
    .filter((item) => item.length >= 3 && item.length <= 90);
  const taxonomy = [
    ["Beginner multifamily investors", /beginner multifamily investors?/i],
    ["Multifamily investors", /\bmultifamily investors?\b/i],
    ["Capital raisers", /\bcapital raisers?\b/i],
    ["Passive investors", /\bpassive investors?\b/i],
    ["Real estate professionals", /\breal estate professionals?\b/i],
    ["Entrepreneurs", /\bentrepreneurs?\b/i],
    ["W-2 professionals", /\bw-?2 professionals?\b/i],
    ["Medical professionals", /\bmedical professionals?\b/i],
    ["Commercial real estate investors", /\bcommercial real estate\b/i],
    ["People building passive income", /\bbuild(?:ing)? passive income\b/i],
  ];
  taxonomy.forEach(([label, pattern]) => {
    if (pattern.test(section) && !candidates.some((candidate) => pattern.test(candidate))) {
      candidates.push(label);
    }
  });
  const unique = new Map();
  candidates.forEach((candidate) => {
    const key = candidate.toLowerCase();
    if (!unique.has(key)) unique.set(key, candidate);
  });
  return [...unique.values()].slice(0, 15);
}

function normalizeTicket(ticket) {
  return {
    id: String(ticket.id || ""),
    name: ticket.name || "Ticket",
    description: ticket.description || "",
    free: Boolean(ticket.free),
    donation: Boolean(ticket.donation),
    displayPrice: ticket.cost?.display || "",
    currency: ticket.cost?.currency || "",
    basePrice: Number(ticket.cost?.major_value || 0),
    fee: Number(ticket.fee?.major_value || 0),
    tax: Number(ticket.tax?.major_value || 0),
    quantityTotal: Number(ticket.quantity_total || 0),
    quantitySold: Number(ticket.quantity_sold || 0),
    minimumQuantity: Number(ticket.minimum_quantity || 1),
    maximumQuantity: Number(ticket.maximum_quantity || 0),
    maximumPerOrder: Number(ticket.maximum_quantity_per_order || 0),
    salesStart: ticket.sales_start || "",
    salesEnd: ticket.sales_end || "",
    salesStatus: ticket.sales_status || "",
    hidden: Boolean(ticket.hidden),
    includeFee: Boolean(ticket.include_fee),
    deliveryMethods: ticket.delivery_methods || [],
  };
}

async function retrieveCompleteListing(eventId) {
  const [event, ticketData, structured] = await Promise.all([
    get(`/events/${eventId}/?expand=venue,organizer,ticket_availability,category,subcategory,format,refund_policy,publish_settings,logo`),
    getAll(`/events/${eventId}/ticket_classes/`, "ticket_classes"),
    optionalGet(`/events/${eventId}/structured_content/?purpose=listing`),
  ]);

  const modules = normalizeModules(structured || {});
  const widgetPresentersData = await widgetPresenters(structured || {});
  const widgetAgendaData = widgetAgenda(structured || {});
  const heroImage = widgetImage(structured || {});
  const descriptionHtml = event.description?.html ||
    modules.map((module) => module.textHtml).filter(Boolean).join("\n");
  const descriptionText = event.description?.text || plainText(descriptionHtml);
  const { highlights, durationMinutes } = extractHighlights(event, modules);
  const ticketClasses = ticketData.items.map(normalizeTicket);
  const imageUrl = heroImage.url || event.logo?.original?.url || event.logo?.url || "";

  return {
    event,
    ticketClasses,
    listing: {
      summary: event.summary || "",
      descriptionHtml,
      descriptionText,
      structuredContent: {
        version: Number(
          structured?.page_version_number ||
          structured?.version_number ||
          structured?.page?.version_number ||
          0,
        ),
        modules,
        widgetTypes: (structured?.widgets || []).map((item) => item.type),
      },
      agenda: widgetAgendaData.length ? widgetAgendaData : extractAgenda(modules),
      presenters: widgetPresentersData.length ? widgetPresentersData : extractPresenters(modules),
      faqs: widgetFaqs(structured || {}),
      organizer: {
        id: String(event.organizer?.id || ""),
        name: event.organizer?.name || "",
        description: text(event.organizer?.description),
        logoUrl: event.organizer?.logo?.url || "",
        website: event.organizer?.website || "",
        facebook: event.organizer?.facebook || "",
        twitter: event.organizer?.twitter || "",
      },
      refundPolicy: event.refund_policy || {},
      highlights,
      durationMinutes,
      image: {
        url: imageUrl,
        originalUrl: heroImage.original?.url || event.logo?.original?.url || imageUrl,
        cropMask: heroImage.crop_mask || event.logo?.crop_mask || {},
      },
      category: {
        id: String(event.category?.id || event.category_id || ""),
        name: event.category?.name || "",
      },
      subcategory: {
        id: String(event.subcategory?.id || event.subcategory_id || ""),
        name: event.subcategory?.name || "",
      },
      format: {
        id: String(event.format?.id || event.format_id || ""),
        name: event.format?.name || "",
      },
      venue: event.venue || {},
      onlineAccess: {
        isOnline: Boolean(event.online_event),
        accessManagedByEventbrite: Boolean(event.online_event),
        publicListingUrl: event.url || "",
        organizerEditUrl: event.id
          ? `https://www.eventbrite.com/myevent?eid=${event.id}`
          : "",
      },
      publishSettings: event.publish_settings || {},
      sourceUpdatedAt: event.changed || null,
      lastRetrievedAt: new Date(),
    },
    audienceSuggestions: extractAudienceSuggestions(modules, descriptionText),
  };
}

module.exports = {
  get,
  getAll,
  plainText,
  retrieveCompleteListing,
};
