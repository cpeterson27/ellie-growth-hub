import { useState } from "react";
import Button from "../components/Button.jsx";
import DashboardCard from "../components/DashboardCard.jsx";
import Modal from "../components/Modal.jsx";

const channels = ["LinkedIn", "Facebook", "Instagram", "X / Twitter"];

export default function Marketing() {
  const [error, setError] = useState("");
  const [compose, setCompose] = useState(false);
  const [posts, setPosts] = useState([]);
  const [draft, setDraft] = useState({ channel: "LinkedIn", title: "", copy: "", campaign: "" });

  const savePost = () => {
    if (!draft.copy.trim()) { setError("Write the post before saving a draft."); return; }
    setPosts([{ ...draft, id: Date.now(), status: "draft" }, ...posts]);
    setCompose(false);
    setDraft({ channel: "LinkedIn", title: "", copy: "", campaign: "" });
  };

  return <div className="page-dashboard marketing-page">
    <header className="marketing-hero"><div><p className="marketing-eyebrow">Distribution center</p><h1 className="page-title">Marketing</h1><p>Plan channel-specific messages and keep approved post drafts organized.</p></div><Button onClick={() => setCompose(true)}>Create social post</Button></header>
    {error ? <p className="form-error">{error}</p> : null}
    <section className="marketing-channels">{channels.map((channel) => <DashboardCard key={channel} title={channel}><p className="marketing-channel__status">Configuration required</p><p>Drafting works now. Connect the account before Ellie can publish; it will never publish automatically.</p><Button variant="outline" size="sm" onClick={() => { setDraft({ ...draft, channel }); setCompose(true); }}>Create draft</Button></DashboardCard>)}</section>
    <section className="marketing-grid"><DashboardCard title="Growth recommendations"><p className="marketing-empty">No live recommendations are available yet. The previous sample recommendation has been removed. Use Jarvis or create a campaign plan when you are ready.</p></DashboardCard><DashboardCard title="Post drafts">{posts.length ? <div className="marketing-drafts">{posts.map((post) => <article key={post.id}><span>{post.channel}</span><h3>{post.title || "Untitled post"}</h3><p>{post.copy}</p><small>Draft — not published</small></article>)}</div> : <div className="table-state table-state--empty">No social drafts yet. Create one for any connected channel.</div>}</DashboardCard></section>
    <DashboardCard title="Recent Growth Activity"><p>No growth activity has been recorded yet.</p></DashboardCard>
    <Modal isOpen={compose} onClose={() => setCompose(false)} title="Create social post draft" footer={<><Button variant="outline" onClick={() => setCompose(false)}>Cancel</Button><Button onClick={savePost}>Save draft</Button></>}><div className="campaign-form-grid"><label className="form-field"><span>Channel</span><select className="select-input" value={draft.channel} onChange={(event) => setDraft({ ...draft, channel: event.target.value })}>{channels.map((channel) => <option key={channel}>{channel}</option>)}</select></label><label className="form-field"><span>Campaign or offer</span><input className="select-input" value={draft.campaign} onChange={(event) => setDraft({ ...draft, campaign: event.target.value })} placeholder="e.g. Deal to Close Bootcamp" /></label><label className="form-field span-2"><span>Post title</span><input className="select-input" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label><label className="form-field span-2"><span>Post copy</span><textarea className="select-input" value={draft.copy} onChange={(event) => setDraft({ ...draft, copy: event.target.value })} placeholder="Hook, offer, CTA, and hashtags…" /></label></div></Modal>
  </div>;
}
