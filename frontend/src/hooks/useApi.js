import { useState, useEffect } from "react";
import { fetchCampaigns, fetchOutreach } from "../services/api.js";

export function useCampaigns() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetchCampaigns()
      .then((data) => {
        if (active) setCampaigns(data);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return { campaigns, loading };
}

export function useOutreach(campaignId) {
  const [outreach, setOutreach] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!campaignId) {
      setLoading(false);
      return;
    }
    let active = true;
    fetchOutreach(campaignId)
      .then((data) => {
        if (active) setOutreach(data);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [campaignId]);

  return { outreach, loading };
}
