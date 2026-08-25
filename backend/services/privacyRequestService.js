const crypto = require("crypto");
const PrivacyRequest = require("../models/PrivacyRequest");
const InAppNotification = require("../models/InAppNotification");
const Contact = require("../models/Contact");
const SocialIdentity = require("../models/SocialIdentity");
const SocialProviderEvent = require("../models/SocialProviderEvent");
const ConversationThread = require("../models/ConversationThread");
const ConversationMessage = require("../models/ConversationMessage");
const TrackedLink = require("../models/TrackedLink");
const CoachingApplication = require("../models/CoachingApplication");
const SocialConnection = require("../models/SocialConnection");
const CrmActivity = require("../models/CrmActivity");

const dependencies = { PrivacyRequest, InAppNotification, Contact, SocialIdentity, SocialProviderEvent, ConversationThread, ConversationMessage, TrackedLink, CoachingApplication, SocialConnection, CrmActivity };
const SUBJECT = "meta data deletion request";
const CATEGORIES = new Set(["contact", "social_identity", "social_events", "conversations", "tracked_links", "applications"]);
const CONFIRMATION = "DELETE VERIFIED REQUEST DATA";
const clean = (value, max = 1000) => String(value || "").trim().slice(0, max);
const email = (value) => clean(value, 320).toLowerCase().match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/)?.[0] || "";
const hash = (value) => crypto.createHash("sha256").update(String(value || "").toLowerCase()).digest("hex");

function metaIdentifiers(text) {
  const value = String(text || "");
  const urls = value.match(/https?:\/\/(?:www\.)?(?:facebook|instagram)\.com\/[^\s<>)]+/gi) || [];
  const handles = (value.match(/(^|\s)@[A-Za-z0-9._]{2,60}\b/g) || []).map((item) => item.trim());
  return [...new Set([...urls, ...handles].map((item) => clean(item, 300).toLowerCase()))].slice(0, 30);
}

async function detectIncoming({ workspaceId, threadId, message }, models = dependencies) {
  if (clean(message?.subject, 500).toLowerCase() !== SUBJECT || message?.direction !== "inbound") return null;
  const providerMessageId = clean(message.providerMessageId, 500);
  if (!providerMessageId) return null;
  let request;
  try {
    request = await models.PrivacyRequest.create({ workspaceId, source: "gmail", providerThreadId: clean(threadId, 500), providerMessageId, requester: { name: clean(message.sender?.name, 180), email: email(message.sender?.address), metaIdentifiers: metaIdentifiers(message.body) }, requestText: clean(message.body, 10000), auditTrail: [{ action: "received", detail: "Detected during workspace Gmail synchronization" }] });
  } catch (error) {
    if (error?.code !== 11000) throw error;
    return models.PrivacyRequest.findOne({ workspaceId, source: "gmail", providerMessageId });
  }
  await models.InAppNotification.create({ workspaceId, type: "privacy_request", privacyRequestId: request._id, actionUrl: `/settings/privacy?request=${request._id}`, title: "Meta Data Deletion Request received", message: "Human identity verification and Owner/Admin approval are required. No data has been deleted." });
  return request;
}

async function candidates(workspaceId, request, models = dependencies) {
  const requesterEmail = email(request.requester?.email);
  const identifiers = request.requester?.metaIdentifiers || [];
  const handles = identifiers.filter((item) => item.startsWith("@")).map((item) => item.slice(1));
  const contactsByEmail = requesterEmail ? await models.Contact.find({ workspaceId, email: requesterEmail }).select("_id name email phone status sources tags").lean() : [];
  const identities = handles.length ? await models.SocialIdentity.find({ workspaceId, $or: [{ username: { $in: handles } }, { providerUserId: { $in: handles } }] }).select("_id contactId provider username displayName providerAssetId").lean() : [];
  const contactIds = [...new Set([...contactsByEmail.map((row) => String(row._id)), ...identities.map((row) => String(row.contactId))])];
  const contacts = contactIds.length ? await models.Contact.find({ workspaceId, _id: { $in: contactIds } }).select("_id name email phone status sources tags").lean() : [];
  const identityIds = identities.map((row) => row._id);
  const counts = { contacts: contacts.length, socialIdentities: identities.length, socialEvents: contactIds.length || identityIds.length ? await models.SocialProviderEvent.countDocuments({ workspaceId, $or: [{ contactId: { $in: contactIds } }, { socialIdentityId: { $in: identityIds } }] }) : 0, conversations: contactIds.length || requesterEmail ? await models.ConversationMessage.countDocuments({ workspaceId, $or: [{ contactId: { $in: contactIds } }, { "sender.address": requesterEmail }] }) : 0, trackedLinks: contactIds.length ? await models.TrackedLink.countDocuments({ workspaceId, contactId: { $in: contactIds } }) : 0, applications: contactIds.length ? await models.CoachingApplication.countDocuments({ workspaceId, contactId: { $in: contactIds } }) : 0 };
  const meta = await models.SocialConnection.findOne({ workspaceId, provider: "meta", status: "connected" }).select("providerAccount assets selectedAssetIds status").lean();
  const normalized = identifiers.join(" ");
  const businessAuthorizationMatch = Boolean(meta && [meta.providerAccount?.id, meta.providerAccount?.name, ...(meta.assets || []).flatMap((asset) => [asset.id, asset.name, asset.username])].filter(Boolean).some((item) => normalized.includes(String(item).toLowerCase())));
  return { contacts, identities, counts, businessAuthorizationMatch, metaAuthorizationAction: "Manual separate review required; this workflow never disconnects the shared Meta connection." };
}

async function transition({ workspaceId, requestId, action, notes, userId }, models = dependencies) {
  const request = await models.PrivacyRequest.findOne({ _id: requestId, workspaceId });
  if (!request) throw new Error("Privacy request not found");
  if (action === "review" && request.status === "received") request.status = "under_review";
  else if (action === "verify" && ["received", "under_review"].includes(request.status)) { if (!clean(notes, 3000)) throw new Error("Record how identity and authority were verified"); request.status = "verified"; request.verificationNotes = clean(notes, 3000); request.verifiedBy = userId; request.verifiedAt = new Date(); }
  else if (action === "reject" && ["received", "under_review"].includes(request.status)) { if (!clean(notes, 3000)) throw new Error("Explain why the request could not be verified"); request.status = "rejected"; request.verificationNotes = clean(notes, 3000); }
  else throw new Error("This status transition is not allowed");
  request.auditTrail.push({ action, actorUserId: userId, detail: action === "verify" ? "Identity verification recorded" : action === "reject" ? "Unable to verify" : "Review opened" });
  await request.save(); return request;
}

async function approve({ workspaceId, requestId, contactIds, categories, confirmation, userId }, models = dependencies) {
  const request = await models.PrivacyRequest.findOne({ _id: requestId, workspaceId });
  if (!request || request.status !== "verified") throw new Error("Verify the request before approving any data action");
  if (confirmation !== CONFIRMATION) throw new Error(`Type ${CONFIRMATION} to approve the selected actions`);
  const selectedCategories = [...new Set((categories || []).filter((item) => CATEGORIES.has(item)))];
  if (!selectedCategories.length) throw new Error("Select at least one data category");
  const found = await candidates(workspaceId, request, models);
  const allowedIds = new Set(found.contacts.map((row) => String(row._id)));
  const selectedIds = [...new Set((contactIds || []).map(String))];
  if (!selectedIds.length || selectedIds.some((id) => !allowedIds.has(id))) throw new Error("Choose only candidate records from this verified workspace request");
  const selectedContacts = found.contacts.filter((row) => selectedIds.includes(String(row._id)));
  const selectedEmails = selectedContacts.map((row) => email(row.email)).filter(Boolean);
  const identityRows = await models.SocialIdentity.find({ workspaceId, contactId: { $in: selectedIds } }).select("_id").lean();
  const identityIds = identityRows.map((row) => row._id); const result = {};
  if (selectedCategories.includes("social_events")) result.socialEvents = (await models.SocialProviderEvent.updateMany({ workspaceId, $or: [{ contactId: { $in: selectedIds } }, { socialIdentityId: { $in: identityIds } }] }, { $set: { contactId: null, socialIdentityId: null, automationId: null, payloadHash: "privacy-redacted" } })).modifiedCount || 0;
  if (selectedCategories.includes("conversations")) {
    const messageFilter = { workspaceId, $or: [{ contactId: { $in: selectedIds } }, { "sender.address": { $in: selectedEmails } }] };
    const messages = await models.ConversationMessage.find(messageFilter).select("threadId").lean(); const threadIds = [...new Set(messages.map((row) => String(row.threadId)))];
    result.messages = (await models.ConversationMessage.updateMany(messageFilter, { $set: { body: "[Personal content removed after a verified privacy request]", html: "", sender: { name: "", address: "" }, recipients: [], contactId: null, metadata: { privacyRequestHandled: true } } })).modifiedCount || 0;
    if (threadIds.length) { await models.ConversationThread.updateMany({ workspaceId, _id: { $in: threadIds } }, { $set: { preview: "Personal content removed after a verified privacy request" }, $pull: { contactIds: { $in: selectedIds }, participants: { $or: [{ contactId: { $in: selectedIds } }, { address: { $in: selectedEmails } }] } } }); }
  }
  if (selectedCategories.includes("tracked_links")) result.trackedLinks = (await models.TrackedLink.deleteMany({ workspaceId, contactId: { $in: selectedIds } })).deletedCount || 0;
  if (selectedCategories.includes("applications")) result.applications = (await models.CoachingApplication.updateMany({ workspaceId, contactId: { $in: selectedIds } }, { $set: { answers: {}, attribution: {}, "consent.sms": false, "consent.marketingEmail": false } })).modifiedCount || 0;
  if (selectedCategories.includes("social_identity")) result.socialIdentities = (await models.SocialIdentity.deleteMany({ workspaceId, contactId: { $in: selectedIds } })).deletedCount || 0;
  if (selectedCategories.includes("contact")) result.contacts = (await models.Contact.updateMany({ workspaceId, _id: { $in: selectedIds } }, { $set: { name: "Privacy request completed", firstName: "", lastName: "", phone: "", status: "archived", sources: ["privacy_request"], tags: ["privacy-request-completed"], socialAttribution: {}, additionalFields: { privacyRequestHandled: true } }, $unset: { email: 1 } })).modifiedCount || 0;
  const responseTo = request.requester.email; const completedAt = new Date();
  request.status = "completed"; request.completedBy = userId; request.completedAt = completedAt; request.selectedContactIds = selectedIds; request.completedCategories = selectedCategories; request.resultCounts = result; request.requestText = "[Removed after request completion]"; request.requester.emailHash = hash(responseTo); request.requester.name = ""; request.requester.email = ""; request.requester.metaIdentifiers = []; request.verificationNotes = "Verification completed; detailed notes removed after execution"; request.auditTrail.push({ action: "completed", actorUserId: userId, detail: `Approved categories: ${selectedCategories.join(", ")}` });
  await request.save();
  await models.CrmActivity.create({ workspaceId, type: "system", title: "Privacy request completed", source: "crm", createdBy: userId, metadata: { eventType: "privacy.request.completed", privacyRequestId: request._id, categories: selectedCategories, resultCounts: result } });
  if (models.InAppNotification?.updateMany) await models.InAppNotification.updateMany({ workspaceId, privacyRequestId: request._id }, { $set: { readAt: completedAt } });
  return { request, confirmation: { to: responseTo, subject: "Re: Meta Data Deletion Request", body: "Your verified Meta data deletion request has been reviewed and the approved data actions have been completed. If you have questions about this response, reply to this email. This confirmation does not include passwords, tokens, or private system details." } };
}

module.exports = { CATEGORIES, CONFIRMATION, SUBJECT, approve, candidates, detectIncoming, metaIdentifiers, transition };
