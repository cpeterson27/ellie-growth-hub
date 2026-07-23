const express = require("express");
const Campaign = require("../models/Campaign");
const Event = require("../models/Event");
const Outreach = require("../models/Outreach");
const { generateOutreachSuggestions } = require("../utils/outreachGenerator");

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
    } = req.body;



    if (
      !name ||
      !startDate ||
      !ticketPrice ||
      !ticketGoal ||
      !audience ||
      audience.length === 0
    ) {

      return res.status(400).json({

        error:
          "Missing event data",

      });

    }



    const event =
      await Event.create({

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



    const campaign =
      await Campaign.create({

        eventId:
          event._id,

        name:
          event.name,

        startDate:
          event.startDate,

        ticketPrice:
          event.ticketPrice,

        ticketGoal:
          event.ticketGoal,

        ticketsSold:
          0,

        audience:
          event.audience,

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



module.exports = router;