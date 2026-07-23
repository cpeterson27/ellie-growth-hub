import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import {
  FiRefreshCw,
  FiMail,
  FiCheckCircle,
  FiEye,
  FiSearch,
} from "react-icons/fi";

import DashboardCard from "../components/DashboardCard.jsx";
import Button from "../components/Button.jsx";
import Modal from "../components/Modal.jsx";

import {
  fetchCampaigns,
  fetchOutreach,
  generateOutreach,
  updateOutreach,
  sendEmails,
} from "../services/api.js";


export default function Outreach() {

  const [searchParams] = useSearchParams();

  const campaignId = searchParams.get("campaignId");


  const [campaigns, setCampaigns] = useState([]);
  const [selectedCampaign, setSelectedCampaign] = useState(null);

  const [outreach, setOutreach] = useState([]);
  const [filteredOutreach, setFilteredOutreach] = useState([]);

  const [selectedEmail, setSelectedEmail] = useState(null);

  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");



  const loadOutreach = useCallback(async (campaign) => {

    if (!campaign?._id) {

      setOutreach([]);
      setFilteredOutreach([]);

      return;

    }


    try {

      const data =
        await fetchOutreach(
          campaign._id
        );


      const items =
        Array.isArray(data)
          ? data
          : data.outreach || [];


      setOutreach(items);
      setFilteredOutreach(items);


    } catch(error) {

      console.error(
        "OUTREACH ERROR:",
        error
      );


      setError(
        "Unable to load outreach"
      );

    }

  }, []);




  const loadCampaigns = useCallback(async () => {

    try {

      setLoading(true);
      setError("");


      const data =
        await fetchCampaigns();


      setCampaigns(data);


      const selected =
        campaignId
          ? data.find(
              campaign =>
                campaign._id === campaignId
            )
          : data[0];


      setSelectedCampaign(
        selected || null
      );


      if(selected) {

        await loadOutreach(selected);

      }


    } catch(error) {

      console.error(
        "CAMPAIGN ERROR:",
        error
      );


      setError(
        "Unable to load campaigns"
      );


    } finally {

      setLoading(false);

    }

  }, [campaignId, loadOutreach]);




  useEffect(() => {

    loadCampaigns();

  }, [loadCampaigns]);




  useEffect(() => {

    let results = [...outreach];


    if(filter !== "all") {

      results =
        results.filter(
          item =>
            item.status === filter
        );

    }


    if(search.trim()) {

      const value =
        search.toLowerCase();


      results =
        results.filter(item =>
          item.organization
            ?.toLowerCase()
            .includes(value) ||
          item.contactName
            ?.toLowerCase()
            .includes(value) ||
          item.contactEmail
            ?.toLowerCase()
            .includes(value)
        );

    }


    setFilteredOutreach(results);


  }, [filter, search, outreach]);




  async function handleCampaignChange(event) {

    const selected =
      campaigns.find(
        campaign =>
          campaign._id === event.target.value
      );


    setSelectedCampaign(
      selected || null
    );


    await loadOutreach(selected);

  }



  async function handleGenerate() {

  if(!selectedCampaign?._id) {

    setError(
      "Select a campaign first."
    );

    return;

  }


  try {

    setSaving(true);
    setError("");


    await generateOutreach(
      selectedCampaign._id
    );


    await loadOutreach(
      selectedCampaign
    );


  } catch(error) {

    console.error(
      "GENERATE ERROR:",
      error
    );


    setError(
      "Unable to generate outreach"
    );


  } finally {

    setSaving(false);

  }

}





  async function handleApprove(item) {

  try {

    setSaving(true);
    setError("");


    const updated =
      await updateOutreach(
        item._id,
        {
          status:"approved"
        }
      );


    setOutreach(
      current =>
        current.map(row =>
          row._id === updated._id
            ? updated
            : row
        )
    );


  } catch(error) {

    console.error(
      "APPROVE ERROR:",
      error
    );


    setError(
      "Unable to approve outreach"
    );


  } finally {

    setSaving(false);

  }

}





  async function handleSend() {

  const ids =
    outreach
      .filter(
        item =>
          item.status === "approved"
      )
      .map(
        item =>
          item._id
      );


  if(!ids.length) {

    setError(
      "Approve outreach before sending."
    );

    return;

  }


  try {

    setSaving(true);
    setError("");


    await sendEmails(ids);


    await loadOutreach(
      selectedCampaign
    );


  } catch(error) {

    console.error(
      "SEND ERROR:",
      error
    );


    setError(
      "Unable to send emails"
    );


  } finally {

    setSaving(false);

  }

}





  function statusStyle(status) {

    const styles = {

      sent:{
        background:"#dcfce7",
        color:"#166534"
      },

      approved:{
        background:"#dbeafe",
        color:"#1e40af"
      },

      replied:{
        background:"#ede9fe",
        color:"#6b21a8"
      },

      failed:{
        background:"#fee2e2",
        color:"#991b1b"
      },

      pending:{
        background:"#fef3c7",
        color:"#92400e"
      }

    };


    return styles[status] || styles.pending;

  }





  return (

    <div className="page-dashboard">


      <div className="page-header">

        <div>

          <h1 className="page-title">
            Outreach
          </h1>

          <p className="page-subtitle">
            Review, approve, and send outreach emails.
          </p>

        </div>


        <div
          style={{
            display:"flex",
            gap:"12px"
          }}
        >

          <Button
            variant="outline"
            loading={saving}
            onClick={handleGenerate}
          >

            <FiRefreshCw />
            Generate

          </Button>


          <Button
            variant="primary"
            loading={saving}
            onClick={handleSend}
          >

            <FiMail />
            Send Approved

          </Button>


        </div>

      </div>





      <section className="section-grid">


        <DashboardCard title="Campaign Selector">

          <select
            className="select-input"
            value={selectedCampaign?._id || ""}
            onChange={handleCampaignChange}
          >

            {campaigns.map(campaign => (

              <option
                key={campaign._id}
                value={campaign._id}
              >

                {campaign.name}

              </option>

            ))}

          </select>

        </DashboardCard>





        <DashboardCard title="Outreach Items">


          {loading ? (

            <p>
              Loading outreach...
            </p>


          ) : outreach.length === 0 ? (

            <p>
              No outreach found.
            </p>


          ) : (

            outreach.map(item => (

              <div
                key={item._id}
                style={{
                  border:"1px solid #ddd",
                  padding:"20px",
                  marginBottom:"15px",
                  borderRadius:"12px"
                }}
              >

                <h3>
                  {item.organization}
                </h3>


                <div
                  style={{
                    display:"inline-block",
                    padding:"6px 12px",
                    borderRadius:"20px",
                    fontWeight:"600",
                    fontSize:"12px",
                    marginBottom:"15px",
                    ...statusStyle(item.status)
                  }}
                >
                  {item.status.toUpperCase()}
                </div>


                <p>
                  {item.contactName}
                </p>


                <p>
                  {item.contactEmail}
                </p>


                <p>
                  <strong>
                    {item.subject}
                  </strong>
                </p>


                {item.sentAt && (
                  <p>
                    Sent:
                    {" "}
                    {new Date(
                      item.sentAt
                    ).toLocaleString()}
                  </p>
                )}


                {item.messageId && (
                  <p>
                    Message ID:
                    {" "}
                    {item.messageId}
                  </p>
                )}

{item.status === "failed" && item.errorMessage && (
  <p
    style={{
      color:"#991b1b"
    }}
  >
    Error:
    {" "}
    {item.errorMessage}
  </p>
)}

               {item.repliedAt && (
  <div>

    <p>
      Reply:
      {" "}
      <strong>
        REPLIED
      </strong>
    </p>


    {item.replyText && (
      <p>
        {item.replyText}
      </p>
    )}

  </div>
)}



                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setSelectedEmail(item)
                  }
                >

                  <FiEye />
                  View Email

                </Button>



                {item.status === "pending" && (

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      handleApprove(item)
                    }
                  >

                    <FiCheckCircle />
                    Approve

                  </Button>

                )}

              </div>

            ))

          )}



          {error && (

            <p className="form-error">
              {error}
            </p>

          )}

        </DashboardCard>


      </section>





      <Modal
        isOpen={!!selectedEmail}
        onClose={() =>
          setSelectedEmail(null)
        }
        title="Email Preview"
      >

        {selectedEmail && (

          <>
            <p>
              <strong>To:</strong>{" "}
              {selectedEmail.contactEmail}
            </p>

            <p>
              <strong>Subject:</strong>{" "}
              {selectedEmail.subject}
            </p>

            <hr />

            <p>
              {selectedEmail.emailDraft}
            </p>
          </>

        )}

      </Modal>


    </div>

  );

}