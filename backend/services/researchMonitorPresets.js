const STUDENT_BUYER_PRESET = Object.freeze({
  id: "ellie-multifamily-student-intent",
  monitorType: "buyer_intent",
  name: "Ellie Multifamily Student Intent",
  query: "Adults actively learning or entering multifamily investing who are publicly asking for help with underwriting, analyzing an early deal, cap rates, NOI, debt service, financing, syndication, raising capital, moving from single-family to multifamily, or finding relevant mentorship, training, courses, bootcamps, or investor education.",
  locations: ["United States"],
  sources: ["bing_web", "reddit_rss"],
  negativeKeywords: ["Jobs and job seekers", "Homework or school assignments", "Institutional funds", "Venture capital", "Private equity", "Hedge funds", "SEC filings", "Generic promotions", "Service providers pitching", "Unrelated commercial finance"],
  intentCategories: [
    { name: "Early multifamily deal", phrases: ["first multifamily deal", "early apartment deal", "first apartment acquisition"] },
    { name: "Underwriting help", phrases: ["underwriting help", "how to underwrite multifamily", "underwriting my first deal"] },
    { name: "Deal analysis help", phrases: ["deal analysis help", "analyzing an apartment deal", "cap rate", "NOI", "debt service"] },
    { name: "Moving into multifamily", phrases: ["moving from single-family to multifamily", "transitioning to apartments", "getting into multifamily"] },
    { name: "Learning request", phrases: ["learn multifamily investing", "investor education", "multifamily bootcamp"] },
    { name: "Mentor or coaching search", phrases: ["multifamily mentor", "multifamily coaching", "looking for mentorship"] },
    { name: "Course or training search", phrases: ["multifamily course", "multifamily training", "syndication course"] },
    { name: "Execution questions", phrases: ["financing my deal", "raising capital", "syndication question", "how do I execute this deal"] },
  ],
  feedUrls: [],
  intervalMinutes: 30,
});

const INVESTOR_PROSPECT_PRESET = Object.freeze({
  id: "eventbootcamp-qualified-investor-prospects",
  monitorType: "investor_profile",
  name: "EventBootcamp qualified investor prospects",
  query: "U.S. adults whose public statements or activity demonstrate both credible financial or professional fit and active interest in multifamily, passive real-estate investing, apartment syndications, limited-partner investing, investor education, or evaluating an investment opportunity. A professional title alone never qualifies someone.",
  locations: ["United States"],
  sources: ["bing_web", "reddit_rss"],
  negativeKeywords: ["Professional title only", "No stated investing interest", "Jobs and job seekers", "Homework or school assignments", "Institutional funds", "Venture capital", "Private equity", "Hedge funds", "SEC filings", "Wholesalers pitching", "Real estate agents pitching", "Generic promotions", "Service providers pitching", "Crypto", "Forex"],
  intentCategories: [
    { name: "Self-described investor fit", phrases: ["accredited investor", "limited partner", "LP investor", "passive investor", "multifamily investor"] },
    { name: "Multifamily interest", phrases: ["interested in multifamily", "apartment investing", "multifamily syndication", "passive real estate"] },
    { name: "Active evaluation", phrases: ["evaluating a syndication", "reviewing an investment opportunity", "how to evaluate a sponsor", "looking to invest"] },
    { name: "Investor education intent", phrases: ["learn passive investing", "multifamily investor education", "investor bootcamp", "syndication training"] },
    { name: "Credible financial or professional fit", phrases: ["business owner and investor", "practice owner and investor", "executive and passive investor", "founder and real estate investor"] },
  ],
  feedUrls: [],
  intervalMinutes: 30,
});

const COMMUNITY_PARTNER_PRESET = Object.freeze({
  id: "real-estate-community-partners",
  monitorType: "community_partner",
  name: "Real Estate Community Partners - USA",
  query: "Active U.S. communities and identifiable organizers, founders, presidents, directors, administrators, hosts, publishers, or association leaders serving multifamily investors, apartment owners, landlords, real-estate entrepreneurs, syndicators, passive investors, or commercial real-estate professionals. Community metadata identifies partnership opportunities and must never be treated as individual buyer intent.",
  locations: ["United States"],
  sources: ["linkedin_public", "facebook_public", "meetup_public", "community_directories", "bing_web"],
  negativeKeywords: ["Individual buyer intent", "Private member lists", "Private groups", "Inactive communities", "Jobs and job seekers", "Homework or school assignments", "Unrelated communities", "Generic promotions", "Service providers pitching", "Crypto", "Forex"],
  intentCategories: [
    { name: "Community leadership", phrases: ["REIA president", "Meetup organizer", "community founder", "group administrator", "association director"] },
    { name: "Relevant community", phrases: ["multifamily investors group", "apartment owners association", "landlord association", "real estate investing club", "syndication community"] },
    { name: "Active public presence", phrases: ["upcoming public event", "active member community", "recent community programming", "investor meetup"] },
    { name: "Partnership fit", phrases: ["education partner", "event partner", "community collaboration", "guest training", "member resource"] },
  ],
  feedUrls: [],
  intervalMinutes: 60,
});

const RESEARCH_MONITOR_PRESETS = Object.freeze([STUDENT_BUYER_PRESET, INVESTOR_PROSPECT_PRESET, COMMUNITY_PARTNER_PRESET]);
module.exports = { STUDENT_BUYER_PRESET, INVESTOR_PROSPECT_PRESET, COMMUNITY_PARTNER_PRESET, RESEARCH_MONITOR_PRESETS };
