import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Button from "../components/Button.jsx";
import ActivityTimeline from "../components/ActivityTimeline.jsx";
import { Drawer, PageHeader, StatusBadge, Tabs, Toolbar } from "../components/WorkspaceUI.jsx";
import { canonicalizeContactCompanies, fetchCompanies, fetchCompany } from "../services/api.js";
import "./Companies.css";

const companyViews = [
  { id: "all", label: "All companies" },
  { id: "hot", label: "High priority" },
  { id: "customers", label: "Customers" },
  { id: "partners", label: "Partners" },
  { id: "incomplete", label: "Needs research" },
];

function priorityTone(company) {
  if (company.priorityTier === "hot") return "danger";
  if (company.priorityTier === "warm") return "warning";
  return "draft";
}

function relationshipLabel(company) {
  return company.relationship?.status || company.relationship?.relationshipType || "prospect";
}

export default function Companies() {
  const navigate = useNavigate();
  const { id: routeCompanyId } = useParams();
  const [companies, setCompanies] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [view, setView] = useState("all");
  const [audienceTier, setAudienceTier] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState(null);
  const [detailTab, setDetailTab] = useState("overview");
  const [detailLoading, setDetailLoading] = useState(Boolean(routeCompanyId));
  const [canonicalization, setCanonicalization] = useState(null);
  const [canonicalizing, setCanonicalizing] = useState(false);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      fetchCompanies({
        page,
        limit: 25,
        search,
        priorityTier: view === "hot" ? "hot" : "",
        relationshipStatus: ["customers", "partners"].includes(view) ? view.slice(0, -1) : "",
        needsResearch: view === "incomplete" ? "true" : "",
        audienceTier,
      })
        .then((result) => {
          if (!active) return;
          const items = result.data || [];
          setCompanies(items);
          setPagination(result.pagination || { page: 1, pages: 1, total: items.length });
          setError("");
        })
        .catch(() => { if (active) setError("Unable to load companies."); })
        .finally(() => { if (active) setLoading(false); });
    }, 180);
    return () => { active = false; window.clearTimeout(timer); };
  }, [page, search, view, audienceTier]);

  useEffect(() => {
    if (!routeCompanyId) return;
    let active = true;
    fetchCompany(routeCompanyId)
      .then((result) => { if (active) { setDetail(result.data); setDetailTab("overview"); } })
      .catch(() => { if (active) setError("Unable to open that company record."); })
      .finally(() => { if (active) setDetailLoading(false); });
    return () => { active = false; };
  }, [routeCompanyId]);

  const openCompany = (company) => {
    setDetailLoading(true);
    navigate(`/crm/companies/${company._id}`);
  };
  const closeCompany = () => { setDetail(null); navigate("/crm/companies"); };
  const organization = detail?.organization;
  const buildFromContacts = async (apply = false) => {
    setCanonicalizing(true);
    setError("");
    try {
      const result = await canonicalizeContactCompanies(apply);
      setCanonicalization(result.data);
      if (apply) setPage((value) => value);
    } catch {
      setError("Unable to build companies from CRM contacts.");
    } finally {
      setCanonicalizing(false);
    }
  };

  return <div className="page-dashboard companies-page">
    <PageHeader
      eyebrow="CRM"
      title="Companies"
      description="Understand every account, the people connected to it, and the next relationship move."
      actions={<><Button variant="outline" onClick={() => navigate("/crm/contacts")}>Contacts</Button><Button onClick={() => navigate("/discovery/companies")}>Discover companies</Button></>}
    />

    <Tabs label="Saved company views" activeId={view} onChange={(nextView) => { setView(nextView); setPage(1); }} items={companyViews} />
    <Toolbar
      search={<input className="select-input companies-search" aria-label="Search companies" placeholder="Search companies, domains, industries, or locations" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} />}
      filters={<label>Audience fit <select value={audienceTier} onChange={(event) => { setAudienceTier(event.target.value); setPage(1); }}><option value="">All tiers</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option><option value="unscored">Unscored</option></select></label>}
      actions={search || audienceTier ? <Button variant="outline" onClick={() => { setSearch(""); setAudienceTier(""); setPage(1); }}>Clear filters</Button> : null}
      results={loading ? "Loading companies" : `${companies.length} shown · ${pagination.total || 0} total`}
    />

    {error ? <p className="form-error" role="alert">{error}</p> : null}
    {canonicalization ? <section className="company-import-preview" aria-live="polite"><div><strong>{canonicalization.apply ? `${canonicalization.companiesCreated} companies created` : `${canonicalization.companiesToCreate} companies ready to create`}</strong><p>{canonicalization.apply ? `${canonicalization.contactsLinked} contacts linked. No enrichment or AI credits were used.` : `${canonicalization.eligibleContacts} unlinked contacts grouped into ${canonicalization.companyGroups} exact company-name matches. Existing companies will be reused.`}</p></div>{canonicalization.apply ? <Button variant="outline" onClick={() => window.location.reload()}>View companies</Button> : <Button loading={canonicalizing} disabled={!canonicalization.companyGroups} onClick={() => buildFromContacts(true)}>Create and link companies</Button>}</section> : null}
    {loading ? <div className="table-state">Loading companies…</div> : companies.length ? <div className="company-table-wrap">
      <table className="company-table">
        <thead><tr><th>Company</th><th>Industry and location</th><th>Relationship</th><th>Priority</th><th>Audience fit</th><th>Contacts</th><th>Last updated</th></tr></thead>
        <tbody>{companies.map((company) => <tr key={company._id} onClick={() => openCompany(company)}>
          <td><button type="button" onClick={(event) => { event.stopPropagation(); openCompany(company); }}><span>{company.name.slice(0, 1).toUpperCase()}</span><span><strong>{company.name}</strong><small>{company.domain || company.website || "Domain missing"}</small></span></button></td>
          <td><strong>{company.industry || "Industry missing"}</strong><small>{company.location || "Location missing"}{company.employeeCount ? ` · ${company.employeeCount.toLocaleString()} employees` : ""}</small></td>
          <td><StatusBadge tone={["customer", "partner", "qualified"].includes(relationshipLabel(company)) ? "success" : "draft"}>{relationshipLabel(company)}</StatusBadge></td>
          <td><StatusBadge tone={priorityTone(company)}>{company.priorityTier || "cold"} · {company.priorityScore || 0}</StatusBadge></td>
          <td><strong>{company.audienceScore || 0}/100</strong><small>{company.audienceTier || "unscored"}</small></td>
          <td><strong>{company.contactCount || 0}</strong><small>connected people</small></td>
          <td>{company.updatedAt ? new Date(company.updatedAt).toLocaleDateString() : "—"}</td>
        </tr>)}</tbody>
      </table>
    </div> : <section className="company-empty"><h2>No companies match this view</h2><p>Build account records from company names already in your CRM, or discover new evidence-backed organizations.</p><div><Button loading={canonicalizing} variant="outline" onClick={() => buildFromContacts(false)}>Preview companies from contacts</Button><Button onClick={() => navigate("/discovery/companies")}>Open Company Discovery</Button></div></section>}

    {pagination.pages > 1 ? <nav className="company-pagination" aria-label="Company pages"><Button variant="outline" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</Button><span>Page {pagination.page} of {pagination.pages}</span><Button variant="outline" disabled={page >= pagination.pages} onClick={() => setPage((value) => value + 1)}>Next</Button></nav> : null}

    <Drawer isOpen={Boolean(routeCompanyId)} onClose={closeCompany} title={organization?.name || "Company"} description={[organization?.industry, organization?.location].filter(Boolean).join(" · ")} size="wide">
      {detailLoading ? <p>Loading company…</p> : organization ? <div className="company-workspace">
        <header className="company-workspace__summary"><div><span>{organization.name.slice(0, 1).toUpperCase()}</span><div><strong>{organization.name}</strong><small>{organization.domain || "Domain missing"}</small></div></div><div><StatusBadge tone={priorityTone(organization)}>{organization.priorityTier || "cold"} priority</StatusBadge>{organization.website ? <a className="btn btn--outline btn--sm" href={organization.website} target="_blank" rel="noreferrer">Visit website ↗</a> : null}</div></header>
        <Tabs label="Company record sections" activeId={detailTab} onChange={setDetailTab} items={[{ id: "overview", label: "Overview" }, { id: "activity", label: "Activity" }, { id: "contacts", label: "Contacts", count: detail.contacts?.length || 0 }, { id: "research", label: "Research" }, { id: "relationships", label: "Relationships", count: detail.relationships?.length || 0 }]} />
        {detailTab === "overview" ? <section className="company-overview-grid">
          <div><span>Recommended focus</span><strong>{organization.priorityReasons?.[0] || "Review company fit and identify the next relationship action."}</strong><p>{organization.priorityScore || 0}/100 priority score</p></div>
          <div><span>Audience fit</span><strong>{organization.audienceScore || 0}/100 · {organization.audienceTier || "unscored"}</strong><p>{organization.scoreReasons?.[0] || "No audience explanation recorded"}</p></div>
          <div><span>Company profile</span><strong>{organization.employeeCount ? `${organization.employeeCount.toLocaleString()} employees` : "Size missing"}</strong><p>{organization.industry || "Industry missing"} · {organization.location || "Location missing"}</p></div>
          <div className="span-2"><span>Description</span><p>{organization.description || "No company description has been researched yet."}</p></div>
        </section> : null}
        {detailTab === "activity" ? <ActivityTimeline organizationId={organization._id} /> : null}
        {detailTab === "contacts" ? <section className="company-contact-list">{detail.contacts?.length ? detail.contacts.map((contact) => <button type="button" key={contact._id} onClick={() => navigate(`/crm/contacts/${contact._id}`)}><span>{contact.name.slice(0, 1).toUpperCase()}</span><span><strong>{contact.name}</strong><small>{contact.title || "Role missing"} · {contact.email || "No email"}</small></span><StatusBadge tone={contact.emailStatus === "verified" ? "success" : "warning"}>{contact.emailStatus || "needs review"}</StatusBadge></button>) : <p>No CRM contacts are linked to this company yet.</p>}</section> : null}
        {detailTab === "research" ? <section className="company-research"><dl><div><dt>Source</dt><dd>{organization.source}</dd></div><div><dt>Last verified</dt><dd>{organization.lastResearchVerifiedAt ? new Date(organization.lastResearchVerifiedAt).toLocaleString() : "Not recorded"}</dd></div><div><dt>LinkedIn</dt><dd>{organization.linkedinUrl ? <a href={organization.linkedinUrl} target="_blank" rel="noreferrer">Open company profile ↗</a> : "Not recorded"}</dd></div><div><dt>Phone</dt><dd>{organization.phone || "Not recorded"}</dd></div><div><dt>Founded</dt><dd>{organization.founded || "Not recorded"}</dd></div><div><dt>Keywords</dt><dd>{organization.keywords?.length ? organization.keywords.join(", ") : "None recorded"}</dd></div></dl><div className="company-evidence"><strong>Research evidence</strong>{organization.researchEvidence?.length ? organization.researchEvidence.map((evidence, index) => <article key={`${evidence.sourceUrl}-${index}`}><span>{evidence.field || evidence.sourceType}</span><strong>{evidence.observedValue}</strong>{evidence.sourceUrl ? <a href={evidence.sourceUrl} target="_blank" rel="noreferrer">Source ↗</a> : null}</article>) : <p>No field-level evidence has been recorded.</p>}</div></section> : null}
        {detailTab === "relationships" ? <section className="company-relationships">{detail.relationships?.length ? detail.relationships.map((relationship) => <article key={relationship._id}><div><strong>{relationship.audienceId?.name || "Audience"}</strong><span>{relationship.relationshipType || "prospect"}</span></div><StatusBadge tone={["customer", "partner", "qualified"].includes(relationship.status) ? "success" : "draft"}>{relationship.status}</StatusBadge><p>{relationship.notes || "No relationship notes."}</p><small>Changed {new Date(relationship.lastChangedAt || relationship.updatedAt).toLocaleDateString()}</small></article>) : <p>No audience relationships are recorded.</p>}</section> : null}
      </div> : null}
    </Drawer>
  </div>;
}
