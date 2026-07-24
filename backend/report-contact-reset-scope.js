/*
 * Report-only development-data reset scope. It never changes MongoDB data.
 * Usage: MONGO_URI=... node backend/report-contact-reset-scope.js <campaignId>
 */
const mongoose = require("mongoose");
const Contact = require("./models/Contact");
const Campaign = require("./models/Campaign");
const Outreach = require("./models/Outreach");

async function report(campaignId) {
  if (!mongoose.Types.ObjectId.isValid(campaignId)) throw new Error("Provide a valid Deal to Close campaign ID");
  const id = new mongoose.Types.ObjectId(campaignId);
  const campaign = await Campaign.findById(id).select("_id name").lean();
  if (!campaign) throw new Error("Campaign not found");
  const proposedContactFilter = { $or: [{ sources: "monday" }, { tags: "monday" }, { tags: "test" }, { sourceProvider: "test" }] };
  const campaignContactFilter = { campaignIds: id };
  const outreachFilter = { campaignId: id };
  const samples = async (model, filter, fields) => model.find(filter).select(fields).limit(5).lean();
  return {
    reportOnly: true,
    campaign,
    filters: { proposedContactFilter, campaignContactFilter, outreachFilter },
    proposedMondayOrTestContacts: { count: await Contact.countDocuments(proposedContactFilter), samples: await samples(Contact, proposedContactFilter, "_id name email company sources tags") },
    campaignContacts: { count: await Contact.countDocuments(campaignContactFilter), samples: await samples(Contact, campaignContactFilter, "_id name email company campaignIds") },
    campaignOutreach: { count: await Outreach.countDocuments(outreachFilter), samples: await samples(Outreach, outreachFilter, "_id contactId campaignId status") },
  };
}

if (require.main === module) {
  const campaignId = process.argv[2] || process.env.DEAL_TO_CLOSE_CAMPAIGN_ID;
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is required");
  mongoose.connect(process.env.MONGO_URI).then(async () => {
    console.log(JSON.stringify(await report(campaignId), null, 2));
  }).finally(() => mongoose.connection.close());
}

module.exports = { report };
