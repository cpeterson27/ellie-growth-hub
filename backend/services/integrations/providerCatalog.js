const providers = [
  {
    id: "csv",
    name: "CSV Upload",
    category: "lead_provider",
    description: "Lead import",
    capabilities: ["createContacts", "normalizeContacts"],
    environmentKeys: [],
    builtIn: true,
  },
  {
    id: "resend",
    name: "Resend",
    category: "communication",
    description: "Email delivery",
    capabilities: ["sendEmail"],
    environmentKeys: ["RESEND_API_KEY"],
  },
  {
    id: "eventbrite",
    name: "Eventbrite",
    category: "events",
    description: "Event data",
    capabilities: ["syncAttendees", "normalizeContacts"],
    environmentKeys: [
      "EVENTBRITE_PRIVATE_TOKEN",
      "EVENTBRITE_CLIENT_ID",
      "EVENTBRITE_CLIENT_SECRET",
    ],
  },
  {
    id: "meetup",
    name: "Meetup",
    category: "events",
    description: "Event distribution",
    capabilities: ["searchEvents", "syncEvents"],
    environmentKeys: ["MEETUP_API_KEY", "MEETUP_ACCESS_TOKEN"],
  },
  {
    id: "stripe",
    name: "Stripe",
    category: "payments",
    description: "Payments",
    capabilities: ["create", "sync"],
    environmentKeys: ["STRIPE_SECRET_KEY"],
  },
  {
    id: "openai",
    name: "OpenAI",
    category: "ai",
    description: "AI intelligence",
    capabilities: ["create"],
    environmentKeys: ["OPENAI_API_KEY"],
  },
];

module.exports = providers;
