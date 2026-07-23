function getMondayApiKey() {
  return process.env.MONDAY_API_KEY;
}

async function createContact(contact) {
  if (!getMondayApiKey()) {
    return { success: false, message: "Monday API key is not configured." };
  }
  return {
    success: false,
    message: "Monday CRM integration is not yet implemented.",
  };
}

async function createDeal(deal) {
  if (!getMondayApiKey()) {
    return { success: false, message: "Monday API key is not configured." };
  }
  return {
    success: false,
    message: "Monday CRM integration is not yet implemented.",
  };
}

async function updateContactStatus(contactId, status) {
  if (!getMondayApiKey()) {
    return { success: false, message: "Monday API key is not configured." };
  }
  return {
    success: false,
    message: "Monday CRM integration is not yet implemented.",
  };
}

module.exports = { createContact, createDeal, updateContactStatus };
