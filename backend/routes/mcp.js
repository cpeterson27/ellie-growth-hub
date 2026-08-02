const express = require("express");
const { requireMcpAuth } = require("../middleware/mcpAuth");
const { handleMcpRequest } = require("../services/mcpServer");

const router = express.Router();
router.post("/", requireMcpAuth, (req, res, next) => handleMcpRequest(req, res).catch(next));
router.get("/", requireMcpAuth, (_req, res) => res.status(405).json({ error: "This stateless Ellie MCP endpoint accepts POST requests." }));
router.delete("/", requireMcpAuth, (_req, res) => res.status(405).json({ error: "Stateless MCP sessions do not require deletion." }));
module.exports = router;
