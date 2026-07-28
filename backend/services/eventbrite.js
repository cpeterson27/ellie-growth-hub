const axios = require("axios");
const eventbriteOAuthService = require("./eventbriteOAuthService");

async function getEventbriteToken() {
  return eventbriteOAuthService.accessToken();
}


const eventbriteApi = axios.create({
  baseURL: "https://www.eventbriteapi.com/v3",
});



// ==================================
// GET SINGLE EVENT
// Eventbrite Event ID -> Event Data
// ==================================
async function getEvent(eventId) {

  const token = await getEventbriteToken();


  if (!token) {
    throw new Error(
      "Eventbrite private token is not configured."
    );
  }


  const response = await eventbriteApi.get(
    `/events/${eventId}/?expand=venue,organizer,ticket_availability,category,format`,
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

  const token = await getEventbriteToken();


  if (!token) {
    throw new Error(
      "Eventbrite private token is not configured."
    );
  }



  try {

    const response = await eventbriteApi.get(
      "/users/me/owned_events/",
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

    const configuredIds = String(process.env.EVENTBRITE_EVENT_IDS || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    if (!configuredIds.length) throw error;
    return Promise.all(configuredIds.map((eventId) => getEvent(eventId)));

  }

}



module.exports = {
  getEvent,
  getEvents,
};
