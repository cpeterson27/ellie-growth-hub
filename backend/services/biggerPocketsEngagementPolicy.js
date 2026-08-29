const { isBiggerPocketsForumTopicUrl } = require("./intentSourceService");

const POLICY_MESSAGE = "No promotional outreach — BiggerPockets policy.";

function isBiggerPocketsSignal(signal = {}) {
  return isBiggerPocketsForumTopicUrl(signal.sourceUrl)
    || signal.raw?.indexedSourceLabel === "BiggerPockets forum via Bing";
}

function publicResponseDraft(signal = {}) {
  const text = `${signal.title || ""} ${signal.excerpt || ""}`.toLowerCase();
  const guidance = [];
  if (/coach|coaching|mentor|mentoring|program|course|training/.test(text)) guidance.push("compare the curriculum, instructor track record, access to deal-specific feedback, and whether former participants can describe concrete outcomes");
  if (/underwrit|deal analysis|cap rate|noi|debt service/.test(text)) guidance.push("ask each option to walk through how they teach underwriting, debt assumptions, downside cases, and review of an actual practice deal");
  if (/\$\s?\d|price|cost|budget/.test(text)) guidance.push("write down the specific support included at the quoted price and compare it with lower-cost education, local investor groups, and paying specialists only for the gaps you cannot validate yourself");
  if (/overwhelmed|stuck|confused|guidance/.test(text)) guidance.push("narrow the decision to the next skill you need rather than trying to solve the entire multifamily process at once");
  if (!guidance.length) guidance.push("define the exact decision you need help making, then compare options using verifiable experience, a clear curriculum, and references you can speak with directly");
  return `For the situation described here, a practical way to evaluate the options is to ${guidance.join(". Also, ")}. Before paying, ask for a written outline of what is included, who provides feedback, how often you can get help, and what happens if the format is not a fit. That makes it easier to compare the value without relying only on testimonials.`;
}

function prohibitedPublicResponseContent(value) {
  const text = String(value || "");
  const rules = [
    [/https?:\/\/|www\.|\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b|\b(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/i, "contact information or a link"],
    [/\b(?:dm me|message me|contact me|reach out|book a call|schedule a call|call me|email me|let me know|feel free to|if you(?:'re| are) interested|happy to share|glad to share|i can share|we can share|would be happy to)\b/i, "an invitation, promotional transition, or contact request"],
    [/\b(?:ellie(?:'s)?(?: coaching)?|growth operator)\b/i, "a prohibited Ellie or Growth Operator mention"],
    [/\b(?:i work with|we work with|i work for|we work for|affiliated with|on behalf of|our team|my team|our company|my company|our business|my business|our brand|my brand|our program|my program|our course|my course|our service|my service|our product|my product|our client|my client)\b/i, "a company, brand, client, affiliation, program, product, or service mention"],
    [/\b(?:we help|i help|we offer|i offer|we provide|i provide|we sell|i sell|check (?:us|me|it) out|learn more|sign up|enroll|apply now|limited offer)\b/i, "direct or indirect solicitation"],
  ];
  return rules.filter(([pattern]) => pattern.test(text)).map(([, reason]) => reason);
}

function assertNoBiggerPocketsSolicitation(signal, action) {
  if (!isBiggerPocketsSignal(signal)) return;
  const error = new Error(`${POLICY_MESSAGE} ${action} is blocked unless documented inbound interest or an independently sourced relationship exists.`);
  error.code = "BIGGERPOCKETS_OUTREACH_BLOCKED";
  throw error;
}

function validIndependentRelationship(input = {}) {
  return ["inbound_interest", "independent_relationship"].includes(String(input.relationshipBasis || ""))
    && String(input.relationshipNote || "").trim().length >= 20;
}

module.exports = { POLICY_MESSAGE, assertNoBiggerPocketsSolicitation, isBiggerPocketsSignal, prohibitedPublicResponseContent, publicResponseDraft, validIndependentRelationship };
