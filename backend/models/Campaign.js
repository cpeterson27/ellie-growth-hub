const mongoose = require("mongoose");


const campaignSchema = new mongoose.Schema(
{
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Event",
    required: function() { return this.campaignKind !== "program"; },
    index: true,
  },


  name: {
    type: String,
    required: true,
    trim: true,
  },


  type: {
    type: String,
    default: "event",
  },
  campaignKind: { type: String, enum: ["event", "program"], default: "event", index: true },
  programName: { type: String, default: "" },
  templateKey: { type: String, default: "event_invite" },


  audience: [
    {
      type: String,
    },
  ],


  content: {

    subject: {
      type: String,
      default: "Event Campaign",
    },


    body: {
      type: String,
      default: "Campaign created for event promotion.",
    },


    callToAction: {
      type: String,
      default: "Register Now",
    },


    callToActionUrl: {
      type: String,
      default: "",
    },

  },


  metrics: {

    sent: {
      type: Number,
      default: 0,
    },

    delivered: {
      type: Number,
      default: 0,
    },

    opened: {
      type: Number,
      default: 0,
    },

    clicked: {
      type: Number,
      default: 0,
    },

    converted: {
      type: Number,
      default: 0,
    },

  },


  startDate: Date,


  ticketPrice: Number,


  ticketGoal: Number,


  ticketsSold: {
    type: Number,
    default: 0,
  },


  status: {
    type: String,
    enum:[
      "draft",
      "active",
      "completed",
      "paused",
    ],
    default:"active",
  },


},
{
 timestamps:true,
 collection:"campaigns",
}
);


module.exports = mongoose.model(
 "Campaign",
 campaignSchema
);
