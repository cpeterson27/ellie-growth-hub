const express = require("express");
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

module.exports = router;
