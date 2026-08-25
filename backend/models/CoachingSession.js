const mongoose = require("mongoose");
const workspacePlugin = require("../tenancy/workspacePlugin");

const coachingSessionSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
  contactId: { type: mongoose.Schema.Types.ObjectId, ref: "Contact", required: true, index: true },
  enrollmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Enrollment", required: true, index: true },
  coachProfileId: { type: mongoose.Schema.Types.ObjectId, ref: "CoachProfile", required: true, index: true },
  coachingProgramId: { type: mongoose.Schema.Types.ObjectId, ref: "CoachingProgram", required: true, index: true },
  stageKey: { type: String, default: "", trim: true, lowercase: true, maxlength: 80 },
  startsAt: { type: Date, required: true, index: true },
  durationMinutes: { type: Number, required: true, min: 15, max: 480, default: 60 },
  timezone: { type: String, default: "UTC", trim: true, maxlength: 100 },
  status: { type: String, enum: ["scheduled", "cancelled", "completed"], default: "scheduled", index: true },
  calendar: {
    provider: { type: String, enum: ["google_calendar"], default: "google_calendar" },
    connectionId: { type: mongoose.Schema.Types.ObjectId, ref: "IntegrationConnection", default: null },
    calendarId: { type: String, default: "", trim: true, maxlength: 1024 },
    eventId: { type: String, default: "", trim: true, maxlength: 1024 },
    htmlLink: { type: String, default: "", trim: true, maxlength: 2048 },
  },
  videoMode: { type: String, enum: ["none", "zoom", "external"], default: "none", index: true },
  zoom: {
    connectionId: { type: mongoose.Schema.Types.ObjectId, ref: "IntegrationConnection", default: null },
    meetingId: { type: String, default: "", trim: true, maxlength: 255 },
    joinUrl: { type: String, default: "", trim: true, maxlength: 2048 },
    hostUserId: { type: String, default: "", trim: true, maxlength: 255 },
    hostEmail: { type: String, default: "", trim: true, lowercase: true, maxlength: 320 },
    status: { type: String, enum: ["", "created", "started", "ended", "cancelled"], default: "" },
    attendance: {
      state: { type: String, enum: ["unknown", "attended", "no_show"], default: "unknown" },
      participantCount: { type: Number, default: 0, min: 0 },
      firstJoinedAt: { type: Date, default: null },
      lastLeftAt: { type: Date, default: null },
      participants: { type: [mongoose.Schema.Types.Mixed], default: [], select: false },
    },
  },
  cancelledAt: { type: Date, default: null },
  cancellationReason: { type: String, default: "", trim: true, maxlength: 500 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: true, collection: "coaching_sessions" });

coachingSessionSchema.index({ workspaceId: 1, coachProfileId: 1, startsAt: 1 });
coachingSessionSchema.index({ workspaceId: 1, enrollmentId: 1, startsAt: -1 });
coachingSessionSchema.index(
  { workspaceId: 1, "calendar.connectionId": 1, "calendar.eventId": 1 },
  { unique: true, partialFilterExpression: { "calendar.eventId": { $gt: "" } } },
);
coachingSessionSchema.index(
  { workspaceId: 1, "zoom.meetingId": 1 },
  { unique: true, partialFilterExpression: { "zoom.meetingId": { $gt: "" } } },
);
coachingSessionSchema.plugin(workspacePlugin);

module.exports = mongoose.model("CoachingSession", coachingSessionSchema);
