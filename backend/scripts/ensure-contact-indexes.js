require("dotenv").config();
const mongoose = require("mongoose");

async function ensureContactIndexes() {
  await mongoose.connect(process.env.MONGO_URI);
  const contacts = mongoose.connection.collection("contacts");
  const indexes = await contacts.indexes();
  const byName = new Map(indexes.map((index) => [index.name, index]));

  const providerIndex = byName.get("sourceProvider_1_providerContactId_1");
  const providerIndexIsCurrent =
    providerIndex?.unique === true &&
    providerIndex?.partialFilterExpression?.providerContactId?.$type === "string";

  if (providerIndex && !providerIndexIsCurrent) {
    await contacts.dropIndex("sourceProvider_1_providerContactId_1");
  }
  if (!providerIndexIsCurrent) {
    await contacts.createIndex(
      { sourceProvider: 1, providerContactId: 1 },
      {
        name: "sourceProvider_1_providerContactId_1",
        unique: true,
        partialFilterExpression: { providerContactId: { $type: "string" } },
      },
    );
  }

  const emailIndex = byName.get("email_1");
  const emailIndexIsCurrent = emailIndex?.unique === true && emailIndex?.sparse === true;
  if (emailIndex && !emailIndexIsCurrent) {
    await contacts.dropIndex("email_1");
  }
  if (!emailIndexIsCurrent) {
    await contacts.createIndex(
      { email: 1 },
      { name: "email_1", unique: true, sparse: true },
    );
  }

  const verified = await contacts.indexes();
  console.log(JSON.stringify(
    verified
      .filter((index) => ["email_1", "sourceProvider_1_providerContactId_1"].includes(index.name))
      .map(({ name, unique, sparse, partialFilterExpression }) => ({
        name,
        unique,
        sparse: Boolean(sparse),
        partialFilterExpression: partialFilterExpression || null,
      })),
  ));
  await mongoose.disconnect();
}

ensureContactIndexes().catch(async (error) => {
  console.error(error.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
