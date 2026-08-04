const mongoose = require("mongoose");
const Contact = require("../models/Contact");
const WorkspaceConfig = require("../models/WorkspaceConfig");

const BUILTIN_FIELDS = {
  firstName: { label: "First name", type: "text", maxLength: 120 },
  lastName: { label: "Last name", type: "text", maxLength: 120 },
  company: { label: "Company", type: "text", maxLength: 240 },
  title: { label: "Title", type: "text", maxLength: 240 },
  industry: { label: "Industry", type: "text", maxLength: 240 },
  city: { label: "City", type: "text", maxLength: 160 },
  state: { label: "State", type: "text", maxLength: 120 },
  country: { label: "Country", type: "text", maxLength: 120 },
  phone: { label: "Phone", type: "text", maxLength: 80 },
  website: { label: "Website", type: "text", maxLength: 600 },
  linkedin: { label: "LinkedIn URL", type: "text", maxLength: 600 },
  seniority: { label: "Seniority", type: "text", maxLength: 160 },
  stage: { label: "Stage", type: "text", maxLength: 160 },
  notes: { label: "Notes", type: "text", maxLength: 10000 },
  employeeCount: { label: "Employee count", type: "number" },
  qualifyContact: { label: "Qualified contact", type: "boolean" },
  departments: { label: "Departments", type: "list" },
  tags: { label: "Tags", type: "list" },
  audienceProfiles: { label: "Audience profiles", type: "list" },
};

function printable(value) {
  if (value === undefined || value === null || value === "") return "—";
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

function valuesMatch(left, right) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function normalizeValue(field, rawValue) {
  const type = field.type;
  if (type === "boolean") {
    if (typeof rawValue === "boolean") return rawValue;
    const normalized = String(rawValue).trim().toLowerCase();
    if (["true", "yes", "1", "on"].includes(normalized)) return true;
    if (["false", "no", "0", "off"].includes(normalized)) return false;
    throw new Error(`${field.label} must be yes or no.`);
  }
  if (type === "number") {
    if (rawValue === "" || rawValue === null || rawValue === undefined) return null;
    const value = Number(rawValue);
    if (!Number.isFinite(value)) throw new Error(`${field.label} must be a number.`);
    return value;
  }
  if (type === "date") {
    if (!rawValue) return null;
    const value = new Date(rawValue);
    if (Number.isNaN(value.getTime())) throw new Error(`${field.label} must be a valid date.`);
    return value;
  }
  if (type === "list") {
    const values = Array.isArray(rawValue) ? rawValue : String(rawValue || "").split(",");
    return [...new Set(values.map((item) => String(item).trim()).filter(Boolean))].slice(0, 100);
  }
  return String(rawValue ?? "").trim().slice(0, field.maxLength || 2000);
}

async function availableContactFields() {
  const config = await WorkspaceConfig.findOne({ key: "primary" }).lean();
  const builtIn = Object.entries(BUILTIN_FIELDS).map(([key, definition]) => ({ key, ...definition, custom: false }));
  const custom = (config?.customContactFields || []).map((field) => ({
    key: field.key,
    label: field.label,
    type: field.type,
    custom: true,
  }));
  return [...builtIn, ...custom];
}

async function resolveContactField(key) {
  if (BUILTIN_FIELDS[key]) return { key, ...BUILTIN_FIELDS[key], custom: false, path: key };
  const config = await WorkspaceConfig.findOne({ key: "primary" }).lean();
  const field = (config?.customContactFields || []).find((item) => item.key === key);
  if (!field) throw new Error("Choose an approved CRM field.");
  return { key: field.key, label: field.label, type: field.type, custom: true, path: `additionalFields.${field.key}` };
}

function contactValue(contact, field) {
  return field.custom ? contact.additionalFields?.[field.key] : contact[field.key];
}

async function buildContactFieldUpdatePreview({ contactIds, fieldKey, value }) {
  const ids = [...new Set(Array.isArray(contactIds) ? contactIds.map(String) : [])];
  if (!ids.length || ids.length > 500) throw new Error("Select between 1 and 500 contacts.");
  if (ids.some((id) => !mongoose.Types.ObjectId.isValid(id))) throw new Error("One or more contact IDs are invalid.");
  const field = await resolveContactField(String(fieldKey || ""));
  const normalizedValue = normalizeValue(field, value);
  const contacts = await Contact.find({ _id: { $in: ids }, status: { $ne: "archived" } }).lean();
  const changes = contacts.map((contact) => {
    const before = contactValue(contact, field);
    return {
      contactId: String(contact._id),
      contactName: contact.name || [contact.firstName, contact.lastName].filter(Boolean).join(" ") || "Unnamed contact",
      before,
      after: normalizedValue,
      changed: !valuesMatch(before, normalizedValue),
    };
  });
  const changed = changes.filter((item) => item.changed);
  return {
    field,
    value: normalizedValue,
    selectedCount: ids.length,
    foundCount: contacts.length,
    missingCount: ids.length - contacts.length,
    changedCount: changed.length,
    unchangedCount: changes.length - changed.length,
    changes,
    displayChanges: changed.slice(0, 25).map((item) => ({ ...item, beforeDisplay: printable(item.before), afterDisplay: printable(item.after) })),
  };
}

async function applyContactFieldUpdate(payload) {
  const field = await resolveContactField(payload.fieldKey);
  const intendedValue = normalizeValue(field, payload.value);
  const results = { updated: 0, unchanged: 0, conflicts: 0, missing: 0, changes: [] };
  for (const expected of payload.changes || []) {
    const contact = await Contact.findById(expected.contactId);
    if (!contact || contact.status === "archived") {
      results.missing += 1;
      continue;
    }
    const current = contactValue(contact.toObject(), field);
    if (!valuesMatch(current, expected.before)) {
      results.conflicts += 1;
      continue;
    }
    if (valuesMatch(current, intendedValue)) {
      results.unchanged += 1;
      continue;
    }
    if (field.custom) {
      contact.additionalFields = { ...(contact.additionalFields || {}), [field.key]: intendedValue };
      contact.markModified("additionalFields");
    } else {
      contact.set(field.key, intendedValue);
    }
    if (["firstName", "lastName"].includes(field.key)) {
      const nextFirst = field.key === "firstName" ? intendedValue : contact.firstName;
      const nextLast = field.key === "lastName" ? intendedValue : contact.lastName;
      contact.name = [nextFirst, nextLast].filter(Boolean).join(" ") || contact.name;
    }
    await contact.save();
    results.updated += 1;
    results.changes.push({ contactId: contact._id, contactName: contact.name, fieldKey: field.key, fieldLabel: field.label, before: current, after: intendedValue });
  }
  return { ...results, field };
}

module.exports = {
  BUILTIN_FIELDS,
  applyContactFieldUpdate,
  availableContactFields,
  buildContactFieldUpdatePreview,
  normalizeValue,
};
