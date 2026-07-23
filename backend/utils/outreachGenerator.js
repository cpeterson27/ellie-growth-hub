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
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
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
// ESCAPE HTML
// ======================================

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}


// ======================================
// GENERATE OUTREACH DRAFT
// ======================================

function generateOutreachDraft(contact, campaign) {

  const campaignName =
    cleanCampaignName(
      campaign.name || "Deal to Close: Multifamily Bootcamp"
    );


  const rawContactName =
    contact.name ||
    `${contact.firstName || ""} ${contact.lastName || ""}`;


  const contactName =
    cleanName(rawContactName || "there");


  const source =
    contact.sources?.[0] ||
    "manual";


  const subject =
    `Partner With ${campaignName}`;


  const eventLink =
    "https://www.eventbrite.com/e/deal-to-close-multifamily-bootcamp-tickets-1994515277887?aff=ebdssbdestsearch";


  // Replace this later with Cloudinary flyer URL
  const flyerUrl =
    "https://res.cloudinary.com/de1vvqtp3/image/upload/v1784844473/deal-to-close-flyer.png_bmxmbw.png";


  const emailDraft = `
Hi ${contactName},

I wanted to personally introduce you to Deal to Close: Multifamily Bootcamp.

This is a one-day virtual event designed for real estate investors who want to learn how to analyze multifamily deals, build investor relationships, raise capital, and confidently move toward acquisitions.

We thought this would be a great fit for your audience because your community is connected to real estate education, investing, and growth opportunities.

We would love to explore a partnership opportunity with you and see if this event would be valuable to share with your audience.

Event Details:

Deal to Close: Multifamily Bootcamp
Saturday, August 22, 2026
8:00 AM - 4:00 PM PST

Register Here:
${eventLink}

Would you be open to discussing a potential partnership?

Thank you,

Ellie's Coaching
`.trim();



  const htmlBody = `
<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;">

<p>Hi ${escapeHtml(contactName)},</p>

<p>
I wanted to personally introduce you to 
<strong>Deal to Close: Multifamily Bootcamp</strong>.
</p>

<p>
This is a one-day virtual event designed for real estate investors who want to learn how to analyze multifamily deals, build investor relationships, raise capital, and confidently move toward acquisitions.
</p>

<p>
We thought this would be a great fit for your audience because your community is connected to real estate education, investing, and growth opportunities.
</p>


<img 
src="${flyerUrl}"
alt="Deal to Close Multifamily Bootcamp"
style="width:100%;max-width:600px;border-radius:8px;"
/>


<h3>Event Details</h3>

<p>
<strong>Deal to Close: Multifamily Bootcamp</strong><br>
Saturday, August 22, 2026<br>
8:00 AM - 4:00 PM PST
</p>


<a 
href="${eventLink}"
style="
display:inline-block;
background:#000;
color:#fff;
padding:14px 24px;
text-decoration:none;
border-radius:6px;
font-weight:bold;
">
Reserve Your Spot
</a>


<p>
Would you be open to discussing a potential partnership?
</p>

<p>
Thank you,<br>
Ellie's Coaching
</p>

</body>
</html>
`.trim();



  return {

    organization:
      cleanName(
        contact.company ||
        rawContactName ||
        ""
      ),


    contactName,


    contactEmail:
      String(contact.email || "")
      .toLowerCase()
      .trim(),


    contactRole:
      contact.role || "",


    reason:
      `Audience match discovered through ${source}.`,


    subject,


    emailDraft,


    htmlBody,


    eventLink,


    flyerUrl,


    status:"pending"

  };

}



module.exports = {
  generateOutreachDraft,
};