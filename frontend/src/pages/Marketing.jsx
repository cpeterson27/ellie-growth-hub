import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import DashboardCard from "../components/DashboardCard.jsx";
import Button from "../components/Button.jsx";

import {
  getGrowthOperatorActions,
  getGrowthOperatorHistory,
} from "../services/api.js";


const DEV_OPERATOR_ID = "6a61a4cc975879e9453dedc8";


export default function Marketing() {

  const navigate = useNavigate();

  const [actions, setActions] = useState([]);
  const [history, setHistory] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");



  useEffect(() => {

    const loadGrowthOperator = async () => {

      try {

        setLoading(true);
        setError("");


        const [
          actionsData,
          historyData,
        ] = await Promise.all([
          getGrowthOperatorActions(DEV_OPERATOR_ID),
          getGrowthOperatorHistory(DEV_OPERATOR_ID),
        ]);


        setActions(actionsData || []);
        setHistory(historyData || []);


      } catch (err) {

        console.error(
          "Growth Operator error:",
          err.response?.data || err
        );


        setError(
          "Failed to load Growth Operator data."
        );


      } finally {

        setLoading(false);

      }

    };


    loadGrowthOperator();

  }, []);



  const openCampaign = (action) => {

   const campaignId =
  action.campaign?._id ||
  action.actionTaken?.campaign?._id ||
  action.marketingCampaignId ||
  action.actionTaken?.marketingCampaignId;



    if (!campaignId) {

      console.error(
        "Missing campaign ID:",
        action
      );


      setError(
        "This action does not have a campaign yet."
      );


      return;

    }



    navigate(
      `/marketing-campaigns/${campaignId}`
    );

  };



  return (

    <div className="page-dashboard">


      <div className="page-header">

        <div>

          <h1 className="page-title">
            AI Growth Operator
          </h1>


          <p className="page-subtitle">
            AI-powered recommendations to find opportunities,
            create campaigns, and grow Ellie’s business.
          </p>


        </div>

      </div>



      {error && (

        <DashboardCard title="Error">

          <p>
            {error}
          </p>

        </DashboardCard>

      )}




      <section
        className="section-grid"
        style={{
          marginTop: "1.5rem"
        }}
      >


        {loading ? (

          <p>
            Loading AI recommendations...
          </p>


        ) : actions.length === 0 ? (

          <DashboardCard title="No opportunities found">

            <p>
              Growth Operator has no recommendations right now.
            </p>

          </DashboardCard>


        ) : (


          actions.map((action) => (

            <DashboardCard

              key={action.opportunityId}

              title={
                action.organizationName ||
                "Organization"
              }


              action={

                <span className="label-pill">

                  Priority {action.priority}

                </span>

              }

            >


              <p>

                Recommended Action:{" "}

                <strong>
                  {action.recommendedAction}
                </strong>

              </p>



              <p>

                Status:{" "}

                {action.opportunityStatus}

              </p>




              {action.reasons?.map((reason) => (

                <p key={reason}>
                  • {reason}
                </p>

              ))}




              {action.opportunityStatus === "actioned" && (

                <Button

                  variant="primary"

                  onClick={() =>
                    openCampaign(action)
                  }

                >

                  Open Campaign

                </Button>

              )}


            </DashboardCard>

          ))

        )}


      </section>





      <section
        className="section-grid"
        style={{
          marginTop: "1.5rem"
        }}
      >


        <DashboardCard title="Recent Growth Actions">


          {history.length === 0 ? (

            <p>
              No actions executed yet.
            </p>


          ) : (


            history.map((item) => (


              <div

                key={item.opportunityId}

                className="upcoming-card"

              >


                <div>


                  <p className="stat-card__title">

                    {item.organization ||
                     item.organizationName ||
                     "Organization"}

                  </p>



                  <p>

                    {item.action ||
                     item.recommendedAction}

                  </p>



                  {item.why?.map((reason) => (

                    <p key={reason}>
                      • {reason}
                    </p>

                  ))}


                </div>



                <div className="event-meta">


                  <span>

                    Priority: {item.priorityScore}

                  </span>



                  {item.campaign?.status && (

                    <span>

                      {item.campaign.status}

                    </span>

                  )}


                </div>


              </div>


            ))

          )}


        </DashboardCard>


      </section>


    </div>

  );

}