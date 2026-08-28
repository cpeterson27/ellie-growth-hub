const IntentSignal = require("../models/IntentSignal");
const ResearchMonitor = require("../models/ResearchMonitor");
const Contact = require("../models/Contact");
const Organization = require("../models/Organization");
const SalesOpportunity = require("../models/SalesOpportunity");
const CrmActivity = require("../models/CrmActivity");
const agentExecutionService = require("./agentExecutionService");

const deps = { IntentSignal, ResearchMonitor, Contact, Organization, SalesOpportunity, CrmActivity, agentExecutionService };
const clean = (value, limit = 1000) => String(value || "").replaceAll("\u0000", "").trim().slice(0, limit);
const normalizedEmail = (value) => { const email = clean(value, 320).toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : ""; };
const priorityFor = (score) => score >= 90 ? "urgent" : score >= 80 ? "high" : score >= 60 ? "medium" : "low";

function deterministicQualification(signal = {}) {
  const score = Math.min(100, Math.max(0, Number(signal.score) || 0));
  const reasons = [...new Set((signal.scoreReasons || []).map((item) => clean(item, 500)).filter(Boolean))];
  const evidence = (signal.evidence || []).map((item) => ({ label: clean(item.label || "Public source", 200), url: clean(item.url, 2000), observedAt: item.observedAt || signal.discoveredAt || new Date() })).filter((item) => item.url);
  const warnings = [];
  if (signal.identityResolution?.status !== "supported") warnings.push("Identity is not fully supported by the collected public evidence.");
  if (!evidence.length) warnings.push("No structured evidence items are attached; review the original source before outreach.");
  if (["hypothetical_or_student", "promotion", "job_seeker", "irrelevant"].includes(signal.classification) || signal.audienceEligible === false || score < 45) return { qualificationStatus: "not_qualified", score, priority: "low", confidence: evidence.length ? 0.8 : 0.55, reasons, evidence, likelyNeed: "", recommendedNextAction: "Do not add to the Closer Queue without new evidence.", warnings, method: "deterministic", aiUseful: false };
  if (signal.classification === "buyer_intent" && score >= 80 && signal.identityResolution?.status === "supported") return { qualificationStatus: "qualified", score, priority: priorityFor(score), confidence: Math.min(0.95, 0.72 + evidence.length * 0.05), reasons, evidence, likelyNeed: clean(signal.title || signal.excerpt, 1000), recommendedNextAction: "Review the source evidence and contact timeline before choosing outreach.", warnings, method: "deterministic", aiUseful: false };
  return { qualificationStatus: "needs_review", score, priority: priorityFor(score), confidence: evidence.length ? 0.55 : 0.35, reasons, evidence, likelyNeed: clean(signal.title || signal.excerpt, 1000), recommendedNextAction: "Review the evidence and confirm fit before assigning outreach.", warnings, method: "deterministic", aiUseful: score >= 55 && evidence.length > 0 };
}

async function evaluate({ workspaceId, userId, signalId, auth, useAi = false }, models = deps) {
  const signal = await models.IntentSignal.findOne({ _id: signalId, workspaceId }).lean();
  if (!signal) { const error = new Error("Lead signal not found"); error.code = "LEAD_SIGNAL_NOT_FOUND"; throw error; }
  const monitor = signal.monitorId ? await models.ResearchMonitor.findOne({ _id: signal.monitorId, workspaceId }).lean() : null;
  const deterministic = deterministicQualification(signal);
  let result = { ...deterministic, aiInferences: [] };
  if (useAi && deterministic.aiUseful) {
    const ai = await models.agentExecutionService.runAgent({ workspaceId, userId, agent: "lead", task: "qualify_generated_lead", input: { signal: { title: signal.title, excerpt: signal.excerpt, source: signal.source, classification: signal.classification, score: signal.score, scoreReasons: signal.scoreReasons, matchedKeywords: signal.matchedKeywords, identityResolution: signal.identityResolution, evidence: deterministic.evidence }, monitor: monitor ? { name: monitor.name, goal: monitor.goal, description: monitor.description, buyingIntentSignals: monitor.buyingIntentSignals, exclusions: monitor.alwaysIgnore } : null }, operationalContext: "The supplied signal and monitor fields are authoritative collected evidence. Do not infer an identity or buying action not present in them.", correlationId: `lead-qualification:${signal._id}`, auth, options: { responseSchema: { type: "object", properties: { qualificationStatus: { type: "string", enum: ["qualified", "needs_review", "not_qualified"] }, confidence: { type: "number", minimum: 0, maximum: 1 }, reasons: { type: "array", items: { type: "string" } }, likelyNeed: { type: "string" }, recommendedNextAction: { type: "string" }, warnings: { type: "array", items: { type: "string" } } }, required: ["qualificationStatus", "confidence", "reasons", "likelyNeed", "recommendedNextAction", "warnings"], additionalProperties: false } } });
    const output = ai.output || {};
    result = { ...deterministic, qualificationStatus: deterministic.qualificationStatus === "not_qualified" ? "not_qualified" : output.qualificationStatus, confidence: Math.min(deterministic.confidence, Number(output.confidence) || deterministic.confidence), likelyNeed: clean(output.likelyNeed || deterministic.likelyNeed), recommendedNextAction: clean(output.recommendedNextAction || deterministic.recommendedNextAction), warnings: [...new Set([...deterministic.warnings, ...(output.warnings || []).map((item) => clean(item, 500))])], aiInferences: (output.reasons || []).map((item) => clean(item, 500)).filter(Boolean), method: "deterministic_plus_ai" };
  }
  return { signal, monitor, qualification: result, aiCalled: Boolean(useAi && deterministic.aiUseful) };
}

async function converge({ workspaceId, userId, signal, qualification, input = {} }, models = deps) {
  if (!signal || !qualification || !["qualified", "needs_review"].includes(qualification.qualificationStatus)) { const error = new Error("Only reviewed lead signals can enter the CRM workflow"); error.code = "LEAD_NOT_READY"; throw error; }
  const name = clean(input.name || signal.authorName, 240);
  if (!name || name.split(/\s+/).length < 2) { const error = new Error("A supported first and last name are required before CRM conversion"); error.code = "LEAD_IDENTITY_REQUIRED"; throw error; }
  const email = normalizedEmail(input.email || signal.publishedEmails?.[0]);
  const providerFilter = { workspaceId, sourceProvider: "intent_monitor", providerContactId: String(signal._id) };
  let contact = email ? await models.Contact.findOne({ workspaceId, email }) : null;
  contact ||= await models.Contact.findOne(providerFilter);
  let organization = null;
  const company = clean(input.company || signal.organizationName || signal.organizationDomain, 240);
  if (company && signal.identityResolution?.status === "supported") organization = await models.Organization.findOneAndUpdate({ workspaceId, ...(signal.organizationDomain ? { domain: signal.organizationDomain } : { normalizedName: company.toLowerCase() }) }, { $setOnInsert: { workspaceId, name: company, normalizedName: company.toLowerCase(), source: "public_web" }, $set: { website: signal.organizationDomain ? `https://${signal.organizationDomain}` : undefined, lastResearchVerifiedAt: new Date() } }, { upsert: true, new: true, setDefaultsOnInsert: true });
  const parts = name.split(/\s+/), evidenceNote = `Public lead evidence: ${signal.title || signal.excerpt}\nSource: ${signal.sourceUrl}`;
  if (!contact) contact = new models.Contact({ workspaceId, name, firstName: parts[0], lastName: parts.slice(1).join(" "), ...(email ? { email } : {}), company, organizationId: organization?._id || null, sourceProvider: "intent_monitor", providerContactId: String(signal._id), providerRecordId: signal.sourceId, sources: ["public_web", signal.source], status: "active", type: "lead", stage: "Needs Research", researchStatus: qualification.qualificationStatus === "qualified" ? "qualified" : "ready_for_review", qualifyContact: qualification.qualificationStatus === "qualified", tags: ["intent-signal", signal.source], website: signal.sourceUrl, notes: evidenceNote, additionalFields: { intentSignalIds: [String(signal._id)] } });
  else {
    contact.name ||= name; contact.firstName ||= parts[0]; contact.lastName ||= parts.slice(1).join(" "); if (email && !contact.email) contact.email = email;
    contact.sources = [...new Set([...(contact.sources || []), "public_web", signal.source])]; contact.tags = [...new Set([...(contact.tags || []), "intent-signal", signal.source])];
    contact.additionalFields = { ...(contact.additionalFields || {}), intentSignalIds: [...new Set([...(contact.additionalFields?.intentSignalIds || []), String(signal._id)])] };
    if (!String(contact.notes || "").includes(signal.sourceUrl)) contact.notes = [contact.notes, evidenceNote].filter(Boolean).join("\n\n");
    if (qualification.qualificationStatus === "qualified") { contact.researchStatus = "qualified"; contact.qualifyContact = true; }
    if (!contact.organizationId && organization) contact.organizationId = organization._id;
  }
  await contact.save();
  let opportunity = await models.SalesOpportunity.findOne({ workspaceId, primaryContactId: contact._id, stageKey: { $nin: ["won", "lost"] } });
  const createdOpportunity = !opportunity;
  if (!opportunity) opportunity = new models.SalesOpportunity({ workspaceId, name: `${contact.name} — generated lead`, stageKey: qualification.qualificationStatus === "qualified" ? "qualified" : "new", primaryContactId: contact._id, organizationId: contact.organizationId || null, probability: qualification.qualificationStatus === "qualified" ? 25 : 10 });
  opportunity.leadQualification = { status: qualification.qualificationStatus, score: qualification.score, priority: qualification.priority, confidence: qualification.confidence, reasons: qualification.reasons, observedEvidence: qualification.evidence, aiInferences: qualification.aiInferences, likelyNeed: qualification.likelyNeed, recommendedNextAction: qualification.recommendedNextAction, warnings: qualification.warnings, method: qualification.method, evaluatedAt: new Date(), sourceSignalId: signal._id };
  opportunity.leadLifecycle = { ...(opportunity.leadLifecycle?.toObject?.() || opportunity.leadLifecycle || {}), status: qualification.qualificationStatus === "qualified" ? "qualified" : "evaluating", statusAt: new Date() };
  opportunity.leadAttribution = { ...(opportunity.leadAttribution?.toObject?.() || opportunity.leadAttribution || {}), source: signal.source, monitorId: signal.monitorId, signalId: signal._id, sourceUrl: signal.sourceUrl };
  opportunity.nextAction ||= qualification.recommendedNextAction;
  await opportunity.save();
  await models.IntentSignal.updateOne({ _id: signal._id, workspaceId }, { $set: { status: "converted" } });
  await models.CrmActivity.findOneAndUpdate({ workspaceId, contactId: contact._id, "metadata.eventKey": `generated-lead:${signal._id}` }, { $setOnInsert: { workspaceId, contactId: contact._id, organizationId: contact.organizationId || null, type: "research", title: "Generated lead entered Sales CRM", body: qualification.reasons.join("\n"), source: "research", createdBy: userId, metadata: { eventKey: `generated-lead:${signal._id}`, eventType: "lead.qualified", opportunityId: opportunity._id, signalId: signal._id, score: qualification.score, source: signal.source } } }, { upsert: true, new: true, setDefaultsOnInsert: true });
  return { contact, organization, opportunity, createdOpportunity };
}

module.exports = { converge, deterministicQualification, evaluate, priorityFor };
