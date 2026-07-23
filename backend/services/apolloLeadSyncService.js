const IntegrationConnection = require("../models/IntegrationConnection");
const MondayAdapter = require("./integrations/MondayAdapter");


async function syncContactToMonday(contact) {

  try {

    const connection =
      await IntegrationConnection.findOne({
        provider: "monday",
      });


    if (!connection) {
      console.log(
        "Monday not connected. Skipping Monday sync."
      );
      return null;
    }


    const adapter =
      new MondayAdapter();


    const result =
      await adapter.createContact(
        connection.credentials,
        contact
      );


    console.log(
      "Synced contact to Monday:",
      contact.email
    );


    return result;


  } catch(error) {

    console.error(
      "Monday contact sync failed:",
      error.message
    );

    return null;

  }

}


module.exports = {
  syncContactToMonday,
};