import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import {
  fetchPublicApplication,
  submitPublicApplication,
} from "../services/api.js";
import { PublicLayout } from "./PublicSite.jsx";
import useWorkspaceTheme from "../context/useWorkspaceTheme.js";
import "./PublicApplication.css";

const initial = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  coachingProgramId: "",
  investingExperience: "",
  currentSituation: "",
  goals: "",
  desiredStartTimeline: "",
  message: "",
  smsConsent: false,
  marketingEmailConsent: false,
  privacyTermsAccepted: false,
};
const legacyHeading = "Apply for coaching";
const legacyIntro = "Tell us where you are and where you want to go.";

export default function PublicApplication() {
  const location = useLocation();
  const { code } = useParams();
  const { site } = useWorkspaceTheme();
  const [config, setConfig] = useState(null);
  const [form, setForm] = useState(initial);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [saving, setSaving] = useState(false);
  const attribution = useMemo(() => {
    const query = new URLSearchParams(location.search);
    return {
      referralCode: query.get("ref") || code || "",
      trackedLinkToken: query.get("go_link") || "",
      utm: {
        source: query.get("utm_source") || "",
        medium: query.get("utm_medium") || "",
        campaign: query.get("utm_campaign") || "",
        content: query.get("utm_content") || "",
        term: query.get("utm_term") || "",
      },
    };
  }, [location.search, code]);

  useEffect(() => {
    const timer = window.setTimeout(
      () =>
        fetchPublicApplication()
          .then((data) => {
            setConfig(data);
            const selected = new URLSearchParams(location.search).get(
              "program",
            );
            const matched = data.programs?.find(
              (program) =>
                String(program.id) === selected || program.slug === selected,
            );
            if (matched || data.programs?.length === 1)
              setForm((value) => ({
                ...value,
                coachingProgramId: matched?.id || data.programs[0].id,
              }));
          })
          .catch(() => setError("The application is temporarily unavailable.")),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [location.search]);

  const set = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event) => {
    event.preventDefault();
    setError("");
    try {
      setSaving(true);
      const idempotencyKey =
        window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
      const result = await submitPublicApplication({
        ...form,
        ...attribution,
        idempotencyKey,
      });
      setDone(result.data.message);
    } catch (requestError) {
      setError(
        requestError.response?.data?.error ||
          "We could not submit the application. Please review the form and try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const heading =
    !config?.heading || config.heading === legacyHeading
      ? "Apply to Join a Program"
      : config.heading;
  const intro =
    !config?.intro || config.intro === legacyIntro
      ? "Choose the program that fits your goals and tell us a little about where you are today."
      : config.intro;
  const heroLogo =
    site?.branding?.publicSiteLogoUrl ||
    (site?.workspace?.slug === "ellie" ? "/elliescoachinglogo.png" : "");

  return (
    <PublicLayout>
      <main className="application-page">
        <section className="application-hero">
          <div className="application-hero__copy">
            <p className="public-kicker">Program application</p>
            <h1>{heading}</h1>
            <p className="public-lead">{intro}</p>
          </div>
          {heroLogo ? (
            <div className="application-hero__logo">
              <img
                src={heroLogo}
                alt={site?.branding?.publicSiteName || "Ellie Coaching"}
              />
            </div>
          ) : null}
        </section>
        {done ? (
          <section className="application-success">
            <h2>Application received</h2>
            <p>{done}</p>
            {config?.nextStepCta?.url ? (
              <a className="public-button" href={config.nextStepCta.url}>
                {config.nextStepCta.label || "Next step"}
              </a>
            ) : null}
          </section>
        ) : config?.enabled === false ? (
          <p className="public-empty">
            Program applications are not currently open.
          </p>
        ) : (
          <form onSubmit={submit}>
            <div className="application-grid">
              <label>
                First name
                <input
                  required
                  autoComplete="given-name"
                  value={form.firstName}
                  onChange={(event) => set("firstName", event.target.value)}
                />
              </label>
              <label>
                Last name
                <input
                  required
                  autoComplete="family-name"
                  value={form.lastName}
                  onChange={(event) => set("lastName", event.target.value)}
                />
              </label>
              <label>
                Email
                <input
                  required
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={(event) => set("email", event.target.value)}
                />
              </label>
              <label>
                Phone
                <input
                  type="tel"
                  autoComplete="tel"
                  value={form.phone}
                  onChange={(event) => set("phone", event.target.value)}
                />
              </label>
              <label className="wide">
                Choose a program
                <select
                  required
                  value={form.coachingProgramId}
                  onChange={(event) =>
                    set("coachingProgramId", event.target.value)
                  }
                >
                  <option value="">Select a program</option>
                  {config?.programs?.map((row) => (
                    <option value={row.id} key={row.id}>
                      {row.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="wide">
                {config?.questionLabels?.investingExperience ||
                  "Investing experience"}
                <textarea
                  value={form.investingExperience}
                  onChange={(event) =>
                    set("investingExperience", event.target.value)
                  }
                />
              </label>
              <label className="wide">
                {config?.questionLabels?.currentSituation ||
                  "Current situation"}
                <textarea
                  value={form.currentSituation}
                  onChange={(event) =>
                    set("currentSituation", event.target.value)
                  }
                />
              </label>
              <label className="wide">
                {config?.questionLabels?.goals || "Goals"}
                <textarea
                  value={form.goals}
                  onChange={(event) => set("goals", event.target.value)}
                />
              </label>
              <label>
                {config?.questionLabels?.desiredStartTimeline ||
                  "Desired start timeline"}
                {config?.timelineOptions?.length ? (
                  <select
                    value={form.desiredStartTimeline}
                    onChange={(event) =>
                      set("desiredStartTimeline", event.target.value)
                    }
                  >
                    <option value="">Select</option>
                    {config.timelineOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={form.desiredStartTimeline}
                    onChange={(event) =>
                      set("desiredStartTimeline", event.target.value)
                    }
                  />
                )}
              </label>
              <label className="wide">
                {config?.questionLabels?.message ||
                  "Anything else we should know?"}
                <textarea
                  value={form.message}
                  onChange={(event) => set("message", event.target.value)}
                />
              </label>
            </div>
            <div className="application-consent">
              <label>
                <input
                  type="checkbox"
                  checked={form.smsConsent}
                  onChange={(event) => set("smsConsent", event.target.checked)}
                />
                I agree to receive program-application text messages. Message
                and data rates may apply. Reply STOP to opt out.
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={form.marketingEmailConsent}
                  onChange={(event) =>
                    set("marketingEmailConsent", event.target.checked)
                  }
                />
                I would like to receive Ellie Coaching news and program updates
                by email.
              </label>
              <label>
                <input
                  required
                  type="checkbox"
                  checked={form.privacyTermsAccepted}
                  onChange={(event) =>
                    set("privacyTermsAccepted", event.target.checked)
                  }
                />
                I acknowledge the{" "}
                <a href={config?.privacyUrl || "/privacy"}>Privacy Policy</a>{" "}
                and <a href={config?.termsUrl || "/terms"}>Terms</a>.
              </label>
            </div>
            {error ? <p className="application-error">{error}</p> : null}
            <button
              className="public-button"
              disabled={saving || !config?.programs?.length}
            >
              {saving ? "Submitting…" : "Submit program application"}
            </button>
          </form>
        )}
      </main>
    </PublicLayout>
  );
}
