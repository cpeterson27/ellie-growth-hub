import { useState } from "react";
import { FiEdit2 } from "react-icons/fi";
import DashboardCard from "../components/DashboardCard.jsx";
import Button from "../components/Button.jsx";
import Modal from "../components/Modal.jsx";

const briefs = [
  {
    title: "Email drip campaign",
    detail: "Target pre-launch attendees with onboarding copy.",
  },
  {
    title: "Social post series",
    detail: "Share event highlights and partner shoutouts.",
  },
  {
    title: "Landing page update",
    detail: "Refresh hero messaging for conversions.",
  },
];

export default function Content() {
  const [isOpen, setOpen] = useState(false);

  return (
    <div className="page-dashboard">
      <div
        className="page-header"
        style={{ justifyContent: "space-between", alignItems: "center" }}
      >
        <div>
          <h1 className="page-title">AI Content</h1>
          <p className="page-subtitle">
            Generate marketing copy, emails, and event assets faster.
          </p>
        </div>
        <Button variant="primary" onClick={() => setOpen(true)}>
          Create AI Brief
        </Button>
      </div>

      <section className="section-grid" style={{ marginTop: "1.5rem" }}>
        {briefs.map((item) => (
          <DashboardCard
            key={item.title}
            title={item.title}
            action={<FiEdit2 />}
          >
            <p>{item.detail}</p>
          </DashboardCard>
        ))}
      </section>

      <Modal
        isOpen={isOpen}
        onClose={() => setOpen(false)}
        title="Create Campaign Brief"
        footer={
          <Button variant="primary" onClick={() => setOpen(false)}>
            Save brief
          </Button>
        }
      >
        <p>
          Use Ellie's AI engine to generate email sequences, social copy, and
          follow-up templates.
        </p>
      </Modal>
    </div>
  );
}
