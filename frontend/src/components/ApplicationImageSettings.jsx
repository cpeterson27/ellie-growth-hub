import { useEffect, useState } from "react";
import Button from "./Button.jsx";
import { fetchApplicationConfig, updateApplicationConfig, uploadEventImage } from "../services/api.js";

export default function ApplicationImageSettings() {
  const [config, setConfig] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => { fetchApplicationConfig().then(setConfig).catch(() => setMessage("Unable to load the application image.")); }, []);
  const persist = async (heroImageUrl) => { const saved = await updateApplicationConfig({ ...config, heroImageUrl }); setConfig(saved); };
  const upload = async (file) => {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 5 * 1024 * 1024) return setMessage("Choose a PNG, JPG, or WEBP image up to 5 MB.");
    setBusy(true); setMessage("");
    try {
      const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
      const asset = await uploadEventImage({ file: data, filename: file.name });
      await persist(asset.url); setMessage("Application image saved.");
    } catch (error) { setMessage(error.response?.data?.error || "Unable to save the application image."); }
    finally { setBusy(false); }
  };
  const remove = async () => { setBusy(true); setMessage(""); try { await persist(""); setMessage("Application image removed."); } catch (error) { setMessage(error.response?.data?.error || "Unable to remove the application image."); } finally { setBusy(false); } };
  if (!config) return <section className="application-image-settings"><p>{message || "Loading application image…"}</p></section>;
  return <section className="application-image-settings"><div><p className="page-eyebrow">Student application</p><h3>Application image</h3><p>Choose the image students see when the application opens.</p></div><div className="application-image-settings__control"><div className="application-image-settings__preview">{config.heroImageUrl ? <img src={config.heroImageUrl} alt="Current student application" /> : <span>No custom image</span>}</div><div><label className="website-upload-button">{busy ? "Uploading…" : config.heroImageUrl ? "Replace image" : "Upload image"}<input disabled={busy} type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => upload(event.target.files?.[0])}/></label>{config.heroImageUrl ? <Button variant="secondary" disabled={busy} onClick={remove}>Remove</Button> : null}<small>PNG, JPG, or WEBP up to 5 MB.</small></div></div><p aria-live="polite">{message}</p></section>;
}
