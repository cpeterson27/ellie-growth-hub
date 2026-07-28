const integrationHub = require("./integrationHub");
const IntegrationConnection = require("../models/IntegrationConnection");
const Contact = require("../models/Contact");
const WorkspaceConfig = require("../models/WorkspaceConfig");
const { createUnsubscribeToken, publicBackendUrl } = require("../utils/unsubscribe");



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
  const workspace = await WorkspaceConfig.findOne({ key: "primary" });
  if (!workspace?.postalAddress?.trim()) {
    return {
      success: false,
      message: "Add the business mailing address in Settings before sending campaign email.",
    };
  }
  const token = createUnsubscribeToken(contact);
  const unsubscribeUrl = `${publicBackendUrl()}/api/unsubscribe/${encodeURIComponent(token)}`;
  const businessName = workspace?.legalBusinessName || workspace?.workspaceName || "Ellie's Coaching";
  const postalAddress = workspace?.postalAddress || "";
  const complianceText = `${businessName}${postalAddress ? ` · ${postalAddress}` : ""}\nUnsubscribe: ${unsubscribeUrl}`;
  const footerHtml = `<div style="margin-top:36px;padding-top:20px;border-top:1px solid #ddd7ca;color:#737b77;font-size:12px;line-height:1.6;text-align:center"><div>${String(businessName).replace(/[<>&"]/g, "")}</div>${postalAddress ? `<div>${String(postalAddress).replace(/[<>&"]/g, "")}</div>` : ""}<div><a href="${unsubscribeUrl}" style="color:#506b63">Unsubscribe from campaign emails</a></div></div>`;
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



module.exports = {
  sendEmail,
};
