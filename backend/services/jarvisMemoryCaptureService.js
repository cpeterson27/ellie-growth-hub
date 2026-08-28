const crypto = require("crypto");
const GrowthActionApproval = require("../models/GrowthActionApproval");
const jarvisMemoryService = require("./jarvisMemoryService");

const CONFIRMATION_PHRASE = "SAVE BUSINESS MEMORY";
const clean = (value, limit) => String(value || "").replaceAll("\u0000", "").trim().slice(0, limit);

async function prepare({ workspaceId, userId, title, content, category }, dependencies = {}) {
  const Approval = dependencies.GrowthActionApproval || GrowthActionApproval;
  if (!jarvisMemoryService.CATEGORY_FOLDERS[category]) { const error = new Error("Select an approved memory category"); error.code = "MEMORY_CATEGORY_INVALID"; throw error; }
  const safeTitle = clean(title, 200), safeContent = clean(content, 120000);
  if (!safeTitle || !safeContent) { const error = new Error("Memory title and content are required"); error.code = "MEMORY_CONTENT_INVALID"; throw error; }
  const approval = await Approval.create({ workspaceId, userId, action: "save_business_memory", payload: { title: safeTitle, content: safeContent, category }, summary: { title: safeTitle, category, characterCount: safeContent.length }, confirmationPhrase: CONFIRMATION_PHRASE, expiresAt: new Date(Date.now() + 30 * 60 * 1000) });
  return { id: approval._id, action: approval.action, preview: approval.summary, content: safeContent, confirmationPhrase: CONFIRMATION_PHRASE, expiresAt: approval.expiresAt, stored: false };
}

async function confirm({ workspaceId, userId, approvalId, confirmationPhrase }, dependencies = {}) {
  const Approval = dependencies.GrowthActionApproval || GrowthActionApproval;
  const memory = dependencies.jarvisMemoryService || jarvisMemoryService;
  const approval = await Approval.findOne({ _id: approvalId, workspaceId, action: "save_business_memory", usedAt: null, expiresAt: { $gt: new Date() } });
  if (!approval) { const error = new Error("Memory approval was not found or has expired"); error.code = "MEMORY_APPROVAL_NOT_FOUND"; throw error; }
  const expected = Buffer.from(approval.confirmationPhrase), provided = Buffer.from(String(confirmationPhrase || ""));
  if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) { const error = new Error("Confirmation phrase does not match"); error.code = "MEMORY_CONFIRMATION_INVALID"; throw error; }
  const result = await memory.saveApprovedMemory({ workspaceId, userId, approvalId: approval._id, ...approval.payload }, dependencies);
  approval.usedAt = new Date();
  approval.summary = { ...(approval.summary?.toObject ? approval.summary.toObject() : approval.summary), confirmedByUserId: userId, resultSource: result.source, resultPath: result.path };
  await approval.save();
  return { approvalId: approval._id, ...result };
}

module.exports = { CONFIRMATION_PHRASE, confirm, prepare };
