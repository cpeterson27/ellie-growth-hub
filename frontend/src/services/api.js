import axios from "axios";

const api = axios.create({
  baseURL:
    import.meta.env.VITE_API_BASE_URL ||
    "http://localhost:5001/api",
});


// ======================================
// CAMPAIGNS
// ======================================

export const fetchCampaigns = (eventId) =>
  api
    .get("/campaigns", {
      params: eventId ? { eventId } : {},
    })
    .then((res) => res.data);

export const fetchCampaign = (campaignId) => api.get(`/campaigns/${campaignId}`).then((res) => res.data);



export const fetchMarketingCampaign = async (campaignId) => {
  const res = await api.get(
    `/marketing-campaigns/${campaignId}`
  );

  return res.data;
};


export const createCampaign = (campaignData) =>
  api
    .post("/campaigns", campaignData)
    .then((res) => res.data);

export const fetchCampaignDeletionPreview = (campaignId) =>
  api.get(`/campaigns/${campaignId}/deletion-preview`).then((res) => res.data);

export const deleteCampaign = (campaignId, options = {}) =>
  api.delete(`/campaigns/${campaignId}`, { data: options }).then((res) => res.data);



export const createCampaignFromEvent = (eventId) =>
  api
    .post(`/campaigns/from-event/${eventId}`)
    .then((res) => res.data);




// ======================================
// EVENTS
// ======================================

export const fetchEvents = () =>
  api
    .get("/events")
    .then((res) => res.data);



export const fetchEvent = (eventId) =>
  api
    .get(`/events/${eventId}`)
    .then((res) => res.data);



export const createEvent = (eventData) =>
  api
    .post("/events", eventData)
    .then((res) => res.data);




// ======================================
// EVENTBRITE
// ======================================

export const fetchEventbriteEvents = () =>
  api
    .get("/eventbrite/events")
    .then((res) => res.data);



export const importEventbriteEvent = (eventId) =>
  api
    .post(`/eventbrite/import/${eventId}`)
    .then((res) => res.data);




// ======================================
// LEADS / APOLLO
// ======================================

export const generateLeads = (campaignId) =>
  api
    .post("/outreach/leads", {
      campaignId,
    })
    .then((res) => res.data);




// ======================================
// OUTREACH
// ======================================

export const fetchOutreach = (campaignId) =>
  api
    .get("/outreach", {
      params: {
        campaignId,
      },
    })
    .then((res) => res.data);


export const fetchContacts = (params = {}) =>
  api
    .get("/contacts", { params })
    .then((res) => res.data);


export const fetchIntegrationHub = () =>
  api
    .get("/integrations/hub")
    .then((res) => res.data);


export const importContactsFromMonday = () =>
  api
    .post("/contacts/import/monday")
    .then((res) => res.data);


export const searchApolloLeads = (payload) =>
  api.post("/contacts/apollo/search", payload).then((res) => res.data);

export const importContactsFromApollo = (payload) =>
  api
    .post("/contacts/import/apollo", payload)
    .then((res) => res.data);

export const ingestContacts = (payload) =>
  api.post("/contacts/ingest", payload).then((res) => res.data);

export const retryMondaySync = (contactId) =>
  api.post(`/contacts/${contactId}/retry-monday`).then((res) => res.data);

export const archiveContact = (contactId) => api.post(`/contacts/${contactId}/archive`).then((res) => res.data);
export const deleteContact = (contactId, confirmCascade = false) => api.delete(`/contacts/${contactId}`, { data: { confirmCascade } }).then((res) => res.data);
export const updateContact = (contactId, data) => api.patch(`/contacts/${contactId}`, data).then((res) => res.data);

export const fetchPartners = () => api.get("/partners").then((res) => res.data);
export const createPartner = (data) => api.post("/partners", data).then((res) => res.data);
export const updatePartner = (partnerId, data) => api.patch(`/partners/${partnerId}`, data).then((res) => res.data);

export const fetchContentBriefs = (type) => api.get("/content", { params: type ? { type } : {} }).then((res) => res.data);
export const createContentBrief = (data) => api.post("/content", data).then((res) => res.data);
export const updateContentBrief = (id, data) => api.patch(`/content/${id}`, data).then((res) => res.data);



export const generateOutreach = (campaignId) =>
  api
    .post("/outreach/generate", {
      campaignId,
    })
    .then((res) => res.data);



export const updateOutreach = (id, updateData) =>
  api
    .patch(`/outreach/${id}`, updateData)
    .then((res) => res.data);




// ======================================
// EMAILS / OUTREACH SEND
// ======================================

export const sendEmails = (outreachIds) =>
  api
    .post("/outreach/send", {
      outreachIds,
    })
    .then((res) => res.data);


// ======================================
// JARVIS ASSISTANT
// ======================================

export const jarvisChat = (message) =>
  api
    .post("/jarvis/chat", {
      message,
    })
    .then((res) => res.data);



export const jarvisSummary = () =>
  api
    .get("/jarvis/summary")
    .then((res) => res.data);

export const jarvisStatus = () =>
  api
    .get("/jarvis/status")
    .then((res) => res.data);

export const fetchJarvisProfile = () =>
  api
    .get("/jarvis/profile")
    .then((res) => res.data);

export const updateJarvisProfile = (profile) =>
  api
    .put("/jarvis/profile", profile)
    .then((res) => res.data);



export const jarvisRecommendCampaign = (options) =>
  api
    .post("/jarvis/actions/recommend-campaign", options)
    .then((res) => res.data);



export const jarvisPrepareRecipients = (
  campaignId,
  filters
) =>
  api
    .post("/jarvis/actions/prepare-recipients", {
      campaignId,
      ...filters,
    })
    .then((res) => res.data);



export const jarvisSendTestEmail = (
  campaignId,
  testEmail
) =>
  api
    .post("/jarvis/actions/send-test-email", {
      campaignId,
      testEmail,
    })
    .then((res) => res.data);



export const jarvisCampaignStatus = (campaignId) =>
  api
    .get(`/jarvis/actions/campaign-status/${campaignId}`)
    .then((res) => res.data);




// ======================================
// AI GROWTH OPERATOR
// ======================================

export const getGrowthOperatorHistory = (operatorId) =>
  api
    .get(`/growth-operators/${operatorId}/actions/history`)
    .then((res) => res.data.data.history);



export const getGrowthOperatorActions = (operatorId) =>
  api
    .get(`/growth-operators/${operatorId}/actions`)
    .then((res) => res.data.data.actions);



export const executeGrowthOperatorAction = (
  operatorId,
  opportunityId
) =>
  api
    .post(
      `/growth-operators/${operatorId}/actions/${opportunityId}/execute`
    )
    .then((res) => res.data);




export default api;
