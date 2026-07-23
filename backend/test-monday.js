require("dotenv").config();

const MondayAdapter = require("./services/integrations/MondayAdapter");

const adapter = new MondayAdapter();

adapter
  .fetchUserInfo({
    apiKey: process.env.MONDAY_API_KEY,
  })
  .then((info) => {
    console.log("SUCCESS:", info);
  })
  .catch((err) => {
    console.error("FAILED:", err.message);
  });