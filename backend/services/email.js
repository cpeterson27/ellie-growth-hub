const integrationHub = require("./integrationHub");
const IntegrationConnection = require("../models/IntegrationConnection");



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




  const text = outreachItem.emailDraft || "";
  const html = outreachItem.htmlBody || `<html><body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;">${text
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${String(paragraph).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replaceAll("\n", "<br>")}</p>`)
    .join("")}</body></html>`;





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
