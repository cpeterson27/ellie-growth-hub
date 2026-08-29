const assert = require("node:assert/strict");
const ambassadors = require("./services/ambassadorService");
const invitations = require("./services/invitationTemplateService");
const referrals = require("./services/referralCommissionService");

function query(value) { const chain = { populate() { return chain; }, select() { return chain; }, sort() { return chain; }, lean: async () => value, then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); } }; return chain; }

async function invitationCopy() {
  assert.match(invitations.defaults.ambassador.body, /Ambassador Portal/);
  assert.match(invitations.defaults.ambassador.body, /copy your unique referral link/);
  assert.match(invitations.defaults.ambassador.body, /after account activation/);
  assert.match(invitations.defaults.ambassador.body, /{{inviteLink}}/);
}

async function privateSelfServiceData() {
  let referralFilter, payoutFilter;
  const referralRows = [{ _id: "r1", contactId: { firstName: "Taylor", lastName: "Prospect", email: "private@example.com", phone: "555" }, applicationId: { status: "submitted", submittedAt: new Date("2026-08-01") }, enrollmentId: null, state: "applied", source: "public_application", attributedAt: new Date("2026-08-01") }];
  const payoutRows = [{ _id: "p1", contactId: { name: "Private Person", email: "private@example.com" }, productLabel: "Program", grossAmountMinor: 100000, commissionAmountMinor: 10000, currency: "USD", status: "approved", calculatedAt: new Date("2026-08-02"), approvedAt: new Date("2026-08-03") }];
  const models = {
    ReferralAttribution: { find(filter) { referralFilter = filter; return query(referralRows); } },
    CommissionLedger: { find(filter) { payoutFilter = filter; return query(payoutRows); } },
  };
  const ownReferrals = await ambassadors.ownReferrals({ workspaceId: "w1", ambassadorProfileId: "a1" }, models);
  const ownPayouts = await ambassadors.ownPayouts({ workspaceId: "w1", ambassadorProfileId: "a1" }, models);
  assert.deepEqual(referralFilter, { workspaceId: "w1", ambassadorProfileId: "a1", promoterType: "ambassador" });
  assert.deepEqual(payoutFilter, { workspaceId: "w1", ambassadorProfileId: "a1", beneficiaryType: "ambassador" });
  assert.equal(ownReferrals[0].referredPerson, "Taylor P.");
  assert.equal(ownReferrals[0].applicationStatus, "submitted");
  assert.equal(ownReferrals[0].contactId, undefined);
  assert.equal(ownReferrals[0].email, undefined);
  assert.equal(ownPayouts[0].commissionAmountMinor, 10000);
  assert.equal(ownPayouts[0].grossAmountMinor, undefined);
  assert.equal(ownPayouts[0].contactId, undefined);
}

async function attributionContinuityAndInvalidCodes() {
  const existing = { _id: "r1", workspaceId: "w1", contactId: "c1", promoterType: "ambassador", ambassadorProfileId: "a1", referralCode: "first-code", state: "referred", applicationId: null, enrollmentId: null, isModified: () => true, async save() { return this; } };
  const active = { _id: "a2", workspaceId: "w1", userId: "u2", status: "active", referralCode: "second-code", referralSlug: "second-code" };
  const models = {
    Contact: { findOne: () => query({ _id: "c1", workspaceId: "w1" }) },
    AmbassadorProfile: { findOne: (filter) => query(filter.workspaceId === "w1" && filter.status === "active" && filter.$or?.some((item) => item.referralCode === "second-code") ? active : null) },
    CoachProfile: { findOne: () => query(null) },
    ReferralAttribution: { findOne: async () => existing },
    CrmActivity: { create: async () => ({}) },
  };
  const preserved = await referrals.attributeReferral({ workspaceId: "w1", contactId: "c1", referralCode: "second-code", state: "applied", applicationId: "app1", enrollmentId: "enroll1" }, models);
  assert.equal(preserved.ambassadorProfileId, "a1", "first valid attribution is not silently overwritten");
  assert.equal(preserved.referralCode, "first-code");
  assert.equal(preserved.applicationId, "app1");
  assert.equal(preserved.enrollmentId, "enroll1");
  assert.equal(preserved.state, "applied");
  assert.equal(await referrals.resolvePromoterByCode({ workspaceId: "other", referralCode: "second-code" }, models), null);
  assert.equal(await referrals.resolvePromoterByCode({ workspaceId: "w1", referralCode: "disabled-code" }, models), null);
}

Promise.resolve().then(invitationCopy).then(privateSelfServiceData).then(attributionContinuityAndInvalidCodes).then(() => console.log("Ambassador invitation, private self-service visibility, workspace isolation, and first-touch attribution continuity passed.")).catch((error) => { console.error(error); process.exitCode = 1; });
