/**
 * Contact Routes
 * Manage contacts and campaign recipient lists
 */

const express = require("express");
const mongoose = require("mongoose");
const contactService = require("../services/contactService");
const mondaySyncService = require("../services/mondaySyncService");
const { searchContacts } = require("../services/apollo");
const Contact = require("../models/Contact");

const router = express.Router();

/**
 * POST /api/contacts
 * Create contact (or update if duplicate by email+source)
 */
router.post("/", async (req, res) => {
  try {
    const {
      name,
      firstName,
      lastName,
      email,
      company,
      organizationId,
      source,
      externalId,
      tags,
      status,
    } = req.body;

    if (!email || !source) {
      return res
        .status(400)
        .json({ success: false, message: "Email and source are required" });
    }

    const contact = await contactService.upsertContact({
      name: name || `${firstName || ""} ${lastName || ""}`.trim(),
      firstName,
      lastName,
      email,
      company,
      organizationId: organizationId
        ? mongoose.Types.ObjectId(organizationId)
        : null,
      source,
      externalId,
      tags: tags || [],
      status: status || "active",
    });

    res
      .status(201)
      .json({
        success: true,
        data: contact,
        message: "Contact created/updated",
      });
  } catch (err) {
    if (err.message.includes("duplicate key")) {
      return res
        .status(409)
        .json({ success: false, message: "Duplicate contact" });
    }
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/contacts
 * List contacts with filters
 */
router.get("/", async (req, res) => {
  try {
    const {
      email,
      externalId,
      source,
      organizationId,
      status,
      tags,
      limit = 50,
      skip = 0,
    } = req.query;

    const query = {};
    if (email) query.email = email;
    if (externalId) query.externalId = externalId;
    if (source) query.source = source;
    if (organizationId && mongoose.Types.ObjectId.isValid(organizationId)) {
      query.organizationId = mongoose.Types.ObjectId(organizationId);
    }
    if (status) query.status = status;
    if (tags) query.tags = { $in: typeof tags === "string" ? [tags] : tags };

    const total = await Contact.countDocuments(query);
    const contacts = await Contact.find(query)
      .limit(Math.min(parseInt(limit) || 50, 500))
      .skip(parseInt(skip) || 0)
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: contacts,
      pagination: { total, limit, skip },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/contacts/:id
 * Get single contact
 */
router.get("/:id", async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid contact ID" });
    }

    const contact = await contactService.getContact(req.params.id);
    res.json({ success: true, data: contact });
  } catch (err) {
    res.status(404).json({ success: false, message: err.message });
  }
});

/**
 * PATCH /api/contacts/:id
 * Update contact
 */
router.patch("/:id", async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid contact ID" });
    }

    const contact = await contactService.updateContact(req.params.id, req.body);
    res.json({ success: true, data: contact, message: "Contact updated" });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

/**
 * DELETE /api/contacts/:id
 * Delete contact
 */
router.delete("/:id", async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid contact ID" });
    }

    await contactService.deleteContact(req.params.id);
    res.json({ success: true, message: "Contact deleted" });
  } catch (err) {
    res.status(404).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/contacts/check-duplicate
 * Check for duplicate contact
 */
router.post("/check-duplicate", async (req, res) => {
  try {
    const { email, source } = req.body;

    if (!email || !source) {
      return res
        .status(400)
        .json({ success: false, message: "Email and source required" });
    }

    const isDuplicate = await contactService.isDuplicate(email, source);
    res.json({ success: true, data: { isDuplicate } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/contacts/campaign/:campaignId/recipients
 * Get campaign recipient list from contacts
 */
router.get("/campaign/:campaignId/recipients", async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.campaignId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid campaign ID" });
    }

    const { organizationId, source, tags, limit = 500 } = req.query;
    const filters = {};

    if (organizationId && mongoose.Types.ObjectId.isValid(organizationId)) {
      filters.organizationId = mongoose.Types.ObjectId(organizationId);
    }
    if (source) filters.source = source;
    if (tags) filters.tags = typeof tags === "string" ? [tags] : tags;
    filters.limit = Math.min(parseInt(limit) || 500, 500);

    const recipients = await contactService.getCampaignRecipients(
      req.params.campaignId,
      filters,
    );
    res.json({
      success: true,
      data: recipients,
      count: recipients.length,
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/contacts/stats
 * Get contact statistics
 */
router.get("/stats", async (req, res) => {
  try {
    const stats = await contactService.getStats();
    res.json({ success: true, data: stats });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/contacts/sync
 * Sync contacts from external source
 */
router.post("/sync", async (req, res) => {
  try {
    const { source, contacts } = req.body;

    if (!source || !Array.isArray(contacts)) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Source and contacts array required",
        });
    }

    const result = await contactService.syncContactsFromSource(
      source,
      contacts,
    );
    res.json({
      success: true,
      data: result,
      message: `Synced: ${result.created} created, ${result.updated} updated, ${result.duplicates} duplicates`,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/contacts/import/monday
 * Import contacts from Monday CRM.
 */
router.post("/import/monday", async (req, res) => {
  try {
    const result = await mondaySyncService.syncMondayContacts();

    res.json({
      success: true,
      data: result,
      message: result.message,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message || "Failed to import contacts from Monday CRM",
    });
  }
});

/**
 * POST /api/contacts/import/apollo
 * Import the first page of Apollo contact-search results.
 */
router.post("/import/apollo", async (req, res) => {
  try {
    const result = await searchContacts({ perPage: 25 });

    if (!result.success) {
      return res.status(502).json({
        success: false,
        message: result.message || "Failed to import contacts from Apollo",
      });
    }

    const syncResult = await contactService.syncContactsFromSource(
      "apollo",
      result.contacts.map((contact) => ({
        ...contact,
        externalId: contact.apolloPersonId,
      })),
    );

    res.json({
      success: true,
      data: syncResult,
      message: `Imported Apollo contacts: ${syncResult.created} created, ${syncResult.updated} updated`,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message || "Failed to import contacts from Apollo",
    });
  }
});

module.exports = router;
