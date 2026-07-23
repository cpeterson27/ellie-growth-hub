/**
 * Monday CRM Integration Adapter
 *
 * Handles:
 * - Monday → Mongo contact sync
 * - Mongo/Apollo → Monday contact creation
 */

const BaseIntegration = require("./BaseIntegration");


// ======================================
// CLEAN MONDAY TEXT
// ======================================

function cleanName(value = "") {

  return String(value)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();

}





class MondayAdapter extends BaseIntegration {


  constructor() {

    super("monday", "Monday CRM");

    this.endpoint =
      "https://api.monday.com/v2";

  }





  async createContact(credentials, contact) {


    if (!credentials || !credentials.apiKey) {
      throw new Error("Monday API key required");
    }



    const boardId =
      credentials.boardId ||
      process.env.MONDAY_CONTACTS_BOARD_ID;



    if (!boardId) {
      throw new Error("Monday board ID required");
    }



    const columnValues = {

      lead_email: {
        email: contact.email,
        text: contact.email,
      },

      lead_company:
        contact.company || "",

    };



    const mutation = `
      mutation {
        create_item(
          board_id: ${boardId},
          item_name: "${this.escapeValue(
            cleanName(contact.name || "Unknown")
          )}",
          column_values: ${JSON.stringify(
            JSON.stringify(columnValues)
          )}
        ) {
          id
          name
        }
      }
    `;



    const response =
      await fetch(
        this.endpoint,
        {
          method:"POST",

          headers:{
            "Content-Type":"application/json",
            Authorization:credentials.apiKey,
          },

          body:JSON.stringify({
            query:mutation,
          }),
        }
      );



    const data =
      await response.json();



    if(data.errors){

      throw new Error(
        data.errors[0].message
      );

    }



    return data.data.create_item;


  }







  async syncContacts(credentials) {


    if (!credentials || !credentials.apiKey) {
      throw new Error("Monday API key required");
    }



    const boardId =
      credentials.boardId ||
      process.env.MONDAY_CONTACTS_BOARD_ID;



    if(!boardId){

      throw new Error(
        "Monday board ID required"
      );

    }




    const query = `
      query {
        boards(ids:[${boardId}]) {
          items_page(limit:500) {
            items {
              id
              name
              column_values {
                id
                text
              }
            }
          }
        }
      }
    `;



    const response =
      await fetch(
        this.endpoint,
        {
          method:"POST",

          headers:{
            "Content-Type":"application/json",
            Authorization:credentials.apiKey,
          },

          body:JSON.stringify({
            query,
          }),

        }
      );



    const data =
      await response.json();



    if(data.errors){

      throw new Error(
        data.errors[0].message
      );

    }



    const items =
      data.data?.boards?.[0]?.items_page?.items || [];



    console.log(
      "MONDAY ITEMS FOUND:",
      items.length
    );



    return this.mapMondayContacts(items);


  }







  mapMondayContacts(items){


    if(!Array.isArray(items)){

      return [];

    }



    return items

      .map(item => {


        const columns = {};



        item.column_values?.forEach(col => {

          columns[col.id] =
            col.text || "";

        });



        const email =
          columns.lead_email ||
          columns.email ||
          columns.Email ||
          columns.contact_email;



        if(!email){

          return null;

        }




        return {


          name:
            cleanName(
              item.name
            ),



          email:
            email.toLowerCase().trim(),



          company:
            cleanName(
              columns.lead_company ||
              columns.company ||
              ""
            ),



          externalId:
            item.id,



          source:
            "monday",



          type:
            "lead",



          tags:[
            "monday",
          ],



          status:
            "active",

        };


      })

      .filter(Boolean);


  }







  async validateConnection(credentials){


    if(!credentials?.apiKey){

      return false;

    }



    try{

      const user =
        await this.fetchUserInfo(credentials);


      return !!user;


    }
    catch{

      return false;

    }


  }







  async fetchUserInfo(credentials){


    const query = `
      {
        me {
          id
          name
          email
          account {
            name
          }
        }
      }
    `;



    const response =
      await fetch(
        this.endpoint,
        {

          method:"POST",

          headers:{
            "Content-Type":"application/json",
            Authorization:credentials.apiKey,
          },

          body:JSON.stringify({
            query,
          }),

        }
      );



    const data =
      await response.json();



    if(data.errors){

      throw new Error(
        data.errors[0].message
      );

    }



    return data.data?.me || null;


  }







  escapeValue(value){

    return String(value)
      .replace(/"/g,'\\"');

  }







  getInfo(){

    return {

      name:"Monday CRM",

      provider:"monday",

      version:"2.0.0",

      capabilities:[

        "sync_contacts",
        "create_contacts",
        "prevent_duplicates",

      ],

      status:"active",

      description:
        "Two-way Monday CRM contact synchronization",

    };

  }


}



module.exports =
  MondayAdapter;