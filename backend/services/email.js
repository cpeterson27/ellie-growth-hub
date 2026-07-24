const integrationHub = require("./integrationHub");



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




  const eventLink =
    outreachItem.eventLink ||
    "https://www.eventbrite.com/e/deal-to-close-multifamily-bootcamp-tickets-1994515277887";



  const flyerUrl =
    outreachItem.flyerUrl || "";





  const html = `

<!DOCTYPE html>

<html>

<body style="
font-family:Arial,sans-serif;
line-height:1.6;
color:#333;
">


<p>
Hi ${outreachItem.contactName || "there"},
</p>


<p>
I wanted to reach out about a potential collaboration opportunity.
</p>


<p>
Ellie's Coaching is hosting 
<strong>Deal to Close: Multifamily Bootcamp</strong>,
a one-day virtual event for real estate investors.
</p>



${flyerUrl ? `

<img
src="${flyerUrl}"
alt="Deal to Close Multifamily Bootcamp"
style="
width:100%;
max-width:600px;
border-radius:8px;
"
/>

` : ""}



<h3>
Event Details
</h3>


<p>
<strong>
Deal to Close: Multifamily Bootcamp
</strong>
<br>
Saturday, August 22, 2026
<br>
8:00 AM - 4:00 PM PST
</p>




<a
href="${eventLink}"
style="
display:inline-block;
padding:12px 22px;
background:#000;
color:#fff;
text-decoration:none;
border-radius:6px;
font-weight:bold;
"
>
Learn More
</a>




<p>
Would this be something your audience would find valuable?
</p>


<p>
Thank you,
<br>
Ellie's Coaching
</p>



</body>

</html>

`;





try {


const response = await integrationHub.execute("resend", "sendEmail", {
  from: process.env.EMAIL_FROM || "Ellie AI <onboarding@resend.dev>",
  to: recipient,
  subject: "Quick question about your audience",
  text: outreachItem.emailDraft || "",
  html,
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
