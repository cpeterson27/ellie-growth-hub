import Button from "./Button.jsx";

function duration(minutes = 0) {
  if (!minutes) return "Not provided";
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return [hours ? `${hours} hr` : "", remainder ? `${remainder} min` : ""]
    .filter(Boolean)
    .join(" ");
}

function policyLabel(policy = {}) {
  return (
    policy.refund_policy ||
    policy.name ||
    policy.refund_method ||
    (Object.keys(policy).length ? "Policy available" : "Managed in Eventbrite")
  );
}

function EmptyField({ children }) {
  return <p className="event-empty-field">{children}</p>;
}

function ticketStatus(ticket = {}) {
  if (ticket.salesStatus) return ticket.salesStatus;
  if (ticket.hidden) return "Hidden";
  if (Number(ticket.quantityTotal || 0) > 0 && Number(ticket.quantitySold || 0) >= Number(ticket.quantityTotal || 0)) return "Sold out";
  const now = Date.now();
  if (ticket.salesStart && now < new Date(ticket.salesStart).getTime()) return "Scheduled";
  if (ticket.salesEnd && now > new Date(ticket.salesEnd).getTime()) return "Sales ended";
  return "On sale";
}

function formattedModule(html = "") {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;color:#404844;font:14px/1.65 Arial,sans-serif}
    h1,h2,h3{color:#17221f;line-height:1.25;margin:1em 0 .45em}
    p{margin:.55em 0} ul,ol{padding-left:1.35rem} a{color:#176b54}
    img{max-width:100%;height:auto}
  </style></head><body>${html}</body></html>`;
}

export default function EventbriteListingDetails({ event }) {
  const listing = event.eventbriteListing || {};
  const logistics = event.eventbriteLogistics || {};
  const modules = listing.structuredContent?.modules || [];
  const tickets = logistics.ticketClasses || [];
  const editUrl =
    listing.onlineAccess?.organizerEditUrl ||
    event.integrations?.eventbrite?.url;

  return (
    <div className="event-listing-details">
      <header className="event-listing-header">
        {listing.image?.url ? (
          <img
            src={listing.image.url}
            alt={`${event.name} Eventbrite listing`}
          />
        ) : (
          <div className="event-listing-image-placeholder">
            Event image not exposed by Eventbrite
          </div>
        )}
        <div>
          <p className="events-eyebrow">Live Eventbrite information</p>
          <h2>{event.name}</h2>
          <p>
            {listing.summary || "No short summary was returned by Eventbrite."}
          </p>
          <div className="event-listing-badges">
            <span>
              {listing.format?.name ||
                (event.locationType === "online" ? "Online" : "In person")}
            </span>
            <span>{duration(listing.durationMinutes)}</span>
            <span>{listing.category?.name || "Category not provided"}</span>
          </div>
        </div>
      </header>

      <section className="event-detail-section">
        <div className="event-detail-heading">
          <div>
            <p className="events-eyebrow">Overview</p>
            <h3>Formatted event content</h3>
          </div>
          <span>
            Structured content v{listing.structuredContent?.version || "—"}
          </span>
        </div>
        {modules.length ? (
          <div className="event-content-modules">
            {modules.map((module) => (
              <article key={module.id}>
                {module.imageUrl ? <img src={module.imageUrl} alt="" /> : null}
                {module.textHtml ? (
                  <iframe
                    className="event-module-frame"
                    title={`Formatted Eventbrite ${module.type} content`}
                    srcDoc={formattedModule(module.textHtml)}
                    sandbox=""
                  />
                ) : module.text ? (
                  <div className="event-module-text">{module.text}</div>
                ) : null}
                {module.videoUrl ? (
                  <a href={module.videoUrl} target="_blank" rel="noreferrer">
                    View embedded video
                  </a>
                ) : null}
              </article>
            ))}
          </div>
        ) : listing.descriptionText || event.description ? (
          <div className="event-long-copy">
            {listing.descriptionText || event.description}
          </div>
        ) : (
          <EmptyField>
            Eventbrite did not return the modern description modules for this
            listing.
          </EmptyField>
        )}
      </section>

      <div className="event-detail-columns">
        <section className="event-detail-section">
          <p className="events-eyebrow">Agenda</p>
          <h3>Schedule</h3>
          {listing.agenda?.length ? (
            listing.agenda.map((item, index) => (
              <article
                className="event-agenda-item"
                key={`${item.startsAt}-${index}`}
              >
                <strong>
                  {item.startsAt}
                  {item.endsAt ? ` – ${item.endsAt}` : ""}
                </strong>
                <div>
                  <b>{item.title}</b>
                  {item.description ? <p>{item.description}</p> : null}
                </div>
              </article>
            ))
          ) : (
            <EmptyField>
              The public API did not expose the listing’s Agenda section. Use
              Eventbrite to edit it.
            </EmptyField>
          )}
        </section>

        <section className="event-detail-section">
          <p className="events-eyebrow">Lineup</p>
          <h3>Instructors and speakers</h3>
          {listing.presenters?.length ? (
            listing.presenters.map((presenter) => (
              <article className="event-person" key={presenter.name}>
                <strong>{presenter.name}</strong>
                <span>{presenter.role}</span>
              </article>
            ))
          ) : (
            <EmptyField>
              The public API did not expose Eventbrite’s Lineup section. Ellie
              will not invent speaker names.
            </EmptyField>
          )}
        </section>
      </div>

      <div className="event-detail-columns">
        <section className="event-detail-section">
          <p className="events-eyebrow">Organizer</p>
          <h3>
            {listing.organizer?.name ||
              logistics.organizerName ||
              "Organizer not returned"}
          </h3>
          {listing.organizer?.description ? (
            <p>{listing.organizer.description}</p>
          ) : null}
          {listing.organizer?.website ? (
            <a
              href={listing.organizer.website}
              target="_blank"
              rel="noreferrer"
            >
              Organizer website
            </a>
          ) : null}
        </section>

        <section className="event-detail-section">
          <p className="events-eyebrow">Policy and access</p>
          <dl className="event-detail-list">
            <div>
              <dt>Refund policy</dt>
              <dd>{policyLabel(listing.refundPolicy)}</dd>
            </div>
            <div>
              <dt>Access</dt>
              <dd>
                {listing.onlineAccess?.isOnline
                  ? "Online access managed securely by Eventbrite"
                  : event.location || "Venue"}
              </dd>
            </div>
            <div>
              <dt>Highlights</dt>
              <dd>{listing.highlights?.join(" · ") || "None returned"}</dd>
            </div>
          </dl>
        </section>
      </div>

      {listing.faqs?.length ? (
        <section className="event-detail-section">
          <p className="events-eyebrow">Good to know</p>
          <h3>Frequently asked questions</h3>
          <div className="event-faq-list">
            {listing.faqs.map((faq) => (
              <details key={faq.question}>
                <summary>{faq.question}</summary>
                <p>{faq.answer}</p>
              </details>
            ))}
          </div>
        </section>
      ) : null}

      <section className="event-detail-section">
        <p className="events-eyebrow">Tickets</p>
        <h3>Ticket classes and purchasing rules</h3>
        {tickets.length ? (
          <div className="event-ticket-grid">
            {tickets.map((ticket) => (
              <article key={ticket.id}>
                <div>
                  <strong>{ticket.name}</strong>
                  <span>{ticketStatus(ticket)}</span>
                </div>
                <p>
                  {ticket.free
                    ? "Free"
                    : ticket.displayPrice ||
                      `${ticket.currency || "USD"} ${Number(ticket.basePrice || ticket.cost || 0).toFixed(2)}`}
                </p>
                {!ticket.free && Number(ticket.fee || ticket.tax || 0) > 0 ? (
                  <p className="event-ticket-checkout-price">
                    Buyer pays <strong>${Number(ticket.buyerTotal || (Number(ticket.basePrice || 0) + Number(ticket.fee || 0) + Number(ticket.tax || 0))).toFixed(2)}</strong>
                    <small>
                      ${Number(ticket.basePrice || 0).toFixed(2)} ticket
                      {Number(ticket.fee || 0) ? ` + $${Number(ticket.fee).toFixed(2)} Eventbrite fee` : ""}
                      {Number(ticket.tax || 0) ? ` + $${Number(ticket.tax).toFixed(2)} tax` : ""}
                    </small>
                  </p>
                ) : null}
                <dl>
                  <div>
                    <dt>Sold</dt>
                    <dd>
                      {ticket.quantitySold || 0} / {ticket.quantityTotal || 0}
                    </dd>
                  </div>
                  <div>
                    <dt>Per order</dt>
                    <dd>
                      {ticket.minimumQuantity || 1}–
                      {ticket.maximumPerOrder ||
                        ticket.maximumQuantity ||
                        "No maximum"}
                    </dd>
                  </div>
                  <div>
                    <dt>Sales window</dt>
                    <dd>
                      {ticket.salesStart
                        ? `${new Date(ticket.salesStart).toLocaleString()} – ${new Date(ticket.salesEnd).toLocaleString()}`
                        : "Not returned"}
                    </dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        ) : (
          <EmptyField>No ticket classes were returned.</EmptyField>
        )}
      </section>

      <aside className="event-unsupported">
        <div>
          <strong>
            Some modern Eventbrite sections are display-only or unavailable
            through its public API.
          </strong>
          <p>
            Ellie shows everything Eventbrite returns and sends unsupported
            edits to the authoritative Eventbrite editor.
          </p>
        </div>
        {editUrl ? (
          <Button
            variant="outline"
            onClick={() =>
              window.open(editUrl, "_blank", "noopener,noreferrer")
            }
          >
            Edit advanced content on Eventbrite
          </Button>
        ) : null}
      </aside>
    </div>
  );
}
