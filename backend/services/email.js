const integrationHub = require("./integrationHub");
const IntegrationConnection = require("../models/IntegrationConnection");
const Contact = require("../models/Contact");
const WorkspaceConfig = require("../models/WorkspaceConfig");
const { createUnsubscribeToken, publicBackendUrl } = require("../utils/unsubscribe");

async function renderEmailContent(outreachItem, { contact = null, preview = false } = {}) {
  const workspace = await WorkspaceConfig.findOne({ key: "primary" });
  if (!workspace?.postalAddress?.trim() && !preview) {
    throw new Error("Add the business mailing address in Settings before sending campaign email.");
  }
  const resolvedContact = contact || (outreachItem.contactId
    ? await Contact.findById(outreachItem.contactId)
    : await Contact.findOne({ email: String(outreachItem.contactEmail || "").toLowerCase() }));
  const unsubscribeUrl = resolvedContact
    ? `${publicBackendUrl()}/api/unsubscribe/${encodeURIComponent(createUnsubscribeToken(resolvedContact))}`
    : "#";
  const businessName = workspace?.legalBusinessName || workspace?.workspaceName || "Ellie's Coaching";
  const postalAddress = workspace?.postalAddress || (preview ? "Business postal address from Settings" : "");
  const websiteUrl = String(workspace?.websiteUrl || "").trim();
  const complianceText = `This promotional message was sent because we believed this opportunity may be relevant to your professional work.\n${businessName}${postalAddress ? ` · ${postalAddress}` : ""}${websiteUrl ? ` · ${websiteUrl}` : ""}\nUnsubscribe: ${unsubscribeUrl}`;
  const footerHtml = `<div style="margin-top:36px;padding-top:20px;border-top:1px solid #ddd7ca;color:#737b77;font-size:12px;line-height:1.6;text-align:center"><div style="margin-bottom:8px">This promotional message was sent because we believed this opportunity may be relevant to your professional work.</div><div><strong>${String(businessName).replace(/[<>&"]/g, "")}</strong></div>${postalAddress ? `<div>${String(postalAddress).replace(/[<>&"]/g, "")}</div>` : ""}${websiteUrl ? `<div><a href="${websiteUrl.replace(/"/g, "&quot;")}" style="color:#506b63">${websiteUrl.replace(/[<>&"]/g, "")}</a></div>` : ""}<div style="margin-top:8px"><a href="${unsubscribeUrl}" style="color:#506b63">Unsubscribe from campaign emails</a></div></div>`;
  const text = `${outreachItem.emailDraft || ""}\n\n—\n${complianceText}`;
  let html = outreachItem.htmlBody || `<html><body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;">${(outreachItem.emailDraft || "")
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${String(paragraph).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replaceAll("\n", "<br>")}</p>`)
    .join("")}</body></html>`;
  const organizationLogo = String(workspace?.organizationLogoUrl || "").trim();
  if (organizationLogo && !html.includes(organizationLogo)) {
    const logoHtml = `<div style="margin:0 0 28px"><img src="${organizationLogo.replace(/"/g, "&quot;")}" alt="${String(businessName).replace(/[<>&"]/g, "")}" style="display:block;max-height:84px;max-width:220px;object-fit:contain"></div>`;
    html = html.includes("<body") ? html.replace(/(<body[^>]*>)/i, `$1${logoHtml}`) : `${logoHtml}${html}`;
  }
  html = html.includes("</body>") ? html.replace("</body>", `${footerHtml}</body>`) : `${html}${footerHtml}`;
  return { text, html, unsubscribeUrl };
}



// ======================================
// SEND EMAIL
// ======================================

async function sendEmail(outreachItem) {


  if (!outreachItem) {

    return {
      success:false,
      message:"Missing outreach item.",
    };

  }



  const recipient =
    outreachItem.contactEmail ||
    process.env.TEST_EMAIL;



  if (!recipient) {

    return {
      success:false,
      message:"No recipient email found.",
    };

  }




  const contact = outreachItem.contactId
    ? await Contact.findById(outreachItem.contactId)
    : await Contact.findOne({ email: String(recipient).toLowerCase() });
  if (contact?.status === "unsubscribed" || contact?.emailPreferences?.marketingStatus === "unsubscribed") {
    return { success: false, message: "This contact unsubscribed from campaign email." };
  }
  if (!contact) {
    return { success: false, message: "A CRM contact is required before campaign email can be sent." };
  }
  if (contact.emailPreferences?.marketingStatus !== "subscribed" || !contact.emailPreferences?.consentAt) {
    return { success: false, message: "This contact has no recorded marketing opt-in. Verified email is not the same as permission to send." };
  }
  const topicField = {
    event_invitations: "eventInvitations",
    program_offers: "programOffers",
    educational_newsletter: "educationalNewsletter",
  }[outreachItem.emailTopic || "event_invitations"];
  if (!topicField || contact.emailPreferences?.topics?.[topicField] !== true) {
    return { success: false, message: `This contact has not subscribed to ${String(outreachItem.emailTopic || "this email topic").replaceAll("_", " ")}.` };
  }
  let rendered;
  try {
    rendered = await renderEmailContent(outreachItem, { contact });
  } catch (error) {
    return { success: false, message: error.message };
  }
  const { text, html, unsubscribeUrl } = rendered;





try {

const gmailConnection = await IntegrationConnection.findOne({
  provider: "gmail",
  status: "connected",
}).select("settings");
const replyTo =
  String(process.env.EMAIL_REPLY_TO || "").trim() ||
  String(gmailConnection?.settings?.email || "").trim();

const response = await integrationHub.execute("resend", "sendEmail", {
  from: process.env.EMAIL_FROM || "Ellie AI <onboarding@resend.dev>",
  to: recipient,
  subject: outreachItem.subject || "A message from Ellie's Coaching",
  text,
  html,
  replyTo,
  headers: {
    "List-Unsubscribe": `<${unsubscribeUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  },
});





console.log("✅ Email sent via Resend");



return {

success:true,

message:
"Email sent successfully.",

id:
response.messageId

};



}
catch(error){


console.error("SEND EMAIL ERROR");



return {

success:false,

message:
error.message

};


}



}

async function sendTestEmail(outreachItem, recipient = "team@elliescoaching.com") {
  if (!outreachItem) {
    return { success: false, message: "Missing outreach item." };
  }

  try {
    const { text, html } = await renderEmailContent(outreachItem, { preview: true });
    const gmailConnection = await IntegrationConnection.findOne({
      provider: "gmail",
      status: "connected",
    }).select("settings");
    const replyTo =
      String(process.env.EMAIL_REPLY_TO || "").trim() ||
      String(gmailConnection?.settings?.email || "").trim();
    const response = await integrationHub.execute("resend", "sendEmail", {
      from: process.env.EMAIL_FROM || "Ellie AI <onboarding@resend.dev>",
      to: recipient,
      subject: `[TEST] ${outreachItem.subject || "A message from Ellie's Coaching"}`,
      text,
      html,
      replyTo,
    });
    return {
      success: true,
      message: `Test email sent to ${recipient}.`,
      id: response.messageId,
      recipient,
    };
  } catch (error) {
    return { success: false, message: error.message };
  }
}



module.exports = {
  renderEmailContent,
  sendEmail,
  sendTestEmail,
};
