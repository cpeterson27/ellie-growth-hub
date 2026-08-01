const PEOPLE_ALIASES = {
  name: "Name", "contact name": "Name", "person name": "Name",
  "first name": "First Name", firstname: "First Name",
  "last name": "Last Name", lastname: "Last Name",
  title: "Title", "job title": "Title", role: "Title",
  company: "Company Name", "company name": "Company Name", organization: "Company Name", "account name": "Company Name",
  email: "Email", "work email": "Email", "business email": "Email",
  "email status": "Email Status", "email verification status": "Email Status",
  phone: "Phone", "phone number": "Phone", "work direct phone": "Work Direct Phone", "mobile phone": "Mobile Phone",
  linkedin: "Person Linkedin Url", "linkedin url": "Person Linkedin Url", "person linkedin url": "Person Linkedin Url",
  website: "Website", "company website": "Website", industry: "Industry", industries: "Industry",
  location: "Location", city: "City", state: "State", country: "Country",
  employees: "# Employees", "# employees": "# Employees", "company employees": "# Employees", "number of employees": "# Employees",
  seniority: "Seniority", departments: "Departments", keywords: "Keywords", lists: "Lists",
  "apollo contact id": "Apollo Contact Id", "apollo person id": "Apollo Contact Id", "apollo record id": "Apollo Record Id",
};

const ORGANIZATION_ALIASES = {
  name: "Company Name", company: "Company Name", "company name": "Company Name", organization: "Company Name", "organization name": "Company Name", "account name": "Company Name",
  domain: "Domain", website: "Website", "company website": "Website",
  industry: "Industry", industries: "Industry", employees: "# Employees", "# employees": "# Employees", "number of employees": "# Employees", "company employees": "# Employees",
  location: "Location", "company location": "Location", headquarters: "Location", "headquarters location": "Location",
  linkedin: "Company Linkedin Url", "linkedin url": "Company Linkedin Url", "company linkedin url": "Company Linkedin Url",
  phone: "Phone", "company phone": "Phone", founded: "Founded", "founded year": "Founded",
  keywords: "Keywords", description: "Description",
  "apollo account id": "Apollo Account Id", "apollo organization id": "Apollo Account Id", "organization id": "Apollo Account Id", "account id": "Apollo Account Id",
};

export const APOLLO_PEOPLE_TEMPLATE_HEADERS = ["First Name", "Last Name", "Title", "Company Name", "Email", "Email Status", "Phone", "Person Linkedin Url", "Website", "Industry", "City", "State", "Country", "# Employees", "Seniority", "Departments", "Keywords", "Apollo Contact Id"];
export const APOLLO_ORGANIZATION_TEMPLATE_HEADERS = ["Company Name", "Domain", "Website", "Industry", "# Employees", "Location", "Company Linkedin Url", "Phone", "Founded", "Keywords", "Description", "Apollo Account Id"];

function cleanHeader(value = "") {
  return String(value).replace(/^\uFEFF/, "").trim().replace(/\s+/g, " ");
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function hasCompletePersonName(name = "") {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return false;
  const lastName = parts.slice(1).join(" ");
  return /[A-Za-z]{2}/.test(lastName) && !/[-–—_*•]{2,}/.test(lastName);
}

export function parseApolloPeoplePaste(text = "") {
  const lines = String(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const candidates = [];

  lines.forEach((line, index) => {
    if (line.toLowerCase() !== "access mobile" || index < 4) return;
    const emailValue = lines[index - 1];
    const name = lines[index - 4];
    const title = lines[index - 3];
    const company = lines[index - 2];
    if (!name || !title || !company) return;
    const nameParts = name.split(/\s+/).filter(Boolean);
    const location = lines[index + 3] || "";
    const locationParts = location.split(",").map((part) => part.trim());
    candidates.push({
      "First Name": nameParts.shift() || "",
      "Last Name": nameParts.join(" "),
      Title: title,
      "Company Name": company,
      Email: EMAIL_PATTERN.test(emailValue) ? emailValue : "",
      "Email Status": "",
      City: locationParts.length > 1 ? locationParts[0] : "",
      State:
        locationParts.length > 1 && !/^US(?:A)?$/i.test(locationParts[1])
          ? locationParts[1]
          : "",
      Country: /\bUS(?:A)?\b/i.test(location) ? "US" : "",
    });
  });

  const rows = candidates.filter((row) =>
    hasCompletePersonName(`${row["First Name"]} ${row["Last Name"]}`),
  );
  return {
    detected: candidates.length > 0,
    rows,
    total: candidates.length,
    excludedIncompleteName: candidates.length - rows.length,
  };
}

export function normalizeApolloRows(rows = [], mode = "people") {
  const aliases = mode === "organizations" ? ORGANIZATION_ALIASES : PEOPLE_ALIASES;
  return rows.map((row) => Object.fromEntries(Object.entries(row || {}).map(([header, value]) => {
    const cleaned = cleanHeader(header);
    return [aliases[cleaned.toLowerCase()] || cleaned, String(value ?? "").trim()];
  })));
}

export function downloadApolloTemplate(mode = "people") {
  const headers = mode === "organizations" ? APOLLO_ORGANIZATION_TEMPLATE_HEADERS : APOLLO_PEOPLE_TEMPLATE_HEADERS;
  const blob = new Blob([`${headers.join(",")}\n`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `ellie-apollo-${mode === "organizations" ? "organizations" : "people"}-template.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
