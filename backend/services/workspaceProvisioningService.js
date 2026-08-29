const mongoose = require("mongoose");
const Workspace = require("../models/Workspace");
const WorkspaceMembership = require("../models/WorkspaceMembership");

const dependencies = { mongoose, Workspace, WorkspaceMembership };

function normalizeName(value) {
  const name = String(value || "").trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 120) throw new Error("Workspace name must be between 2 and 120 characters");
  return name;
}

function normalizeSlug(value) {
  const slug = String(value || "").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").replace(/-{2,}/g, "-");
  if (slug.length < 2 || slug.length > 80) throw new Error("Workspace slug must be between 2 and 80 letters, numbers, or hyphens");
  return slug;
}

async function createWorkspace({ name, slug, ownerUserId }, models = dependencies) {
  if (!ownerUserId) throw new Error("An initial workspace Owner is required");
  const values = { name: normalizeName(name), slug: normalizeSlug(slug), status: "active", billingStatus: "setup" };
  const session = await models.mongoose.startSession();
  let workspace;
  try {
    await session.withTransaction(async () => {
      [workspace] = await models.Workspace.create([values], { session });
      await models.WorkspaceMembership.create([{ workspaceId: workspace._id, userId: ownerUserId, role: "owner", roles: ["owner"], status: "active", permissionOverrides: { allow: [], deny: [] }, responsibilities: { programIds: [], applicationProgramIds: [], salesPipelineIds: [] } }], { session });
    });
    if (!workspace) throw new Error("Workspace creation did not complete");
    return workspace;
  } catch (error) {
    if (error?.code === 11000) throw Object.assign(new Error("That workspace slug is already in use"), { code: "WORKSPACE_SLUG_EXISTS" });
    throw error;
  } finally {
    await session.endSession();
  }
}

module.exports = { createWorkspace, normalizeName, normalizeSlug };
