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
const gmailRouter = require("./routes/gmail");
const workspaceRouter = require("./routes/workspace");
const unsubscribeRouter = require("./routes/unsubscribe");
const authRouter = require("./routes/auth");
const businessIndexRouter = require("./routes/businessIndex");
const mcpAccessRouter = require("./routes/mcpAccess");
const mcpRouter = require("./routes/mcp");
const oauthRouter = require("./routes/oauth");
const socialRouter = require("./routes/social");
const gptActionsRouter = require("./routes/gptActions");
const activitiesRouter = require("./routes/activities");
const opportunitiesRouter = require("./routes/opportunities");
const { requireAuth } = require("./middleware/auth");
const { startResearchMonitorRunner } = require("./services/researchMonitorService");

const app = express();

const allowedOrigins = (process.env.FRONTEND_URL || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
if (process.env.NODE_ENV !== "production") {
  allowedOrigins.push("http://localhost:5173", "http://127.0.0.1:5173");
}
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("Origin is not allowed"));
  },
  credentials: true,
}));
app.use(express.json({
  limit: "12mb",
  verify(req, _res, buffer) {
    if (req.originalUrl === "/api/webhooks/resend") {
      req.rawBody = buffer.toString("utf8");
    }
  },
}));
app.use(express.urlencoded({ extended: false }));

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

    // Older intent conversions sometimes stored a Reddit username and URL as a
    // person's name. Keep the source evidence, but do not present that account
    // as a verified identity in the CRM.
    const legacyIntentContacts = await Contact.find({ sourceProvider: "intent_monitor" });
    let repairedIntentContacts = 0;
    for (const contact of legacyIntentContacts) {
      const recordedName = String(contact.name || "").trim();
      if (!/(?:reddit\.com\/user\/|^\/?u\/|https?:\/\/)/i.test(recordedName)) continue;
      const evidenceNote = `Original public account value: ${recordedName}`;
      const notes = String(contact.notes || "").includes(evidenceNote)
        ? contact.notes
        : [contact.notes, evidenceNote].filter(Boolean).join("\n");
      await Contact.updateOne(
        { _id: contact._id },
        { $set: { name: "Identity research needed", firstName: "", lastName: "", stage: "Needs Research", researchStatus: "needs_research", notes } },
      );
      repairedIntentContacts += 1;
    }
    if (repairedIntentContacts) {
      console.log(`Repaired ${repairedIntentContacts} legacy intent contact name(s).`);
    }

    app.use("/api/auth", authRouter);
    app.use("/", oauthRouter);
    app.use("/", gptActionsRouter);
    app.use("/mcp", mcpRouter);
    app.use("/api", (req, res, next) => {
      const publicRequest =
        req.path === "/health" ||
        req.path.startsWith("/unsubscribe/") ||
        req.path === "/webhooks/resend" ||
        req.path === "/jarvis/memory/sync" ||
        req.path === "/eventbrite/webhook" ||
        req.path === "/eventbrite/oauth/callback" ||
        req.path === "/gmail/oauth/callback";
      const publicSocialCallback = /^\/social\/(?:linkedin|meta)\/oauth\/callback$/.test(req.path);
      return publicRequest || publicSocialCallback ? next() : requireAuth(req, res, next);
    });

    app.use("/api/campaigns", campaignsRouter);
    app.use("/api/outreach", outreachRouter);
    app.use("/api/emails", emailsRouter);
    app.use("/api/events", eventsRouter);
    app.use("/api/eventbrite", eventbriteRouter);
    app.use("/api/contacts", contactsRouter);
    app.use("/api/activities", activitiesRouter);
    app.use("/api/opportunities", opportunitiesRouter);
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
    app.use("/api/gmail", gmailRouter);
    app.use("/api/workspace", workspaceRouter);
    app.use("/api/unsubscribe", unsubscribeRouter);
    app.use("/api/business-index", businessIndexRouter);
    app.use("/api/mcp-access-tokens", mcpAccessRouter);
    app.use("/api/social", socialRouter);

    app.get("/api/health", (req, res) => {
      res.json({
        status: "Growth Operator backend running 🚀",
      });
    });

    const server = app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      if (process.env.RESEARCH_WORKER_MODE !== "external") startResearchMonitorRunner();
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
