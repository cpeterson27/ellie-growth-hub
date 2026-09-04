import { useEffect, useState } from "react";
import {
  FiAward,
  FiHome,
  FiLayers,
  FiMessageSquare,
  FiUsers,
} from "react-icons/fi";
import PublicSiteAdmin from "./PublicSiteAdmin.jsx";
import ProgramWebsiteSettings from "./ProgramWebsiteSettings.jsx";
import TestimonialManager from "./TestimonialManager.jsx";
import {
  fetchCoachingPrograms,
  fetchManagedProfiles,
  fetchManagedTestimonials,
  fetchPublicManagementConfig,
  updatePublicManagementConfig,
} from "../services/api.js";
import { publicSiteUrl } from "../utils/publicSiteUrl.js";
import "./WebsiteManagement.css";

const sections = [
  ["overview", "Overview"],
  ["website", "Website"],
  ["programs", "Programs"],
  ["team", "Team"],
  ["testimonials", "Testimonials"],
  ["results", "Results"],
];
const hashFor = (section) => `#website-${section}`;

export default function WebsiteBrandManager({ websiteUrl }) {
  const readSection = () =>
    sections.some(([key]) => hashFor(key) === window.location.hash)
      ? window.location.hash.replace("#website-", "")
      : "overview";
  const [active, setActive] = useState(readSection),
    [data, setData] = useState(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [saving, setSaving] = useState(false);
  const load = () =>
    Promise.all([
      fetchPublicManagementConfig(),
      fetchCoachingPrograms({ limit: 200 }),
      fetchManagedProfiles(),
      fetchManagedTestimonials(),
    ])
      .then(([config, programs, profiles, testimonials]) =>
        setData({ config, programs, profiles, testimonials }),
      )
      .catch((err) =>
        setError(err.response?.data?.error || "Unable to load website status."),
      );
  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    const changed = () => setActive(readSection());
    window.addEventListener("hashchange", changed);
    window.addEventListener("popstate", changed);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("hashchange", changed);
      window.removeEventListener("popstate", changed);
    };
  }, []);
  const navigate = (section) => {
    if (window.location.hash !== hashFor(section))
      window.history.pushState(null, "", hashFor(section));
    setActive(section);
  };
  const resultsVisible =
    data?.config?.publicSite?.sectionVisibility?.results === true;
  const setResultsVisible = async (visible) => {
    try {
      setSaving(true);
      const next = {
        ...data.config,
        publicSite: {
          ...data.config.publicSite,
          sectionVisibility: {
            ...data.config.publicSite.sectionVisibility,
            results: visible,
          },
        },
      };
      const config = await updatePublicManagementConfig(next);
      setData((current) => ({ ...current, config }));
      setError("");
      setMessage("Results visibility saved successfully.");
    } catch (err) {
      setError(
        err.response?.data?.error || "Unable to update Results visibility.",
      );
    } finally {
      setSaving(false);
    }
  };
  const counts = data
    ? {
        programsPublished: data.programs.filter(
          (row) =>
            row.status === "active" &&
            row.publicPresentation?.status === "published",
        ).length,
        programsHidden: data.programs.filter(
          (row) =>
            !(
              row.status === "active" &&
              row.publicPresentation?.status === "published"
            ),
        ).length,
        teamPublished: data.profiles.filter((row) => row.status === "published")
          .length,
        teamDraft: data.profiles.filter((row) => row.status !== "published")
          .length,
        testimonials: data.testimonials.filter(
          (row) => row.status === "approved",
        ).length,
      }
    : null;
  const publicUrl = publicSiteUrl(websiteUrl);
  return (
    <div className="website-brand-manager">
      <header className="website-brand-header">
        <div>
          <p className="page-eyebrow">Public experience</p>
          <h2>Website &amp; Brand</h2>
          <p>
            Manage what visitors see on{" "}
            {data?.config?.branding?.publicSiteName || "your website"}.
          </p>
        </div>
        <div className="website-brand-header__actions">
          <a
            className="website-preview-action"
            href={publicUrl}
            target="_blank"
            rel="noreferrer"
          >
            Preview
          </a>
          <a
            className="website-live-action"
            href={publicUrl}
            target="_blank"
            rel="noreferrer"
          >
            View Live Website ↗
          </a>
        </div>
      </header>
      <nav
        className="website-brand-tabs"
        aria-label="Website and Brand sections"
        role="tablist"
      >
        {sections.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={active === key}
            className={active === key ? "is-active" : ""}
            onClick={() => navigate(key)}
          >
            {label}
          </button>
        ))}
      </nav>
      {error ? (
        <p className="form-error website-brand-message">{error}</p>
      ) : null}
      {message ? <p className="website-brand-message">{message}</p> : null}
      {active === "overview" ? (
        <div className="website-brand-overview">
          <section className="website-status-panel">
            <div className="website-section-heading">
              <div>
                <span>Website status</span>
                <h3>What’s live now</h3>
              </div>
              <small>
                {data?.config?.publicSite?.published === false
                  ? "Website hidden"
                  : "Website live"}
              </small>
            </div>
            <div className="website-status-grid">
              <button onClick={() => navigate("website")}>
                <FiHome />
                <span>
                  <strong>Website</strong>
                  <small>
                    {data?.config?.publicSite?.published === false
                      ? "Hidden"
                      : "Live"}
                  </small>
                </span>
              </button>
              <button onClick={() => navigate("programs")}>
                <FiLayers />
                <span>
                  <strong>Programs</strong>
                  <small>
                    {counts
                      ? `${counts.programsPublished} published · ${counts.programsHidden} hidden`
                      : "Loading…"}
                  </small>
                </span>
              </button>
              <button onClick={() => navigate("team")}>
                <FiUsers />
                <span>
                  <strong>Team</strong>
                  <small>
                    {counts
                      ? `${counts.teamPublished} published · ${counts.teamDraft} draft`
                      : "Loading…"}
                  </small>
                </span>
              </button>
              <button onClick={() => navigate("testimonials")}>
                <FiMessageSquare />
                <span>
                  <strong>Testimonials</strong>
                  <small>
                    {counts ? `${counts.testimonials} published` : "Loading…"}
                  </small>
                </span>
              </button>
              <button onClick={() => navigate("results")}>
                <FiAward />
                <span>
                  <strong>Results page</strong>
                  <small>{resultsVisible ? "Shown" : "Hidden"}</small>
                </span>
              </button>
            </div>
          </section>
          <section className="website-management-cards">
            <article>
              <FiHome />
              <div>
                <h3>Website settings</h3>
                <p>
                  Branding, homepage content, navigation and visible sections.
                </p>
              </div>
              <button onClick={() => navigate("website")}>
                Manage website
              </button>
            </article>
            <article>
              <FiLayers />
              <div>
                <h3>Programs</h3>
                <p>Control which coaching programs appear publicly.</p>
              </div>
              <button onClick={() => navigate("programs")}>
                Manage programs
              </button>
            </article>
            <article>
              <FiUsers />
              <div>
                <h3>Team &amp; Coaches</h3>
                <p>Choose which coaches appear on the website.</p>
              </div>
              <button onClick={() => navigate("team")}>Manage team</button>
            </article>
            <article>
              <FiMessageSquare />
              <div>
                <h3>Testimonials</h3>
                <p>Add and manage client stories.</p>
              </div>
              <button onClick={() => navigate("testimonials")}>
                Manage testimonials
              </button>
            </article>
            <article>
              <FiAward />
              <div>
                <h3>Results</h3>
                <p>
                  {resultsVisible
                    ? "Currently shown on the public website."
                    : "Currently hidden until the Results page is ready."}
                </p>
              </div>
              <button onClick={() => navigate("results")}>
                Manage results
              </button>
            </article>
          </section>
        </div>
      ) : null}
      {active === "website" ? <PublicSiteAdmin section="website" /> : null}
      {active === "programs" ? (
        <ProgramWebsiteSettings websiteUrl={publicUrl} onChange={load} />
      ) : null}
      {active === "team" ? <PublicSiteAdmin section="team" /> : null}
      {active === "testimonials" ? <TestimonialManager /> : null}
      {active === "results" ? (
        <section className="website-focused-panel results-manager">
          <div>
            <p className="page-eyebrow">Public visibility</p>
            <h3>Results page</h3>
            <p>Keep this hidden until the Results page is ready.</p>
          </div>
          <label>
            <input
              type="checkbox"
              checked={resultsVisible}
              disabled={!data || saving}
              onChange={(event) => setResultsVisible(event.target.checked)}
            />
            <span>
              <strong>Show Results page</strong>
              <small>
                {resultsVisible
                  ? "Visitors can see Results in public navigation."
                  : "Results remains private."}
              </small>
            </span>
          </label>
        </section>
      ) : null}
    </div>
  );
}
