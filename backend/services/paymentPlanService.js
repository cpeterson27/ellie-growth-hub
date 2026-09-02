const crypto = require("crypto");
const PaymentPlan = require("../models/PaymentPlan");
const PaymentInstallment = require("../models/PaymentInstallment");
const PaymentTransaction = require("../models/PaymentTransaction");
const PaymentConnection = require("../models/PaymentConnection");
const CoachingApplication = require("../models/CoachingApplication");
const CoachingProgram = require("../models/CoachingProgram");
const Contact = require("../models/Contact");
const WorkspaceConfig = require("../models/WorkspaceConfig");
const CrmActivity = require("../models/CrmActivity");
const { encryptCredentials, decryptCredentials } = require("../utils/credentialEncryption");
const { getPaymentProvider } = require("./payments/providerRegistry");

const tokenHash = (value) => crypto.createHash("sha256").update(String(value || "")).digest("hex");
const frontend = () => (process.env.FRONTEND_URL || "http://localhost:5173").split(",")[0].trim();
const activeStatuses = ["draft", "active", "partially_paid", "past_due", "attention_required"];
const moneyInt = (value) => { const amount = Number(value); if (!Number.isSafeInteger(amount) || amount < 1) throw Object.assign(new Error("Each installment must be a positive whole number of cents"), { code: "PAYMENT_PLAN_AMOUNT_INVALID" }); return amount; };
const equalSchedule = (total, count) => { const base = Math.floor(total / count), remainder = total % count; return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0)); };
const validateSchedule = ({ totalAmountMinor, installmentCount, installments }) => {
  const count = Number(installmentCount); if (!Number.isInteger(count) || count < 2 || count > 12) throw Object.assign(new Error("Payment plans require 2–12 installments"), { code: "PAYMENT_PLAN_COUNT_INVALID" });
  if (!Array.isArray(installments) || installments.length !== count) throw Object.assign(new Error("The complete installment schedule is required"), { code: "PAYMENT_PLAN_SCHEDULE_INCOMPLETE" });
  const normalized = installments.map((item, index) => { const dueAt = new Date(item.dueAt); if (Number.isNaN(dueAt.getTime())) throw Object.assign(new Error(`Installment ${index + 1} needs a valid due date`), { code: "PAYMENT_PLAN_DATE_INVALID" }); return { installmentNumber: index + 1, amountMinor: moneyInt(item.amountMinor), dueAt }; });
  if (normalized.some((item, index) => index && item.dueAt < normalized[index - 1].dueAt)) throw Object.assign(new Error("Installment due dates must be in chronological order"), { code: "PAYMENT_PLAN_DATES_OUT_OF_ORDER" });
  if (normalized.reduce((sum, item) => sum + item.amountMinor, 0) !== totalAmountMinor) throw Object.assign(new Error("Installments must equal the published program price exactly"), { code: "PAYMENT_PLAN_TOTAL_MISMATCH" });
  return normalized;
};

async function association(workspaceId, applicationId) {
  const application = await CoachingApplication.findOne({ _id: applicationId, workspaceId });
  if (!application || ["not_fit", "converted"].includes(application.status)) throw Object.assign(new Error("Application is not eligible for a payment plan"), { code: "PAYMENT_PLAN_APPLICATION_INVALID", status: 404 });
  const [program, contact] = await Promise.all([CoachingProgram.findOne({ _id: application.coachingProgramId, workspaceId, status: "active", "publicPresentation.status": "published" }), Contact.findOne({ _id: application.contactId, workspaceId })]);
  if (!program || !contact) throw Object.assign(new Error("Application program or contact is not available in this workspace"), { code: "PAYMENT_PLAN_ASSOCIATION_INVALID" });
  const totalAmountMinor = Math.round(Number(program.defaultPrice?.amount || 0) * 100); if (!Number.isSafeInteger(totalAmountMinor) || totalAmountMinor < 1) throw Object.assign(new Error("Published program price is required"), { code: "PAYMENT_PLAN_PRICE_INVALID" });
  return { application, program, contact, totalAmountMinor };
}

async function createPlan({ workspaceId, userId, applicationId, input }) {
  const data = await association(workspaceId, applicationId);
  if (await PaymentPlan.exists({ workspaceId, coachingApplicationId: applicationId, status: { $in: activeStatuses } })) throw Object.assign(new Error("This application already has an active payment plan"), { code: "PAYMENT_PLAN_ALREADY_EXISTS" });
  if (await PaymentTransaction.exists({ workspaceId, coachingApplicationId: applicationId, status: { $in: ["pending", "requires_action", "paid", "partially_refunded", "refunded"] } })) throw Object.assign(new Error("This application already has an active payment arrangement"), { code: "PAYMENT_REQUEST_ALREADY_EXISTS" });
  const count = Number(input.installmentCount); const amounts = input.mode === "equal" ? equalSchedule(data.totalAmountMinor, count) : (input.installments || []).map((item) => item.amountMinor);
  const dates = input.installments || []; const schedule = validateSchedule({ totalAmountMinor: data.totalAmountMinor, installmentCount: count, installments: amounts.map((amountMinor, index) => ({ amountMinor, dueAt: dates[index]?.dueAt })) });
  const publicToken = crypto.randomBytes(32).toString("base64url"), expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  let plan;
  try {
    plan = await PaymentPlan.create({ workspaceId, provider: "square", status: "active", coachingApplicationId: data.application._id, contactId: data.contact._id, coachingProgramId: data.program._id, salesOpportunityId: data.application.salesOpportunityId, totalAmountMinor: data.totalAmountMinor, currency: data.program.defaultPrice.currency || "USD", installmentCount: count, publicAccessTokenHash: tokenHash(publicToken), publicAccessTokenEncrypted: encryptCredentials({ token: publicToken }), publicAccessExpiresAt: expiresAt, createdBy: userId });
    await PaymentInstallment.insertMany(schedule.map((item) => ({ ...item, workspaceId, paymentPlanId: plan._id, status: item.dueAt <= new Date() ? "due" : "scheduled", idempotencyKey: `plan_${String(plan._id)}_${item.installmentNumber}` })));
  } catch (error) { if (plan?._id) await PaymentPlan.deleteOne({ _id: plan._id, workspaceId }).catch(() => {}); if (error?.code === 11000) throw Object.assign(new Error("This application already has an active payment plan"), { code: "PAYMENT_PLAN_ALREADY_EXISTS" }); throw error; }
  await CoachingApplication.updateOne({ _id: data.application._id, workspaceId }, { $set: { status: "qualified", acceptedAt: data.application.acceptedAt || new Date(), acceptedBy: data.application.acceptedBy || userId, payment: { planId: plan._id, transactionId: null, status: "active", kind: "payment_plan", amountMinor: data.totalAmountMinor, requestedAt: new Date(), paidAt: null } } });
  await Contact.updateOne({ _id: data.contact._id, workspaceId }, { $set: { "paymentSummary.planId": plan._id, "paymentSummary.status": "active", "paymentSummary.lastAmountMinor": data.totalAmountMinor } });
  await CrmActivity.create({ workspaceId, contactId: data.contact._id, type: "system", title: "Payment plan created", body: `${count} installment payment plan`, source: "integration", createdBy: userId, metadata: { paymentPlanId: plan._id, amountMinor: data.totalAmountMinor } });
  return { plan: await staffPlan(workspaceId, plan._id), publicPaymentPlanUrl: `${frontend()}/payment-plan/${publicToken}` };
}

async function staffPlan(workspaceId, planId) { const plan = await PaymentPlan.findOne({ _id: planId, workspaceId }).populate("contactId", "name email").populate("coachingProgramId", "name").lean(); if (!plan) return null; const installments = await PaymentInstallment.find({ workspaceId, paymentPlanId: plan._id }).sort({ installmentNumber: 1 }).lean(); return { ...plan, installments }; }
async function listPlans(workspaceId) { const plans = await PaymentPlan.find({ workspaceId }).populate("contactId", "name email").populate("coachingProgramId", "name").sort({ createdAt: -1 }).lean(); const ids = plans.map((p) => p._id); const installments = await PaymentInstallment.find({ workspaceId, paymentPlanId: { $in: ids } }).sort({ installmentNumber: 1 }).lean(); return plans.map((plan) => ({ ...plan, installments: installments.filter((item) => String(item.paymentPlanId) === String(plan._id)) })); }

async function publicPlan(token) {
  const plan = await PaymentPlan.findOne({ publicAccessTokenHash: tokenHash(token), publicAccessRevokedAt: null }).select("+publicAccessTokenHash").populate("coachingProgramId", "name");
  if (!plan || plan.publicAccessExpiresAt <= new Date()) throw Object.assign(new Error("This payment plan link is invalid or expired"), { code: "PAYMENT_PLAN_LINK_INVALID", status: 404 });
  await PaymentInstallment.updateMany({ workspaceId: plan.workspaceId, paymentPlanId: plan._id, status: "scheduled", dueAt: { $lt: new Date() } }, { $set: { status: "past_due" } });
  const installments = await PaymentInstallment.find({ workspaceId: plan.workspaceId, paymentPlanId: plan._id }).sort({ installmentNumber: 1 }).lean();
  const config = await WorkspaceConfig.findOne({ workspaceId: plan.workspaceId, key: "primary" }).lean(); const paid = installments.reduce((sum, item) => sum + item.paidAmountMinor - item.refundedAmountMinor, 0); const next = installments.find((item) => ["scheduled", "due", "failed", "past_due", "checkout_created", "pending"].includes(item.status));
  return { businessName: config?.branding?.publicSiteName || config?.workspaceName || config?.legalBusinessName || "Program provider", programName: plan.coachingProgramId?.name || "Program", status: plan.status, currency: plan.currency, originalPriceMinor: plan.totalAmountMinor, amountPaidMinor: paid, remainingBalanceMinor: Math.max(plan.totalAmountMinor - paid, 0), nextPayment: next ? { installmentNumber: next.installmentNumber, amountMinor: next.amountMinor, dueAt: next.dueAt, status: next.status } : null, installments: installments.map((item) => ({ installmentNumber: item.installmentNumber, amountMinor: item.amountMinor, dueAt: item.dueAt, status: item.status, paidAt: item.paidAt, canPay: !["paid", "canceled", "refunded", "partially_refunded"].includes(item.status) && !["canceled", "paid", "refunded"].includes(plan.status) })) };
}

async function beginInstallmentCheckout(token, number) {
  const plan = await PaymentPlan.findOne({ publicAccessTokenHash: tokenHash(token), publicAccessRevokedAt: null, status: { $in: ["active", "partially_paid", "past_due", "attention_required"] }, publicAccessExpiresAt: { $gt: new Date() } }).select("+publicAccessTokenHash");
  if (!plan) throw Object.assign(new Error("This payment plan cannot accept payments"), { code: "PAYMENT_PLAN_NOT_PAYABLE", status: 409 });
  const installment = await PaymentInstallment.findOne({ workspaceId: plan.workspaceId, paymentPlanId: plan._id, installmentNumber: Number(number) });
  if (!installment || ["paid", "canceled", "refunded", "partially_refunded"].includes(installment.status)) throw Object.assign(new Error("This installment cannot be paid"), { code: "PAYMENT_INSTALLMENT_NOT_PAYABLE", status: 409 });
  const existing = await PaymentTransaction.findOne({ workspaceId: plan.workspaceId, paymentInstallmentId: installment._id }); if (existing) return { checkoutUrl: existing.checkoutUrl };
  const connection = await PaymentConnection.findOne({ workspaceId: plan.workspaceId, provider: plan.provider, status: { $in: ["connected", "attention_required"] } }).select("+credentialsEncrypted"); if (!connection) throw Object.assign(new Error("Payments are temporarily unavailable"), { code: "PAYMENT_CONNECTION_REQUIRED", status: 409 });
  const provider = getPaymentProvider(plan.provider), idempotencyKey = installment.idempotencyKey; const publicUrl = `${frontend()}/payment-plan/${token}`;
  const hosted = await provider.createHostedCheckout(decryptCredentials(connection.credentialsEncrypted).accessToken, { idempotencyKey, locationId: connection.externalLocationId, referenceId: idempotencyKey, description: `Program installment ${installment.installmentNumber} of ${plan.installmentCount}`, amountMinor: installment.amountMinor, currency: plan.currency, redirectUrl: `${publicUrl}?returned=1` });
  let transaction; try { transaction = await PaymentTransaction.create({ workspaceId: plan.workspaceId, provider: plan.provider, kind: "installment", status: "pending", amountMinor: installment.amountMinor, totalAmountMinor: installment.amountMinor, remainingBalanceMinor: 0, currency: plan.currency, idempotencyKey, externalCheckoutId: hosted.checkoutId, externalOrderId: hosted.orderId, checkoutUrl: hosted.url, contactId: plan.contactId, coachingApplicationId: plan.coachingApplicationId, coachingProgramId: plan.coachingProgramId, salesOpportunityId: plan.salesOpportunityId, paymentPlanId: plan._id, paymentInstallmentId: installment._id, description: `Installment ${installment.installmentNumber} of ${plan.installmentCount}`, createdBy: plan.createdBy }); } catch (error) { if (error?.code !== 11000) throw error; transaction = await PaymentTransaction.findOne({ workspaceId: plan.workspaceId, paymentInstallmentId: installment._id }); }
  installment.paymentTransactionId = transaction._id; installment.status = "checkout_created"; await installment.save(); return { checkoutUrl: transaction.checkoutUrl };
}

async function updateInstallments({ workspaceId, planId, installments }) {
  const plan = await PaymentPlan.findOne({ _id: planId, workspaceId, status: { $in: activeStatuses } });
  if (!plan) throw Object.assign(new Error("Payment plan cannot be edited"), { code: "PAYMENT_PLAN_NOT_EDITABLE", status: 404 });
  const current = await PaymentInstallment.find({ workspaceId, paymentPlanId: plan._id }).sort({ installmentNumber: 1 });
  if (!Array.isArray(installments) || installments.length !== current.length) throw Object.assign(new Error("The complete installment schedule is required"), { code: "PAYMENT_PLAN_SCHEDULE_INCOMPLETE" });
  const immutable = new Map(current.filter((item) => ["paid", "partially_refunded", "refunded", "checkout_created", "pending"].includes(item.status)).map((item) => [item.installmentNumber, item]));
  const normalized = validateSchedule({ totalAmountMinor: plan.totalAmountMinor, installmentCount: plan.installmentCount, installments });
  for (const item of normalized) {
    const locked = immutable.get(item.installmentNumber);
    if (locked && (locked.amountMinor !== item.amountMinor || new Date(locked.dueAt).getTime() !== item.dueAt.getTime())) throw Object.assign(new Error(`Installment ${item.installmentNumber} is already paid or in checkout and cannot be changed`), { code: "PAYMENT_PLAN_PAID_INSTALLMENT_IMMUTABLE" });
  }
  for (const item of normalized.filter((entry) => !immutable.has(entry.installmentNumber))) await PaymentInstallment.updateOne({ workspaceId, paymentPlanId: plan._id, installmentNumber: item.installmentNumber }, { $set: { amountMinor: item.amountMinor, dueAt: item.dueAt, status: item.dueAt <= new Date() ? "due" : "scheduled" } });
  return staffPlan(workspaceId, plan._id);
}
async function planShareLink(workspaceId, planId) { const plan = await PaymentPlan.findOne({ _id: planId, workspaceId, publicAccessRevokedAt: null }).select("+publicAccessTokenEncrypted"); if (!plan) throw Object.assign(new Error("Payment plan link is unavailable"), { code: "PAYMENT_PLAN_LINK_INVALID", status: 404 }); const token = decryptCredentials(plan.publicAccessTokenEncrypted).token; return `${frontend()}/payment-plan/${token}`; }
async function cancelPlan({ workspaceId, planId, userId }) { const plan = await PaymentPlan.findOne({ _id: planId, workspaceId, status: { $in: activeStatuses } }); if (!plan) throw Object.assign(new Error("Payment plan cannot be canceled"), { code: "PAYMENT_PLAN_NOT_CANCELABLE", status: 404 }); plan.status = "canceled"; plan.canceledAt = new Date(); plan.canceledBy = userId; plan.publicAccessRevokedAt = new Date(); await plan.save(); await PaymentInstallment.updateMany({ workspaceId, paymentPlanId: plan._id, status: { $in: ["scheduled", "due", "checkout_created", "pending", "failed", "past_due"] } }, { $set: { status: "canceled" } }); await CrmActivity.create({ workspaceId, contactId: plan.contactId, type: "system", title: "Payment plan canceled", source: "integration", createdBy: userId, metadata: { paymentPlanId: plan._id } }); return staffPlan(workspaceId, plan._id); }

async function syncTransaction(transaction) { if (!transaction.paymentPlanId || !transaction.paymentInstallmentId) return; const installment = await PaymentInstallment.findOne({ _id: transaction.paymentInstallmentId, workspaceId: transaction.workspaceId, paymentPlanId: transaction.paymentPlanId }); const plan = await PaymentPlan.findOne({ _id: transaction.paymentPlanId, workspaceId: transaction.workspaceId }); if (!installment || !plan) return;
  if (transaction.status === "paid") { installment.status = "paid"; installment.paidAmountMinor = transaction.amountMinor; installment.paidAt = transaction.paidAt || new Date(); }
  else if (["failed", "canceled"].includes(transaction.status)) installment.status = transaction.status === "failed" ? "failed" : "canceled";
  else if (["partially_refunded", "refunded"].includes(transaction.status)) { installment.status = transaction.status; installment.refundedAmountMinor = transaction.refundedAmountMinor; plan.status = "attention_required"; }
  await installment.save(); const all = await PaymentInstallment.find({ workspaceId: plan.workspaceId, paymentPlanId: plan._id }); plan.paidAmountMinor = all.reduce((sum, item) => sum + item.paidAmountMinor, 0); plan.refundedAmountMinor = all.reduce((sum, item) => sum + item.refundedAmountMinor, 0); if (plan.status !== "attention_required") { const paidCount = all.filter((item) => item.status === "paid").length; plan.status = paidCount === all.length ? "paid" : paidCount ? "partially_paid" : all.some((item) => item.status === "past_due") ? "past_due" : "active"; if (plan.status === "paid") plan.completedAt = new Date(); } await plan.save(); await CoachingApplication.updateOne({ _id: plan.coachingApplicationId, workspaceId: plan.workspaceId }, { $set: { "payment.status": plan.status, "payment.paidAt": plan.status === "paid" ? plan.completedAt : null } }); await Contact.updateOne({ _id: plan.contactId, workspaceId: plan.workspaceId }, { $set: { "paymentSummary.status": plan.status, "paymentSummary.lastPaidAt": transaction.paidAt || null } });
  await CrmActivity.create({ workspaceId: plan.workspaceId, contactId: plan.contactId, type: "system", title: transaction.status === "paid" ? "Installment payment verified" : transaction.status.includes("refund") ? "Payment plan refund updated" : "Installment payment updated", body: `Installment ${installment.installmentNumber} of ${plan.installmentCount}: ${transaction.status}`, source: "integration", metadata: { paymentPlanId: plan._id, paymentInstallmentId: installment._id, paymentTransactionId: transaction._id, amountMinor: transaction.amountMinor, status: transaction.status } });
}
module.exports = { activeStatuses, beginInstallmentCheckout, cancelPlan, createPlan, equalSchedule, listPlans, planShareLink, publicPlan, staffPlan, syncTransaction, updateInstallments, validateSchedule };
