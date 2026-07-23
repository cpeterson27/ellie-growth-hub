const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema(
  {
    // Basic event information
    name: {
      type: String,
      required: true,
    },

    description: {
      type: String,
      default: "",
    },

    summary: {
      type: String,
      default: "",
    },

    category: {
      type: String,
      default: "",
    },

    tags: [
      {
        type: String,
      },
    ],

    // Date and time
    startDate: {
      type: Date,
      required: true,
    },

    endDate: {
      type: Date,
    },

    timeZone: {
      type: String,
      default: "America/Los_Angeles",
    },

    // Location
    locationType: {
      type: String,
      enum: ["online", "venue"],
      default: "online",
    },

    location: {
      type: String,
      default: "",
    },

    onlineUrl: {
      type: String,
      default: "",
    },

    // Ticketing
    ticketPrice: {
      type: Number,
      required: true,
    },

    ticketGoal: {
      type: Number,
      required: true,
    },

    ticketsSold: {
      type: Number,
      default: 0,
    },

    capacity: {
      type: Number,
      default: 0,
    },

    // Audience + marketing
    audience: [
      {
        type: String,
      },
    ],

    channels: [
      {
        type: String,
      },
    ],

    // Integrations
    integrations: {
      eventbrite: {
        enabled: {
          type: Boolean,
          default: false,
        },
        eventId: {
          type: String,
          default: "",
        },
        url: {
          type: String,
          default: "",
        },
      },

      monday: {
        enabled: {
          type: Boolean,
          default: false,
        },
        boardId: {
          type: String,
          default: "",
        },
      },

      apollo: {
        enabled: {
          type: Boolean,
          default: false,
        },
      },

      resend: {
        enabled: {
          type: Boolean,
          default: false,
        },
      },
    },

    status: {
      type: String,
      enum: ["draft", "active", "completed"],
      default: "draft",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Event", eventSchema);