const CoachingSession = require("../models/CoachingSession");
const Enrollment = require("../models/Enrollment");
const Contact = require("../models/Contact");
const IntegrationConnection = require("../models/IntegrationConnection");
const CoachProfile = require("../models/CoachProfile");
const WorkspaceMembership = require("../models/WorkspaceMembership");
const ZoomWebhookEvent = require("../models/ZoomWebhookEvent");
const CrmActivity = require("../models/CrmActivity");
const CommunicationJob = require("../models/CommunicationJob");
const googleCalendarService = require("./googleCalendarService");
const zoomService = require("./zoomService");

const dependencies = { CoachingSession, Enrollment, Contact, IntegrationConnection, CoachProfile, WorkspaceMembership, ZoomWebhookEvent, CrmActivity, CommunicationJob, googleCalendarService, zoomService };

async function contextFor(session, models) {
  const [enrollment, contact] = await Promise.all([
    models.Enrollment.findOne({ _id: session.enrollmentId, workspaceId: session.workspaceId }),
    models.Contact.findOne({ _id: session.contactId, workspaceId: session.workspaceId }),
  ]);
  return { contactName: contact?.name || [contact?.firstName, contact?.lastName].filter(Boolean).join(" ") || "Student", programName: enrollment?.programSnapshot?.name || "Coaching", stageKey: session.stageKey || enrollment?.currentStageKey || "" };
}

async function schedule(input, models = dependencies) {
  const videoMode = ["zoom", "external"].includes(input.videoMode) ? input.videoMode : "none";
  if (videoMode === "zoom") await models.zoomService.connectedConnection({ workspaceId: input.workspaceId, coachProfileId: input.coachProfileId }, models);
  const session = await models.googleCalendarService.scheduleSession(input, models);
  session.videoMode = videoMode; await session.save();
  if (videoMode !== "zoom") return session;
  try {
    await models.zoomService.createMeeting({ workspaceId: input.workspaceId, session, context: await contextFor(session, models) }, models);
    await models.googleCalendarService.syncVideoLink({ workspaceId: input.workspaceId, session }, models);
    return session;
  } catch (error) {
    try { await models.googleCalendarService.cancelSession({ workspaceId: input.workspaceId, sessionId: session._id, reason: "Zoom meeting creation failed", updatedBy: input.createdBy }, models); } catch { /* preserve the original provider failure */ }
    throw error;
  }
}

async function reschedule(input, models = dependencies) {
  const cancelled = models.CommunicationJob ? await models.CommunicationJob.updateMany({ workspaceId: input.workspaceId, coachingSessionId: input.sessionId, status: "pending" }, { $set: { status: "cancelled", cancelledAt: new Date(), blockReason: "Session rescheduled" } }) : { modifiedCount: 0 };
  if (cancelled.modifiedCount) await models.CrmActivity.create({ workspaceId: input.workspaceId, type: "system", title: "Stale coaching reminders cancelled", source: "crm", createdBy: input.updatedBy, metadata: { eventType: "coaching.communication.cancelled", coachingSessionId: input.sessionId, count: cancelled.modifiedCount, reason: "rescheduled" } });
  const session = await models.googleCalendarService.rescheduleSession(input, models);
  if (session.videoMode === "zoom") {
    await models.zoomService.updateMeeting({ workspaceId: input.workspaceId, session, context: await contextFor(session, models), updatedBy: input.updatedBy }, models);
    await models.googleCalendarService.syncVideoLink({ workspaceId: input.workspaceId, session }, models);
  }
  return session;
}

async function cancel(input, models = dependencies) {
  const session = await models.CoachingSession.findOne({ _id: input.sessionId, workspaceId: input.workspaceId, status: "scheduled" });
  if (!session) { const error = new Error("Scheduled coaching session not found"); error.code = "SESSION_NOT_FOUND"; throw error; }
  if (session.videoMode === "zoom") await models.zoomService.cancelMeeting({ workspaceId: input.workspaceId, session, updatedBy: input.updatedBy }, models);
  const cancelled = models.CommunicationJob ? await models.CommunicationJob.updateMany({ workspaceId: input.workspaceId, coachingSessionId: session._id, status: "pending" }, { $set: { status: "cancelled", cancelledAt: new Date(), blockReason: "Session cancelled" } }) : { modifiedCount: 0 };
  if (cancelled.modifiedCount) await models.CrmActivity.create({ workspaceId: input.workspaceId, contactId: session.contactId, type: "system", title: "Coaching reminders cancelled", source: "crm", createdBy: input.updatedBy, metadata: { eventType: "coaching.communication.cancelled", coachingSessionId: session._id, count: cancelled.modifiedCount, reason: "cancelled" } });
  return models.googleCalendarService.cancelSession(input, models);
}

module.exports = { schedule, reschedule, cancel, contextFor, _dependencies: dependencies };
