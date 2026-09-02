require("dotenv").config();
const mongoose = require("mongoose");

const apply = process.argv.includes("--apply");
const definitions = [
  { collection: "payment_plans", key: { workspaceId: 1, coachingApplicationId: 1 }, options: { unique: true, name: "application_active_payment_plan", partialFilterExpression: { status: { $in: ["draft", "active", "partially_paid", "past_due", "attention_required"] } } }, group: { workspaceId: "$workspaceId", coachingApplicationId: "$coachingApplicationId" } },
  { collection: "payment_plans", key: { publicAccessTokenHash: 1 }, options: { unique: true, name: "payment_plan_public_token" }, group: { publicAccessTokenHash: "$publicAccessTokenHash" } },
  { collection: "payment_installments", key: { workspaceId: 1, paymentPlanId: 1, installmentNumber: 1 }, options: { unique: true, name: "plan_installment_number" }, group: { workspaceId: "$workspaceId", paymentPlanId: "$paymentPlanId", installmentNumber: "$installmentNumber" } },
  { collection: "payment_installments", key: { workspaceId: 1, idempotencyKey: 1 }, options: { unique: true, name: "workspace_installment_idempotency" }, group: { workspaceId: "$workspaceId", idempotencyKey: "$idempotencyKey" } },
  { collection: "payment_transactions", key: { workspaceId: 1, paymentInstallmentId: 1 }, options: { unique: true, name: "workspace_payment_installment_transaction", partialFilterExpression: { paymentInstallmentId: { $type: "objectId" } } }, group: { workspaceId: "$workspaceId", paymentInstallmentId: "$paymentInstallmentId" }, match: { paymentInstallmentId: { $type: "objectId" } } },
];

async function run() {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is required");
  await mongoose.connect(process.env.MONGO_URI);
  const report = [];
  for (const definition of definitions) {
    const collection = mongoose.connection.db.collection(definition.collection);
    const duplicates = await collection.aggregate([{ $match: definition.match || {} }, { $group: { _id: definition.group, count: { $sum: 1 } } }, { $match: { count: { $gt: 1 } } }, { $limit: 10 }]).toArray();
    if (duplicates.length) throw Object.assign(new Error(`Duplicate records block ${definition.options.name}`), { code: "PAYMENT_INDEX_DUPLICATES", index: definition.options.name, count: duplicates.length });
    const existing = (await collection.listIndexes().toArray()).find((index) => index.name === definition.options.name);
    if (apply && !existing) await collection.createIndex(definition.key, definition.options);
    report.push({ collection: definition.collection, index: definition.options.name, status: existing ? "exists" : apply ? "created" : "missing", duplicates: 0 });
  }
  console.log(JSON.stringify({ mode: apply ? "apply" : "preflight", ready: true, report }, null, 2));
}
run().catch((error) => { console.error(JSON.stringify({ error: "PAYMENT_PLAN_INDEX_MIGRATION_STOPPED", code: error.code || "MIGRATION_FAILED", index: error.index || null, dataChanged: false }, null, 2)); process.exitCode = 1; }).finally(() => mongoose.disconnect());
