const axios = require("axios");

const APOLLO_BASE = "https://api.apollo.io/api/v1";

/**
 * Returns the configured API key or throws if missing.
 */
function getApiKey() {
  const key = process.env.APOLLO_API_KEY;
  if (!key) throw new Error("APOLLO_API_KEY is not set in environment");
  return key;
}

/**
 * Shared Axios instance — auth header injected per request so the key
 * is always read fresh from process.env.
 */
function apolloClient() {
  return axios.create({
    baseURL: APOLLO_BASE,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
    },
    timeout: 15000,
  });
}

/**
 * Normalise Apollo error responses into a consistent shape.
 */
function formatError(error) {
  const status = error.response?.status;
  const timeout = error.code === "ECONNABORTED" || error.code === "ETIMEDOUT";
  const code = timeout
    ? "timeout"
    : status === 401 ? "unauthorized"
      : status === 403 ? "forbidden"
        : status === 422 ? "invalid_request"
          : status === 429 ? "rate_limited"
        : status === 404 || status === 405 ? "unsupported_endpoint"
          : "provider_error";

  return {
    success: false,
    error: code,
    errorCode: code,
    status: status ?? null,
    retryAfter: error.response?.headers?.["retry-after"] || null,
    results: [],
    message: error.response?.data?.message || error.response?.data?.error || null,
  };
}

async function getAccountStatus() {
  if (!process.env.APOLLO_API_KEY) {
    return { connected: false, configured: false, code: "not_configured", message: "Apollo API key is not configured." };
  }
  try {
    const key = getApiKey();
    let peopleSearch = { available: true, code: "available", message: "People Search API access verified." };
    try {
      await apolloClient().post("/mixed_people/api_search", null, {
        params: { q_keywords: `ellie_access_check_${Date.now()}`, page: 1, per_page: 1 },
        headers: { "x-api-key": key },
      });
    } catch (error) {
      const formatted = formatError(error);
      peopleSearch = {
        available: formatted.errorCode !== "forbidden",
        code: formatted.errorCode,
        message: formatted.message || "Apollo People Search access could not be verified.",
      };
      if (formatted.errorCode === "unauthorized") throw error;
    }
    let usage = null;
    let usageAvailable = false;
    try {
      const response = await apolloClient().post("/usage_stats/api_usage_stats", {}, { headers: { "x-api-key": key } });
      usage = response.data || {};
      usageAvailable = true;
    } catch (error) {
      if (formatError(error).errorCode === "unauthorized") throw error;
    }
    return {
      connected: true,
      configured: true,
      code: peopleSearch.available ? "connected" : "people_search_plan_unavailable",
      message: "Apollo accepted the configured API key.",
      usageAvailable,
      usage,
      capabilities: { peopleSearch },
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    const formatted = formatError(error);
    if (formatted.errorCode === "forbidden") {
      return {
        connected: true,
        configured: true,
        code: "usage_scope_unavailable",
        message: "Apollo key is configured, but it cannot read API usage stats. Search permissions are checked when a search runs.",
        usageAvailable: false,
        checkedAt: new Date().toISOString(),
      };
    }
    if (formatted.errorCode === "rate_limited") {
      return {
        connected: true,
        configured: true,
        code: "rate_limited",
        message: "Apollo accepted the key but the API is currently rate limited.",
        retryAfter: formatted.retryAfter,
        checkedAt: new Date().toISOString(),
      };
    }
    return {
      connected: false,
      configured: true,
      code: formatted.errorCode,
      status: formatted.status,
      message: formatted.message,
      checkedAt: new Date().toISOString(),
    };
  }
}

async function listApolloLists() {
  try {
    const response = await apolloClient().get("/labels", { headers: { "x-api-key": getApiKey() } });
    const lists = response.data?.labels || response.data?.lists || [];
    return { success: true, available: true, code: "available", lists: lists.map((item) => ({ id: item.id, name: item.name, modality: item.modality || item.kind || "contacts" })) };
  } catch (error) {
    const formatted = formatError(error);
    if (formatted.errorCode === "forbidden") {
      return {
        success: true,
        available: false,
        code: "list_scope_unavailable",
        providerStatus: 403,
        lists: [],
        message: "Apollo search is connected, but this API key cannot read saved lists.",
        action: "Ask your Apollo administrator to issue a key that includes access to the labels/lists endpoint, then replace APOLLO_API_KEY and recheck.",
      };
    }
    return { ...formatted, available: false, lists: [] };
  }
}

async function savePeopleToApolloList(people = [], listName = "") {
  const saved = [];
  for (const person of people.slice(0, 25)) {
    const response = await apolloClient().post("/contacts", {
      first_name: person.firstName || "",
      last_name: person.lastName || "",
      organization_name: person.company || "",
      title: person.title || "",
      email: person.email || undefined,
      present_raw_address: person.location || "",
      label_names: [listName],
      run_dedupe: true,
    }, { headers: { "x-api-key": getApiKey() } });
    saved.push(response.data?.contact || response.data);
  }
  return { success: true, saved: saved.length };
}

function nonBlankStrings(values) {
  return Array.isArray(values)
    ? values.map((value) => String(value || "").trim()).filter(Boolean)
    : [];
}

function buildContactSearchBody({ titles = [], keywords = [], domains = [], locations = [], industryIds = [], emailStatuses = [], seniorities = [], technologiesAny = [], technologiesAll = [], technologiesExclude = [], employeeRanges = [], employeeRange = {}, revenueRange = {}, page = 1, perPage = 25 } = {}) {
  const body = { page: Math.max(1, Number(page) || 1), per_page: Math.min(100, Math.max(1, Number(perPage) || 25)) };
  const cleanedTitles = nonBlankStrings(titles);
  const cleanedKeywords = nonBlankStrings(keywords);
  const cleanedDomains = nonBlankStrings(domains);
  const cleanedLocations = nonBlankStrings(locations);
  const cleanedIndustryIds = nonBlankStrings(industryIds);
  const cleanedEmailStatuses = nonBlankStrings(emailStatuses);
  if (cleanedTitles.length) body.person_titles = cleanedTitles;
  if (cleanedKeywords.length) body.q_keywords = cleanedKeywords.join(" ");
  if (cleanedDomains.length) body.q_organization_domains_list = cleanedDomains;
  if (cleanedLocations.length) body.person_locations = cleanedLocations;
  if (cleanedIndustryIds.length) body.organization_industry_tag_ids = cleanedIndustryIds;
  if (cleanedEmailStatuses.length) body.contact_email_status = cleanedEmailStatuses;
  if (nonBlankStrings(seniorities).length) body.person_seniorities = nonBlankStrings(seniorities);
  if (nonBlankStrings(technologiesAny).length) body.currently_using_any_of_technology_uids = nonBlankStrings(technologiesAny);
  if (nonBlankStrings(technologiesAll).length) body.currently_using_all_of_technology_uids = nonBlankStrings(technologiesAll);
  if (nonBlankStrings(technologiesExclude).length) body.currently_not_using_any_of_technology_uids = nonBlankStrings(technologiesExclude);
  const cleanedEmployeeRanges = nonBlankStrings(employeeRanges);
  const hasEmployeeMin = employeeRange?.min !== null && employeeRange?.min !== undefined && employeeRange?.min !== "";
  const hasEmployeeMax = employeeRange?.max !== null && employeeRange?.max !== undefined && employeeRange?.max !== "";
  if (cleanedEmployeeRanges.length) body.organization_num_employees_ranges = cleanedEmployeeRanges;
  else if (hasEmployeeMin || hasEmployeeMax) body.organization_num_employees_ranges = [`${hasEmployeeMin ? Number(employeeRange.min) : 1},${hasEmployeeMax ? Number(employeeRange.max) : 1000000}`];
  if (revenueRange?.min !== "" && revenueRange?.min != null) body["revenue_range[min]"] = Number(revenueRange.min);
  if (revenueRange?.max !== "" && revenueRange?.max != null) body["revenue_range[max]"] = Number(revenueRange.max);
  return body;
}

function contactSearchDiagnostic({ status, data }) {
  const payload = data && typeof data === "object" ? data : {};
  const firstError = Array.isArray(payload.errors) ? payload.errors[0] : payload.error;
  return {
    endpoint: "/api/v1/mixed_people/api_search",
    status,
    topLevelKeys: Object.keys(payload),
    resultCount: Array.isArray(payload.people) ? payload.people.length : 0,
    apolloCode: payload.code || payload.error_code || firstError?.code || null,
    apolloMessage: payload.message || (typeof payload.error === "string" ? payload.error : firstError?.message) || null,
    pagination: payload.pagination ? { page: payload.pagination.page, perPage: payload.pagination.per_page, totalEntries: payload.pagination.total_entries, totalPages: payload.pagination.total_pages } : null,
  };
}

// ---------------------------------------------------------------------------
// MILESTONE 1 — Organizations search
// ---------------------------------------------------------------------------

/**
 * Verify the API key is valid and the account can reach the Apollo API.
 * Uses a minimal organizations/search call with page_size=1 so it costs
 * almost no credits.
 *
 * Returns: { success: boolean, plan: string|null, message: string }
 */
async function verifyAuth() {
  try {
    const key = getApiKey();
    const response = await apolloClient().post(
      "/mixed_companies/search",
      { q_organization_keyword_tags: ["real estate"], page: 1, per_page: 1 },
      { headers: { "x-api-key": key } },
    );

    const quota = response.data?.quota_usage;
    return {
      success: true,
      message: "Apollo authentication successful",
      quota: quota ?? null,
    };
  } catch (error) {
    return { ...formatError(error), message: "Apollo authentication failed" };
  }
}

/**
 * Search Apollo for organizations matching an audience segment.
 *
 * @param {object} params
 * @param {string[]} params.keywords   - Industry/keyword tags (e.g. ["real estate", "multifamily"])
 * @param {string[]} [params.industries] - Apollo industry filters
 * @param {number}  [params.page=1]
 * @param {number}  [params.perPage=25]
 *
 * Returns: {
 *   success: boolean,
 *   total: number,
 *   page: number,
 *   organizations: Array<{
 *     apolloId: string,   // stored as external metadata only, NOT a DB key
 *     name: string,
 *     website: string,
 *     industry: string,
 *     employeeCount: number|null,
 *     location: string,
 *     description: string,
 *   }>
 * }
 */
async function searchOrganizations({
  keywords = [],
  locations = [],
  employeeRange = {},
  revenueRange = {},
  fundingRange = {},
  technologiesAny = [],
  page = 1,
  perPage = 25,
} = {}) {
  try {
    const key = getApiKey();

    const body = {
      page,
      per_page: perPage,
    };

    if (keywords.length > 0) {
      body.q_organization_keyword_tags = keywords;
    }

    if (locations.length > 0) {
      body.organization_locations = locations;
    }

    const hasMinEmployees = employeeRange?.min !== null && employeeRange?.min !== undefined && employeeRange?.min !== "";
    const hasMaxEmployees = employeeRange?.max !== null && employeeRange?.max !== undefined && employeeRange?.max !== "";
    const minEmployees = hasMinEmployees ? Number(employeeRange.min) : null;
    const maxEmployees = hasMaxEmployees ? Number(employeeRange.max) : null;
    if (Number.isFinite(minEmployees) || Number.isFinite(maxEmployees)) {
      body.organization_num_employees_ranges = [
        `${Number.isFinite(minEmployees) ? minEmployees : 1},${Number.isFinite(maxEmployees) ? maxEmployees : 1000000}`,
      ];
    }
    if (revenueRange?.min !== "" && revenueRange?.min != null) body["revenue_range[min]"] = Number(revenueRange.min);
    if (revenueRange?.max !== "" && revenueRange?.max != null) body["revenue_range[max]"] = Number(revenueRange.max);
    if (fundingRange?.min !== "" && fundingRange?.min != null) body["latest_funding_amount_range[min]"] = Number(fundingRange.min);
    if (fundingRange?.max !== "" && fundingRange?.max != null) body["latest_funding_amount_range[max]"] = Number(fundingRange.max);
    if (nonBlankStrings(technologiesAny).length) body.currently_using_any_of_technology_uids = nonBlankStrings(technologiesAny);

    const response = await apolloClient().post("/mixed_companies/search", body, {
      headers: { "x-api-key": key },
    });

    const raw = response.data?.organizations ?? [];
    const total = response.data?.pagination?.total_entries ?? raw.length;

    const organizations = raw.map((org) => ({
      apolloId: org.id ?? null, // external reference only
      name: org.name ?? "",
      website: org.website_url ?? "",
      industry: org.industry ?? "",
      employeeCount: org.estimated_num_employees ?? null,
      location: [org.city, org.state, org.country].filter(Boolean).join(", "),
      description: org.short_description ?? "",
    }));

    return { success: true, total, page, organizations };
  } catch (error) {
    console.error(
      "[Apollo] searchOrganizations error:",
      error.response?.data ?? error.message,
    );
    return formatError(error);
  }
}

// ---------------------------------------------------------------------------
// MILESTONE 2a — Organization enrichment
// ---------------------------------------------------------------------------

/**
 * Enrich a single organization using its domain or Apollo ID.
 * Prefer domain — it works without a prior search and costs fewer credits.
 *
 * @param {object} params
 * @param {string} [params.domain]    - Company website domain (e.g. "castellanre.com")
 * @param {string} [params.apolloId]  - Apollo org ID from a prior search (fallback)
 *
 * Returns: {
 *   success: boolean,
 *   organization: {
 *     apolloId: string|null,   // external metadata only
 *     name: string,
 *     website: string,
 *     industry: string,
 *     employeeCount: number|null,
 *     location: string,
 *     description: string,
 *     linkedinUrl: string,
 *     founded: number|null,
 *     keywords: string[],
 *     phone: string,
 *   } | null
 * }
 */
async function enrichOrganization({ domain, apolloId } = {}) {
  if (!domain && !apolloId) {
    return {
      success: false,
      error: "Provide either a domain or apolloId to enrich an organization",
      organization: null,
    };
  }

  try {
    const key = getApiKey();

    const body = {};
    if (domain) body.domain = domain;
    if (apolloId) body.id = apolloId;

    const response = await apolloClient().post("/organizations/enrich", body, {
      headers: { "x-api-key": key },
    });

    const org = response.data?.organization ?? null;

    if (!org) {
      return {
        success: false,
        error: "No organization returned from Apollo",
        organization: null,
      };
    }

    return {
      success: true,
      organization: {
        apolloId: org.id ?? null,
        name: org.name ?? "",
        website: org.website_url ?? "",
        industry: org.industry ?? "",
        employeeCount: org.estimated_num_employees ?? null,
        location: [org.city, org.state, org.country].filter(Boolean).join(", "),
        description: org.short_description ?? "",
        linkedinUrl: org.linkedin_url ?? "",
        founded: org.founded_year ?? null,
        keywords: org.keywords ?? [],
        phone: org.sanitized_phone ?? "",
      },
    };
  } catch (error) {
    console.error(
      "[Apollo] enrichOrganization error:",
      error.response?.data ?? error.message,
    );
    return { ...formatError(error), organization: null };
  }
}

// ---------------------------------------------------------------------------
// MILESTONE 2b — Top people at an organization
// ---------------------------------------------------------------------------

/**
 * Retrieve key decision-makers associated with a given organization.
 * Uses the Apollo ID returned by organizations/search.
 *
 * @param {object} params
 * @param {string}   params.organizationId  - Apollo org ID (from searchOrganizations)
 * @param {number}  [params.limit=10]       - Max contacts to return (Apollo default is 10)
 *
 * Returns: {
 *   success: boolean,
 *   organizationId: string,
 *   people: Array<{
 *     apolloPersonId: string|null,   // external metadata only, NOT a DB key
 *     name: string,
 *     firstName: string,
 *     lastName: string,
 *     title: string,
 *     company: string,
 *     email: string,
 *     location: string,
 *     linkedinUrl: string,
 *     source: "apollo",
 *   }>
 * }
 */
async function getOrganizationTopPeople({ organizationId, limit = 10 } = {}) {
  if (!organizationId) {
    return {
      success: false,
      error: "organizationId is required",
      people: [],
    };
  }

  try {
    const key = getApiKey();

    const response = await apolloClient().post(
      "/mixed_people/organization_top_people",
      {
        organization_id: organizationId,
        limit,
      },
      { headers: { "x-api-key": key } },
    );

    const raw = response.data?.people ?? response.data?.contacts ?? [];

    const people = raw.map((person) => ({
      apolloPersonId: person.id ?? null,
      name: [person.first_name, person.last_name].filter(Boolean).join(" "),
      firstName: person.first_name ?? "",
      lastName: person.last_name ?? "",
      title: person.title ?? "",
      company: person.organization?.name ?? person.company_name ?? "",
      email: person.email ?? "",
      location: [person.city, person.state, person.country]
        .filter(Boolean)
        .join(", "),
      linkedinUrl: person.linkedin_url ?? "",
      source: "apollo",
    }));

    return { success: true, organizationId, people };
  } catch (error) {
    console.error(
      "[Apollo] getOrganizationTopPeople error:",
      error.response?.data ?? error.message,
    );
    return { ...formatError(error), people: [] };
  }
}

module.exports = {
  formatError,
  verifyAuth,
  searchOrganizations,
  enrichOrganization,
  getOrganizationTopPeople,
  searchContacts,
  buildContactSearchBody,
  contactSearchDiagnostic,
  getAccountStatus,
  listApolloLists,
  savePeopleToApolloList,
  enrichContacts,
};

// ---------------------------------------------------------------------------
// MILESTONE 3 — Contact / people discovery
// ---------------------------------------------------------------------------

/**
 * Search Apollo's contact database for people matching an audience segment.
 * Primary people-discovery method since organization_top_people is plan-gated.
 *
 * Supports filtering by title keywords, person keywords, location, and
 * org domains. All filters are optional and can be combined.
 *
 * @param {object} params
 * @param {string[]} [params.titles]     - Job title keywords  e.g. ["investor", "syndicator"]
 * @param {string[]} [params.keywords]   - General keywords    e.g. ["multifamily", "real estate"]
 * @param {string[]} [params.domains]    - Company domains     e.g. ["castellanre.com"]
 * @param {string[]} [params.locations]  - City or state names e.g. ["New York", "Texas"]
 * @param {number}   [params.page=1]
 * @param {number}   [params.perPage=25]
 *
 * Returns: {
 *   success: boolean,
 *   total: number,
 *   page: number,
 *   contacts: Array<{
 *     apolloPersonId: string|null,  // external metadata only, NOT a DB key
 *     name: string,
 *     firstName: string,
 *     lastName: string,
 *     title: string,
 *     company: string,
 *     email: string,
 *     location: string,
 *     linkedinUrl: string,
 *     source: "apollo",
 *   }>
 * }
 */
async function searchContacts({
  titles = [],
  keywords = [],
  domains = [],
  locations = [],
  industryIds = [],
  emailStatuses = [],
  seniorities = [],
  technologiesAny = [],
  technologiesAll = [],
  technologiesExclude = [],
  employeeRanges = [],
  employeeRange = {},
  revenueRange = {},
  page = 1,
  perPage = 25,
} = {}) {
  try {
    const key = getApiKey();

    const body = buildContactSearchBody({ titles, keywords, domains, locations, industryIds, emailStatuses, seniorities, technologiesAny, technologiesAll, technologiesExclude, employeeRanges, employeeRange, revenueRange, page, perPage });

    const { page: searchPage, per_page: perPageValue, ...filters } = body;
    const response = await apolloClient().post("/mixed_people/api_search", null, {
      params: { ...filters, page: searchPage, per_page: perPageValue },
      headers: { "x-api-key": key },
    });

    const diagnostic = contactSearchDiagnostic({ status: response.status, data: response.data });
    console.info("[Apollo] search diagnostic", diagnostic);
    const raw = response.data?.people ?? [];
    const total = response.data?.pagination?.total_entries ?? raw.length;

    const contacts = raw.map((person) => ({
      apolloPersonId: person.id ?? person.person_id ?? null,
      name: [person.first_name, person.last_name].filter(Boolean).join(" "),
      firstName: person.first_name ?? "",
      lastName: person.last_name ?? "",
      title: person.title ?? "",
      company: person.organization?.name ?? person.company_name ?? "",
      email: person.email ?? "",
      emailStatus: person.email_status ?? "",
      industry: person.organization?.industry ?? "",
      employeeCount: person.organization?.estimated_num_employees ?? null,
      seniority: person.seniority ?? "",
      departments: person.departments ?? [],
      keywords: person.organization?.keywords ?? [],
      website: person.organization?.website_url ?? "",
      location: [person.city, person.state, person.country]
        .filter(Boolean)
        .join(", "),
      linkedinUrl: person.linkedin_url ?? "",
      source: "apollo",
    }));

    return { success: true, total, page, contacts };
  } catch (error) {
    console.info("[Apollo] search diagnostic", contactSearchDiagnostic({ status: error.response?.status || null, data: error.response?.data }));
    return { ...formatError(error), contacts: [] };
  }
}

async function enrichContacts(leads = []) {
  const key = getApiKey();
  const enriched = [];

  for (let index = 0; index < leads.length; index += 10) {
    const batch = leads.slice(index, index + 10);
    const details = batch.map((lead) => ({
      id: lead.apolloPersonId || lead.apolloContactId || undefined,
      first_name: lead.firstName || undefined,
      last_name: lead.lastName || undefined,
      organization_name: lead.company || undefined,
      linkedin_url: lead.linkedinUrl || lead.linkedin || undefined,
    }));
    const response = await apolloClient().post(
      "/people/bulk_match",
      { details },
      {
        params: { reveal_personal_emails: false, reveal_phone_number: false },
        headers: { "x-api-key": key },
      },
    );
    const matches = response.data?.matches || response.data?.people || [];
    enriched.push(...batch.map((lead, matchIndex) => {
      const person = matches[matchIndex] || {};
      const organization = person.organization || {};
      return {
        ...lead,
        apolloPersonId: person.id || lead.apolloPersonId || null,
        firstName: person.first_name || lead.firstName || "",
        lastName: person.last_name || lead.lastName || "",
        name: person.name || lead.name || [person.first_name, person.last_name].filter(Boolean).join(" "),
        title: person.title || lead.title || "",
        company: organization.name || person.company_name || lead.company || "",
        email: person.email || lead.email || "",
        emailStatus: person.email_status || lead.emailStatus || "",
        industry: organization.industry || lead.industry || "",
        employeeCount: organization.estimated_num_employees ?? lead.employeeCount ?? null,
        website: organization.website_url || lead.website || "",
        linkedinUrl: person.linkedin_url || lead.linkedinUrl || "",
      };
    }));
  }

  return enriched;
}
