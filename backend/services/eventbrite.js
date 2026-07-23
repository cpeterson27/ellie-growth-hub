const axios = require("axios");

function getEventbriteToken() {
  return process.env.EVENTBRITE_PRIVATE_TOKEN;
}


const eventbriteApi = axios.create({
  baseURL: "https://www.eventbriteapi.com/v3",
});



// ==================================
// GET SINGLE EVENT
// Eventbrite Event ID -> Event Data
// ==================================
async function getEvent(eventId) {

  const token = getEventbriteToken();


  if (!token) {
    throw new Error(
      "Eventbrite private token is not configured."
    );
  }


  const response = await eventbriteApi.get(
    `/events/${eventId}/`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );


  return response.data;
}





// ==================================
// GET CONNECTED EVENTBRITE EVENTS
// Used for dropdown
// ==================================
async function getEvents() {

  const token = getEventbriteToken();


  if (!token) {
    throw new Error(
      "Eventbrite private token is not configured."
    );
  }



  try {

    const response = await eventbriteApi.get(
      "/users/me/events/",
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );


    return response.data.events || [];


  } catch (error) {


    console.error(
      "EVENTBRITE GET EVENTS ERROR:",
      error.response?.data || error.message
    );


    throw error;

  }

}



module.exports = {
  getEvent,
  getEvents,
};