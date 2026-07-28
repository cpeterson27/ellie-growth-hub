const express = require("express");
const Campaign = require("../models/Campaign");
const Event = require("../models/Event");
const Outreach = require("../models/Outreach");
const { generateOutreachSuggestions } = require("../utils/outreachGenerator");
const { getCampaignTemplate } = require("../services/campaignTemplates");
const ContentBrief = require("../models/ContentBrief");
const { assignCampaignMatches, getCampaignMatches } = require("../services/campaignAudienceService");

const router = express.Router();

const REGISTRATION_HOSTS = {
  eventbrite: ["eventbrite.com", "www.eventbrite.com"],
  meetup: ["meetup.com", "www.meetup.com"],
};

function normalizeRegistrationUrl(provider, value) {
  if (!value) return "";

  const parsed = new URL(String(value).trim());
  if (parsed.protocol !== "https:" || !REGISTRATION_HOSTS[provider].includes(parsed.hostname.toLowerCase())) {
    throw new Error(`Enter a valid ${provider === "eventbrite" ? "Eventbrite" : "Meetup"} https link`);
  }

  return parsed.toString();
}


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

router.get("/:id/audience-match", async (req, res) => {
  try {
    const result = await getCampaignMatches(req.params.id);
    return res.json({
      campaignId: result.campaign._id,
      audiences: result.campaign.audience,
      ...result.counts,
      contacts: result.matches.slice(0, 25).map(({ contact, reasons }) => ({
        _id: contact._id,
        name: contact.name,
        email: contact.email,
        company: contact.company,
        reasons,
      })),
    });
  } catch (error) {
    return res.status(error.message === "Campaign not found" ? 404 : 500).json({ error: error.message || "Unable to preview audience matches" });
  }
});

router.post("/:id/audience-match", async (req, res) => {
  try {
    return res.json(await assignCampaignMatches(req.params.id));
  } catch (error) {
    return res.status(error.message === "Campaign not found" ? 404 : 500).json({ error: error.message || "Unable to assign audience matches" });
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

router.patch("/:id/brand", async (req, res) => {
  try {
    const accentColor = /^#[0-9a-f]{6}$/i.test(String(req.body?.accentColor || ""))
      ? req.body.accentColor
      : "#173f36";
    const campaign = await Campaign.findByIdAndUpdate(
      req.params.id,
      { $set: {
        brand: {
          logoUrl: String(req.body?.logoUrl || "").trim(),
          websiteUrl: String(req.body?.websiteUrl || "").trim(),
          accentColor,
        },
      } },
      { new: true, runValidators: true },
    );
    if (!campaign) return res.status(404).json({ error: "Campaign not found." });
    res.json(campaign);
  } catch (error) {
    res.status(400).json({ error: "Unable to save campaign branding." });
  }
});

router.patch("/:id/registration-links", async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });

    const eventbriteUrl = normalizeRegistrationUrl("eventbrite", req.body?.eventbriteUrl);
    const meetupUrl = normalizeRegistrationUrl("meetup", req.body?.meetupUrl);
    const meetupEventId = meetupUrl ? new URL(meetupUrl).pathname.match(/\/events\/([^/]+)/)?.[1] || "" : "";

    campaign.registrationLinks = {
      eventbrite: {
        enabled: Boolean(eventbriteUrl),
        url: eventbriteUrl,
        label: "Register on Eventbrite",
      },
      meetup: {
        enabled: Boolean(meetupUrl),
        url: meetupUrl,
        label: "View on Meetup",
        eventId: meetupEventId,
      },
    };

    // Eventbrite remains the main checkout link used by campaign emails.
    if (eventbriteUrl) campaign.content.callToActionUrl = eventbriteUrl;
    await campaign.save();

    if (campaign.eventId) {
      const event = await Event.findById(campaign.eventId).select("channels");
      const otherChannels = (event?.channels || []).filter(
        (channel) => !["eventbrite", "meetup"].includes(String(channel).toLowerCase()),
      );
      const activeChannels = [
        ...otherChannels,
        ...(eventbriteUrl ? ["Eventbrite"] : []),
        ...(meetupUrl ? ["Meetup"] : []),
      ];

      await Event.findByIdAndUpdate(campaign.eventId, {
        "integrations.eventbrite.enabled": Boolean(eventbriteUrl),
        "integrations.eventbrite.url": eventbriteUrl,
        "integrations.meetup.enabled": Boolean(meetupUrl),
        "integrations.meetup.url": meetupUrl,
        "integrations.meetup.eventId": meetupEventId,
        channels: activeChannels,
      });
    }

    return res.json({
      message: "Registration channels updated",
      registrationLinks: campaign.registrationLinks,
      primaryRegistrationProvider: eventbriteUrl ? "eventbrite" : meetupUrl ? "meetup" : null,
    });
  } catch (error) {
    const isValidationError = error instanceof TypeError || /Enter a valid/.test(error.message);
    return res.status(isValidationError ? 400 : 500).json({ error: error.message || "Unable to update registration links" });
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
      existingCampaign.audience = event.audienceConfirmedAt ? event.audience : [];
      await existingCampaign.save();
      const audienceMatch = await assignCampaignMatches(existingCampaign._id);

      return res.json({

        message: "Campaign already exists",

        campaign: existingCampaign,
        audienceMatch,

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
          event.audienceConfirmedAt ? event.audience : [],

        content,
        registrationLinks: {
          eventbrite: {
            enabled: Boolean(event.integrations?.eventbrite?.url),
            url: event.integrations?.eventbrite?.url || content.callToActionUrl || "",
            label: "Register on Eventbrite",
          },
          meetup: {
            enabled: Boolean(event.integrations?.meetup?.url),
            url: event.integrations?.meetup?.url || "",
            label: "View on Meetup",
            eventId: event.integrations?.meetup?.eventId || "",
          },
        },

        status:
          "active",

      });

    const audienceMatch = await assignCampaignMatches(campaign._id);



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
      audienceMatch,

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
      brand = {},
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
        brand: {
          logoUrl: String(brand.logoUrl || "").trim(),
          websiteUrl: String(brand.websiteUrl || "").trim(),
          accentColor: String(brand.accentColor || "#173f36").trim(),
        },

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

    const audienceMatch = await assignCampaignMatches(campaign._id);

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
      audienceMatch,

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
