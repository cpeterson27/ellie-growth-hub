const express = require("express");
const WorkspaceConfig = require("../models/WorkspaceConfig");
const router = express.Router();

router.get("/", async (_req, res) => {
  const config = await WorkspaceConfig.findOneAndUpdate(
    { key: "primary" },
    { $setOnInsert: { workspaceName: "Ellie AI Growth Operator" } },
    { upsert: true, new: true },
  );
  res.json({ workspaceName: config.workspaceName });
});

router.patch("/", async (req, res) => {
  const workspaceName = String(req.body?.workspaceName || "").trim();
  if (workspaceName.length < 2) return res.status(400).json({ error: "Enter a workspace name." });
  const config = await WorkspaceConfig.findOneAndUpdate(
    { key: "primary" },
    { $set: { workspaceName } },
    { upsert: true, new: true },
  );
  res.json({ workspaceName: config.workspaceName });
});

module.exports = router;
