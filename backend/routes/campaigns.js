const express = require("express");
const Campaign = require("../models/Campaign");
const Event = require("../models/Event");
const Outreach = require("../models/Outreach");
const { generateOutreachSuggestions } = require("../utils/outreachGenerator");
const { getCampaignTemplate } = require("../services/campaignTemplates");
const ContentBrief = require("../models/ContentBrief");

const router = express.Router();


// ==================================
// GET ALL CAMPAIGNS
// ==================================
router.get("/", async (req, res) => {
  try {
    const campaigns = await Campaign.find()
      .populate("eventId")
      .sort({ createdAt: -1 });

    res.json(campaigns);

  } catch (error) {

    console.error(
      "FETCH CAMPAIGNS ERROR:",
      error
    );

    res.status(500).json({
      error: "Failed to fetch campaigns",
    });

  }
});

// ==================================
// CAMPAIGN DELETION PREVIEW
// ==================================
router.get("/:id/deletion-preview", async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id).select("eventId name").lean();
    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    const outreachCount = await Outreach.countDocuments({ campaignId: campaign._id });
    const linkedCampaignCount = campaign.eventId
      ? await Campaign.countDocuments({ eventId: campaign.eventId })
      : 0;

    return res.json({
      campaignId: campaign._id,
      campaignName: campaign.name,
      outreachCount,
      event: campaign.eventId
        ? { id: campaign.eventId, canDelete: linkedCampaignCount === 1 }
        : null,
    });
  } catch (error) {
    console.error("CAMPAIGN DELETION PREVIEW ERROR:", error);
    return res.status(500).json({ error: "Unable to prepare campaign deletion" });
  }
});

// ==================================
// GET SINGLE CAMPAIGN
// ==================================
router.get("/:id", async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id)
      .populate("eventId");


    if (!campaign) {
      return res.status(404).json({
        error: "Campaign not found",
      });
    }


    res.json(campaign);


  } catch (error) {

    console.error(
      "FETCH CAMPAIGN ERROR:",
      error
    );


    res.status(500).json({
      error: "Failed to fetch campaign",
    });

  }
});

// ==================================
// CREATE CAMPAIGN FROM EXISTING EVENT
// Event -> Campaign
// ==================================
router.post("/from-event/:eventId", async (req, res) => {

  try {

    const event = await Event.findById(
      req.params.eventId
    );


    if (!event) {

      return res.status(404).json({
        error: "Event not found",
      });

    }



    // Prevent duplicate campaigns
    const existingCampaign =
      await Campaign.findOne({
        eventId: event._id,
      });



    if (existingCampaign) {

      return res.json({

        message: "Campaign already exists",

        campaign: existingCampaign,

      });

    }



    const content = getCampaignTemplate("event_investor", {
      campaignName: event.name,
    });

    const campaign =
      await Campaign.create({

        eventId: event._id,

        name: event.name,

        startDate: event.startDate,

        ticketPrice: event.ticketPrice,

        ticketGoal: event.ticketGoal,

        ticketsSold:
          event.ticketsSold || 0,

        audience:
          event.audience,

        content,

        status:
          "active",

      });



    const outreachItems =
      generateOutreachSuggestions(
        campaign
      );



    if (outreachItems.length) {

      await Outreach.insertMany(
        outreachItems
      );

    }



    res.status(201).json({

      message:
        "Campaign created successfully",

      campaign,

      event,

      outreachCreated:
        outreachItems.length,

    });



  } catch (error) {

    console.error(
      "CREATE CAMPAIGN FROM EVENT ERROR:",
      error
    );


    res.status(500).json({

      error:
        "Failed to create campaign",

    });

  }

});



// ==================================
// CREATE BRAND NEW EVENT + CAMPAIGN
// Future Ellie AI Event Builder
// ==================================
router.post("/", async (req, res) => {

  try {

    const {
      name,
      startDate,
      ticketPrice,
      ticketGoal,
      audience,
      description,
      channels,
      campaignKind = "event",
      programName = "",
      templateKey = "event_investor",
      contentBriefId = null,
    } = req.body;



    if (
      !name ||
      (campaignKind !== "program" && (!startDate || !ticketPrice || !ticketGoal)) ||
      !audience ||
      audience.length === 0
    ) {

      return res.status(400).json({

        error:
          "Missing event data",

      });

    }



    const event = campaignKind === "program" ? null : await Event.create({

        name,

        description:
          description || "",

        startDate:
          new Date(startDate),

        ticketPrice:
          Number(ticketPrice),

        ticketGoal:
          Number(ticketGoal),

        audience,

        channels:
          channels || [],

        status:
          "active",

      });



    const savedTemplate = contentBriefId
      ? await ContentBrief.findOne({ _id: contentBriefId, type: "email_template", status: { $ne: "archived" } })
      : null;
    const content = savedTemplate ? {
      subject: savedTemplate.subject || savedTemplate.title,
      body: savedTemplate.body,
      callToAction: savedTemplate.callToAction || "Learn more",
      callToActionUrl: "",
    } : getCampaignTemplate(templateKey, { campaignName: name, programName });

    const campaign =
      await Campaign.create({

        eventId: event?._id || null,
        campaignKind,
        programName,
        templateKey: savedTemplate ? `content:${savedTemplate._id}` : templateKey,

        name:
          event?.name || name,

        startDate:
          event?.startDate || (startDate ? new Date(startDate) : null),

        ticketPrice:
          event?.ticketPrice || Number(ticketPrice || 0),

        ticketGoal:
          event?.ticketGoal || Number(ticketGoal || 0),

        ticketsSold:
          0,

        audience:
          event?.audience || audience,

        content,

        status:
          "active",

      });



    const outreachItems =
      generateOutreachSuggestions(
        campaign
      );



    if (outreachItems.length) {

      await Outreach.insertMany(
        outreachItems
      );

    }



    res.status(201).json({

      message:
        "Event and campaign created",

      campaign,

      event,

      outreachCreated:
        outreachItems.length,

    });



  } catch (error) {

    console.error(
      "CREATE EVENT CAMPAIGN ERROR:",
      error
    );


    res.status(500).json({

      error:
        "Failed to create event campaign",

    });

  }

});

// ==================================
// DELETE CAMPAIGN SAFELY
// ==================================
router.delete("/:id", async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    const deleteOutreach = req.body?.deleteOutreach === true;
    const deleteEvent = req.body?.deleteEvent === true;
    const outreachCount = await Outreach.countDocuments({ campaignId: campaign._id });

    if (outreachCount && !deleteOutreach) {
      return res.status(409).json({
        error: "This campaign has outreach history. Choose whether to delete its outreach drafts before deleting the campaign.",
        outreachCount,
      });
    }

    let eventIdToDelete = null;
    if (deleteEvent && campaign.eventId) {
      const linkedCampaignCount = await Campaign.countDocuments({ eventId: campaign.eventId });
      if (linkedCampaignCount > 1) {
        return res.status(409).json({
          error: "The linked event is used by another campaign and cannot be deleted here.",
        });
      }
      eventIdToDelete = campaign.eventId;
    }

    if (deleteOutreach) {
      await Outreach.deleteMany({ campaignId: campaign._id });
    }
    await Campaign.deleteOne({ _id: campaign._id });
    if (eventIdToDelete) {
      await Event.deleteOne({ _id: eventIdToDelete });
    }

    return res.json({
      message: "Campaign deleted",
      deleted: { campaign: 1, outreach: deleteOutreach ? outreachCount : 0, event: eventIdToDelete ? 1 : 0 },
    });
  } catch (error) {
    console.error("DELETE CAMPAIGN ERROR:", error);
    return res.status(500).json({ error: "Unable to delete campaign" });
  }
});



module.exports = router;
