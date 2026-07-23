const express = require("express");

const Event = require("../models/Event");
const Campaign = require("../models/Campaign");
const Outreach = require("../models/Outreach");

const {
  generateOutreachSuggestions,
} = require("../utils/outreachGenerator");


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