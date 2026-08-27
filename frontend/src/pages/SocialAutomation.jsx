import { useEffect, useMemo, useState } from "react";
import {
  createSocialAutomation,
  fetchSocialAutomationOverview,
  fetchSocialAutomationContentBriefs,
  fetchSocialAutomationPosts,
  fetchSocialAutomations,
  fetchSocialLeads,
  updateSocialAutomation,
  fetchCampaigns,
} from "../services/api.js";
import { CampaignSelect, ContactLabelsControl } from "../components/SocialAutomationFields.jsx";
import "./SocialAutomation.css";

const EMPTY = {
  name: "",
  provider: "instagram",
  assetId: "",
  contentId: "",
  contentBriefId: "",
  triggerType: "comment_keyword",
  keywords: "",
  responseTemplate: "",
  ctaLabel: "",
  ctaDestination: "",
  campaignId: "",
  tags: [],
  qualification: "",
  enabled: false,
};
const CATEGORIES = [
  {
    title: "Comment keyword automations",
    triggers: [
      ["comment_keyword", "Comment contains keyword"],
      ["comment_any", "Any new comment"],
    ],
    description: "Capture interest and send one permitted private reply.",
  },
  {
    title: "Inbound message automations",
    triggers: [
      ["dm_keyword", "Message contains keyword"],
      ["dm_any", "Any inbound message"],
    ],
    description: "Respond within the allowed customer-message window.",
  },
  {
    title: "Mention automations",
    triggers: [["mention", "Account mentioned"]],
    description:
      "Record an identified mention and organize follow-up. No unsolicited DM.",
  },
  {
    title: "Referral / postback automations",
    triggers: [
      ["postback", "Conversation button selected"],
      ["referral", "Referred conversation opened"],
      ["optin", "Messaging opt-in received"],
    ],
    description:
      "Keep referral context. Referral-only events do not open a reply window.",
  },
  {
    title: "Story-related automations",
    triggers: [["story_reply", "Story reply or story mention message"]],
    description:
      "Only actual inbound messages; never story views or aggregate insights.",
  },
];

export default function SocialAutomation() {
  const [overview, setOverview] = useState(null);
  const [automations, setAutomations] = useState([]);
  const [leads, setLeads] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [campaigns, setCampaigns] = useState([]);
  const [postOptions, setPostOptions] = useState({ key: "", recent: [], briefs: [], error: "" });
  const load = async () => {
    setLoading(true);

    try {
      const [
        nextOverview,
        nextAutomations,
        nextLeads,
        nextCampaigns,
      ] = await Promise.all([
        fetchSocialAutomationOverview(),
        fetchSocialAutomations(),
        fetchSocialLeads(),
        fetchCampaigns(),
      ]);

      setOverview(nextOverview);
      setAutomations(nextAutomations);
      setLeads(nextLeads);
      setCampaigns(
        Array.isArray(nextCampaigns) ? nextCampaigns.filter(Boolean) : [],
      );
    } catch (error) {
      setMessage(
        error.response?.data?.error || "Social Automation could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    let active = true;

    Promise.all([
      fetchSocialAutomationOverview(),
      fetchSocialAutomations(),
      fetchSocialLeads(),
      fetchCampaigns(),
    ])
      .then(
        ([
          nextOverview,
          nextAutomations,
          nextLeads,
          nextCampaigns,
        ]) => {
          if (active) {
            setOverview(nextOverview);
            setAutomations(nextAutomations);
            setLeads(nextLeads);
            setCampaigns(
              Array.isArray(nextCampaigns) ? nextCampaigns.filter(Boolean) : [],
            );
          }
        },
      )
      .catch((error) => {
        if (active)
          setMessage(
            error.response?.data?.error ||
              "Social Automation could not be loaded.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!form.assetId) return;
    const key = `${form.provider}:${form.assetId}`;
    let active = true;
    Promise.all([fetchSocialAutomationContentBriefs(form.provider, form.assetId), fetchSocialAutomationPosts(form.provider, form.assetId).catch((error) => ({ providerError: error.response?.data?.error || "Recent Meta posts could not be loaded." }))])
      .then(([briefs, recent]) => { if (active) setPostOptions({ key, briefs: Array.isArray(briefs) ? briefs : [], recent: Array.isArray(recent) ? recent : [], error: recent?.providerError || "" }); })
      .catch((error) => { if (active) setPostOptions({ key, briefs: [], recent: [], error: error.response?.data?.error || "Posts could not be loaded." }); });
    return () => { active = false; };
  }, [form.provider, form.assetId]);

  const assets = useMemo(
    () => [
      ...new Map(
        (overview?.connections || [])
          .filter((connection) => connection.status === "connected")
          .flatMap((connection) =>
            (connection.assets || []).filter(
              (asset) =>
                (connection.selectedAssetIds || []).includes(asset.id) &&
                asset.type ===
                  (form.provider === "instagram"
                    ? "instagram_business"
                    : "facebook_page"),
            ),
          )
          .map((asset) => [asset.id, asset]),
      ).values(),
    ],
    [overview, form.provider],
  );
  const categories = CATEGORIES.filter(
    (category) =>
      form.provider === "instagram" ||
      !["Mention automations", "Story-related automations"].includes(
        category.title,
      ),
  );
  const contextOnly = ["mention", "referral"].includes(form.triggerType);
  const save = async (event) => {
    event.preventDefault();
    setMessage("");
    try {
      const values = {
        ...form,
        contentBriefId: form.contentBriefId?._id || form.contentBriefId || "",
        keywords: form.keywords.split(","),
        tags: form.tags,
        qualification: form.qualification.split(","),
        cta: { label: form.ctaLabel, destination: form.ctaDestination },
        campaignId: form.campaignId || null,
      };
      if (editingId) await updateSocialAutomation(editingId, values);
      else await createSocialAutomation(values);
      setForm(EMPTY);
      setEditingId(null);
      setMessage("Social automation saved.");
      await load();
    } catch (error) {
      setMessage(
        error.response?.data?.error || "Automation could not be saved.",
      );
    }
  };
  const toggle = async (item) => {
    await updateSocialAutomation(item._id, { enabled: !item.enabled });
    await load();
  };

  if (loading)
    return (
      <main className="social-automation">
        <p>Loading Social Automation…</p>
      </main>
    );
  return (
    <main className="social-automation">
      <header>
        <div>
          <p className="eyebrow">Growth Operator</p>
          <h1>Social Automation</h1>
          <p>
            Social Automations are rules for what happens after an interaction.
            Social Leads shows the people captured; Social Content is where you
            create posts.
          </p>
        </div>
        <span className="native-badge">
          Replies require administrator approval
        </span>
      </header>
      {message ? (
        <div className="social-notice" role="status">
          {message}
        </div>
      ) : null}
      <section className="social-grid social-grid--metrics">
        <article>
          <strong>{overview?.counts?.socialLeads || 0}</strong>
          <span>Social leads</span>
        </article>
        <article>
          <strong>{overview?.counts?.automations || 0}</strong>
          <span>Automations</span>
        </article>
        <article>
          <strong>{assets.length}</strong>
          <span>Connected accounts</span>
        </article>
      </section>
      <section className="social-panel">
        <h2>Choose an interaction</h2>
        <div className="capability-grid">
          {CATEGORIES.map((category) => (
            <article key={category.title}>
              <h3>{category.title}</h3>
              <p>{category.description}</p>
              <p>
                {
                  automations.filter((item) =>
                    category.triggers.some(
                      ([trigger]) => trigger === item.triggerType,
                    ),
                  ).length
                }{" "}
                configured
              </p>
            </article>
          ))}
        </div>
        <p>
          Replies remain disabled until your administrator explicitly enables
          them. Use workspace Automations for follow-up tasks and employee
          notifications, and Social Inbox to assign conversations.
        </p>
      </section>
      <section className="social-grid">
        <form className="social-panel" onSubmit={save}>
          <h2>Build an interaction workflow</h2>
          <label>
            Name
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label>
            Platform
            <select
              disabled={Boolean(editingId)}
              value={form.provider}
              onChange={(e) =>
                setForm({
                  ...form,
                  provider: e.target.value,
                  triggerType: "comment_keyword",
                  assetId: "",
                  contentId: "",
                  contentBriefId: "",
                })
              }
            >
              <option value="instagram">Instagram</option>
              <option value="facebook">Facebook</option>
            </select>
          </label>
          <label>
            Connected account
            <select
              disabled={Boolean(editingId)}
              required
              value={form.assetId}
              onChange={(e) => setForm({ ...form, assetId: e.target.value, contentId: "", contentBriefId: "" })}
            >
              <option value="">Select an account/page</option>
              {assets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.name || asset.username || "Account"}
                </option>
              ))}
            </select>
          </label>
          <label>
            When someone
            <select
              disabled={Boolean(editingId)}
              value={form.triggerType}
              onChange={(e) =>
                setForm({ ...form, triggerType: e.target.value })
              }
            >
              {categories.map((category) => (
                <optgroup label={category.title} key={category.title}>
                  {category.triggers.map(([value, label]) => (
                    <option value={value} key={value}>
                      {label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label>
            Apply this automation to
            <select value={form.contentBriefId ? `brief:${form.contentBriefId?._id || form.contentBriefId}` : form.contentId ? `post:${form.contentId}` : ""} disabled={!form.assetId} onChange={(event) => {
              const [kind, ...idParts] = event.target.value.split(":");
              const id = idParts.join(":");
              setForm({ ...form, contentBriefId: kind === "brief" ? id : "", contentId: kind === "post" ? id : "" });
            }}>
              <option value="">All posts</option>
              {postOptions.key === `${form.provider}:${form.assetId}` && postOptions.briefs.length ? <optgroup label="Growth Operator posts">{postOptions.briefs.map((post) => <option key={post.id} value={`brief:${post.id}`}>{`${post.title} · ${post.status.replaceAll("_", " ")}${post.updatedAt ? ` · ${new Date(post.updatedAt).toLocaleDateString()}` : ""}`}</option>)}</optgroup> : null}
              {postOptions.key === `${form.provider}:${form.assetId}` && postOptions.recent.length ? <optgroup label="Already published posts">{postOptions.recent.map((post) => <option key={post.id} value={`post:${post.id}`}>{`${post.text.slice(0, 80)}${post.text.length > 80 ? "…" : ""}${post.publishedAt ? ` · ${new Date(post.publishedAt).toLocaleDateString()}` : ""}`}</option>)}</optgroup> : null}
            </select>
            {!form.assetId ? <small>Choose a connected account first.</small> : postOptions.key !== `${form.provider}:${form.assetId}` ? <small>Loading posts…</small> : postOptions.error ? <small role="alert">{postOptions.error} Select All posts or reconnect the account.</small> : <small>Choose a Growth Operator draft/scheduled post, an already-published post, or All posts.</small>}
          </label>
          <label>
            Keywords <small>(comma separated)</small>
            <input
              placeholder="DEAL"
              value={form.keywords}
              onChange={(e) => setForm({ ...form, keywords: e.target.value })}
              disabled={
                form.triggerType !== "comment_keyword" &&
                form.triggerType !== "dm_keyword"
              }
            />
          </label>
          <p>
            Find or create the contact, record the interaction, and optionally
            add tags or a permitted reply.
          </p>
          {contextOnly && (
            <p>
              This interaction records attribution and CRM activity only. It
              does not authorize an automatic message.
            </p>
          )}
          <label>
            Initial response
            <textarea
              disabled={contextOnly}
              maxLength={2000}
              rows="4"
              value={form.responseTemplate}
              onChange={(e) =>
                setForm({ ...form, responseTemplate: e.target.value })
              }
            />
          </label>
          <label>
            Button text (optional)
            <input
              value={form.ctaLabel}
              onChange={(e) => setForm({ ...form, ctaLabel: e.target.value })}
              placeholder="Learn more"
            />
          </label>

          <label>
            Button link (optional)
            <input
              type="url"
              value={form.ctaDestination}
              onChange={(e) =>
                setForm({ ...form, ctaDestination: e.target.value })
              }
              placeholder="https://elliescoaching.com/apply"
            />
          </label>
          <CampaignSelect campaigns={campaigns} value={form.campaignId} onChange={(campaignId) => setForm({ ...form, campaignId })} />
          <ContactLabelsControl value={form.tags} onChange={(tags) => setForm({ ...form, tags })} onError={setMessage} />

          <label className="checkbox">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
            />{" "}
            Turn on automation after saving
          </label>

          <button type="submit" className="save-automation-button">
            {editingId ? "Save changes" : "Save automation"}
          </button>
        </form>
        <section className="social-panel">
          <h2>Configured automations</h2>
          {automations.length ? (
            automations.map((item) => (
              <article className="automation-row" key={item._id}>
                <div>
                  <strong>{item.name}</strong>
                  <span>
                    {item.provider} · {item.triggerType.replaceAll("_", " ")}
                    {item.contentId ? " · specific post" : " · any content"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(item._id);
                    setForm({
                      ...EMPTY,
                      ...item,
                      keywords: item.keywords.join(","),
                      tags: item.tags || [],
                      contentBriefId: item.contentBriefId?._id || item.contentBriefId || "",
                      qualification: item.qualification.join(","),
                      ctaLabel: item.cta?.label || "",
                      ctaDestination: item.cta?.destination || "",
                      campaignId: item.campaignId?._id || item.campaignId || "",
                    });
                  }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className={item.enabled ? "enabled" : ""}
                  onClick={() => toggle(item)}
                >
                  {item.enabled ? "Enabled" : "Disabled"}
                </button>
              </article>
            ))
          ) : (
            <p>
              No social automation is configured. Normal social posts remain
              unaffected.
            </p>
          )}
        </section>
      </section>
      <section className="social-panel">
        <h2>Recent social leads</h2>
        {leads.length ? (
          <div className="lead-table">
            {leads.map((identity) => (
              <article key={identity._id}>
                <div>
                  <strong>
                    {identity.contactId?.name ||
                      identity.displayName ||
                      identity.username}
                  </strong>
                  <span>
                    {identity.provider}
                    {identity.username ? ` · @${identity.username}` : ""}
                  </span>
                </div>
                <div>
                  <span>
                    {identity.contactId?.socialAttribution?.latest?.contentId
                      ? "Source post recorded"
                      : "Conversation source"}
                  </span>
                  <small>
                    {new Date(identity.lastActivityAt).toLocaleString()}
                  </small>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p>
            No social leads yet. Contacts appear here when your connected
            accounts receive eligible interactions.
          </p>
        )}
      </section>
      <section className="social-panel">
        <h2>Recent interaction history</h2>
        {overview?.recentEvents?.length ? (
          overview.recentEvents.map((event) => (
            <article className="automation-row" key={event._id}>
              <div>
                <strong>
                  {event.contactId?.name ||
                    "Context only — identity not provided"}
                </strong>
                <span>
                  {event.provider} · {event.eventType.replaceAll("_", " ")} ·{" "}
                  {new Date(event.occurredAt).toLocaleString()}
                </span>
              </div>
              <span>
                {["sending", "unknown"].includes(event.reply?.status)
                  ? "Delivery needs review — do not resend blindly"
                  : event.reply?.status === "pending"
                    ? "Reply prepared · delivery controlled by safety setting"
                    : event.reply?.status === "sent"
                      ? "Reply sent"
                      : event.processingStatus === "failed"
                        ? "Processing retry needed"
                        : "Recorded"}
              </span>
            </article>
          ))
        ) : (
          <p>No interactions received yet.</p>
        )}
      </section>
      <aside className="social-warning">
        <strong>Platform limits:</strong> no automation runs from likes, views,
        saves, shares, reactions, or followers. LinkedIn is human-assisted;
        TikTok is lead-form-only until an approved connection is configured.
      </aside>
    </main>
  );
}
