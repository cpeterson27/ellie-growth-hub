const mongoose = require("mongoose");
const { currentWorkspaceId } = require("./workspaceContext");

const QUERY_OPERATIONS = ["countDocuments", "deleteMany", "deleteOne", "distinct", "find", "findOne", "findOneAndDelete", "findOneAndReplace", "findOneAndUpdate", "replaceOne", "updateMany", "updateOne"];

function enforcementEnabled() {
  return String(process.env.TENANT_QUERY_ENFORCEMENT || "enabled").toLowerCase() !== "disabled";
}

function workspacePlugin(schema) {
  if (!schema.path("workspaceId")) {
    schema.add({
      workspaceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Workspace",
        default: null,
        index: true,
      },
    });
  }

  schema.pre(QUERY_OPERATIONS, function scopeWorkspaceQuery() {
    const workspaceId = currentWorkspaceId();
    if (!workspaceId || !enforcementEnabled()) return;
    this.where({ workspaceId });
    const update = this.getUpdate?.();
    if (!update) return;
    if (update.$set) update.$set.workspaceId = workspaceId;
    else if (!Object.keys(update).some((key) => key.startsWith("$"))) update.workspaceId = workspaceId;
    this.setUpdate(update);
  });

  schema.pre("aggregate", function scopeWorkspaceAggregate() {
    const workspaceId = currentWorkspaceId();
    if (!workspaceId || !enforcementEnabled()) return;
    const match = { workspaceId: new mongoose.Types.ObjectId(workspaceId) };
    this.pipeline().splice(this.pipeline()[0]?.$geoNear ? 1 : 0, 0, { $match: match });
  });

  schema.pre("validate", function assignWorkspaceToDocument() {
    const workspaceId = currentWorkspaceId();
    if (workspaceId) this.workspaceId = workspaceId;
  });

  schema.pre("insertMany", function assignWorkspaceToMany(documents) {
    const workspaceId = currentWorkspaceId();
    if (workspaceId) {
      for (const document of documents || []) document.workspaceId = workspaceId;
    }
  });
}

module.exports = workspacePlugin;
