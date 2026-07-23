const mongoose = require("mongoose");


const outreachSchema = new mongoose.Schema(
  {

    // -------------------------------------------------------------------------
    // Campaign relationship
    // -------------------------------------------------------------------------

    campaignId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Campaign",
      required: true,
      index: true,
    },


    // -------------------------------------------------------------------------
    // Contact relationship
    // -------------------------------------------------------------------------

    contactId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contact",
      default: null,
      index: true,
    },


    // -------------------------------------------------------------------------
    // Contact snapshot
    // Stored so outreach history remains intact
    // even if contact data changes later.
    // -------------------------------------------------------------------------

    organization: {
      type: String,
      required: true,
      trim: true,
    },


    contactName: {
      type: String,
      default: "",
      trim: true,
    },


    contactEmail: {
      type: String,
      default: "",
      lowercase: true,
      trim: true,
    },


    contactRole: {
      type: String,
      default: "",
      trim: true,
    },


    // -------------------------------------------------------------------------
    // AI / generation metadata
    // -------------------------------------------------------------------------

    reason: {
      type: String,
      required: true,
    },


    emailDraft: {
      type: String,
      required: true,
    },


    subject: {
      type: String,
      default: "",
      trim: true,
    },


    // -------------------------------------------------------------------------
    // Outreach lifecycle
    //
    // pending  -> Generated waiting for approval
    // approved -> Approved and ready to send
    // sent     -> Successfully delivered
    // replied  -> Contact responded
    // failed   -> Sending failed
    // -------------------------------------------------------------------------

    status: {
      type: String,
      enum: [
        "pending",
        "approved",
        "sent",
        "replied",
        "failed",
      ],
      default: "pending",
      index: true,
    },


    // -------------------------------------------------------------------------
    // Email tracking
    // -------------------------------------------------------------------------

    sentAt: {
      type: Date,
      default: null,
    },


    messageId: {
      type: String,
      default: "",
      trim: true,
    },


    // -------------------------------------------------------------------------
    // Reply tracking
    // -------------------------------------------------------------------------

    repliedAt: {
      type: Date,
      default: null,
    },


    replyText: {
      type: String,
      default: "",
    },


    // AI generated reply suggestion
    aiReplyDraft: {
      type: String,
      default: "",
    },


    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    errorMessage: {
      type: String,
      default: "",
    },


  },
  {
    timestamps: true,
  }
);



// -----------------------------------------------------------------------------
// Indexes
// -----------------------------------------------------------------------------


// Prevent duplicate outreach
// Same campaign + same person
outreachSchema.index(
  {
    campaignId: 1,
    contactEmail: 1,
  },
  {
    unique: true,
  }
);


// Campaign filtering
outreachSchema.index({
  campaignId: 1,
  status: 1,
});


// Sent history
outreachSchema.index({
  status: 1,
  sentAt: -1,
});


// Resend message lookup
outreachSchema.index(
  {
    messageId: 1,
  },
  {
    sparse: true,
  }
);


// Reply inbox sorting
outreachSchema.index({
  status: 1,
  repliedAt: -1,
});


module.exports = mongoose.model(
  "Outreach",
  outreachSchema
);