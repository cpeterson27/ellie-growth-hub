/**
 * Outreach Generator
 *
 * Creates personalized outreach emails
 */

// ======================================
// CLEAN CONTACT NAMES
// ======================================

function cleanName(value = "") {
  return String(value)
    // Split camelCase
    .replace(/([a-z])([A-Z])/g, "$1 $2")

    // Split ALLCAPS followed by normal word
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")

    // Remove duplicate spaces
    .replace(/\s+/g, " ")

    .trim();
}


// ======================================
// CLEAN CAMPAIGN NAME
// ======================================

function cleanCampaignName(value = "") {
  return String(value)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}


// ======================================
// GENERATE OUTREACH DRAFT
// ======================================

function generateOutreachDraft(contact, campaign) {

  const campaignName =
    cleanCampaignName(
      campaign.name || "this opportunity"
    );


  const rawContactName =
    contact.name ||
    `${contact.firstName || ""} ${contact.lastName || ""}`;


  const contactName =
    cleanName(
      rawContactName || "there"
    );


  const source =
    contact.sources?.[0] ||
    "manual";


  const subject =
    `Partner With ${campaignName}`;


  const emailDraft = [
    `Hi ${contactName},`,
    "",
    `I wanted to introduce ${campaignName}.`,
    "",
    "We are reaching out because your audience aligns with this event and we believe it could provide value through education, networking, and new opportunities.",
    "",
    "Would you be open to exploring a partnership or sharing this opportunity with your community?",
    "",
    "Thank you.",
  ].join("\n");



  return {

    organization:
      cleanName(
        contact.company ||
        rawContactName ||
        ""
      ),


    contactName,


    contactEmail:
      String(
        contact.email || ""
      )
        .toLowerCase()
        .trim(),


    contactRole:
      contact.role || "",


    reason:
      `Audience match discovered through ${source}.`,


    subject,


    emailDraft,


    status:
      "pending",

  };

}



module.exports = {
  generateOutreachDraft,
};