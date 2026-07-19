import DashboardCard from "../components/DashboardCard.jsx";
import Button from "../components/Button.jsx";

const campaigns = [
  {
    title: "Social Launch Plan",
    summary:
      "Craft high-converting posts and partner messaging for the next cycle.",
  },
  {
    title: "Email Conversion Flow",
    summary: "Build a multi-stage nurture sequence for registrants and leads.",
  },
  {
    title: "Content Briefs",
    summary: "Turn event outcomes into owned articles and social assets.",
  },
];

export default function Marketing() {
  return (
    <div className="page-dashboard">
      <div
        className="page-header"
        style={{ justifyContent: "space-between", alignItems: "center" }}
      >
        <div>
          <h1 className="page-title">Marketing</h1>
          <p className="page-subtitle">
            Plan campaigns, content, and outreach from a single hub.
          </p>
        </div>
        <Button variant="primary">Launch Marketing Plan</Button>
      </div>

      <section className="section-grid" style={{ marginTop: "1.5rem" }}>
        {campaigns.map((item) => (
          <DashboardCard
            key={item.title}
            title={item.title}
            action={
              <Button variant="outline" size="sm">
                Edit
              </Button>
            }
          >
            <p>{item.summary}</p>
          </DashboardCard>
        ))}
      </section>
    </div>
  );
}
