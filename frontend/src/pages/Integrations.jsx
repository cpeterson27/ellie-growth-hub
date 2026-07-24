import { useEffect, useState } from "react";

import Button from "../components/Button.jsx";
import DashboardCard from "../components/DashboardCard.jsx";
import { fetchIntegrationHub } from "../services/api.js";

const statusLabels = {
  connected: "Connected",
  disconnected: "Disconnected",
  configuration_required: "Configuration required",
};

export default function Integrations() {
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadProviders = async () => {
    try { setLoading(true); const response = await fetchIntegrationHub(); setProviders(response.data?.providers || []); setError(""); }
    catch (err) { setError(err.response?.data?.error || "Unable to load integrations"); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    loadProviders();
  }, []);

  return (
    <div className="page-dashboard">
      <div className="page-header">
        <div>
          <h1 className="page-title">Integrations</h1>
          <p className="page-subtitle">
            Connect and manage the providers that power Ellie AI.
          </p>
        </div>
        <Button variant="outline" onClick={loadProviders}>Refresh status</Button>
      </div>

      {error ? <p className="form-error">{error}</p> : null}
      {loading ? <p>Loading integrations...</p> : (
        <section className="section-grid">
          {providers.map((provider) => (
            <DashboardCard key={provider.id} title={provider.name}>
              <p>{provider.description}</p>
              <p><strong>{provider.category.replaceAll("_", " ")}</strong></p>
              <p><span className="label-pill">{statusLabels[provider.status] || provider.status}</span></p>
              <p>Capabilities: {provider.capabilities?.join(", ") || "Not reported"}</p>
              {provider.id === "apollo" ? <p>People Search requires a paid Apollo API plan. CSV and supported organization capabilities remain available.</p> : null}
            </DashboardCard>
          ))}
        </section>
      )}
    </div>
  );
}
