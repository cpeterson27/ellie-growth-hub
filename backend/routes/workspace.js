const express = require("express");
const crypto = require("crypto");
const WorkspaceConfig = require("../models/WorkspaceConfig");
const User = require("../models/User");
const WorkspaceMembership = require("../models/WorkspaceMembership");
const { hashPassword } = require("../utils/passwords");
const router = express.Router();

router.get("/", async (_req, res) => {
  const config = await WorkspaceConfig.findOneAndUpdate(
    { key: "primary" },
    { $setOnInsert: { workspaceName: "Ellie AI Growth Operator" } },
    { upsert: true, new: true },
  );
  res.json({
    workspaceName: config.workspaceName,
    legalBusinessName: config.legalBusinessName,
    postalAddress: config.postalAddress,
    addressLine1: config.addressLine1,
    addressLine2: config.addressLine2,
    addressCity: config.addressCity,
    addressRegion: config.addressRegion,
    addressPostalCode: config.addressPostalCode,
    addressCountry: config.addressCountry,
    websiteUrl: config.websiteUrl,
    organizationLogoUrl: config.organizationLogoUrl,
  });
});

router.patch("/", async (req, res) => {
  const workspaceName = String(req.body?.workspaceName || "").trim();
  if (workspaceName.length < 2) return res.status(400).json({ error: "Enter a workspace name." });
  const config = await WorkspaceConfig.findOneAndUpdate(
    { key: "primary" },
    { $set: {
      workspaceName,
      legalBusinessName: String(req.body?.legalBusinessName || "").trim(),
      postalAddress: String(req.body?.postalAddress || "").trim(),
      addressLine1: String(req.body?.addressLine1 || "").trim(),
      addressLine2: String(req.body?.addressLine2 || "").trim(),
      addressCity: String(req.body?.addressCity || "").trim(),
      addressRegion: String(req.body?.addressRegion || "").trim(),
      addressPostalCode: String(req.body?.addressPostalCode || "").trim(),
      addressCountry: String(req.body?.addressCountry || "").trim(),
      websiteUrl: String(req.body?.websiteUrl || "").trim(),
      organizationLogoUrl: String(req.body?.organizationLogoUrl || "").trim(),
    } },
    { upsert: true, new: true },
  );
  res.json({
    workspaceName: config.workspaceName,
    legalBusinessName: config.legalBusinessName,
    postalAddress: config.postalAddress,
    addressLine1: config.addressLine1,
    addressLine2: config.addressLine2,
    addressCity: config.addressCity,
    addressRegion: config.addressRegion,
    addressPostalCode: config.addressPostalCode,
    addressCountry: config.addressCountry,
    websiteUrl: config.websiteUrl,
    organizationLogoUrl: config.organizationLogoUrl,
  });
});

router.get("/members", async (req, res) => {
  const memberships = await WorkspaceMembership.find({ workspaceId: req.auth.workspaceId })
    .populate("userId", "name email status lastLoginAt")
    .sort({ createdAt: 1 });
  res.json({ members: memberships.map((membership) => ({
    id: membership._id,
    name: membership.userId?.name || "",
    email: membership.userId?.email || "",
    role: membership.role,
    status: membership.status,
    lastLoginAt: membership.userId?.lastLoginAt || null,
  })) });
});

router.post("/members", async (req, res) => {
  if (!["owner", "admin"].includes(req.auth.role)) {
    return res.status(403).json({ error: "Only workspace owners and admins can add team members" });
  }
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const name = String(req.body?.name || "").trim();
    const role = ["admin", "member", "viewer"].includes(req.body?.role) ? req.body.role : "member";
    if (!email.includes("@") || name.length < 2) return res.status(400).json({ error: "Enter a name and valid email" });
    let user = await User.findOne({ email });
    if (!user) {
      user = await User.create({ name, email, passwordHash: await hashPassword(req.body?.temporaryPassword) });
    }
    const membership = await WorkspaceMembership.findOneAndUpdate(
      { workspaceId: req.auth.workspaceId, userId: user._id },
      { $set: { role, status: "active" } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    res.status(201).json({ member: { id: membership._id, name: user.name, email: user.email, role, status: "active" } });
  } catch (error) {
    res.status(400).json({ error: error.code === 11000 ? "That email already belongs to an account" : error.message });
  }
});

router.get("/discovery-templates", async (_req, res) => {
  const config = await WorkspaceConfig.findOneAndUpdate(
    { key: "primary" },
    { $setOnInsert: { workspaceName: "Ellie AI Growth Operator" } },
    { upsert: true, new: true },
  );
  res.json({ templates: config.discoveryTemplates || [] });
});

router.put("/discovery-templates", async (req, res) => {
  const templates = (Array.isArray(req.body?.templates) ? req.body.templates : [])
    .slice(0, 30)
    .map((template) => ({
      id: String(template.id || crypto.randomUUID()),
      name: String(template.name || "").trim().slice(0, 120),
      titles: String(template.titles || "").slice(0, 500),
      industries: String(template.industries || "").slice(0, 500),
      keywords: String(template.keywords || "").slice(0, 1000),
      locations: String(template.locations || "").slice(0, 500),
      employeeMin: String(template.employeeMin ?? "").slice(0, 12),
      employeeMax: String(template.employeeMax ?? "").slice(0, 12),
      industryIds: (Array.isArray(template.industryIds) ? template.industryIds : []).map(String).slice(0, 20),
      emailStatuses: (Array.isArray(template.emailStatuses) ? template.emailStatuses : []).map(String).slice(0, 5),
      seniorities: (Array.isArray(template.seniorities) ? template.seniorities : []).map(String).slice(0, 12),
      technologiesAny: String(template.technologiesAny || "").slice(0, 1000),
      technologiesAll: String(template.technologiesAll || "").slice(0, 1000),
      technologiesExclude: String(template.technologiesExclude || "").slice(0, 1000),
      revenueMin: String(template.revenueMin ?? "").slice(0, 20),
      revenueMax: String(template.revenueMax ?? "").slice(0, 20),
      fundingMin: String(template.fundingMin ?? "").slice(0, 20),
      fundingMax: String(template.fundingMax ?? "").slice(0, 20),
    }))
    .filter((template) => template.name);
  const config = await WorkspaceConfig.findOneAndUpdate(
    { key: "primary" },
    { $set: { discoveryTemplates: templates } },
    { upsert: true, new: true },
  );
  res.json({ templates: config.discoveryTemplates });
});

module.exports = router;
