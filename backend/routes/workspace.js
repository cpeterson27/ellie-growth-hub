const express = require("express");
const WorkspaceConfig = require("../models/WorkspaceConfig");
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

module.exports = router;
