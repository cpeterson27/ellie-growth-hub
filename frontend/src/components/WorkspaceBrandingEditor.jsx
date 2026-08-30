import { useEffect, useMemo, useState } from "react";
import Button from "./Button.jsx";
import { fetchWorkspaceMedia, uploadEventImage } from "../services/api.js";

const ASSETS = [
  [
    "publicSiteLogoUrl",
    "Website header logo",
    "Shown in the public website header and footer.",
  ],
  ["faviconUrl", "Website favicon", "Shown in the visitor's browser tab."],
];
const APP_ASSETS = [
  [
    "logoUrl",
    "Dashboard and sidebar logo",
    "Used throughout the authenticated Growth Operator app.",
  ],
  [
    "logoLightUrl",
    "Logo for light surfaces",
    "Optional variant for light headers and panels.",
  ],
  [
    "logoDarkUrl",
    "Logo for dark surfaces",
    "Optional variant for dark headers and sidebars.",
  ],
  [
    "compactLogoUrl",
    "Compact logo",
    "Optional mark for narrow and collapsed navigation.",
  ],
  [
    "faviconUrl",
    "App favicon",
    "Shown in the browser tab while staff are working.",
  ],
];

function contrastRatio(a, b) {
  const rgb = (hex) =>
    [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const lum = (hex) => {
    const [r, g, bl] = rgb(hex);
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [one, two] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (one + 0.05) / (two + 0.05);
}

function AssetField({ label, help, value, onChange, media, onUpload, busy }) {
  const [advanced, setAdvanced] = useState(false);
  return (
    <article className="brand-asset-field">
      <div className="brand-asset-field__preview">
        {value ? <img src={value} alt="" /> : <span>No asset selected</span>}
      </div>
      <div>
        <strong>{label}</strong>
        <small>{help}</small>
        <div className="brand-asset-field__actions">
          <label className="website-upload-button">
            {busy ? "Uploading…" : value ? "Replace" : "Upload"}
            <input
              disabled={busy}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => onUpload(event.target.files?.[0])}
            />
          </label>
          <select
            aria-label={`Choose existing asset for ${label}`}
            value=""
            onChange={(event) =>
              event.target.value && onChange(event.target.value)
            }
          >
            <option value="">Choose workspace asset</option>
            {media.map((asset) => (
              <option key={asset.url} value={asset.url}>
                {asset.title || asset.filename || "Workspace image"}
              </option>
            ))}
          </select>
          {value ? (
            <button type="button" onClick={() => onChange("")}>
              Remove
            </button>
          ) : null}
        </div>
        <button
          className="brand-advanced-toggle"
          type="button"
          aria-expanded={advanced}
          onClick={() => setAdvanced((current) => !current)}
        >
          Advanced URL {advanced ? "−" : "+"}
        </button>
        {advanced ? (
          <input
            type="url"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="https://…"
          />
        ) : null}
      </div>
    </article>
  );
}

export default function WorkspaceBrandingEditor({
  config,
  setConfig,
  onSave,
  saving,
  setError,
}) {
  const [media, setMedia] = useState([]),
    [uploading, setUploading] = useState("");
  useEffect(() => {
    fetchWorkspaceMedia()
      .then((rows) =>
        setMedia((rows || []).filter((row) => row.type === "image")),
      )
      .catch(() => setMedia([]));
  }, []);
  const patchPublic = (key, value) =>
    setConfig((current) => ({
      ...current,
      branding: { ...current.branding, [key]: value },
    }));
  const patchApp = (key, value) =>
    setConfig((current) => ({
      ...current,
      appBranding: { ...current.appBranding, [key]: value },
    }));
  const patchSite = (key, value) =>
    setConfig((current) => ({
      ...current,
      publicSite: { ...current.publicSite, [key]: value },
    }));
  const upload = async (scope, key, file) => {
    if (!file) return;
    if (
      !/^image\/(png|jpeg|webp)$/.test(file.type) ||
      file.size > 5 * 1024 * 1024
    )
      return setError("Choose a PNG, JPG, or WEBP image up to 5 MB.");
    try {
      setUploading(`${scope}.${key}`);
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const asset = await uploadEventImage({ file: data });
      (scope === "branding"
        ? patchPublic
        : scope === "publicSite"
          ? patchSite
          : patchApp)(key, asset.url);
      setMedia((rows) => [
        { ...asset, type: "image", title: file.name },
        ...rows.filter((row) => row.url !== asset.url),
      ]);
    } catch (error) {
      setError(error.response?.data?.error || "Unable to upload this image.");
    } finally {
      setUploading("");
    }
  };
  const app = config.appBranding || {},
    brand = config.branding || {};
  const contrast = useMemo(
    () =>
      contrastRatio(
        app.sidebarBackgroundColor || "#102a24",
        app.sidebarTextColor || "#f7faf8",
      ),
    [app.sidebarBackgroundColor, app.sidebarTextColor],
  );
  return (
    <div className="workspace-branding-editor">
      <section>
        <header>
          <p className="page-eyebrow">Public website branding</p>
          <h4>Visitor-facing identity</h4>
          <p>These assets and colors belong only to the public website.</p>
        </header>
        <label>
          Public site name
          <input
            value={brand.publicSiteName || ""}
            onChange={(event) =>
              patchPublic("publicSiteName", event.target.value)
            }
          />
        </label>
        <div className="brand-assets-list">
          {ASSETS.map(([key, label, help]) => (
            <AssetField
              key={key}
              label={label}
              help={help}
              value={brand[key] || ""}
              media={media}
              busy={uploading === `branding.${key}`}
              onChange={(value) => patchPublic(key, value)}
              onUpload={(file) => upload("branding", key, file)}
            />
          ))}
          <AssetField
            label="Brand feature / hero image"
            help="Optional visitor-facing image used in the homepage hero."
            value={config.publicSite?.heroMediaUrl || ""}
            media={media}
            busy={uploading === "publicSite.heroMediaUrl"}
            onChange={(value) => patchSite("heroMediaUrl", value)}
            onUpload={(file) => upload("publicSite", "heroMediaUrl", file)}
          />
        </div>
        <div className="brand-color-grid">
          <label>
            Primary color
            <input
              type="color"
              value={brand.primaryColor || "#173f36"}
              onChange={(event) =>
                patchPublic("primaryColor", event.target.value)
              }
            />
          </label>
          <label>
            Accent color
            <input
              type="color"
              value={brand.accentColor || "#a8d65e"}
              onChange={(event) =>
                patchPublic("accentColor", event.target.value)
              }
            />
          </label>
          <label>
            Website surface
            <select
              value={brand.surfaceMode || "light"}
              onChange={(event) =>
                patchPublic("surfaceMode", event.target.value)
              }
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="charcoal">Charcoal</option>
            </select>
          </label>
        </div>
        <div
          className={`brand-live-preview is-${brand.surfaceMode || "light"}`}
        >
          <span>Live preview · website</span>
          {brand.publicSiteLogoUrl ? (
            <img src={brand.publicSiteLogoUrl} alt="" />
          ) : (
            <strong>{brand.publicSiteName || "Your website"}</strong>
          )}
          <button type="button">Primary action</button>
        </div>
      </section>
      <section>
        <header>
          <p className="page-eyebrow">Growth Operator app branding</p>
          <h4>Authenticated workspace identity</h4>
          <p>
            Used by Owner, Admin, Coach, Closer, Ambassador, Member, and Viewer
            portals. It does not replace public website assets.
          </p>
        </header>
        <div className="brand-assets-list">
          {APP_ASSETS.map(([key, label, help]) => (
            <AssetField
              key={key}
              label={label}
              help={help}
              value={app[key] || ""}
              media={media}
              busy={uploading === `appBranding.${key}`}
              onChange={(value) => patchApp(key, value)}
              onUpload={(file) => upload("appBranding", key, file)}
            />
          ))}
        </div>
        <div className="brand-color-grid">
          {[
            ["sidebarBackgroundColor", "Sidebar background"],
            ["sidebarTextColor", "Sidebar text"],
            ["headerColor", "App header"],
            ["primaryActionColor", "Primary action"],
            ["accentColor", "Accent"],
            ["backgroundColor", "App background"],
          ].map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                type="color"
                value={app[key] || "#ffffff"}
                onChange={(event) => patchApp(key, event.target.value)}
              />
            </label>
          ))}
        </div>
        <p
          className={
            contrast >= 4.5
              ? "brand-contrast is-good"
              : "brand-contrast is-warning"
          }
        >
          {contrast >= 4.5
            ? "Sidebar contrast passes AA."
            : "Sidebar text contrast is too low. Choose more distinct colors."}
        </p>
        <div
          className="brand-live-preview brand-app-preview"
          style={{
            background: app.sidebarBackgroundColor,
            color: app.sidebarTextColor,
          }}
        >
          <span>Live preview · app shell</span>
          {app.logoDarkUrl || app.logoUrl ? (
            <img src={app.logoDarkUrl || app.logoUrl} alt="" />
          ) : (
            <strong>Workspace</strong>
          )}
          <button
            type="button"
            style={{ background: app.primaryActionColor, color: "white" }}
          >
            Primary action
          </button>
        </div>
      </section>
      <footer>
        <Button loading={saving} disabled={contrast < 4.5} onClick={onSave}>
          Save branding
        </Button>
      </footer>
    </div>
  );
}
