const express = require("express");

const Outreach = require("../models/Outreach");
const Campaign = require("../models/Campaign");
const Contact = require("../models/Contact");

const { sendEmail } = require("../services/email");

const {
  generateOutreachDraft,
} = require("../utils/outreachGenerator");


const router = express.Router();


// ======================================
// CLEAN NAME
// ======================================

function cleanName(name = "") {

  return String(name)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();

}



// ======================================
// GET OUTREACH BY CAMPAIGN
// ======================================

router.get("/", async (req, res) => {

  try {

    const filter = {};


    if (req.query.campaignId) {

      filter.campaignId =
        req.query.campaignId;

    }


    const outreach =
      await Outreach.find(filter)
        .sort({
          createdAt: -1
        });


    console.log(
      "FETCHING OUTREACH:",
      outreach.length
    );


    res.json(outreach);


  } catch(error) {

    console.error(
      "FETCH OUTREACH ERROR:",
      error
    );


    res.status(500).json({
      error:"Failed fetching outreach"
    });

  }

});



// ======================================
// GENERATE OUTREACH
// ======================================

router.post("/generate", async (req,res)=>{

  try {

    const {
      campaignId
    } = req.body;



    if(!campaignId){

      return res.status(400).json({
        error:"campaignId required"
      });

    }



    const campaign =
      await Campaign.findById(
        campaignId
      );



    if(!campaign){

      return res.status(404).json({
        error:"Campaign not found"
      });

    }



    const contacts =
      await Contact.find({
        type: "lead",
        status: "active",
        // Imported Apollo leads are campaign-scoped. Legacy leads without a
        // campaign association retain the previous behavior.
        $or: [
          { campaignIds: campaign._id },
          { campaignIds: { $exists: false } },
          { campaignIds: { $size: 0 } },
        ],
      });



    console.log(
      "Active leads found:",
      contacts.length
    );



    let createdCount = 0;
    let skippedExisting = 0;
    let skippedMissingEmail = 0;



    for(const contact of contacts){


      if(!contact.email){

        skippedMissingEmail++;

        continue;

      }



      const email =
        contact.email
          .toLowerCase()
          .trim();



      const exists =
        await Outreach.findOne({

          campaignId: campaign._id,

          contactEmail: email

        });



      if(exists){

        skippedExisting++;

        continue;

      }



      const cleanedContact = {

        ...contact.toObject(),

        name:
          cleanName(
            contact.name ||
            contact.firstName ||
            "there"
          ),

        company:
          cleanName(
            contact.company ||
            ""
          )

      };



      const draft =
        generateOutreachDraft(
          cleanedContact,
          campaign
        );



      await Outreach.create({

  campaignId: campaign._id,

  contactId: contact._id,

  organization:
    draft.organization,

  contactName:
    draft.contactName,

  contactEmail:
    email,

  contactRole:
    draft.contactRole,

  reason:
    draft.reason,

  subject:
    draft.subject,

  emailDraft:
    draft.emailDraft,

  htmlBody:
    draft.htmlBody || "",

  eventLink:
    draft.eventLink || "",

  flyerUrl:
    draft.flyerUrl || "",

  status:
    "pending"

});



      createdCount++;

    }




    const outreach =
      await Outreach.find({

        campaignId:
          campaign._id

      })
      .sort({
        createdAt:-1
      });



    console.log({

      createdCount,

      skippedExisting,

      skippedMissingEmail,

      totalCampaignOutreach:
        outreach.length

    });



    console.log(
      "======================================"
    );



    res.json({

      outreach,

      createdCount,

      skippedExisting,

      skippedMissingEmail

    });



  } catch(error){

    console.error(
      "GENERATE OUTREACH ERROR:",
      error
    );


    res.status(500).json({
      error:"Failed generating outreach"
    });

  }

});




// ======================================
// APPROVE
// ======================================

router.patch("/:id/approve", async(req,res)=>{

  try {

    const updated =
      await Outreach.findByIdAndUpdate(

        req.params.id,

        {
          status:"approved"
        },

        {
          new:true
        }

      );



    if(!updated){

      return res.status(404).json({
        error:"Outreach not found"
      });

    }


    res.json(updated);


  } catch(error){

    console.error(
      "APPROVE ERROR:",
      error
    );


    res.status(500).json({
      error:"Failed approving outreach"
    });

  }

});




// ======================================
// SEND APPROVED
// ======================================

router.post("/send", async(req,res)=>{

  try {

    const {
      outreachIds
    } = req.body;



    const items =
      await Outreach.find({

        _id:{
          $in: outreachIds
        },

        status:"approved"

      });



    let sentCount = 0;



    for(const item of items){


      const result =
        await sendEmail(item);



      if(result.success){

        item.status="sent";

        item.sentAt =
          new Date();

        item.messageId =
          result.id || "";


        sentCount++;

      } else {

        item.status="failed";

        item.errorMessage =
          result.message;

      }


      await item.save();

    }



    res.json({

      success:true,

      sentCount

    });



  } catch(error){

    console.error(
      "SEND ERROR:",
      error
    );


    res.status(500).json({
      error:"Failed sending emails"
    });

  }

});




// ======================================
// UPDATE
// ======================================

router.patch("/:id", async(req,res)=>{

  try {


    const updated =
      await Outreach.findByIdAndUpdate(

        req.params.id,

        req.body,

        {
          new:true
        }

      );



    res.json(updated);


  } catch(error){


    console.error(
      "UPDATE ERROR:",
      error
    );


    res.status(500).json({
      error:"Failed updating outreach"
    });

  }

});



module.exports = router;
