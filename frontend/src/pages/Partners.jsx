import { useEffect, useState } from "react";

import DashboardCard from "../components/DashboardCard.jsx";
import Table from "../components/Table.jsx";

import api from "../services/api.js";


const columns = [
  {
    header: "Name",
    accessor: "name",
  },
  {
    header: "Company",
    accessor: "company",
  },
  {
    header: "Status",
    accessor: "status",
  },
  {
    header: "Relationship",
    accessor: "relationship",
  },
  {
    header: "Revenue",
    accessor: "revenue",
  },
];


export default function Partners() {

  const [partners, setPartners] = useState([]);

  const [loading, setLoading] = useState(true);


  useEffect(() => {

    async function loadPartners() {

      try {

        const response =
          await api.get("/partners");


        setPartners(response.data);


      } catch(error) {

        console.error(
          "Failed loading partners:",
          error
        );

      } finally {

        setLoading(false);

      }

    }


    loadPartners();


  }, []);



  return (

    <div className="page-dashboard">


      <div className="page-header">

        <div>

          <h1 className="page-title">
            Partners
          </h1>


          <p className="page-subtitle">
            Manage investor, referral, and strategic partner relationships.
          </p>


        </div>

      </div>



      <DashboardCard title="Partner Network">


        {loading ? (

          <p>
            Loading partners...
          </p>


        ) : (


          <Table
            columns={columns}
            data={partners}
            emptyMessage="No partners found yet."
          />


        )}


      </DashboardCard>


    </div>

  );

}