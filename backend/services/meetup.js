function getMeetupApiKey() {
  return process.env.MEETUP_API_KEY;
}

async function findCommunities(query) {
  if (!getMeetupApiKey()) {
    return { success: false, message: "Meetup API key is not configured." };
  }
  return {
    success: false,
    message: "Meetup integration is not yet implemented.",
  };
}

module.exports = { findCommunities };
