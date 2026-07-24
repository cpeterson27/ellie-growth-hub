/**
 * Contact Routes
 * Manage contacts and campaign recipient lists
 */

const express = require("express");
const mongoose = require("mongoose");
const contactService = require("../services/contactService");
const mondaySyncService = require("../services/mondaySyncService");
const integrationHub = require("../services/integrationHub");
const { importApolloLeads } = require("../services/apolloLeadService");
const { ingestContacts, canonicalFieldMap, retryMondaySync } = require("../services/contactIngestionService");
const Contact = require("../models/Contact");
const Outreach = require("../models/Outreach");

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

    const query = status ? { status } : { status: { $ne: "archived" } };
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
router.post("/:id/archive", async (req, res) => {
  try {
    const contact = await Contact.findById(req.params.id);
    if (!contact) return res.status(404).json({ success: false, message: "Contact not found" });
    contact.status = "archived";
    await contact.save();
    try { await retryMondaySync(contact._id); } catch (_) { /* archive remains local if Monday is unavailable */ }
    return res.json({ success: true, data: contact, message: "Contact archived" });
  } catch (err) { return res.status(400).json({ success: false, message: "Unable to archive contact" }); }
});

router.delete("/:id", async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid contact ID" });
    }

    const outreachCount = await Outreach.countDocuments({ contactId: req.params.id });
    if (outreachCount && !req.body?.confirmCascade) return res.status(409).json({ success: false, message: `Cannot permanently delete: ${outreachCount} outreach record(s) depend on this contact.`, outreachCount });
    const contact = await Contact.findById(req.params.id);
    if (contact?.mondayItemId) {
      const credentials = await mondaySyncService.getMondayCredentials();
      if (credentials?.apiKey) await integrationHub.execute("monday", "archiveContact", credentials, contact.toObject());
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
router.post("/apollo/search", async (req, res) => {
  try {
    const { titles = [], locations = [], keywords = [], page = 1, perPage = 25 } = req.body;
    if (!Array.isArray(titles) || !Array.isArray(locations) || !Array.isArray(keywords)) {
      return res.status(400).json({ success: false, code: "invalid_request", message: "Apollo search filters must be arrays" });
    }
    const result = await integrationHub.execute("apollo", "searchLeads", {
      titles: Array.isArray(titles) ? titles.slice(0, 10) : [],
      locations: Array.isArray(locations) ? locations.slice(0, 10) : [],
      keywords: Array.isArray(keywords) ? keywords.slice(0, 10) : [],
      page: Math.max(1, Number(page) || 1),
      perPage: Math.min(100, Math.max(1, Number(perPage) || 25)),
    });

    if (!result.success) {
      const status = result.status === 401 || result.status === 403
        ? result.status
        : result.errorCode === "timeout" ? 504
          : result.errorCode === "unsupported_endpoint" ? 501
            : result.errorCode === "people_search_unavailable" ? 422
            : 502;
      const messages = {
        unauthorized: "Apollo rejected the configured API key.",
        forbidden: "The configured Apollo account is not permitted to use this search endpoint.",
        unsupported_endpoint: "The configured Apollo account does not support this search endpoint.",
        people_search_unavailable: "Apollo people search is unavailable on the connected plan or is not configured. Use organization discovery or CSV import.",
        timeout: "Apollo search timed out. Please try again.",
        provider_error: "Apollo search failed. Please try again.",
      };
      console.warn("[Apollo search]", {
        provider: "apollo",
        status: result.status || status,
        code: result.errorCode || "provider_error",
        route: "/api/contacts/apollo/search",
      });
      return res.status(status).json({
        success: false,
        code: result.errorCode || "provider_error",
        message: messages[result.errorCode] || messages.provider_error,
      });
    }
    return res.json({
      success: true,
      data: { results: result.contacts, total: result.total, page: result.page },
      message: result.contacts.length ? "Apollo leads found" : "No Apollo leads matched these filters.",
    });
  } catch (err) {
    console.error("[Apollo search]", {
      provider: "apollo",
      status: 500,
      code: "backend_error",
      route: "/api/contacts/apollo/search",
    });
    return res.status(500).json({
      success: false,
      code: "backend_error",
      message: "Unable to search Apollo leads",
    });
  }
});

router.post("/import/apollo", async (req, res) => {
  try {
    const result = await importApolloLeads(req.body);
    return res.json({ success: true, data: result });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message || "Unable to import Apollo leads" });
  }
});

router.post("/ingest", async (req, res) => {
  try { return res.json({ success: true, data: await ingestContacts(req.body) }); }
  catch (err) { return res.status(400).json({ success: false, message: err.message || "Unable to import contacts" }); }
});

router.post("/:id/retry-monday", async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ success: false, message: "Invalid contact ID" });
    const result = await retryMondaySync(req.params.id);
    return res.json({ success: true, data: result, message: "Monday CRM sync completed" });
  } catch (err) {
    return res.status(502).json({ success: false, message: "Monday CRM sync failed" });
  }
});

router.get("/import/field-map", (req, res) => res.json({ success: true, data: canonicalFieldMap }));

module.exports = router;
