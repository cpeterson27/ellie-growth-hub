require("dotenv").config();
const { connectDatabase } = require("./config/database");
const { startResearchMonitorRunner, runDueResearchMonitors } = require("./services/researchMonitorService");

const mongoUri = process.env.MONGO_URI;
if (!mongoUri) {
  console.error("Missing MONGO_URI for the research worker.");
  process.exit(1);
}

connectDatabase(mongoUri)
  .then(async () => {
    console.log("Research worker connected to MongoDB.");
    await runDueResearchMonitors();
    startResearchMonitorRunner();
  })
  .catch((error) => {
    console.error("Research worker failed to start:", error.message || error);
    process.exit(1);
  });
