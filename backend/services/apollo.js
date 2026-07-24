const axios = require("axios");

const APOLLO_BASE = "https://api.apollo.io/v1";

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
  const detail =
    error.response?.data?.message ||
    error.response?.data?.error ||
    error.message ||
    "Unknown Apollo error";

  return { success: false, error: detail, status: status ?? null, results: [] };
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
      "/organizations/search",
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
  industries = [],
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

    if (industries.length > 0) {
      body.organization_industry_tag_ids = industries;
    }

    const response = await apolloClient().post("/organizations/search", body, {
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
  verifyAuth,
  searchOrganizations,
  enrichOrganization,
  getOrganizationTopPeople,
  searchContacts,
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
  page = 1,
  perPage = 25,
} = {}) {
  try {
    const key = getApiKey();

    const body = { page, per_page: perPage };

    if (titles.length > 0) body.q_person_titles = titles;
    if (keywords.length > 0) body.q_keywords = keywords.join(" ");
    if (domains.length > 0) body.q_organization_domains = domains;
    if (locations.length > 0) body.person_locations = locations;

    const response = await apolloClient().post("/contacts/search", body, {
      headers: { "x-api-key": key },
    });

    const raw = response.data?.contacts ?? [];
    const total = response.data?.pagination?.total_entries ?? raw.length;

    const contacts = raw.map((person) => ({
      apolloPersonId: person.id ?? null,
      name: [person.first_name, person.last_name].filter(Boolean).join(" "),
      firstName: person.first_name ?? "",
      lastName: person.last_name ?? "",
      title: person.title ?? "",
      company: person.organization?.name ?? person.account?.name ?? "",
      email: person.email ?? "",
      location: [person.city, person.state, person.country]
        .filter(Boolean)
        .join(", "),
      linkedinUrl: person.linkedin_url ?? "",
      source: "apollo",
    }));

    return { success: true, total, page, contacts };
  } catch (error) {
    console.error("[Apollo] searchContacts failed");
    return { ...formatError(error), contacts: [] };
  }
}
