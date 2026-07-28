const Campaign = require("../models/Campaign");
const Contact = require("../models/Contact");

const AUDIENCE_TERMS = {
  "airbnb investors": ["airbnb", "short-term rental", "short term rental", "vacation rental", "furnished rental"],
  "real estate investors": ["real estate investor", "real estate investment", "property investor", "acquisitions"],
  "house flippers": ["house flip", "fix and flip", "flipping", "wholesaling", "distressed properties", "renovation"],
  "property management companies": ["property management", "property manager", "leasing"],
  "multifamily investors": ["multifamily", "multi-family", "apartments", "apartment investor"],
  "beginner multifamily investors": [
    "multifamily", "multi-family", "apartment investor", "beginner investor",
    "new investor", "real estate investor",
  ],
  "capital raisers": [
    "capital raising", "capital raiser", "raise capital", "investor relations",
    "syndication", "syndicator",
  ],
  "passive investors": [
    "passive investor", "limited partner", "accredited investor", "passive income",
    "real estate investor",
  ],
  "real estate professionals": [
    "real estate", "realtor", "broker", "property manager", "acquisitions",
    "asset management", "developer",
  ],
  "entrepreneurs": ["entrepreneur", "founder", "owner", "business owner"],
  "w-2 professionals": ["w-2", "w2", "professional", "employee", "executive"],
  "medical professionals": [
    "medical", "physician", "doctor", "dentist", "nurse", "healthcare",
  ],
  "anyone looking to build passive income through commercial real estate": [
    "passive income", "commercial real estate", "multifamily", "multi-family",
    "apartment investor", "real estate investor",
  ],
  "experienced real-estate operators": ["operator", "developer", "owner", "founder", "asset management", "acquisitions"],
  "affiliate and referral partners": ["affiliate", "referral", "broker", "realtor", "real estate agent", "lender"],
  "high-ticket program buyers": ["operator", "developer", "owner", "founder", "investor", "acquisitions", "multifamily"],
  "skool community candidates": ["community", "education", "coach", "coaching", "training"],
};

function searchableText(contact = {}) {
  return [
    contact.title,
    contact.industry,
    contact.seniority,
    contact.company,
    ...(contact.audienceProfiles || []),
    ...(contact.tags || []),
    ...(contact.keywords || []),
    ...(contact.lists || []),
    contact.notes,
  ].filter(Boolean).join(" ").toLowerCase();
}

function matchReasons(contact, audiences = []) {
  const haystack = searchableText(contact);
  const reasons = [];
  for (const audience of audiences) {
    const terms = AUDIENCE_TERMS[String(audience).toLowerCase()] || [String(audience).toLowerCase()];
    const hits = terms.filter((term) => haystack.includes(term));
    if (hits.length) reasons.push({ audience, terms: hits.slice(0, 4) });
  }
  return reasons;
}

async function getCampaignMatches(campaignId) {
  const campaign = await Campaign.findById(campaignId);
  if (!campaign) throw new Error("Campaign not found");

  const base = {
    status: { $nin: ["archived", "unsubscribed", "invalid", "rejected"] },
    researchStatus: "qualified",
    qualifyContact: true,
    emailStatus: "verified",
    email: { $exists: true, $nin: ["", null] },
  };
  const eligible = await Contact.find(base).select("name email company title industry tags keywords lists notes seniority campaignIds").lean();
  const matches = eligible.map((contact) => ({
    contact,
    reasons: matchReasons(contact, campaign.audience),
  })).filter((item) => item.reasons.length);

  const [needsResearch, readyForReview, unverified] = await Promise.all([
    Contact.countDocuments({ status: { $ne: "archived" }, researchStatus: "needs_research" }),
    Contact.countDocuments({ status: { $ne: "archived" }, researchStatus: "ready_for_review" }),
    Contact.countDocuments({ status: { $ne: "archived" }, qualifyContact: true, emailStatus: { $ne: "verified" } }),
  ]);

  return {
    campaign,
    matches,
    counts: {
      matched: matches.length,
      alreadyAssigned: matches.filter(({ contact }) => contact.campaignIds?.some((id) => String(id) === String(campaign._id))).length,
      eligible: eligible.length,
      needsResearch,
      readyForReview,
      qualifiedButUnverified: unverified,
    },
  };
}

async function assignCampaignMatches(campaignId) {
  const preview = await getCampaignMatches(campaignId);
  const ids = preview.matches.map(({ contact }) => contact._id);
  if (ids.length) {
    await Contact.updateMany({ _id: { $in: ids } }, { $addToSet: { campaignIds: preview.campaign._id } });
  }
  preview.campaign.audienceMatch = {
    matchedCount: ids.length,
    lastMatchedAt: new Date(),
  };
  await preview.campaign.save();
  return {
    ...preview.counts,
    assigned: ids.length,
    contacts: preview.matches.map(({ contact, reasons }) => ({
      _id: contact._id,
      name: contact.name,
      email: contact.email,
      company: contact.company,
      reasons,
    })),
  };
}

module.exports = {
  AUDIENCE_TERMS,
  assignCampaignMatches,
  getCampaignMatches,
  matchReasons,
  searchableText,
};
