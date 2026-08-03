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
};

export const CONTACT_TEMPLATE_HEADERS = ["First Name", "Last Name", "Title", "Company Name", "Email", "Email Status", "Phone", "Person Linkedin Url", "Website", "Industry", "City", "State", "Country", "# Employees", "Seniority", "Departments", "Keywords"];

function cleanHeader(value = "") {
  return String(value).replace(/^\uFEFF/, "").trim().replace(/\s+/g, " ");
}

export function normalizeContactRows(rows = []) {
  return rows.map((row) => Object.fromEntries(Object.entries(row || {}).map(([header, value]) => {
    const cleaned = cleanHeader(header);
    return [PEOPLE_ALIASES[cleaned.toLowerCase()] || cleaned, String(value ?? "").trim()];
  })));
}

export function downloadContactTemplate() {
  const blob = new Blob([`${CONTACT_TEMPLATE_HEADERS.join(",")}\n`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "growth-operator-people-template.csv";
  link.click();
  URL.revokeObjectURL(url);
}
