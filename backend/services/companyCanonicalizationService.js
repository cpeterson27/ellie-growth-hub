function normalizeCompanyName(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ");
}

function companyKey(value) {
  return normalizeCompanyName(value).toLocaleLowerCase("en-US");
}

function firstUseful(contacts, field) {
  return contacts.map((contact) => contact[field]).find((value) => value !== undefined && value !== null && String(value).trim()) || "";
}

function profileFromContacts(name, contacts) {
  const location = [firstUseful(contacts, "companyCity"), firstUseful(contacts, "companyState"), firstUseful(contacts, "companyCountry")].filter(Boolean).join(", ");
  return {
    name,
    normalizedName: companyKey(name),
    source: "legacy",
    website: firstUseful(contacts, "website"),
    industry: firstUseful(contacts, "industry"),
    location,
    linkedinUrl: firstUseful(contacts, "companyLinkedinUrl"),
    phone: firstUseful(contacts, "companyPhone"),
    employeeCount: firstUseful(contacts, "employeeCount") || null,
    externalSources: { crmCompanyText: true },
  };
}

async function canonicalizeContactCompanies({ apply = false } = {}) {
  // Keep model loading inside the database operation so the normalization
  // helpers remain dependency-free and cheap to test.
  const Contact = require("../models/Contact");
  const Organization = require("../models/Organization");
  const contacts = await Contact.find({
    organizationId: null,
    company: { $exists: true, $type: "string", $ne: "" },
    status: { $ne: "archived" },
  }).select("_id company website industry companyCity companyState companyCountry companyLinkedinUrl companyPhone employeeCount").lean();

  const groups = new Map();
  for (const contact of contacts) {
    const name = normalizeCompanyName(contact.company);
    const key = companyKey(name);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, { name, contacts: [] });
    groups.get(key).contacts.push(contact);
  }

  const existing = await Organization.find({}).select("_id name normalizedName").lean();
  const existingByKey = new Map(existing.map((organization) => [organization.normalizedName || companyKey(organization.name), organization]));
  const result = {
    apply,
    eligibleContacts: contacts.length,
    companyGroups: groups.size,
    existingCompanies: 0,
    companiesToCreate: 0,
    companiesCreated: 0,
    contactsLinked: 0,
  };

  for (const [key, group] of groups) {
    let organization = existingByKey.get(key);
    if (organization) result.existingCompanies += 1;
    else result.companiesToCreate += 1;
    if (!apply) continue;

    if (!organization) {
      organization = await Organization.findOneAndUpdate(
        { normalizedName: key },
        { $setOnInsert: profileFromContacts(group.name, group.contacts) },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      ).lean();
      existingByKey.set(key, organization);
      result.companiesCreated += 1;
    } else if (!organization.normalizedName) {
      await Organization.updateOne({ _id: organization._id }, { $set: { normalizedName: key } });
    }

    const linked = await Contact.updateMany(
      { _id: { $in: group.contacts.map((contact) => contact._id) }, organizationId: null },
      { $set: { organizationId: organization._id } },
    );
    result.contactsLinked += linked.modifiedCount || 0;
  }

  return result;
}

module.exports = { canonicalizeContactCompanies, companyKey, normalizeCompanyName, profileFromContacts };
