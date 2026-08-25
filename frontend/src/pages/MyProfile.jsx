import { useState } from "react";
import Button from "../components/Button.jsx";
import UserAvatar from "../components/UserAvatar.jsx";
import useAuth from "../context/useAuth.js";
import { removeMyAvatar, uploadMyAvatar } from "../services/api.js";
import "./MyProfile.css";
const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
export default function MyProfile() {
  const { session, updateSessionUser } = useAuth(); const [busy, setBusy] = useState(false); const [notice, setNotice] = useState(null);
  const upload = async (file) => { if (!file) return; if (!TYPES.has(file.type)) return setNotice({ error: true, text: "Choose a JPG, PNG, WEBP, or GIF image." }); if (file.size > MAX_BYTES) return setNotice({ error: true, text: "Profile photos must be 5 MB or smaller." }); setBusy(true); try { const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); }); const result = await uploadMyAvatar(dataUrl); updateSessionUser(result.user); setNotice({ text: "Profile photo updated." }); } catch (error) { setNotice({ error: true, text: error.response?.data?.error || "Unable to upload profile photo." }); } finally { setBusy(false); } };
  const remove = async () => { setBusy(true); try { const result = await removeMyAvatar(); updateSessionUser(result.user); setNotice({ text: "Profile photo removed." }); } catch (error) { setNotice({ error: true, text: error.response?.data?.error || "Unable to remove profile photo." }); } finally { setBusy(false); } };
  return <div className="my-profile-page"><header><p className="page-eyebrow">My account</p><h1>Profile photo</h1><p>Your photo follows your Growth Operator account across Team, Coach, and Brand Ambassador experiences.</p></header>{notice ? <p className={notice.error ? "form-error" : "discovery-notice"}>{notice.text}</p> : null}<section><UserAvatar user={session?.user} size="lg"/><div><h2>{session?.user?.name}</h2><p>{session?.user?.email}</p><label className="my-profile-upload">{busy ? "Uploading…" : session?.user?.avatarUrl ? "Replace photo" : "Upload photo"}<input disabled={busy} type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(event) => upload(event.target.files?.[0])}/></label>{session?.user?.avatarUrl ? <Button variant="outline" disabled={busy} onClick={remove}>Remove photo</Button> : null}<small>JPG, PNG, WEBP, or GIF · maximum 5 MB. A square image works best.</small></div></section></div>;
}
