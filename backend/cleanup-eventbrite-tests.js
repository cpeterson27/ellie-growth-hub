#!/usr/bin/env node
/**
 * Clean up Eventbrite test data from database
 */

const mongoose = require("mongoose");
require("dotenv").config();
const Contact = require("./models/Contact");

async function cleanup() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGO_URI);

    console.log("Removing Eventbrite test contacts...");
    const result = await Contact.deleteMany({
      tags: { $in: ["eventbrite"] },
    });

    console.log(`✓ Deleted ${result.deletedCount} contacts`);

    process.exit(0);
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

cleanup();
