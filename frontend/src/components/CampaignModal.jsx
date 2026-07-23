import { useEffect, useState } from "react";
import Modal from "./Modal.jsx";
import "./CampaignModal.css";

const emptyForm = {
  name: "",
  startDate: "",
  ticketPrice: "",
  ticketGoal: "",
  audience: [],
  description: "",
};

export default function CampaignModal({
  isOpen,
  onClose,
  onSubmit,
  audienceOptions = [],
  initialData = null,
  submitting = false,
}) {
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen) return;

    if (initialData) {
      setForm({
        name: initialData.name || "",
        startDate: initialData.startDate
          ? initialData.startDate.split("T")[0]
          : "",
        ticketPrice:
          initialData.ticketPrice ?? "",
        ticketGoal:
          initialData.ticketGoal ?? "",
        audience:
          initialData.audience || [],
        description:
          initialData.description || "",
      });
    } else {
      setForm(emptyForm);
    }

    setError("");

  }, [isOpen, initialData]);


  const handleChange = (field) => (event) => {
    setForm((current) => ({
      ...current,
      [field]: event.target.value,
    }));
  };


  const toggleAudience = (value) => {
    setForm((current) => ({
      ...current,
      audience: current.audience.includes(value)
        ? current.audience.filter(
            (item) => item !== value
          )
        : [
            ...current.audience,
            value,
          ],
    }));
  };


  const handleSubmit = async (event) => {
    event.preventDefault();

    setError("");

    if (
      !form.name ||
      !form.startDate ||
      !form.ticketPrice ||
      !form.ticketGoal ||
      form.audience.length === 0
    ) {
      setError(
        "Please complete all required fields."
      );
      return;
    }


    try {
      await onSubmit({
        ...form,
        ticketPrice: Number(form.ticketPrice),
        ticketGoal: Number(form.ticketGoal),
      });

    } catch (err) {

      setError(
        err.response?.data?.error ||
        err.message ||
        "Unable to save campaign"
      );

    }
  };


  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        initialData
          ? "Edit Campaign"
          : "Create Campaign"
      }
    >

      <form
        className="campaign-form"
        onSubmit={handleSubmit}
      >

        <label>
          Campaign Name

          <input
            type="text"
            value={form.name}
            onChange={handleChange("name")}
          />

        </label>


        <label>
          Start Date

          <input
            type="date"
            value={form.startDate}
            onChange={handleChange("startDate")}
          />

        </label>


        <label>
          Ticket Price

          <input
            type="number"
            min="0"
            step="0.01"
            value={form.ticketPrice}
            onChange={handleChange("ticketPrice")}
          />

        </label>


        <label>
          Ticket Goal

          <input
            type="number"
            min="1"
            value={form.ticketGoal}
            onChange={handleChange("ticketGoal")}
          />

        </label>


        <label>
          Description

          <textarea
            rows="3"
            value={form.description}
            onChange={handleChange("description")}
          />

        </label>


        <fieldset>

          <legend>
            Audience
          </legend>


          {audienceOptions.map((option) => (

            <label
              key={option}
              className="checkbox-row"
            >

              <input
                type="checkbox"
                checked={
                  form.audience.includes(option)
                }
                onChange={() =>
                  toggleAudience(option)
                }
              />

              {option}

            </label>

          ))}

        </fieldset>


        {error && (
          <p className="form-error">
            {error}
          </p>
        )}


        <button
          type="submit"
          className="btn btn--primary"
          disabled={submitting}
        >
          {submitting
            ? "Saving..."
            : initialData
              ? "Save Changes"
              : "Create Campaign"}
        </button>


      </form>

    </Modal>
  );
}