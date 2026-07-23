const { Resend } = require("resend");

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    return null;
  }

  return new Resend(apiKey);
}

async function sendEmail(outreachItem) {
  const resend = getResendClient();

  if (!resend) {
    return {
      success: false,
      message: "Resend API key missing.",
    };
  }

  if (!outreachItem || !outreachItem.emailDraft) {
    return {
      success: false,
      message: "Missing email draft.",
    };
  }

  const recipient =
    outreachItem.contactEmail ||
    process.env.TEST_EMAIL;

  if (!recipient) {
    return {
      success: false,
      message: "No recipient email found.",
    };
  }

  try {
    const response = await resend.emails.send({
      from:
        process.env.EMAIL_FROM ||
        "Ellie AI <onboarding@resend.dev>",

      to: recipient,

      subject:
        outreachItem.subject ||
        `Partnership Opportunity - ${outreachItem.organization}`,

      text: outreachItem.emailDraft,
    });

    if (response.error) {
      return {
        success: false,
        message: response.error.message,
      };
    }

    console.log(
      `✅ Email sent to ${recipient} (${response.data?.id})`
    );

    return {
      success: true,
      message: "Email sent successfully.",
      id: response.data?.id,
    };
  } catch (error) {
    console.error("RESEND ERROR:", error);

    return {
      success: false,
      message: error.message,
    };
  }
}

module.exports = {
  sendEmail,
};