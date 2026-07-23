import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import DashboardCard from "../components/DashboardCard.jsx";
import Button from "../components/Button.jsx";

import {
  fetchEvents,
  fetchEventbriteEvents,
  importEventbriteEvent,
  createCampaignFromEvent,
} from "../services/api.js";


export default function Events() {

  const navigate = useNavigate();


  const [events, setEvents] = useState([]);

  const [eventbriteEvents, setEventbriteEvents] = useState([]);

  const [selectedEventId, setSelectedEventId] = useState("");

  const [loading, setLoading] = useState(false);

  const [creatingCampaign, setCreatingCampaign] = useState(null);

  const [error, setError] = useState("");

  const [success, setSuccess] = useState("");



  const loadEvents = async () => {

    try {

      const data = await fetchEvents();

      setEvents(data);

    } catch (err) {

      console.error(err);

      setError("Unable to load events");

    }

  };



  const loadEventbriteEvents = async () => {

    try {

      const data = await fetchEventbriteEvents();

      setEventbriteEvents(data);

    } catch (err) {

      console.error(err);

      setError("Unable to load Eventbrite events");

    }

  };



  useEffect(() => {

    loadEvents();

    loadEventbriteEvents();

  }, []);





  const handleImport = async () => {


    if (!selectedEventId) {

      setError(
        "Please select an Eventbrite event"
      );

      return;

    }



    setLoading(true);

    setError("");

    setSuccess("");



    try {


      await importEventbriteEvent(
        selectedEventId
      );


      setSelectedEventId("");

      setSuccess(
        "Event imported successfully!"
      );


      await loadEvents();



    } catch(err) {


      setError(
        err.response?.data?.error ||
        "Unable to import Eventbrite event"
      );


    } finally {


      setLoading(false);


    }

  };





  const handleCreateCampaign = async (eventId) => {


    setCreatingCampaign(eventId);

    setError("");

    setSuccess("");



    try {


      const response =
        await createCampaignFromEvent(
          eventId
        );



      navigate(
        `/campaigns/${response.campaign._id}`
      );



    } catch(err) {


      setError(
        err.response?.data?.error ||
        "Unable to create campaign"
      );


    } finally {


      setCreatingCampaign(null);


    }

  };




  return (

    <div className="page-dashboard">


      <div className="page-header">

        <div>

          <h1 className="page-title">
            Events
          </h1>


          <p className="page-subtitle">
            Manage events and convert them into marketing campaigns.
          </p>


        </div>


      </div>




      <DashboardCard title="Import Existing Eventbrite Event">


        <select

          value={selectedEventId}

          onChange={(e)=>
            setSelectedEventId(
              e.target.value
            )
          }

        >

          <option value="">
            Select an Eventbrite event
          </option>


          {eventbriteEvents.map((event)=>(

            <option
              key={event.id}
              value={event.id}
            >

              {event.name.text}

            </option>

          ))}


        </select>



        <Button

          variant="primary"

          loading={loading}

          onClick={handleImport}

        >

          Import Event

        </Button>



        {error &&
          <p className="form-error">
            {error}
          </p>
        }


        {success &&
          <p className="success-message">
            {success}
          </p>
        }


      </DashboardCard>





      <DashboardCard title="Connected Events">


        {events.length === 0 ? (

          <p>
            No events connected yet.
          </p>


        ) : (


          events.map((event)=>(


            <div

              key={event._id}

              style={{
                borderBottom:"1px solid #ddd",
                padding:"1rem 0",
              }}

            >


              <h3>
                {event.name}
              </h3>



              <p>
                {new Date(
                  event.startDate
                ).toLocaleDateString()}
              </p>



              <p>
                ${event.ticketPrice}
              </p>



              <p>
                {event.audience?.join(", ")}
              </p>



              <Button

                variant="primary"

                loading={
                  creatingCampaign === event._id
                }

                onClick={() =>
                  handleCreateCampaign(
                    event._id
                  )
                }

              >

                Create Campaign

              </Button>



            </div>


          ))


        )}


      </DashboardCard>


    </div>

  );

}