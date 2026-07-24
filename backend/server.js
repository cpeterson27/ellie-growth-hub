const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { connectDatabase } = require("./config/database");

const campaignsRouter = require("./routes/campaigns");
const outreachRouter = require("./routes/outreach");
const emailsRouter = require("./routes/emails");
const eventsRouter = require("./routes/events");
const eventbriteRouter = require("./routes/eventbrite");
const contactsRouter = require("./routes/contacts");
const audienceRouter = require("./routes/audience");
const organizationRelationshipsRouter = require("./routes/organizationRelationships");
const integrationsRouter = require("./routes/integrations");
const integrationConnectionsRouter = require("./routes/integrationConnections");
const marketingCampaignsRouter = require("./routes/marketingCampaigns");
const growthOperatorsRouter = require("./routes/growthOperators");
const bootcampCampaignsRouter = require("./routes/bootcampCampaigns");
const mondayRouter = require("./routes/monday");
const jarvisRouter = require("./routes/jarvis");
const webhooksRouter = require("./routes/webhooks");
const partnersRouter = require("./routes/partners");
const contentRouter = require("./routes/content");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5001;
const mongoUri = process.env.MONGO_URI;

if (!mongoUri) {
  console.error(
    "Missing MONGO_URI. Set it in backend/.env or the environment.",
  );
  process.exit(1);
}

connectDatabase(mongoUri)
  .then(() => {
    console.log("Connected to MongoDB");

    app.use("/api/campaigns", campaignsRouter);
    app.use("/api/outreach", outreachRouter);
    app.use("/api/emails", emailsRouter);
    app.use("/api/events", eventsRouter);
    app.use("/api/eventbrite", eventbriteRouter);
    app.use("/api/contacts", contactsRouter);
    app.use("/api/audience", audienceRouter);
    app.use("/api/organizations", organizationRelationshipsRouter);
    app.use("/api/integrations", integrationsRouter);
    app.use("/api/integration-connections", integrationConnectionsRouter);
    app.use("/api/marketing-campaigns", marketingCampaignsRouter);
    app.use("/api/growth-operators", growthOperatorsRouter);
    app.use("/api/bootcamp-campaigns", bootcampCampaignsRouter);
    app.use("/api/monday", mondayRouter);
    app.use("/api/jarvis", jarvisRouter);
    app.use("/api/webhooks", webhooksRouter);
    app.use("/api/partners", partnersRouter);
    app.use("/api/content", contentRouter);

    app.get("/api/health", (req, res) => {
      res.json({
        status: "Ellie backend running 🚀",
      });
    });

    const server = app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });

    server.on("error", (error) => {
      console.error(`Failed to start server on port ${PORT}:`, error.message);
      process.exit(1);
    });
  })
  .catch((error) => {
    console.error("Failed to connect to MongoDB:", error.message || error);
    process.exit(1);
  });
