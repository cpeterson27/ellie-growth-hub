import { useEffect, useState } from "react";
import {
  createSocialContactLabel,
  fetchSocialContactLabels,
} from "../services/api.js";
import "./SocialAutomationFields.css";

export function CampaignSelect({ campaigns, value, onChange }) {
  return (
    <label>
      Campaign (optional)
      <select value={value || ""} onChange={(event) => onChange(event.target.value)}>
        <option value="">No campaign</option>
        {campaigns.map((campaign) => (
          <option key={campaign._id} value={campaign._id}>
            {campaign.programName || campaign.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ContactLabelsControl({ value = [], onChange, onError }) {
  const [labels, setLabels] = useState([]);
  const [newLabel, setNewLabel] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    fetchSocialContactLabels()
      .then((items) => {
        if (active) setLabels(Array.isArray(items) ? items : []);
      })
      .catch(() => onError?.("Contact labels could not be loaded."));
    return () => {
      active = false;
    };
  }, [onError]);

  const add = (label) => {
    if (!label || value.some((item) => item.toLocaleLowerCase() === label.toLocaleLowerCase())) return;
    onChange([...value, label]);
  };

  const create = async () => {
    const label = newLabel.trim().replace(/\s+/g, " ");
    if (!label || saving) return;
    setSaving(true);
    try {
      const saved = await createSocialContactLabel(label);
      setLabels((current) =>
        current.some((item) => item.toLocaleLowerCase() === saved.toLocaleLowerCase())
          ? current
          : [...current, saved].sort((a, b) => a.localeCompare(b)),
      );
      add(saved);
      setNewLabel("");
    } catch (error) {
      onError?.(error.response?.data?.error || "Contact label could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <fieldset className="contact-label-picker">
      <legend>Contact labels <span>(optional)</span></legend>
      <small>These labels are added to the Contact without removing existing labels.</small>
      {value.length ? (
        <div className="contact-label-chips" aria-label="Selected contact labels">
          {value.map((label) => (
            <span key={label.toLocaleLowerCase()}>
              {label}
              <button type="button" aria-label={`Remove ${label}`} onClick={() => onChange(value.filter((item) => item !== label))}>×</button>
            </span>
          ))}
        </div>
      ) : null}
      <label>
        Select an existing label
        <select value="" onChange={(event) => add(event.target.value)}>
          <option value="">Choose a label…</option>
          {labels.filter((label) => !value.some((item) => item.toLocaleLowerCase() === label.toLocaleLowerCase())).map((label) => (
            <option key={label} value={label}>{label}</option>
          ))}
        </select>
      </label>
      <div className="contact-label-create">
        <label>
          Create a new label
          <input value={newLabel} maxLength="80" placeholder="Freedom Lead" onChange={(event) => setNewLabel(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); create(); } }} />
        </label>
        <button type="button" className="add-label-button" disabled={saving || !newLabel.trim()} onClick={create}>Add label</button>
      </div>
    </fieldset>
  );
}
