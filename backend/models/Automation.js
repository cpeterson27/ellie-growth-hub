const mongoose = require("mongoose");
const workspacePlugin = require("../tenancy/workspacePlugin");

const conditionSchema = new mongoose.Schema({ field: { type: String, required: true, maxlength: 100 }, operator: { type: String, enum: ["equals", "not_equals", "in", "not_in", "exists", "not_exists", "contains", "gte", "lte", "older_than_minutes"], required: true }, value: { type: mongoose.Schema.Types.Mixed, default: null } }, { _id: false });
const actionSchema = new mongoose.Schema({ type: { type: String, required: true, maxlength: 100 }, delayMinutes: { type: Number, default: 0, min: 0, max: 525600 }, conditions: { type: [conditionSchema], default: [] }, config: { type: mongoose.Schema.Types.Mixed, default: {} } }, { _id: true });
const schema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 180 }, description: { type: String, default: "", maxlength: 2000 },
  status: { type: String, enum: ["draft", "enabled", "disabled", "archived"], default: "draft", index: true },
  trigger: { eventType: { type: String, required: true, index: true, maxlength: 120 } },
  conditions: { type: [conditionSchema], default: [] }, actions: { type: [actionSchema], default: [] },
  templateKey: { type: String, default: "", trim: true, maxlength: 100 },
  lastScannedAt: { type: Date, default: null }, enabledAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true, collection: "automations" });
schema.index({ workspaceId: 1, status: 1, "trigger.eventType": 1 });
schema.plugin(workspacePlugin);
module.exports = mongoose.model("Automation", schema);
