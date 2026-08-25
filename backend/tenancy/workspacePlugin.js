const mongoose = require("mongoose");
const { currentWorkspaceId } = require("./workspaceContext");

const QUERY_OPERATIONS = ["countDocuments", "deleteMany", "deleteOne", "distinct", "find", "findOne", "findOneAndDelete", "findOneAndReplace", "findOneAndUpdate", "replaceOne", "updateMany", "updateOne"];

function enforcementEnabled() {
  return String(process.env.TENANT_QUERY_ENFORCEMENT || "enabled").toLowerCase() !== "disabled";
}

function scopeWorkspaceUpdate(update, workspaceId) {
  if (!update) return update;
  if (update.$set) {
    // MongoDB rejects the same path in $set and $setOnInsert. Upserts commonly
    // place immutable ownership in $setOnInsert, so normalize it there rather
    // than creating a conflicting $set.workspaceId path.
    if (update.$setOnInsert && Object.prototype.hasOwnProperty.call(update.$setOnInsert, "workspaceId")) update.$setOnInsert.workspaceId = workspaceId;
    else update.$set.workspaceId = workspaceId;
  } else if (update.$setOnInsert) update.$setOnInsert.workspaceId = workspaceId;
  else if (!Object.keys(update).some((key) => key.startsWith("$"))) update.workspaceId = workspaceId;
  return update;
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
    this.setUpdate(scopeWorkspaceUpdate(update, workspaceId));
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
module.exports.scopeWorkspaceUpdate = scopeWorkspaceUpdate;
