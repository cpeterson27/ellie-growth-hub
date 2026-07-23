#!/usr/bin/env node

/**
 * Test Resend Integration
 * Sends a real test email using Resend API
 */

require("dotenv").config();

async function testResendIntegration() {
  console.log("🚀 Testing Resend Email Integration\n");

  // Check API key
  if (!process.env.RESEND_API_KEY) {
    console.error("❌ RESEND_API_KEY not set in .env");
    process.exit(1);
  }

  const testEmail = process.env.TEST_EMAIL || "test@example.com";
  const fromEmail = process.env.EMAIL_FROM || "test@elliescoaching.com";

  console.log(`📧 Sending test email:`);
  console.log(`   From: ${fromEmail}`);
  console.log(`   To: ${testEmail}`);
  console.log(`   Subject: Ellie AI - Test Email from Resend Integration\n`);

  try {
    const response = await fetch(
      "http://localhost:5001/api/integrations/email/send-test",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: testEmail,
          subject: "Ellie AI - Test Email from Resend Integration",
          html: `
          <h1>Welcome to Ellie AI</h1>
          <p>This is a test email sent via the Resend integration.</p>
          <p>If you received this, the integration is working correctly!</p>
          <hr>
          <p><small>Sent at: ${new Date().toISOString()}</small></p>
        `,
        }),
      },
    );

    const data = await response.json();

    if (response.ok) {
      console.log("✅ Email sent successfully!\n");
      console.log("Response:");
      console.log(JSON.stringify(data, null, 2));
      process.exit(0);
    } else {
      console.error("❌ Failed to send email\n");
      console.error("Response:");
      console.error(JSON.stringify(data, null, 2));
      process.exit(1);
    }
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

testResendIntegration();
