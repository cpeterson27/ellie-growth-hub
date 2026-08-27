import { useState } from "react";
import { mutateSocialWorkspace } from "../services/api.js";
import FacebookCommentActions from "./FacebookCommentActions.jsx";
export default function SocialReplyComposer({ thread, onSent }) {
  const [body, setBody] = useState(""), [approved, setApproved] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  if (thread.channel === "facebook" && thread.metadata?.interactionType === "comment") return <FacebookCommentActions thread={thread} onChanged={onSent} />;
  if (!["instagram", "facebook"].includes(thread.channel) || thread.metadata?.interactionType === "comment") return <p>Direct replies are unavailable for this interaction. A comment is not permission to initiate an unsolicited DM.</p>;
  return <form onSubmit={async e => { e.preventDefault(); setBusy(true); try { await mutateSocialWorkspace(`inbox/${thread._id}/reply`, { body, approved }); setBody(""); setApproved(false); onSent(); } catch (err) { setError(err.response?.data?.error || "Reply failed. Check delivery status before trying again."); } finally { setBusy(false); } }}><label>Reply as your connected business account<textarea maxLength="2000" rows="4" value={body} onChange={e => setBody(e.target.value)} required/></label><label><input type="checkbox" checked={approved} onChange={e => setApproved(e.target.checked)}/>I approve sending this exact reply</label><p>The provider's customer messaging window is checked before sending.</p>{error && <p role="alert">{error}</p>}<button disabled={busy || !approved || !body.trim()}>Send approved reply</button></form>;
}
