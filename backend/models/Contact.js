/**
 * Contact Model
 *
 * One person = one Contact record
 *
 * Supports:
 * - Monday CRM
 * - Apollo
 * - Eventbrite
 * - Manual imports
 * - Future integrations
 */

const mongoose = require("mongoose");


const contactSchema = new mongoose.Schema(
  {

    // -------------------------------------------------------------------------
    // Basic identity
    // -------------------------------------------------------------------------

    name: {
      type: String,
      required: true,
      trim: true,
    },


    firstName: {
      type: String,
      trim: true,
      default: "",
    },


    lastName: {
      type: String,
      trim: true,
      default: "",
    },


    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },


    company: {
      type: String,
      trim: true,
      default: "",
    },


    // -------------------------------------------------------------------------
    // Organization relationship
    // -------------------------------------------------------------------------

    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      default: null,
      index: true,
    },


    // -------------------------------------------------------------------------
    // External source tracking
    //
    // Example:
    //
    // sources:
    // [
    //   "monday",
    //   "apollo"
    // ]
    //
    // externalIds:
    // {
    //   monday:"12605053520",
    //   apollo:"abc123"
    // }
    //
    // -------------------------------------------------------------------------

    sources: {
      type: [String],
      default: [],
    },


    externalIds: {
      type: Object,
      default: {},
    },


    // -------------------------------------------------------------------------
    // CRM lifecycle
    //
    // lead:
    //   Newly discovered prospect
    //
    // contact:
    //   Active relationship
    //
    // customer:
    //   Paying customer
    //
    // partner:
    //   Referral / strategic partner
    // -------------------------------------------------------------------------

    type: {
      type: String,
      enum: [
        "lead",
        "contact",
        "customer",
        "partner",
      ],
      default: "lead",
      index: true,
    },


    // -------------------------------------------------------------------------
    // Categorization
    // -------------------------------------------------------------------------

    tags: {
      type: [String],
      default: [],
    },


    // -------------------------------------------------------------------------
    // Record status
    // -------------------------------------------------------------------------

    status: {
      type: String,
      enum: [
        "active",
        "inactive",
        "unsubscribed",
        "invalid",
      ],
      default: "active",
      index: true,
    },


  },
  {
    timestamps: true,
  }
);



// -----------------------------------------------------------------------------
// Indexes
// -----------------------------------------------------------------------------


// One person = one email
// Prevent duplicate people across integrations
contactSchema.index(
  {
    email: 1,
  },
  {
    unique: true,
  }
);


// Find contacts by source
contactSchema.index({
  sources: 1,
});


// Find external provider IDs
contactSchema.index({
  externalIds: 1,
});


// Organization filtering
contactSchema.index({
  organizationId: 1,
  status: 1,
});


// CRM filtering
contactSchema.index({
  type: 1,
  status: 1,
});


// Recent contacts
contactSchema.index({
  createdAt: -1,
});


module.exports = mongoose.model(
  "Contact",
  contactSchema
);