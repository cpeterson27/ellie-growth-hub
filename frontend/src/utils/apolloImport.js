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
