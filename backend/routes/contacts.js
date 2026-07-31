/**
 * Contact Routes
 * Manage contacts and campaign recipient lists
 */

const express = require("express");
const mongoose = require("mongoose");
const contactService = require("../services/contactService");
const integrationHub = require("../services/integrationHub");
const { importApolloLeads } = require("../services/apolloLeadService");
const { getAccountStatus, listApolloLists, savePeopleToApolloList } = require("../services/apollo");
const ApolloSearchRun = require("../models/ApolloSearchRun");
const ContactImportReceipt = require("../models/ContactImportReceipt");
const { ingestContacts, previewContactIngestion, canonicalFieldMap } = require("../services/contactIngestionService");
const emailVerificationService = require("../services/emailVerificationService");
const EmailVerificationBatch = require("../models/EmailVerificationBatch");
const Contact = require("../models/Contact");
const Campaign = require("../models/Campaign");
const Outreach = require("../models/Outreach");
const { applyResearchClassification } = require("../services/contactResearchService");

const router = express.Router();

router.get("/apollo/status", async (_req, res) => {
  const status = await getAccountStatus();
  res.status(status.connected ? 200 : status.code === "not_configured" ? 200 : 502).json(status);
});

router.get("/apollo/lists", async (_req, res) => {
  const result = await listApolloLists();
  if (!result.success) return res.status(result.status || 400).json(result);
  res.json(result);
});

router.get("/apollo/history", async (req, res) => {
  const runs = await ApolloSearchRun.find({ workspaceId: req.auth.workspaceId }).sort({ createdAt: -1 }).limit(50).lean();
  res.json({ runs });
});

router.get("/imports/latest", async (req, res) => {
  const latest = await ContactImportReceipt.findOne({ workspaceId: req.auth.workspaceId }).sort({ createdAt: -1 }).lean();
  if (!latest || Date.now() - new Date(latest.createdAt).getTime() > 86400000) return res.json({ data: null });
  return res.json({ data: { ...latest.summary, completedAt: latest.createdAt } });
});

router.post("/apollo/enrichment-estimate", (req, res) => {
  const count = Math.min(100, Math.max(0, Number(req.body?.count) || 0));
  res.json({ count, minimumCredits: count, maximumCredits: count * 9, note: "Actual credits depend on matched data. Phone enrichment can add up to 8 credits per person." });
});

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
      researchStatus,
      qualifyContact,
      emailStatus,
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
    if (researchStatus) query.researchStatus = researchStatus;
    if (qualifyContact !== undefined) query.qualifyContact = String(qualifyContact) === "true";
    if (emailStatus) query.emailStatus = emailStatus;

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

router.post("/email-verification/batches", async (req, res) => {
  try {
    const emails = emailVerificationService.cleanEmails(req.body?.emails);
    const emailFingerprint = emailVerificationService.fingerprintEmails(emails);
    const existing = await EmailVerificationBatch.findOne({
      emailFingerprint,
      expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 });
    if (existing) {
      return res.status(200).json({
        success: true,
        data: {
          id: existing.providerBatchId,
          total: existing.total,
          complete: existing.complete,
          reused: true,
        },
      });
    }

    const data = await emailVerificationService.createBatch(emails);
    await EmailVerificationBatch.create({
      providerBatchId: data.id,
      emailFingerprint,
      emails,
      total: data.total,
    });
    return res.status(202).json({ success: true, data });
  } catch (err) {
    const providerStatus = err.response?.status;
    const providerMessage = String(
      err.response?.data?.message ||
      err.response?.data?.error ||
      "",
    ).trim();
    const status = err.code === "email_verification_not_configured"
      ? 503
      : providerStatus
        ? 502
        : 400;
    const message = err.code === "email_verification_not_configured"
      ? "Email verification is not configured on the server."
      : providerStatus === 401 || providerStatus === 403
        ? "Emailable rejected the API key. Confirm the live private key in Render."
        : providerStatus === 402
          ? "Emailable does not have enough credits for this batch. Add credits or verify a smaller file."
          : providerStatus === 400
            ? providerMessage || "Emailable rejected the batch details."
            : providerStatus
              ? providerMessage || "Emailable could not start email verification."
              : err.message || "Unable to start email verification";
    return res.status(status).json({
      success: false,
      message,
    });
  }
});

router.post("/email-verification/batches/recover", async (req, res) => {
  const emails = emailVerificationService.cleanEmails(req.body?.emails);
  if (!emails.length) return res.status(400).json({ success: false, message: "At least one email is required" });
  const saved = await EmailVerificationBatch.findOne({
    emailFingerprint: emailVerificationService.fingerprintEmails(emails),
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 });
  if (!saved) return res.status(404).json({ success: false, message: "No saved verification batch matches this CSV" });
  return res.json({
    success: true,
    data: {
      id: saved.providerBatchId,
      processed: saved.processed,
      total: saved.total,
      complete: saved.complete,
      counts: saved.counts,
      results: saved.results,
    },
  });
});

router.get("/email-verification/batches/:batchId", async (req, res) => {
  try {
    const data = await emailVerificationService.getBatch(req.params.batchId);
    await EmailVerificationBatch.findOneAndUpdate(
      { providerBatchId: req.params.batchId },
      {
        processed: data.processed,
        total: data.total,
        complete: data.complete,
        counts: data.counts,
        results: data.results,
      },
    );
    return res.json({ success: true, data });
  } catch (err) {
    const status = err.code === "email_verification_not_configured" ? 503 : 502;
    return res.status(status).json({
      success: false,
      message: "Unable to retrieve email verification results",
    });
  }
});

router.get("/overview", async (req, res) => {
  try {
    const active = { status: { $ne: "archived" } };
    const audienceUnknownCriteria = {
      $and: [
        { $or: [{ audienceProfiles: { $exists: false } }, { audienceProfiles: { $size: 0 } }] },
        { $or: [{ title: { $exists: false } }, { title: "" }] },
        { $or: [{ industry: { $exists: false } }, { industry: "" }] },
        { $or: [{ company: { $exists: false } }, { company: "" }] },
        { $or: [{ seniority: { $exists: false } }, { seniority: "" }] },
        { $or: [{ keywords: { $exists: false } }, { keywords: { $size: 0 } }] },
        { $or: [{ lists: { $exists: false } }, { lists: { $size: 0 } }] },
      ],
    };
    const [
      total,
      approved,
      verified,
      risky,
      undeliverable,
      withoutEmail,
      needsResearch,
      readyForReview,
      qualified,
      campaignAssigned,
      audienceUnknown,
      needsAttention,
      readyToAssign,
      missingFields,
    ] = await Promise.all([
      Contact.countDocuments(active),
      Contact.countDocuments({ status: "active" }),
      Contact.countDocuments({ ...active, emailStatus: "verified", email: { $type: "string", $ne: "" } }),
      Contact.countDocuments({ ...active, emailStatus: "risky" }),
      Contact.countDocuments({ ...active, emailStatus: "undeliverable" }),
      Contact.countDocuments({ ...active, $or: [{ email: { $exists: false } }, { email: "" }, { email: null }] }),
      Contact.countDocuments({ ...active, researchStatus: "needs_research" }),
      Contact.countDocuments({ ...active, researchStatus: "ready_for_review" }),
      Contact.countDocuments({ ...active, researchStatus: "qualified", qualifyContact: true }),
      Contact.countDocuments({ ...active, "campaignIds.0": { $exists: true } }),
      Contact.countDocuments({ ...active, ...audienceUnknownCriteria }),
      Contact.countDocuments({
        ...active,
        $or: [
          { emailStatus: { $ne: "verified" } },
          { email: { $exists: false } },
          { email: "" },
          audienceUnknownCriteria,
        ],
      }),
      Contact.countDocuments({
        ...active,
        emailStatus: "verified",
        email: { $type: "string", $ne: "" },
        "campaignIds.0": { $exists: false },
        $nor: [audienceUnknownCriteria],
      }),
      Contact.aggregate([
        { $match: active },
        { $unwind: "$missingFields" },
        { $group: { _id: "$missingFields", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
    ]);
    return res.json({
      success: true,
      data: {
        total,
        approved,
        verified,
        risky,
        undeliverable,
        withoutEmail,
        needsResearch,
        readyForReview,
        qualified,
        campaignAssigned,
        audienceUnknown,
        needsAttention,
        readyToAssign,
        missingFields: Object.fromEntries(missingFields.map((item) => [item._id, item.count])),
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Unable to summarize contacts" });
  }
});

router.patch("/bulk/assign-campaign", async (req, res) => {
  try {
    const contactIds = [...new Set(Array.isArray(req.body?.contactIds) ? req.body.contactIds : [])];
    const { campaignId } = req.body || {};
    if (!contactIds.length || contactIds.length > 500) {
      return res.status(400).json({ success: false, message: "Select between 1 and 500 contacts" });
    }
    if (!mongoose.Types.ObjectId.isValid(campaignId) || contactIds.some((id) => !mongoose.Types.ObjectId.isValid(id))) {
      return res.status(400).json({ success: false, message: "Invalid contact or campaign ID" });
    }
    const campaign = await Campaign.findById(campaignId).select("_id name");
    if (!campaign) return res.status(404).json({ success: false, message: "Campaign not found" });

    const contacts = await Contact.find({ _id: { $in: contactIds }, status: { $ne: "archived" } });
    let assigned = 0;
    let skipped = 0;
    for (const contact of contacts) {
      if (!contact.name || !contact.email || contact.emailStatus !== "verified") {
        skipped += 1;
        continue;
      }
      if (!contact.campaignIds.some((id) => String(id) === String(campaign._id))) {
        contact.campaignIds.push(campaign._id);
      }
      contact.qualifyContact = true;
      applyResearchClassification(contact);
      await contact.save();
      assigned += 1;
    }
    skipped += contactIds.length - contacts.length;
    return res.json({
      success: true,
      data: { assigned, skipped, campaignId: campaign._id, campaignName: campaign.name },
      message: `${assigned} contact${assigned === 1 ? "" : "s"} qualified and assigned to ${campaign.name}`,
    });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message || "Unable to assign selected contacts" });
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
 * POST /api/contacts/import/apollo
 * Import the first page of Apollo contact-search results.
 */
router.post("/apollo/search", async (req, res) => {
  const startedAt = Date.now();
  try {
    const { titles = [], locations = [], keywords = [], domains = [], industryIds = [], emailStatuses = [], seniorities = [], technologiesAny = [], technologiesAll = [], technologiesExclude = [], employeeRanges = [], employeeRange = {}, revenueRange = {}, page = 1, perPage = 25 } = req.body;
    if (![titles, locations, keywords, domains, industryIds, emailStatuses, seniorities, technologiesAny, technologiesAll, technologiesExclude, employeeRanges].every(Array.isArray)) {
      return res.status(400).json({ success: false, code: "invalid_request", message: "Apollo search filters must be arrays" });
    }
    const result = await integrationHub.execute("apollo", "searchLeads", {
      titles: Array.isArray(titles) ? titles.slice(0, 10) : [],
      locations: Array.isArray(locations) ? locations.slice(0, 10) : [],
      keywords: Array.isArray(keywords) ? keywords.slice(0, 10) : [],
      domains: Array.isArray(domains) ? domains.slice(0, 10) : [],
      industryIds: industryIds.slice(0, 20),
      emailStatuses: emailStatuses.slice(0, 5),
      employeeRanges: employeeRanges.slice(0, 12),
      employeeRange: { min: employeeRange?.min ?? null, max: employeeRange?.max ?? null },
      seniorities: seniorities.slice(0, 12),
      technologiesAny: technologiesAny.slice(0, 50),
      technologiesAll: technologiesAll.slice(0, 50),
      technologiesExclude: technologiesExclude.slice(0, 50),
      revenueRange: { min: revenueRange?.min ?? null, max: revenueRange?.max ?? null },
      page: Math.max(1, Number(page) || 1),
      perPage: Math.min(100, Math.max(1, Number(perPage) || 25)),
    });

    if (!result.success) {
      await ApolloSearchRun.create({ workspaceId: req.auth.workspaceId, userId: req.auth.user._id, mode: "people", templateName: req.body?.templateName || "", filters: req.body, status: "error", durationMs: Date.now() - startedAt, errorCode: result.errorCode || "provider_error", errorMessage: result.message || "" });
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
        rate_limited: "Apollo's API rate limit has been reached. Wait for the limit window to reset, then try again.",
        invalid_request: "Apollo rejected one or more search filters. Review the highlighted filters and try again.",
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
        detail: result.message || null,
        retryAfter: result.retryAfter || null,
        action: result.errorCode === "unauthorized"
          ? "Replace the Apollo API key in backend settings."
          : result.errorCode === "forbidden"
            ? "Use an Apollo master key or enable People Search access for this API key."
            : result.errorCode === "rate_limited"
              ? "Wait for the Apollo rate-limit window to reset."
              : result.errorCode === "invalid_request"
                ? "Remove or correct the unsupported filter values."
                : "Retry the search. If it continues, check Apollo API status and key permissions.",
      });
    }
    await ApolloSearchRun.create({ workspaceId: req.auth.workspaceId, userId: req.auth.user._id, mode: "people", templateName: req.body?.templateName || "", filters: req.body, status: result.contacts.length ? "success" : "empty", totalMatches: result.total, resultsReturned: result.contacts.length, durationMs: Date.now() - startedAt });
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
    let apolloListSync = null;
    if (req.body?.apolloListName) {
      try {
        apolloListSync = await savePeopleToApolloList(req.body.leads, req.body.apolloListName);
      } catch (error) {
        apolloListSync = {
          success: false,
          message: error.message || "Contacts reached Ellie CRM, but Apollo list synchronization failed.",
        };
      }
    }
    const latestRun = await ApolloSearchRun.findOne({
      workspaceId: req.auth.workspaceId,
      mode: "people",
    }).sort({ createdAt: -1 });
    if (latestRun) {
      latestRun.importedCount += result.created || 0;
      await latestRun.save();
    }
    return res.json({ success: true, data: result, apolloListSync });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message || "Unable to import Apollo leads" });
  }
});

router.post("/ingest", async (req, res) => {
  try {
    const result = await ingestContacts(req.body);
    if (result.importBatchId) {
      await ContactImportReceipt.findOneAndUpdate(
        { workspaceId: req.auth.workspaceId, importBatchId: result.importBatchId },
        { $set: { userId: req.auth.user._id, importFileName: result.importFileName || "", summary: result } },
        { upsert: true, new: true },
      );
    }
    return res.json({ success: true, data: result });
  }
  catch (err) { return res.status(400).json({ success: false, message: err.message || "Unable to import contacts" }); }
});

router.post("/ingest/preview", async (req, res) => {
  try { return res.json({ success: true, data: await previewContactIngestion(req.body) }); }
  catch (err) { return res.status(400).json({ success: false, message: err.message || "Unable to preview contact import" }); }
});

router.get("/import/field-map", (req, res) => res.json({ success: true, data: canonicalFieldMap }));

module.exports = router;
