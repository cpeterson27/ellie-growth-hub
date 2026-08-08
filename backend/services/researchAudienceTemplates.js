const RESEARCH_AUDIENCE_TEMPLATES = {
  "research-qualified-investor": {
    audienceLabel: "Qualified professional / investor",
    subject: "{{firstName}}, an invitation to {{campaignName}}",
    body: `Hi {{firstName}},

I would like to personally invite you to {{campaignName}}.

This event is designed for professionals, business owners, and investors who want practical guidance on evaluating multifamily opportunities, building strong investor relationships, and moving confidently toward acquisitions.

You can review the event details and decide whether it is relevant to your goals using either registration link below.

Best,
Ellie's Coaching`,
  },
  "research-sec-fund-executive": {
    audienceLabel: "SEC fund executive",
    subject: "{{firstName}}, an invitation for investment and fund leaders",
    body: `Hi {{firstName}},

I would like to invite you to {{campaignName}}.

The event brings together professionals interested in multifamily analysis, capital strategy, investor relationships, and the process of moving opportunities from evaluation to acquisition.

Given your leadership work with {{company}}, I thought the event may be relevant. You can review the details using either registration link below.

Best,
Ellie's Coaching`,
  },
  "research-community-partner": {
    audienceLabel: "Community partner",
    subject: "A partnership invitation for {{campaignName}}",
    body: `Hi {{firstName}},

I would like to introduce you to {{campaignName}} and explore whether it could be valuable to the community you serve.

The event provides practical education for people interested in multifamily analysis, investor relationships, capital strategy, and acquisitions.

If it fits your audience, I would be glad to discuss a thoughtful way to share it. The complete event details are available through either link below.

Best,
Ellie's Coaching`,
  },
  "research-ticket-buyer": {
    audienceLabel: "Individual ticket buyer",
    subject: "{{firstName}}, an invitation to {{campaignName}}",
    body: `Hi {{firstName}},

I would like to personally invite you to {{campaignName}}.

The event offers practical guidance, systems, and connections for adults actively working toward business ownership, stronger operations, or growth through real estate.

You can review the event details and decide whether it is useful for what you are working toward using either registration link below.

Best,
Ellie's Coaching`,
  },
};

function defaultResearchAudienceTemplate(key, campaign) {
  const definition = RESEARCH_AUDIENCE_TEMPLATES[key];
  if (!definition) return null;
  return {
    ...definition,
    callToAction: "Register on Eventbrite",
    callToActionUrl: String(campaign.registrationLinks?.eventbrite?.url || "").trim(),
    topic: "event_invitations",
    status: "draft",
    currentVersion: 0,
    approvedAt: null,
  };
}

function researchAudienceForSignal(signal, monitor) {
  if (signal.source === "sec_form_d") return { key: "research-sec-fund-executive", label: RESEARCH_AUDIENCE_TEMPLATES["research-sec-fund-executive"].audienceLabel };
  if (monitor?.monitorType === "community_partner") return { key: "research-community-partner", label: RESEARCH_AUDIENCE_TEMPLATES["research-community-partner"].audienceLabel };
  if (monitor?.monitorType === "investor_profile") return { key: "research-qualified-investor", label: RESEARCH_AUDIENCE_TEMPLATES["research-qualified-investor"].audienceLabel };
  return { key: "research-ticket-buyer", label: RESEARCH_AUDIENCE_TEMPLATES["research-ticket-buyer"].audienceLabel };
}

module.exports = { RESEARCH_AUDIENCE_TEMPLATES, defaultResearchAudienceTemplate, researchAudienceForSignal };
