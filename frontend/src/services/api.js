import axios from "axios";

const api = axios.create({
  baseURL:
    import.meta.env.VITE_API_BASE_URL ||
    "http://localhost:5001/api",
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const csrfToken = sessionStorage.getItem("ellie-csrf-token");
  const sessionToken = sessionStorage.getItem("ellie-session-token");
  if (csrfToken) config.headers["X-CSRF-Token"] = csrfToken;
  if (sessionToken) config.headers.Authorization = `Bearer ${sessionToken}`;
  return config;
});

export const fetchWorkspaceConfig = () =>
  api.get("/workspace").then((res) => res.data);

export const updateWorkspaceConfig = (values) =>
  api.patch("/workspace", values).then((res) => res.data);

export const changePassword = (values) =>
  api.patch("/auth/password", values).then((res) => res.data);

export const fetchWorkspaceMembers = () =>
  api.get("/workspace/members").then((res) => res.data);

export const createWorkspaceMember = (values) =>
  api.post("/workspace/members", values).then((res) => res.data);

export const fetchDiscoveryTemplates = () =>
  api.get("/workspace/discovery-templates").then((res) => res.data);

export const saveDiscoveryTemplates = (templates) =>
  api.put("/workspace/discovery-templates", { templates }).then((res) => res.data);


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

export const previewCampaignAudience = (campaignId) =>
  api.get(`/campaigns/${campaignId}/audience-match`).then((res) => res.data);

export const assignCampaignAudience = (campaignId) =>
  api.post(`/campaigns/${campaignId}/audience-match`).then((res) => res.data);

export const updateCampaignRegistrationLinks = (campaignId, links) =>
  api.patch(`/campaigns/${campaignId}/registration-links`, links).then((res) => res.data);

export const updateCampaignBrand = (campaignId, brand) =>
  api.patch(`/campaigns/${campaignId}/brand`, brand).then((res) => res.data);

export const fetchCampaignEmailTemplate = (campaignId, audienceKey = "general") =>
  api.get(`/campaigns/${campaignId}/email-template`, { params: { audienceKey } }).then((res) => res.data);

export const saveCampaignEmailTemplate = (campaignId, template) =>
  api.put(`/campaigns/${campaignId}/email-template`, template).then((res) => res.data);

export const approveCampaignEmailTemplate = (campaignId, audienceKey = "general") =>
  api.post(`/campaigns/${campaignId}/email-template/approve`, { audienceKey }).then((res) => res.data);



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

export const recommendEventAudience = (eventData) =>
  api.post("/events/audience-recommendations", eventData).then((res) => res.data);

export const uploadEventImage = (imageData) =>
  api.post("/events/images", imageData).then((res) => res.data);

export const fetchImageUploadStatus = () =>
  api.get("/events/images/status").then((res) => res.data);



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

export const fetchEventbriteConnection = () =>
  api.get("/eventbrite/oauth/status").then((res) => res.data);

export const beginEventbriteConnection = () =>
  api.get("/eventbrite/oauth/start").then((res) => res.data);

export const disconnectEventbrite = () =>
  api.post("/eventbrite/oauth/disconnect").then((res) => res.data);

export const fetchGmailConnection = () =>
  api.get("/gmail/status").then((res) => res.data);

export const beginGmailConnection = () =>
  api.get("/gmail/oauth/start").then((res) => res.data);

export const disconnectGmail = () =>
  api.post("/gmail/disconnect").then((res) => res.data);

export const fetchGmailThreads = (q = "in:inbox") =>
  api.get("/gmail/threads", { params: { q } }).then((res) => res.data);

export const fetchGmailThread = (threadId) =>
  api.get(`/gmail/threads/${threadId}`).then((res) => res.data);

export const updateGmailThread = (threadId, action) =>
  api.post(`/gmail/threads/${threadId}/action`, { action }).then((res) => res.data);

export const emptyGmailTrash = () =>
  api.delete("/gmail/trash", { data: { confirmation: "DELETE ALL TRASH" } }).then((res) => res.data);

export const deleteSelectedGmailTrash = (threadIds) =>
  api.post("/gmail/trash/delete-selected", { threadIds, confirmation: "DELETE SELECTED" }).then((res) => res.data);

export const sendGmailMessage = (message) =>
  api.post("/gmail/send", message).then((res) => res.data);

export const syncGmailOutreachReplies = () =>
  api.post("/gmail/sync-outreach-replies").then((res) => res.data);

export const fetchContactEmailHistory = (email) =>
  api.get("/gmail/contact-history", { params: { email } }).then((res) => res.data);

export const fetchOutreachEmailHistory = () =>
  api.get("/gmail/outreach-history").then((res) => res.data);

export const syncEventbriteEvent = (eventId) =>
  api.post(`/eventbrite/events/${eventId}/sync`).then((res) => res.data);

export const fetchEventbriteWebhookStatus = () =>
  api.get("/eventbrite/webhook/status").then((res) => res.data);

export const configureEventbriteWebhook = () =>
  api.post("/eventbrite/webhook/configure").then((res) => res.data);

export const createManagedEventbriteEvent = (data) =>
  api.post("/eventbrite/managed-events", data).then((res) => res.data);

export const createEventbriteDraft = (eventId) =>
  api.post(`/eventbrite/managed-events/${eventId}/create-draft`).then((res) => res.data);

export const updateManagedEventbriteEvent = (eventId, data) =>
  api.patch(`/eventbrite/managed-events/${eventId}`, data).then((res) => res.data);

export const publishManagedEventbriteEvent = (eventId) =>
  api.post(`/eventbrite/managed-events/${eventId}/publish`).then((res) => res.data);




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

export const fetchOutreachAnalytics = () =>
  api.get("/outreach/analytics/summary").then((res) => res.data);

export const fetchOutreachPreview = (outreachId) =>
  api.get(`/outreach/${outreachId}/preview`).then((res) => res.data);

export const sendOutreachTestEmail = (outreachId) =>
  api.post(`/outreach/${outreachId}/test`).then((res) => res.data);


export const fetchContacts = (params = {}) =>
  api
    .get("/contacts", { params })
    .then((res) => res.data);

export const fetchContactOverview = () =>
  api.get("/contacts/overview").then((res) => res.data);


export const fetchIntegrationHub = () =>
  api
    .get("/integrations/hub")
    .then((res) => res.data);


export const searchApolloLeads = (payload) =>
  api.post("/contacts/apollo/search", payload).then((res) => res.data);

export const fetchApolloStatus = () =>
  api.get("/contacts/apollo/status").then((res) => res.data);

export const fetchApolloLists = () =>
  api.get("/contacts/apollo/lists").then((res) => res.data);

export const fetchApolloHistory = () =>
  api.get("/contacts/apollo/history").then((res) => res.data);

export const estimateApolloEnrichment = (count) =>
  api.post("/contacts/apollo/enrichment-estimate", { count }).then((res) => res.data);

export const createAudienceDefinition = (payload) =>
  api.post("/audience", payload).then((res) => res.data);

export const discoverAudienceOrganizations = (audienceId) =>
  api.post(`/audience/${audienceId}/discover`).then((res) => res.data);

export const importContactsFromApollo = (payload) =>
  api
    .post("/contacts/import/apollo", payload)
    .then((res) => res.data);

export const ingestContacts = (payload) =>
  api.post("/contacts/ingest", payload).then((res) => res.data);

export const previewContactIngestion = (payload) =>
  api.post("/contacts/ingest/preview", payload).then((res) => res.data);

export const createEmailVerificationBatch = (emails) =>
  api.post("/contacts/email-verification/batches", { emails }).then((res) => res.data);

export const fetchEmailVerificationBatch = (batchId) =>
  api.get(`/contacts/email-verification/batches/${batchId}`).then((res) => res.data);

export const recoverEmailVerificationBatch = (emails) =>
  api.post("/contacts/email-verification/batches/recover", { emails }).then((res) => res.data);

export const archiveContact = (contactId) => api.post(`/contacts/${contactId}/archive`).then((res) => res.data);
export const deleteContact = (contactId, confirmCascade = false) => api.delete(`/contacts/${contactId}`, { data: { confirmCascade } }).then((res) => res.data);
export const updateContact = (contactId, data) => api.patch(`/contacts/${contactId}`, data).then((res) => res.data);
export const bulkAssignContactsToCampaign = (contactIds, campaignId) =>
  api.patch("/contacts/bulk/assign-campaign", { contactIds, campaignId }).then((res) => res.data);

export const fetchPartners = () => api.get("/partners").then((res) => res.data);
export const createPartner = (data) => api.post("/partners", data).then((res) => res.data);
export const updatePartner = (partnerId, data) => api.patch(`/partners/${partnerId}`, data).then((res) => res.data);

export const fetchContentBriefs = (type) => api.get("/content", { params: type ? { type } : {} }).then((res) => res.data);
export const createContentBrief = (data) => api.post("/content", data).then((res) => res.data);
export const updateContentBrief = (id, data) => api.patch(`/content/${id}`, data).then((res) => res.data);



export const generateOutreach = (campaignId, onlyMissing = false) =>
  api
    .post("/outreach/generate", {
      campaignId,
      onlyMissing,
    })
    .then((res) => res.data);



export const updateOutreach = (id, updateData) =>
  api
    .patch(`/outreach/${id}`, updateData)
    .then((res) => res.data);

export const approveAllOutreach = (campaignId) =>
  api.patch("/outreach/bulk/approve", { campaignId }).then((res) => res.data);

export const recordCampaignConsent = (campaignId, details) =>
  api.post("/outreach/record-consent", { campaignId, ...details }).then((res) => res.data);

export const previewCampaignEmailTemplate = (campaignId, template) =>
  api.post(`/campaigns/${campaignId}/email-template/preview`, template).then((res) => res.data);




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

export const fetchDevelopmentRequests = (secret) =>
  api.get("/development-requests", { headers: { "x-development-approval-secret": secret } }).then((res) => res.data);

export const approveDevelopmentRequest = (id, secret, note = "") =>
  api.patch(`/development-requests/${id}/approve`, { note }, { headers: { "x-development-approval-secret": secret } }).then((res) => res.data);

export const rejectDevelopmentRequest = (id, secret, note = "") =>
  api.patch(`/development-requests/${id}/reject`, { note }, { headers: { "x-development-approval-secret": secret } }).then((res) => res.data);




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

export const fetchMarketingFeed = () =>
  api.get("/growth-operators/marketing/feed").then((res) => res.data.data);



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
