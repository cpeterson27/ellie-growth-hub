const express = require("express");
const Partner = require("../models/Partner");
const router = express.Router();
router.get("/", async (_req, res) => { try { res.json(await Partner.find().sort({ createdAt: -1 })); } catch { res.status(500).json({ message: "Unable to load partners" }); } });
router.post("/", async (req, res) => { try { const partner = await Partner.create(req.body); res.status(201).json(partner); } catch (err) { res.status(400).json({ message: err.message || "Unable to create partner" }); } });
router.patch("/:id", async (req, res) => { try { const partner = await Partner.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true }); if (!partner) return res.status(404).json({ message: "Partner not found" }); res.json(partner); } catch { res.status(400).json({ message: "Unable to update partner" }); } });
module.exports = router;
