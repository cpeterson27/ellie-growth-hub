const { Resend } = require("resend");
const path = require("path");


// ======================================
// RESEND CLIENT
// ======================================

function getResendClient() {

  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    return null;
  }

  return new Resend(apiKey);

}



// ======================================
// SEND EMAIL
// ======================================

async function sendEmail(outreachItem) {


  const resend = getResendClient();



  if (!resend) {

    return {
      success:false,
      message:"Resend API key missing.",
    };

  }



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
    "https://www.eventbrite.com/e/deal-to-close-multifamily-bootcamp-tickets-1994515277887?aff=ebdssbdestsearch";




  const flyerPath =
    path.join(
      __dirname,
      "../assets/deal-to-close-flyer.png"
    );





  const fallbackHtml = `

<div style="
font-family:Arial,sans-serif;
line-height:1.6;
color:#333;
">


${String(outreachItem.emailDraft || "")
.replace(/\n/g,"<br>")}



<br><br>



<img
src="cid:dealToCloseFlyer"
alt="Deal to Close Multifamily Bootcamp"
style="
width:100%;
max-width:600px;
border-radius:8px;
"
/>



<br><br>



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
Learn More & Register
</a>



</div>

`;





try {


const response =
await resend.emails.send({

  from:
    process.env.EMAIL_FROM ||
    "Ellie AI <onboarding@resend.dev>",


  to:
    recipient,


  subject:
    outreachItem.subject ||
    "Partner With Deal to Close Multifamily Bootcamp",



  text:
    outreachItem.emailDraft || "",



  html:
    outreachItem.htmlBody ||
    fallbackHtml,



  attachments:[

    {
      filename:
        "deal-to-close-flyer.png",

      path:
        flyerPath,

      contentType:
        "image/png",

      content_id:
        "dealToCloseFlyer",
    }

  ]


});





if(response.error){

  console.error(
    "RESEND ERROR:",
    response.error
  );


  return {

    success:false,

    message:
      response.error.message,

  };

}




console.log(
  `✅ Email sent to ${recipient} (${response.data?.id})`
);





return {

  success:true,

  message:
    "Email sent successfully.",

  id:
    response.data?.id,

};




}
catch(error){


console.error(
  "SEND EMAIL ERROR:",
  error
);



return {

  success:false,

  message:
    error.message,

};


}



}



module.exports = {
  sendEmail,
};