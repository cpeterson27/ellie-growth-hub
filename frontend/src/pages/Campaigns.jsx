import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiArrowRight } from "react-icons/fi";

import DashboardCard from "../components/DashboardCard.jsx";
import Table from "../components/Table.jsx";
import Button from "../components/Button.jsx";
import CampaignModal from "../components/CampaignModal.jsx";

import {
  createCampaign,
  fetchCampaigns,
} from "../services/api.js";


const audienceOptions = [
  "Airbnb investors",
  "Real estate investors",
  "House flippers",
  "Property management companies",
  "Multifamily investors",
];


export default function Campaigns() {

  const navigate = useNavigate();

  const [campaigns, setCampaigns] = useState([]);

  const [loading, setLoading] = useState(true);

  const [isOpen, setIsOpen] = useState(false);

  const [submitting, setSubmitting] = useState(false);

  const [error, setError] = useState("");



  const loadCampaigns = async () => {

    try {

      setLoading(true);

      const data = await fetchCampaigns();

      setCampaigns(data);


    } catch (err) {

      console.error(
        "LOAD CAMPAIGNS ERROR:",
        err
      );

      setError(
        "Unable to load campaigns"
      );


    } finally {

      setLoading(false);

    }

  };



  useEffect(() => {

    loadCampaigns();

  }, []);



  const columns = [

    {
      header: "Campaign",
      accessor: "name",
    },


    {
      header: "Date",
      accessor: "startDate",

      render: (item) =>
        new Date(
          item.startDate
        ).toLocaleDateString(
          "en-US",
          {
            month: "short",
            day: "numeric",
            year: "numeric",
          }
        ),
    },


    {
      header: "Price",
      accessor: "ticketPrice",

      render: (item) =>
        `$${item.ticketPrice}`,
    },


    {
      header: "Goal",
      accessor: "ticketGoal",
    },


    {
      header: "Tickets Sold",
      accessor: "ticketsSold",
    },


    {
      header: "Status",
      accessor: "status",
    },


    {
      header: "",

      accessor: "action",

      render: (item) => (

        <Button

          variant="outline"

          size="sm"

          onClick={() =>
            navigate(
              `/campaigns/${item._id}`
            )
          }

        >

          View <FiArrowRight />

        </Button>

      ),
    },

  ];



  const openModal = () => {

    setError("");

    setIsOpen(true);

  };



  const closeModal = () => {

    setError("");

    setIsOpen(false);

  };



  const handleCreate = async (values) => {

    try {

      setSubmitting(true);

      setError("");


      await createCampaign(values);


      closeModal();


      await loadCampaigns();



    } catch(err) {


      console.error(
        "CREATE CAMPAIGN ERROR:",
        err
      );


      setError(
        err.response?.data?.error ||
        err.message ||
        "Unable to create campaign"
      );


      throw err;



    } finally {


      setSubmitting(false);


    }

  };



  return (

    <div className="page-dashboard">


      <div
        className="page-header"
        style={{
          justifyContent:"space-between",
          alignItems:"center",
        }}
      >


        <div>

          <h1 className="page-title">
            Campaigns
          </h1>


          <p className="page-subtitle">
            Track every campaign from brief to launch.
          </p>

        </div>



        <Button
          variant="primary"
          onClick={openModal}
        >

          Create Campaign

        </Button>


      </div>



      <DashboardCard title="Active Campaigns">


        <Table

          columns={columns}

          data={campaigns}

          loading={loading}

          emptyMessage="No campaigns are active yet."

        />


      </DashboardCard>



      <CampaignModal

        isOpen={isOpen}

        onClose={closeModal}

        onSubmit={handleCreate}

        audienceOptions={audienceOptions}

        submitting={submitting}

      />



      {error && (

        <p className="form-error">

          {error}

        </p>

      )}



    </div>

  );

}