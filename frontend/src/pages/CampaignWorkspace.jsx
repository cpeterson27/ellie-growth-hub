import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";

import DashboardCard from "../components/DashboardCard.jsx";
import Button from "../components/Button.jsx";

import { fetchMarketingCampaign } from "../services/api.js";



export default function CampaignWorkspace() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [campaign, setCampaign] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");


  useEffect(() => {
    if (!id) {
      setError("Campaign ID missing.");
      setLoading(false);
      return;
    }


    async function loadCampaign() {
      try {
        setLoading(true);
        setError("");

        const response = await fetchMarketingCampaign(id);

        console.log(
          "CAMPAIGN RESPONSE:",
          response
        );


        setCampaign(response);


      } catch (err) {
        console.error(
          "LOAD CAMPAIGN ERROR:",
          err.response?.data || err.message
        );


        setError(
          err.response?.data?.error ||
          "Unable to load campaign."
        );


      } finally {
        setLoading(false);
      }
    }


    loadCampaign();

  }, [id]);



  if (loading) {
    return (
      <div className="page-dashboard">
        <p>Loading campaign...</p>
      </div>
    );
  }



  if (error || !campaign) {
    return (
      <div className="page-dashboard">

        <p className="form-error">
          {error || "Campaign not found."}
        </p>


        <Button
          variant="outline"
          onClick={() => navigate("/marketing")}
        >
          Back to Growth Operator
        </Button>

      </div>
    );
  }



  return (
    <div className="page-dashboard">


      <div className="page-header">

        <div>

          <h1 className="page-title">
            {campaign.name}
          </h1>


          <p className="page-subtitle">
            AI Generated Marketing Campaign
          </p>

        </div>


        <Button
          variant="outline"
          onClick={() => navigate("/marketing")}
        >
          Back
        </Button>

      </div>



      <DashboardCard title="Campaign Overview">


        <p>
          <strong>Name:</strong>{" "}
          {campaign.name}
        </p>


        <p>
          <strong>Type:</strong>{" "}
          Event Marketing
        </p>


        <p>
          <strong>Status:</strong>{" "}
          {campaign.status}
        </p>


        <p>
          <strong>Audience:</strong>{" "}
          {campaign.audience?.join(", ") || "Unknown"}
        </p>


        <p>
          <strong>Event Date:</strong>{" "}
          {
            campaign.startDate
              ? new Date(campaign.startDate).toLocaleString()
              : "Unknown"
          }
        </p>


        <p>
          <strong>Ticket Price:</strong>{" "}
          ${campaign.ticketPrice}
        </p>


        <p>
          <strong>Ticket Goal:</strong>{" "}
          {campaign.ticketGoal}
        </p>


        <p>
          <strong>Tickets Sold:</strong>{" "}
          {campaign.ticketsSold}
        </p>


      </DashboardCard>



      <DashboardCard title="Campaign Metrics">


        <p>
          Outreach Generated: 0
        </p>


        <p>
          Emails Sent: 0
        </p>


        <p>
          Replies: 0
        </p>


        <p>
          Conversions: 0
        </p>


      </DashboardCard>



      <DashboardCard title="Marketing Actions">


        <Button
          variant="primary"
          onClick={() =>
            navigate(
              `/outreach?campaignId=${campaign._id}`
            )
          }
        >
          View Outreach
        </Button>


      </DashboardCard>


    </div>
  );
}