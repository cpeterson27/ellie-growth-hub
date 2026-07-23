const mongoose = require("mongoose");


const outreachSchema = new mongoose.Schema(
  {

    // ======================================
    // CAMPAIGN RELATIONSHIP
    // ======================================

    campaignId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Campaign",
      required: true,
      index: true,
    },


    // ======================================
    // CONTACT RELATIONSHIP
    // ======================================

    contactId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contact",
      default: null,
      index: true,
    },


    // ======================================
    // CONTACT SNAPSHOT
    // Keeps outreach history intact
    // ======================================

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
      index: true,
    },


    contactRole: {
      type: String,
      default: "",
      trim: true,
    },


    // ======================================
    // GENERATED OUTREACH CONTENT
    // ======================================

    reason: {
      type: String,
      default: "",
      trim: true,
    },


    emailDraft: {
      type: String,
      default: "",
    },


    htmlBody: {
      type: String,
      default: "",
    },


    eventLink: {
      type: String,
      default: "",
    },


    flyerUrl: {
      type: String,
      default: "",
    },


    subject: {
      type: String,
      default: "",
      trim: true,
    },


    // ======================================
    // OUTREACH LIFECYCLE
    //
    // pending  = Generated waiting approval
    // approved = Ready to send
    // sent     = Successfully delivered
    // replied  = Contact responded
    // failed   = Sending failed
    // ======================================

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


    // ======================================
    // EMAIL TRACKING
    // ======================================

    sentAt: {
      type: Date,
      default: null,
    },


    messageId: {
      type: String,
      default: "",
      trim: true,
    },


    // ======================================
    // REPLY TRACKING
    // ======================================

    repliedAt: {
      type: Date,
      default: null,
    },


    replyText: {
      type: String,
      default: "",
    },


    aiReplyDraft: {
      type: String,
      default: "",
    },


    // ======================================
    // ERROR HANDLING
    // ======================================

    errorMessage: {
      type: String,
      default: "",
    },


  },
  {
    timestamps: true,
  }
);



// ======================================
// INDEXES
// ======================================


// Prevent duplicate outreach
// Same campaign + same email
outreachSchema.index(
  {
    campaignId: 1,
    contactEmail: 1,
  },
  {
    unique: true,
  }
);


// Campaign dashboard filtering
outreachSchema.index({
  campaignId: 1,
  status: 1,
});


// Sent history sorting
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