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
      websiteUrl: String(req.body?.websiteUrl || "").trim(),
      organizationLogoUrl: String(req.body?.organizationLogoUrl || "").trim(),
    } },
    { upsert: true, new: true },
  );
  res.json({
    workspaceName: config.workspaceName,
    legalBusinessName: config.legalBusinessName,
    postalAddress: config.postalAddress,
    websiteUrl: config.websiteUrl,
    organizationLogoUrl: config.organizationLogoUrl,
  });
});

module.exports = router;
