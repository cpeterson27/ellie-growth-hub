const Contact = require("../models/Contact");
const Enrollment = require("../models/Enrollment");
const CoachAssignment = require("../models/CoachAssignment");
const CoachingSession = require("../models/CoachingSession");
const SalesOpportunity = require("../models/SalesOpportunity");
const SkoolPurchase = require("../models/SkoolPurchase");
const Event = require("../models/Event");

const dependencies = { Contact, Enrollment, CoachAssignment, CoachingSession, SalesOpportunity, SkoolPurchase, Event };
const allowedKinds = new Set(["all_prospects", "sales_stage", "eventbrite_registrants", "eventbrite_attendees", "eventbrite_no_shows", "active_students", "program", "program_stage", "coach_students", "alumni", "inactive_students", "addon_purchasers", "upcoming_sessions"]);
function segmentError(message) { const error = new Error(message); error.code = "SEGMENT_INVALID"; return error; }

async function contactIdsForSegment({ workspaceId, segment }, models = dependencies) {
  const kind = String(segment?.kind || "");
  if (!allowedKinds.has(kind)) throw segmentError("Unsupported communication segment");
  let ids = [];
  if (kind === "all_prospects") ids = (await models.Contact.find({ workspaceId, status: "prospect" }).select("_id").lean()).map((row) => row._id);
  if (kind === "sales_stage") ids = (await models.SalesOpportunity.find({ workspaceId, stageKey: String(segment.stageKey || "") }).select("primaryContactId").lean()).map((row) => row.primaryContactId).filter(Boolean);
  if (kind === "eventbrite_registrants") ids = (await models.Contact.find({ workspaceId, $or: [{ sourceProvider: "eventbrite" }, { sources: "eventbrite" }] }).select("_id").lean()).map((row) => row._id);
  if (["eventbrite_attendees", "eventbrite_no_shows"].includes(kind)) {
    if (kind === "eventbrite_no_shows") { if (!segment.eventId) throw segmentError("A completed Eventbrite event is required for no-show targeting"); const event = await models.Event.findOne({ workspaceId, "integrations.eventbrite.eventId": String(segment.eventId), endDate: { $lt: new Date() } }).lean(); if (!event) throw segmentError("No-show targeting is available only after the selected event ends"); }
    ids = (await models.Contact.find({ workspaceId, eventParticipations: { $elemMatch: { provider: "eventbrite", status: kind === "eventbrite_attendees" ? "attended" : "registered", ...(segment.eventId ? { eventId: String(segment.eventId) } : {}) } } }).select("_id").lean()).map((row) => row._id);
  }
  if (["active_students", "program", "program_stage", "alumni", "inactive_students"].includes(kind)) {
    const filter = { workspaceId };
    if (kind === "active_students") filter.status = "active";
    if (kind === "program") filter.coachingProgramId = segment.coachingProgramId;
    if (kind === "program_stage") { filter.coachingProgramId = segment.coachingProgramId; filter.currentStageKey = String(segment.stageKey || ""); }
    if (kind === "alumni") filter.status = "completed";
    if (kind === "inactive_students") filter.status = { $in: ["paused", "cancelled"] };
    ids = (await models.Enrollment.find(filter).select("contactId").lean()).map((row) => row.contactId);
  }
  if (kind === "coach_students") ids = (await models.CoachAssignment.find({ workspaceId, coachProfileId: segment.coachProfileId, status: { $in: ["active", "scheduled"] } }).select("contactId").lean()).map((row) => row.contactId);
  if (kind === "addon_purchasers") ids = (await models.SkoolPurchase.find({ workspaceId, ...(segment.productKey ? { productKey: segment.productKey } : {}) }).select("contactId").lean()).map((row) => row.contactId);
  if (kind === "upcoming_sessions") ids = (await models.CoachingSession.find({ workspaceId, status: "scheduled", startsAt: { $gte: new Date() }, ...(segment.coachingProgramId ? { coachingProgramId: segment.coachingProgramId } : {}) }).select("contactId").lean()).map((row) => row.contactId);
  return [...new Set(ids.filter(Boolean).map(String))];
}

async function resolveSegment(input, models = dependencies) {
  const ids = await contactIdsForSegment(input, models);
  return models.Contact.find({ workspaceId: input.workspaceId, _id: { $in: ids }, status: { $nin: ["archived", "invalid"] } }).sort({ name: 1 }).lean();
}
module.exports = { allowedKinds, contactIdsForSegment, resolveSegment, _dependencies: dependencies };
