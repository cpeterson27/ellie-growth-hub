const express = require("express");
const crypto = require("crypto");
const axios = require("axios");

const Event = require("../models/Event");
const Campaign = require("../models/Campaign");
const Outreach = require("../models/Outreach");

const {
  generateOutreachSuggestions,
} = require("../utils/outreachGenerator");
const { recommendAudiences } = require("../services/eventAudienceRecommendationService");


const router = express.Router();




// GET ALL EVENTS

router.get("/", async (req, res) => {

  try {

    const events = await Event.find()
      .sort({ startDate: 1 });


    res.json(events);


  } catch(error) {

    console.error(error);

    res.status(500).json({
      error: "Failed to fetch events",
    });

  }

});





// GET SINGLE EVENT

router.get("/:id", async(req,res)=>{

  try {

    const event =
      await Event.findById(req.params.id);


    if(!event){

      return res.status(404).json({
        error:"Event not found",
      });

    }


    res.json(event);


  } catch(error){

    console.error(error);

    res.status(500).json({
      error:"Failed to fetch event",
    });

  }

});






// CREATE EVENT

router.post("/", async(req,res)=>{

  try {


    const event =
      await Event.create(req.body);


    res.status(201).json(event);


  } catch(error){


    console.error(error);


    res.status(500).json({
      error:"Failed to create event",
    });


  }

});

router.post("/audience-recommendations", async (req, res) => {
  try {
    const result = await recommendAudiences(req.body || {});
    res.json(result);
  } catch (error) {
    console.error("EVENT AUDIENCE RECOMMENDATION ERROR:", error.message);
    res.status(500).json({ error: "Unable to generate audience recommendations" });
  }
});

router.post("/images", async (req, res) => {
  try {
    const file = String(req.body?.file || "");
    if (!file.startsWith("data:image/")) {
      return res.status(400).json({ error: "Choose a valid image file." });
    }

    let cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
    let apiKey = process.env.CLOUDINARY_API_KEY?.trim();
    let apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();
    const cloudinaryUrl = process.env.CLOUDINARY_URL?.trim();
    if (cloudinaryUrl) {
      const parsed = new URL(cloudinaryUrl);
      cloudName = parsed.hostname;
      apiKey = decodeURIComponent(parsed.username);
      apiSecret = decodeURIComponent(parsed.password);
    }
    if (!cloudName || !apiKey || !apiSecret) {
      return res.status(503).json({
        error: "Image upload is not configured. Add CLOUDINARY_URL to the backend environment.",
      });
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const folder = "ellie-ai/events";
    const signature = crypto
      .createHash("sha1")
      .update(`folder=${folder}&timestamp=${timestamp}${apiSecret}`)
      .digest("hex");
    const body = new FormData();
    body.append("file", file);
    body.append("api_key", apiKey);
    body.append("timestamp", String(timestamp));
    body.append("folder", folder);
    body.append("signature", signature);
    const upload = await axios.post(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      body,
      { maxBodyLength: 12 * 1024 * 1024 },
    );
    res.status(201).json({
      url: upload.data.secure_url,
      publicId: upload.data.public_id,
      width: upload.data.width,
      height: upload.data.height,
    });
  } catch (error) {
    console.error("EVENT IMAGE UPLOAD ERROR:", error.response?.data || error.message);
    res.status(502).json({ error: "The event image could not be uploaded." });
  }
});

router.get("/images/status", (_req, res) => {
  let configured = Boolean(
    process.env.CLOUDINARY_CLOUD_NAME?.trim()
    && process.env.CLOUDINARY_API_KEY?.trim()
    && process.env.CLOUDINARY_API_SECRET?.trim(),
  );
  if (process.env.CLOUDINARY_URL?.trim()) configured = true;
  res.json({
    configured,
    provider: configured ? "cloudinary" : null,
    folder: configured ? "ellie-ai/events" : null,
  });
});






// EVENT → CAMPAIGN

router.post("/:id/create-campaign", async(req,res)=>{

  try {


    const event =
      await Event.findById(req.params.id);



    if(!event){

      return res.status(404).json({
        error:"Event not found",
      });

    }




    const existingCampaign =
      await Campaign.findOne({
        eventId:event._id,
      });



    if(existingCampaign){

      return res.json(existingCampaign);

    }





    const campaign =
      await Campaign.create({

        eventId:event._id,

        name:event.name,

        startDate:event.startDate,

        ticketPrice:event.ticketPrice,

        ticketGoal:event.ticketGoal,

        ticketsSold:0,

        audience:event.audience || [],

        status:"active",

      });







    const outreachSuggestions =
      generateOutreachSuggestions(
        campaign
      );




    if(outreachSuggestions.length){

      await Outreach.insertMany(
        outreachSuggestions
      );

    }







    res.status(201).json({

      campaign,

      message:
        "Campaign created from event",

    });




  } catch(error){


    console.error(
      "CREATE CAMPAIGN ERROR:",
      error
    );


    res.status(500).json({

      error:
        "Failed to create campaign",

    });


  }

});





module.exports = router;
