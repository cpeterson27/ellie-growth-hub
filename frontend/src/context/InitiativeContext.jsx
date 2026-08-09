import { useEffect, useMemo, useState } from "react";
import { fetchCampaigns } from "../services/api.js";
import InitiativeContext from "./InitiativeContextValue.js";

export function InitiativeProvider({ children }) {
  const [campaigns, setCampaigns] = useState([]);
  const [selectedId, setSelectedIdState] = useState(() => localStorage.getItem("ellie-initiative") || "all");

  useEffect(() => {
    fetchCampaigns().then((items) => setCampaigns(Array.isArray(items) ? items.filter(Boolean) : [])).catch(() => setCampaigns([]));
  }, []);

  const setSelectedId = (value) => {
    setSelectedIdState(value);
    localStorage.setItem("ellie-initiative", value);
    window.dispatchEvent(new CustomEvent("ellie-initiative-changed", { detail: value }));
  };
  const selected = campaigns.find((campaign) => campaign._id === selectedId) || null;
  const value = useMemo(() => ({ campaigns, selected, selectedId, setSelectedId }), [campaigns, selected, selectedId]);
  return <InitiativeContext.Provider value={value}>{children}</InitiativeContext.Provider>;
}
