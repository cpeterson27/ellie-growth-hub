import { useState, useCallback } from "react";
import * as api from "../services/api";

/**
 * useJarvis Hook
 * Manages Jarvis assistant interactions and actions
 */
export function useJarvis() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastResponse, setLastResponse] = useState(null);

  const sendMessage = useCallback(async (message) => {
    if (!message?.trim()) {
      setError("Message cannot be empty");
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await api.jarvisChat(message);
      if (response.success) {
        setLastResponse(response.data);
        return response.data;
      } else {
        throw new Error(response.error || "Failed to get response from Jarvis");
      }
    } catch (err) {
      const errorMsg = err.message || "Error communicating with Jarvis";
      setError(errorMsg);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const recommendCampaign = useCallback(async (options = {}) => {
    setLoading(true);
    setError(null);

    try {
      const response = await api.jarvisRecommendCampaign(options);
      if (response.success) {
        setLastResponse(response.data);
        return response.data;
      } else {
        throw new Error(response.error || "Failed to recommend campaign");
      }
    } catch (err) {
      const errorMsg = err.message || "Error recommending campaign";
      setError(errorMsg);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const prepareRecipients = useCallback(async (campaignId, filters = {}) => {
    if (!campaignId) {
      setError("Campaign ID is required");
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await api.jarvisPrepareRecipients(campaignId, filters);
      if (response.success) {
        setLastResponse(response.data);
        return response.data;
      } else {
        throw new Error(response.error || "Failed to prepare recipients");
      }
    } catch (err) {
      const errorMsg = err.message || "Error preparing recipients";
      setError(errorMsg);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const sendTestEmail = useCallback(async (campaignId, testEmail) => {
    if (!campaignId || !testEmail) {
      setError("Campaign ID and test email are required");
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await api.jarvisSendTestEmail(campaignId, testEmail);
      if (response.success) {
        setLastResponse(response.data);
        return response.data;
      } else {
        throw new Error(response.error || "Failed to send test email");
      }
    } catch (err) {
      const errorMsg = err.message || "Error sending test email";
      setError(errorMsg);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const getCampaignStatus = useCallback(async (campaignId) => {
    if (!campaignId) {
      setError("Campaign ID is required");
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await api.jarvisCampaignStatus(campaignId);
      if (response.success) {
        setLastResponse(response.data);
        return response.data;
      } else {
        throw new Error(response.error || "Failed to get campaign status");
      }
    } catch (err) {
      const errorMsg = err.message || "Error getting campaign status";
      setError(errorMsg);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const getStatus = useCallback(async () => {
    try {
      const response = await api.jarvisStatus();
      if (!response.success) throw new Error(response.error || "Failed to retrieve Jarvis status");
      return response.data;
    } catch (err) {
      setError(err.message || "Unable to retrieve Jarvis status");
      return null;
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    loading,
    error,
    lastResponse,
    sendMessage,
    recommendCampaign,
    prepareRecipients,
    sendTestEmail,
    getCampaignStatus,
    getStatus,
    clearError,
  };
}
