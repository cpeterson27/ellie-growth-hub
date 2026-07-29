const express = require("express");

const Outreach = require("../models/Outreach");
const Campaign = require("../models/Campaign");
const Contact = require("../models/Contact");

const { renderEmailContent, sendEmail, sendTestEmail } = require("../services/email");
const CampaignTemplateVersion = require("../models/CampaignTemplateVersion");
const { requireRole } = require("../middleware/auth");
const { matchReasons } = require("../services/campaignAudienceService");

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

router.get("/:id/preview", async (req, res) => {
  try {
    const outreach = await Outreach.findById(req.params.id);
    if (!outreach) return res.status(404).json({ error: "Outreach email not found." });
    const rendered = await renderEmailContent(outreach, { preview: true });
    return res.json({ subject: outreach.subject, html: rendered.html });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Unable to preview outreach email." });
  }
});

router.post("/:id/test", requireRole("owner", "admin"), async (req, res) => {
  try {
    const outreach = await Outreach.findById(req.params.id);
    if (!outreach) {
      return res.status(404).json({ error: "Outreach email not found." });
    }
    const result = await sendTestEmail(outreach);
    if (!result.success) {
      return res.status(400).json({ error: result.message || "Unable to send test email." });
    }
    return res.json({
      message: result.message,
      messageId: result.id,
      recipient: result.recipient,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Unable to send test email." });
  }
});

router.post("/record-consent", requireRole("owner", "admin"), async (req, res) => {
  try {
    const { campaignId, attested } = req.body || {};
    if (!campaignId) return res.status(400).json({ error: "Campaign is required." });
    if (attested !== true) {
      return res.status(400).json({ error: "Confirm that every campaign contact included in this update gave permission." });
    }
    const consentSource = "campaign_owner_confirmation";
    const recordedAt = new Date();
    const campaign = await Campaign.findById(campaignId).select("campaignKind emailTemplate");
    if (!campaign) return res.status(404).json({ error: "Campaign not found." });
    const outreach = await Outreach.find({
      campaignId,
      status: { $in: ["pending", "approved", "failed"] },
      contactId: { $ne: null },
    }).select("contactId");
    const contactIds = [...new Set(outreach.map((item) => String(item.contactId)))];
    const topic = campaign.emailTemplate?.topic
      || (campaign.campaignKind === "program" ? "program_offers" : "event_invitations");
    const topicField = {
      event_invitations: "eventInvitations",
      program_offers: "programOffers",
      educational_newsletter: "educationalNewsletter",
    }[topic];
    const result = await Contact.updateMany(
      { _id: { $in: contactIds }, status: { $nin: ["archived", "invalid"] } },
      {
        $set: {
          status: "active",
          "emailPreferences.marketingStatus": "subscribed",
          "emailPreferences.consentSource": consentSource,
          "emailPreferences.consentAt": recordedAt,
          "emailPreferences.unsubscribedAt": null,
          "emailPreferences.unsubscribeSource": "",
          [`emailPreferences.topics.${topicField}`]: true,
        },
      },
    );
    return res.json({
      updatedCount: result.modifiedCount || 0,
      eligibleCount: result.matchedCount || 0,
      topic,
      message: `Recorded permission for ${result.modifiedCount || 0} campaign contact${result.modifiedCount === 1 ? "" : "s"}.`,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Unable to record campaign permission." });
  }
});



// ======================================
// GENERATE OUTREACH
// ======================================

router.post("/generate", async (req,res)=>{

  try {

    const {
      campaignId,
      onlyMissing = false,
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

    let generalTemplate = campaign.emailTemplate?.currentVersion
      ? await CampaignTemplateVersion.findOne({
        campaignId: campaign._id,
        version: campaign.emailTemplate.currentVersion,
      })
      : null;
    if (!generalTemplate) {
      const template = require("../services/campaignMasterTemplate").effectiveTemplate(campaign);
      const version = (await CampaignTemplateVersion.findOne({ campaignId: campaign._id }).sort({ version: -1 }).select("version"))?.version + 1 || 1;
      generalTemplate = await CampaignTemplateVersion.create({
        campaignId: campaign._id,
        version,
        subject: template.subject,
        body: template.body,
        callToAction: template.callToAction,
        callToActionUrl: template.callToActionUrl,
        topic: template.topic,
        approvedByUserId: req.auth.user._id,
        approvedAt: new Date(),
      });
      campaign.emailTemplate = { ...template, status: "approved", currentVersion: version, approvedAt: generalTemplate.approvedAt };
      campaign.activeAudienceTemplateKey = "general";
      await campaign.save();
    }
    const audienceTemplateDefinitions = Object.entries(campaign.emailAudienceTemplates || {})
      .filter(([, template]) => template?.status === "approved" && template?.currentVersion && template?.audienceLabel);
    const audienceTemplateVersions = await CampaignTemplateVersion.find({
      campaignId: campaign._id,
      version: { $in: audienceTemplateDefinitions.map(([, template]) => template.currentVersion) },
    });
    const audienceTemplates = audienceTemplateDefinitions
      .map(([key, definition]) => ({
        key,
        label: definition.audienceLabel,
        template: audienceTemplateVersions.find((version) => version.version === definition.currentVersion),
      }))
      .filter((item) => item.template);



    const contacts =
      await Contact.find({
        type: "lead",
        status: { $nin: ["archived", "unsubscribed", "invalid", "rejected"] },
        emailStatus: "verified",
        email: { $exists: true, $nin: ["", null] },
        campaignIds: campaign._id,
      });



    console.log(
      "Active leads found:",
      contacts.length
    );



    let createdCount = 0;
    let updatedCount = 0;
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

      const normalizedProfiles = (cleanedContact.audienceProfiles || [])
        .map((profile) => String(profile).toLowerCase().trim());
      const routedTemplate = audienceTemplates
        .map((candidate) => {
          const reasons = matchReasons(cleanedContact, [candidate.label]);
          const exactProfile = normalizedProfiles.includes(String(candidate.label).toLowerCase().trim());
          return {
            ...candidate,
            score: (exactProfile ? 100 : 0) + (reasons[0]?.terms?.length || 0),
          };
        })
        .filter((candidate) => candidate.score > 0)
        .sort((left, right) => right.score - left.score)[0];
      const recipientTemplate = routedTemplate?.template || generalTemplate;
      const recipientAudienceKey = routedTemplate?.key || "general";
      const recipientAudienceLabel = routedTemplate?.label || "All Deal to Close contacts";
      campaign.content = {
        subject: recipientTemplate.subject,
        body: recipientTemplate.body,
        callToAction: recipientTemplate.callToAction,
        callToActionUrl: recipientTemplate.callToActionUrl,
      };



      const draft =
        generateOutreachDraft(
          cleanedContact,
          campaign
        );

      if (exists) {
        if (onlyMissing) {
          skippedExisting++;
          continue;
        }
        if (["pending", "failed"].includes(exists.status)) {
          exists.organization = draft.organization;
          exists.contactName = draft.contactName;
          exists.contactRole = draft.contactRole;
          exists.reason = draft.reason;
          exists.subject = draft.subject;
          exists.emailDraft = draft.emailDraft;
          exists.htmlBody = draft.htmlBody || "";
          exists.eventLink = draft.eventLink || "";
          exists.flyerUrl = draft.flyerUrl || "";
          exists.templateVersion = recipientTemplate.version;
          exists.templateAudienceKey = recipientAudienceKey;
          exists.templateAudienceLabel = recipientAudienceLabel;
          exists.emailTopic = recipientTemplate.topic;
          exists.status = "pending";
          exists.errorMessage = "";
          await exists.save();
          updatedCount++;
        } else {
          skippedExisting++;
        }
        continue;
      }

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

  templateVersion: recipientTemplate.version,

  templateAudienceKey: recipientAudienceKey,

  templateAudienceLabel: recipientAudienceLabel,

  emailTopic: recipientTemplate.topic,

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
      updatedCount,

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
      updatedCount,

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

router.patch("/bulk/approve", async (req, res) => {
  try {
    const { campaignId } = req.body || {};
    if (!campaignId) return res.status(400).json({ error: "campaignId required" });
    const result = await Outreach.updateMany(
      { campaignId, status: "pending" },
      { $set: { status: "approved", errorMessage: "" } },
    );
    return res.json({
      approvedCount: result.modifiedCount || 0,
      message: `${result.modifiedCount || 0} pending draft${result.modifiedCount === 1 ? "" : "s"} approved`,
    });
  } catch (error) {
    return res.status(400).json({ error: error.message || "Unable to approve pending drafts" });
  }
});

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
    let failedCount = 0;
    const failures = [];



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
        failedCount++;
        failures.push({
          outreachId: item._id,
          email: item.contactEmail,
          message: result.message,
        });

      }


      await item.save();

    }

    if (sentCount > 0 && items[0]?.campaignId) {
      await Campaign.updateOne(
        { _id: items[0].campaignId },
        { $inc: { "metrics.sent": sentCount } },
      );
    }



    res.json({

      success:true,

      sentCount,
      failedCount,
      failures

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
