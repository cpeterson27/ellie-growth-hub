/**
 * Contact Service
 *
 * Handles contacts from:
 * - Monday CRM
 * - Apollo
 * - Eventbrite
 * - Future integrations
 *
 * Architecture:
 * ONE PERSON = ONE CONTACT RECORD
 */


const Contact = require("../models/Contact");
const MarketingCampaign = require("../models/MarketingCampaign");



// =====================================
// CLEAN CONTACT NAME
// =====================================

function cleanName(name = "") {

  return String(name)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();

}





class ContactService {



  /**
   * Create or update contact
   *
   * Duplicate rule:
   * email only
   */
  async upsertContact(contactData) {


    const {
      email,
      source,
      externalId,
    } = contactData;



    if (!email || !source) {

      throw new Error(
        "Email and source are required"
      );

    }



    const normalizedEmail =
      email.toLowerCase().trim();



    let contact =
      await Contact.findOne({
        email: normalizedEmail,
      });





    // =====================================
    // UPDATE EXISTING CONTACT
    // =====================================

    if (contact) {


      if (contactData.name) {

        contact.name =
          cleanName(contactData.name);

      }



      if (contactData.firstName) {

        contact.firstName =
          cleanName(contactData.firstName);

      }



      if (contactData.lastName) {

        contact.lastName =
          cleanName(contactData.lastName);

      }



      if (contactData.company) {

        contact.company =
          contactData.company.trim();

      }





      contact.sources =
        [
          ...new Set([
            ...(contact.sources || []),
            source,
          ])
        ];





      if (externalId) {

        contact.externalIds = {

          ...(contact.externalIds || {}),

          [source]:
            externalId,

        };

      }





      if (contactData.type) {

        contact.type =
          contactData.type;

      }





      if (contactData.tags?.length) {

        contact.tags =
          [
            ...new Set([
              ...(contact.tags || []),
              ...contactData.tags,
            ])
          ];

      }





      if (contactData.status) {

        contact.status =
          contactData.status;

      }





      await contact.save();


      return contact;

    }








    // =====================================
    // CREATE NEW CONTACT
    // =====================================

    contact =
      await Contact.create({

        name:
          cleanName(
            contactData.name || "Unknown"
          ),


        firstName:
          cleanName(
            contactData.firstName || ""
          ),


        lastName:
          cleanName(
            contactData.lastName || ""
          ),


        email:
          normalizedEmail,


        company:
          contactData.company?.trim() || "",


        organizationId:
          contactData.organizationId || null,


        sources:
          [
            source
          ],


        externalIds:
          externalId
          ? {
              [source]:
                externalId,
            }
          : {},


        type:
          contactData.type || "lead",


        tags:
          contactData.tags?.length
          ? contactData.tags
          : [source],


        status:
          contactData.status || "active",

      });



    return contact;


  }








  /**
   * Get campaign recipients
   */
  async getCampaignRecipients(
    campaignId,
    filters = {}
  ) {


    const campaign =
      await MarketingCampaign.findById(
        campaignId
      );



    if (!campaign) {

      throw new Error(
        "Campaign not found"
      );

    }




    const query = {

      status: "active",

      type: "lead",

    };





    if (filters.source) {

      query.sources = {

        $in:[
          filters.source
        ]

      };

    }





    if (filters.tags?.length) {

      query.tags = {

        $in:
          filters.tags

      };

    }





    return Contact.find(query)

      .limit(
        filters.limit || 500
      )

      .select(
        "email name firstName company sources"
      );


  }










  /**
   * Get contacts
   */
  async getContacts(filters = {}) {


    const query = {};



    if (filters.email) {

      query.email =
        filters.email.toLowerCase();

    }



    if (filters.source) {

      query.sources = {

        $in:[
          filters.source
        ]

      };

    }



    if (filters.status) {

      query.status =
        filters.status;

    }



    if (filters.type) {

      query.type =
        filters.type;

    }



    if (filters.tags?.length) {

      query.tags = {

        $in:
          filters.tags

      };

    }



    return Contact.find(query);

  }










  async getContact(id) {


    const contact =
      await Contact.findById(id);



    if (!contact) {

      throw new Error(
        "Contact not found"
      );

    }



    return contact;

  }










  async updateContact(id, updates) {


    const contact =
      await Contact.findById(id);



    if (!contact) {

      throw new Error(
        "Contact not found"
      );

    }





    if (updates.name) {

      updates.name =
        cleanName(updates.name);

    }





    Object.assign(
      contact,
      updates
    );



    await contact.save();



    return contact;

  }










  async deleteContact(id) {


    const result =
      await Contact.findByIdAndDelete(id);



    if (!result) {

      throw new Error(
        "Contact not found"
      );

    }


  }










  /**
   * Sync contacts from integrations
   */
  async syncContactsFromSource(
    source,
    externalContacts
  ) {


    let created = 0;

    let updated = 0;





    for (const externalContact of externalContacts) {


      try {


        if (!externalContact.email) {

          continue;

        }





        const existing =
          await Contact.findOne({

            email:
              externalContact.email
                .toLowerCase()
                .trim(),

          });





        await this.upsertContact({

          name:
            cleanName(
              externalContact.name || ""
            ),


          firstName:
            cleanName(
              externalContact.firstName || ""
            ),


          lastName:
            cleanName(
              externalContact.lastName || ""
            ),


          email:
            externalContact.email,


          company:
            externalContact.company || "",


          source,


          externalId:
            externalContact.externalId,


          type:
            externalContact.type || "lead",


          tags:
            externalContact.tags || [source],


          status:
            "active",

        });





        if (existing) {

          updated++;

        } else {

          created++;

        }




      } catch(error) {


        console.error(
          "CONTACT SYNC ERROR:",
          error.message
        );


      }


    }





    return {

      created,

      updated,

      duplicates: 0,

    };


  }










  async getStats() {


    return {

      total:
        await Contact.countDocuments(),

    };

  }


}





module.exports =
  new ContactService();