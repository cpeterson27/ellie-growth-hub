import { useEffect, useMemo, useState } from "react";
import Button from "./Button.jsx";
import Modal from "./Modal.jsx";
import { fetchContentBriefs } from "../services/api.js";
import "./CampaignModal.css";

const EVENT_TEMPLATES = [
  { key: "event_investor", name: "Investor invitation", description: "A direct invitation for qualified real-estate investors." },
  { key: "event_operator", name: "Operator invitation", description: "For property managers, operators, and multifamily leaders." },
  { key: "event_partner", name: "Partner invitation", description: "For affiliates and referral partners who can share the event." },
];

const PROGRAM_TEMPLATES = [
  { key: "program_enrollment", name: "$15k program enrollment", description: "A premium, outcome-led invitation for qualified buyers." },
  { key: "program_operator", name: "Established operator enrollment", description: "For experienced operators who are a strong fit for your $15k program." },
  { key: "program_partner", name: "Program partner referral", description: "For affiliates and strategic partners who can refer ideal buyers." },
];

const PROGRAM_AUDIENCES = [
  "High-ticket program buyers",
  "Experienced real-estate operators",
  "Skool community candidates",
  "Affiliate and referral partners",
];

const createEmptyForm = (campaignKind = "event") => ({
  name: "",
  campaignKind,
  programName: "",
  startDate: "",
  ticketPrice: "",
  ticketGoal: "",
  audience: [],
  description: "",
  templateKey: campaignKind === "program" ? PROGRAM_TEMPLATES[0].key : EVENT_TEMPLATES[0].key,
});

export default function CampaignModal({
  isOpen,
  onClose,
  onSubmit,
  audienceOptions = [],
  initialData = null,
  submitting = false,
  defaultCampaignKind = "event",
}) {
  const [form, setForm] = useState(() => createEmptyForm(defaultCampaignKind));
  const [error, setError] = useState("");
  const [savedTemplates, setSavedTemplates] = useState([]);

  const templateOptions = useMemo(
    () => (form.campaignKind === "program" ? PROGRAM_TEMPLATES : EVENT_TEMPLATES),
    [form.campaignKind],
  );
  const availableAudiences = form.campaignKind === "program"
    ? [...new Set([...PROGRAM_AUDIENCES, ...audienceOptions])]
    : audienceOptions;

  useEffect(() => {
    if (!isOpen) return;

    if (initialData) {
      const campaignKind = initialData.campaignKind || "event";
      const choices = campaignKind === "program" ? PROGRAM_TEMPLATES : EVENT_TEMPLATES;
      setForm({
        name: initialData.name || "",
        campaignKind,
        programName: initialData.programName || "",
        startDate: initialData.startDate ? initialData.startDate.split("T")[0] : "",
        ticketPrice: initialData.ticketPrice ?? "",
        ticketGoal: initialData.ticketGoal ?? "",
        audience: initialData.audience || [],
        description: initialData.description || "",
        templateKey: initialData.templateKey || choices[0].key,
      });
    } else {
      setForm(createEmptyForm(defaultCampaignKind));
    }
    setError("");
  }, [isOpen, initialData, defaultCampaignKind]);

  useEffect(() => {
    if (!isOpen) return;
    fetchContentBriefs("email_template")
      .then((response) => setSavedTemplates(response.data || []))
      .catch(() => setSavedTemplates([]));
  }, [isOpen]);

  const handleChange = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
  };

  const setCampaignKind = (campaignKind) => {
    const choices = campaignKind === "program" ? PROGRAM_TEMPLATES : EVENT_TEMPLATES;
    setForm((current) => ({
      ...current,
      campaignKind,
      templateKey: choices[0].key,
      audience: [],
    }));
  };

  const toggleAudience = (value) => {
    setForm((current) => ({
      ...current,
      audience: current.audience.includes(value)
        ? current.audience.filter((item) => item !== value)
        : [...current.audience, value],
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    const isProgram = form.campaignKind === "program";

    if (!form.name || !form.audience.length || (!isProgram && (!form.startDate || !form.ticketPrice || !form.ticketGoal))) {
      setError(isProgram
        ? "Add a campaign name and at least one audience."
        : "Add the event details and at least one audience.");
      return;
    }

    try {
      await onSubmit({
        ...form,
        contentBriefId: form.templateKey.startsWith("content:") ? form.templateKey.slice("content:".length) : null,
        ticketPrice: Number(form.ticketPrice || 0),
        ticketGoal: Number(form.ticketGoal || 0),
      });
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Unable to save campaign");
    }
  };

  const selectedTemplate = templateOptions.find((template) => template.key === form.templateKey);
  const isProgram = form.campaignKind === "program";

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={initialData ? "Edit campaign" : "Create campaign"}
      footer={(
        <div className="campaign-modal__footer">
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button type="submit" form="campaign-form" variant="primary" loading={submitting}>
            {initialData ? "Save changes" : "Create campaign"}
          </Button>
        </div>
      )}
    >
      <form id="campaign-form" className="campaign-form" onSubmit={handleSubmit}>
        <p className="campaign-form__intro">Choose what you are promoting first. Ellie will attach the appropriate starting email template without changing any existing campaign content.</p>

        <div className="campaign-kind-picker" role="group" aria-label="Campaign type">
          <button type="button" className={form.campaignKind === "event" ? "is-selected" : ""} onClick={() => setCampaignKind("event")}>
            <span>Event campaign</span><small>Sell tickets or registrations</small>
          </button>
          <button type="button" className={form.campaignKind === "program" ? "is-selected" : ""} onClick={() => setCampaignKind("program")}>
            <span>Program campaign</span><small>Promote your premium $15k offer</small>
          </button>
        </div>

        <div className="campaign-form-grid">
          <div className="form-field span-2">
            <label htmlFor="campaign-name">Campaign name <span>*</span></label>
            <input id="campaign-name" type="text" placeholder={isProgram ? "e.g. Elite Operator Program — Fall Enrollment" : "e.g. Deal to Close Bootcamp — September"} value={form.name} onChange={handleChange("name")} />
          </div>

          {isProgram ? (
            <div className="form-field span-2">
              <label htmlFor="program-name">Program / offer name</label>
              <input id="program-name" type="text" placeholder="e.g. The $15k Real Estate Growth Program" value={form.programName} onChange={handleChange("programName")} />
            </div>
          ) : (
            <>
              <div className="form-field">
                <label htmlFor="campaign-start">Event date <span>*</span></label>
                <input id="campaign-start" type="date" value={form.startDate} onChange={handleChange("startDate")} />
              </div>
              <div className="form-field">
                <label htmlFor="campaign-price">Ticket price <span>*</span></label>
                <input id="campaign-price" type="number" min="0" step="0.01" placeholder="0.00" value={form.ticketPrice} onChange={handleChange("ticketPrice")} />
              </div>
              <div className="form-field">
                <label htmlFor="campaign-goal">Registration goal <span>*</span></label>
                <input id="campaign-goal" type="number" min="1" placeholder="100" value={form.ticketGoal} onChange={handleChange("ticketGoal")} />
              </div>
            </>
          )}

          <div className="form-field span-2">
            <label htmlFor="campaign-description">Campaign brief</label>
            <textarea id="campaign-description" rows="3" placeholder="What is the offer, why now, and what should the audience do next?" value={form.description} onChange={handleChange("description")} />
          </div>
        </div>

        <section className="campaign-template-panel" aria-labelledby="template-title">
          <div>
            <p className="eyebrow">Email starting point</p>
            <h4 id="template-title">Template for this audience</h4>
          </div>
          <div className="template-choice-list">
            {templateOptions.map((template) => (
              <label className={form.templateKey === template.key ? "template-choice is-selected" : "template-choice"} key={template.key}>
                <input type="radio" name="templateKey" value={template.key} checked={form.templateKey === template.key} onChange={handleChange("templateKey")} />
                <span><strong>{template.name}</strong><small>{template.description}</small></span>
              </label>
            ))}
            {savedTemplates.map((template) => (
              <label className={form.templateKey === `content:${template._id}` ? "template-choice is-selected" : "template-choice"} key={template._id}>
                <input type="radio" name="templateKey" value={`content:${template._id}`} checked={form.templateKey === `content:${template._id}`} onChange={handleChange("templateKey")} />
                <span><strong>{template.title}</strong><small>Saved Jarvis or AI Content email template</small></span>
              </label>
            ))}
          </div>
          {selectedTemplate ? <p className="template-help">Selected: {selectedTemplate.description}</p> : null}
        </section>

        <fieldset className="audience-panel">
          <legend>Target audience <span>*</span></legend>
          <p>Select the people this message is for. Contacts remain campaign-specific when you import or associate them.</p>
          <div className="audience-grid">
            {availableAudiences.map((option) => (
              <label key={option} className="audience-item">
                <input type="checkbox" checked={form.audience.includes(option)} onChange={() => toggleAudience(option)} />
                <span>{option}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {error ? <p className="form-error" role="alert">{error}</p> : null}
      </form>
    </Modal>
  );
}
