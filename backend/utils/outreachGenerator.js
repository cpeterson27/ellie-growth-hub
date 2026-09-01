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
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function emailButton(url, label, backgroundColor) {
  if (!url) return "";
  return `
<table role="presentation" border="0" cellpadding="0" cellspacing="0" style="border-collapse:separate;margin:12px 0 0;">
  <tr>
    <td align="center" bgcolor="${backgroundColor}" style="background-color:${backgroundColor};border-radius:6px;padding:14px 24px;">
      <a href="${escapeHtml(url)}" target="_blank" style="color:#ffffff;display:block;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;line-height:20px;text-decoration:none;white-space:nowrap;">&nbsp;${escapeHtml(label)}&nbsp;</a>
    </td>
  </tr>
</table>`.trim();
}

function fillTemplate(value = "", variables = {}) {
  const filled = Object.entries(variables).reduce(
    (output, [key, replacement]) => output.replaceAll(`{{${key}}}`, String(replacement || "")),
    String(value || ""),
  );
  const company = String(variables.company || variables.communityName || "");
  return filled
    .replace(/\[(?:community|company|organization)(?:\s+name)?\]/gi, company)
    .replace(/\{\{(?:community|company|organization)(?:\s*name)?\}\}/gi, company);
}

function textToHtml(value = "") {
  return String(value)
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replaceAll("\n", "<br>")}</p>`)
    .join("\n");
}

function formatEventDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function applyCanonicalEventDate(value, eventDate, campaignName = "") {
  let output = String(value || "").replaceAll("{{eventDate}}", eventDate || "");
  if (eventDate && /deal\s*to\s*close/i.test(campaignName)) {
    output = output.replace(/Saturday,\s*(?:August\s+22|September\s+12),\s*2026/gi, eventDate);
  }
  return output;
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


  const eventLink =
    campaign.registrationLinks?.eventbrite?.url ||
    campaign.content?.callToActionUrl ||
    "";

  const meetupLink =
    campaign.registrationLinks?.meetup?.url || "";

  const meetupText = meetupLink
    ? `\nAlso listed on Meetup:\n${meetupLink}\n`
    : "";

  const meetupHtml = meetupLink
    ? emailButton(
      meetupLink,
      campaign.registrationLinks?.meetup?.label || "View on Meetup",
      "#e0393e",
    )
    : "";


  const flyerUrl = campaign.brand?.flyerUrl || campaign.brand?.logoUrl || (
    campaign.campaignKind === "program"
      ? ""
      : "https://res.cloudinary.com/de1vvqtp3/image/upload/v1784844473/deal-to-close-flyer.png_bmxmbw.png"
  );
  const brandLogoUrl = campaign.brand?.flyerUrl ? campaign.brand?.logoUrl || "" : "";
  const eventDate = formatEventDate(campaign.startDate) || "Saturday, September 12, 2026";


  const fallbackEmailDraft = `
Hi ${contactName},

I wanted to personally introduce you to Deal to Close: Multifamily Bootcamp.

This is a one-day virtual event designed for real estate investors who want to learn how to analyze multifamily deals, build investor relationships, raise capital, and confidently move toward acquisitions.

We thought this would be a great fit for your audience because your community is connected to real estate education, investing, and growth opportunities.

We would love to explore a partnership opportunity with you and see if this event would be valuable to share with your audience.

Event Details:

Deal to Close: Multifamily Bootcamp
{{eventDate}}
8:00 AM - 4:00 PM PST

Register Here:
${eventLink}
${meetupText}

Would you be open to discussing a potential partnership?

Thank you,

Ellie's Coaching
`.trim();

  const variables = {
    firstName: cleanName(contact.firstName || contactName.split(" ")[0] || contactName),
    name: contactName,
    campaignName,
    programName: campaign.programName || campaignName,
    eventLink,
    company: cleanName(contact.companyNameForEmails || contact.company || "your community"),
    companyName: cleanName(contact.companyNameForEmails || contact.company || "your community"),
    communityName: cleanName(contact.companyNameForEmails || contact.company || "your community"),
    community: cleanName(contact.companyNameForEmails || contact.company || "your community"),
    organizationName: cleanName(contact.companyNameForEmails || contact.company || "your community"),
    organization: cleanName(contact.companyNameForEmails || contact.company || "your community"),
    eventDate,
  };
  const savedSubject = String(campaign.content?.subject || "").trim();
  const savedBody = String(campaign.content?.body || "").trim();
  const hasSavedSubject = savedSubject && savedSubject !== "Event Campaign";
  const hasSavedBody = savedBody && savedBody !== "Campaign created for event promotion.";
  const subject = fillTemplate(hasSavedSubject ? savedSubject : `Partner With ${campaignName}`, variables);
  let emailDraft = applyCanonicalEventDate(fillTemplate(hasSavedBody ? savedBody : fallbackEmailDraft, variables), eventDate, campaignName);
  if (eventLink && !emailDraft.includes(eventLink)) {
    emailDraft = `${emailDraft}\n\n${campaign.content?.callToAction || "Learn more"}:\n${eventLink}`;
  }
  if (meetupLink && !emailDraft.includes(meetupLink)) {
    emailDraft = `${emailDraft}\n\nAlso listed on Meetup:\n${meetupLink}`;
  }

  const htmlBody = hasSavedBody ? `
<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;">
${brandLogoUrl ? `<img src="${escapeHtml(brandLogoUrl)}" alt="${escapeHtml(campaignName)} logo" style="display:block;max-width:180px;max-height:72px;height:auto;width:auto;object-fit:contain;margin:0 0 24px;">` : ""}
${textToHtml(applyCanonicalEventDate(fillTemplate(savedBody, variables), eventDate, campaignName))}
${flyerUrl ? `<img src="${escapeHtml(flyerUrl)}" alt="${escapeHtml(campaign.programName || campaignName)}" style="display:block;width:100%;max-width:600px;height:auto;border-radius:8px;margin:28px 0;">` : ""}
${emailButton(eventLink, campaign.content?.callToAction || "Learn more", "#000000")}
${meetupHtml}
</body>
</html>
`.trim() : `
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
${escapeHtml(eventDate)}<br>
8:00 AM - 4:00 PM PST
</p>


${emailButton(eventLink, "Reserve Your Spot", "#000000")}

${meetupHtml}

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
    meetupLink,


    flyerUrl,


    status:"pending"

  };

}



module.exports = {
  applyCanonicalEventDate,
  formatEventDate,
  generateOutreachDraft,
};
