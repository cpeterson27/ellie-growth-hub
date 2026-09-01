const assert = require("assert");
const { applyCanonicalEventDate, formatEventDate, generateOutreachDraft } = require("./utils/outreachGenerator");

const campaign = {
  name: "Deal to Close: Multifamily Bootcamp",
  campaignKind: "event",
  startDate: new Date("2026-09-12T12:00:00.000Z"),
  content: {
    subject: "Your Deal to Close invitation",
    body: "Join us Saturday, August 22, 2026 for {{campaignName}}.",
    callToAction: "Register now",
    callToActionUrl: "https://www.eventbrite.com/e/1994515277887",
  },
  registrationLinks: { eventbrite: { url: "https://www.eventbrite.com/e/1994515277887" } },
  brand: {
    logoUrl: "https://cdn.example.com/event-logo.png",
    flyerUrl: "https://cdn.example.com/event-flyer.png",
  },
};

const draft = generateOutreachDraft({ firstName: "Jordan", name: "Jordan Lee" }, campaign);
assert.equal(formatEventDate(campaign.startDate), "Saturday, September 12, 2026");
assert.match(draft.emailDraft, /Saturday, September 12, 2026/);
assert.doesNotMatch(draft.emailDraft, /August 22/);
assert.equal(draft.flyerUrl, campaign.brand.flyerUrl);
assert.match(draft.htmlBody, /event-logo\.png/);
assert.match(draft.htmlBody, /event-flyer\.png/);
assert.ok(draft.htmlBody.indexOf("event-logo.png") < draft.htmlBody.indexOf("event-flyer.png"));
assert.equal(
  applyCanonicalEventDate("Saturday, August 22, 2026 and {{eventDate}}", "Saturday, September 12, 2026", campaign.name),
  "Saturday, September 12, 2026 and Saturday, September 12, 2026",
);

const legacyDraft = generateOutreachDraft(
  { firstName: "Jordan" },
  { ...campaign, brand: { logoUrl: "https://cdn.example.com/legacy-flyer.png" } },
);
assert.equal(legacyDraft.flyerUrl, "https://cdn.example.com/legacy-flyer.png");
assert.equal((legacyDraft.htmlBody.match(/legacy-flyer\.png/g) || []).length, 1);

console.log("Campaign email date and separate brand asset tests passed.");
