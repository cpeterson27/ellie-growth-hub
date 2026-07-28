const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { connectDatabase } = require("./config/database");
const Contact = require("./models/Contact");

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
const jarvisRouter = require("./routes/jarvis");
const webhooksRouter = require("./routes/webhooks");
const partnersRouter = require("./routes/partners");
const contentRouter = require("./routes/content");
const developmentRequestsRouter = require("./routes/developmentRequests");

const app = express();

app.use(cors());
app.use(express.json({ limit: "12mb" }));

const PORT = process.env.PORT || 5001;
const mongoUri = process.env.MONGO_URI;

if (!mongoUri) {
  console.error(
    "Missing MONGO_URI. Set it in backend/.env or the environment.",
  );
  process.exit(1);
}

connectDatabase(mongoUri)
  .then(async () => {
    console.log("Connected to MongoDB");

    const migratedImports = await Contact.updateMany(
      {
        status: "prospect",
        $or: [
          { sourceProvider: { $in: ["csv", "manual", "monday"] } },
          { sources: { $in: ["csv", "manual", "monday"] } },
        ],
      },
      { $set: { status: "active" } },
    );

    if (migratedImports.modifiedCount > 0) {
      console.log(
        `Moved ${migratedImports.modifiedCount} imported contacts into the CRM workflow.`,
      );
    }

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
    app.use("/api/jarvis", jarvisRouter);
    app.use("/api/webhooks", webhooksRouter);
    app.use("/api/partners", partnersRouter);
    app.use("/api/content", contentRouter);
    app.use("/api/development-requests", developmentRequestsRouter);

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
