import { useEffect, useState } from "react";
import Button from "./Button.jsx";
import Modal from "./Modal.jsx";
import {
  fetchCoachingPrograms,
  fetchWorkspaceMedia,
  updateProgramPublicPresentation,
  uploadEventImage,
  uploadProgramVideo,
} from "../services/api.js";

export default function ProgramWebsiteSettings({ websiteUrl = "/", onChange }) {
  const [programs, setPrograms] = useState([]),
    [editing, setEditing] = useState(null),
    [media, setMedia] = useState([]),
    [showLibrary, setShowLibrary] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const presentationForEditing = (program) => {
    const current = program.publicPresentation || {};
    const description = current.description || current.summary || program.internalSummary || "";
    return {
      ...program,
      publicPresentation: {
        ...current,
        title: current.title || program.name,
        description,
        summary: description,
        priceVisible: true,
      },
    };
  };
  const load = () =>
    fetchCoachingPrograms({ limit: 200 })
      .then(setPrograms)
      .catch((err) =>
        setError(
          err.response?.data?.error ||
            "Unable to load program website settings.",
        ),
      );
  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    return () => window.clearTimeout(timer);
  }, []);
  const patch = (key, value) =>
    setEditing((row) => ({
      ...row,
      publicPresentation: { ...row.publicPresentation, [key]: value },
    }));
  const persistProgramImage = async (imageUrl) => {
    const saved = await updateProgramPublicPresentation(editing._id, {
      ...(editing.publicPresentation || {}),
      imageUrl,
      summary: editing.publicPresentation?.description || "",
      priceVisible: true,
    });
    setPrograms((rows) =>
      rows.map((row) => (row._id === saved._id ? saved : row)),
    );
    setEditing(presentationForEditing(saved));
    setMessage(
      imageUrl
        ? `${saved.name} image saved to the public website.`
        : `${saved.name} image removed from the public website.`,
    );
    setError("");
    onChange?.();
  };
  const save = async () => {
    try {
      setSaving(true);
      const saved = await updateProgramPublicPresentation(
        editing._id,
        {
          ...(editing.publicPresentation || {}),
          summary: editing.publicPresentation?.description || "",
          priceVisible: true,
        },
      );
      setPrograms((rows) =>
        rows.map((row) => (row._id === saved._id ? saved : row)),
      );
      setEditing(null);
      setMessage(`${saved.name} website presentation saved.`);
      setError("");
      onChange?.();
    } catch (err) {
      setError(
        err.response?.data?.error || "Unable to save program website settings.",
      );
    } finally {
      setSaving(false);
    }
  };
  const setVisibility = async (program, visible) => {
    try {
      setSaving(true);
      const saved = await updateProgramPublicPresentation(program._id, {
        ...program.publicPresentation,
        status: visible ? "published" : "hidden",
      });
      setPrograms((rows) =>
        rows.map((row) => (row._id === saved._id ? saved : row)),
      );
      onChange?.();
    } catch (err) {
      setError(
        err.response?.data?.error || "Unable to update program visibility.",
      );
    } finally {
      setSaving(false);
    }
  };
  const chooseMedia = async (type = "video") => {
    try {
      const contentAssets = await fetchWorkspaceMedia();
      const programAssets = programs.flatMap((program) => {
        const presentation = program.publicPresentation || {};
        return [
          presentation.imageUrl
            ? { type: "image", url: presentation.imageUrl, title: `${program.name} image` }
            : null,
          presentation.introVideoUrl
            ? { type: "video", url: presentation.introVideoUrl, publicId: presentation.introVideoPublicId || "", title: `${program.name} video` }
            : null,
        ].filter(Boolean);
      });
      const unique = new Map(
        [...programAssets, ...contentAssets]
          .filter((asset) => asset.type === type && asset.url)
          .map((asset) => [asset.url, asset]),
      );
      setMedia([...unique.values()]);
      setShowLibrary(type);
    } catch (err) {
      setError(
        err.response?.data?.error || "Unable to load the media library.",
      );
    }
  };
  const upload = async (file) => {
    if (!file) return;
    if (!file.type.startsWith("video/") || file.size > 75 * 1024 * 1024)
      return setError("Choose an MP4, WEBM, or MOV video up to 75 MB.");
    try {
      setSaving(true);
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const asset = await uploadProgramVideo({
        file: data,
        filename: file.name,
      });
      setEditing((row) => ({
        ...row,
        publicPresentation: {
          ...row.publicPresentation,
          introVideoUrl: asset.url,
          introVideoPublicId: asset.publicId,
        },
      }));
    } catch (err) {
      setError(err.response?.data?.error || "Unable to upload the video.");
    } finally {
      setSaving(false);
    }
  };
  const uploadImage = async (file) => {
    if (!file) return;
    if (
      !/^image\/(png|jpeg|webp)$/.test(file.type) ||
      file.size > 5 * 1024 * 1024
    )
      return setError("Choose a PNG, JPG, or WEBP image up to 5 MB.");
    try {
      setSaving(true);
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const asset = await uploadEventImage({ file: data });
      await persistProgramImage(asset.url);
    } catch (err) {
      setError(
        err.response?.data?.error || "Unable to upload the program image.",
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <section className="website-focused-panel program-website-manager">
      <header className="website-section-heading">
        <div>
          <p className="page-eyebrow">Public programs</p>
          <h3>Programs</h3>
          <p>
            Control which coaching programs visitors can see without changing
            program delivery settings.
          </p>
        </div>
      </header>
      {message ? <p className="discovery-notice">{message}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
      <div className="program-website-list">
        {programs.map((program) => {
          const data = program.publicPresentation || {},
            visible =
              program.status === "active" && data.status === "published",
            state =
              program.status !== "active"
                ? "Draft"
                : visible
                  ? "Published"
                  : "Hidden";
          return (
            <article key={program._id}>
              <div className="program-website-summary">
                <span
                  className={`website-status-chip ${visible ? "is-live" : state === "Draft" ? "is-draft" : ""}`}
                >
                  {state}
                </span>
                <h4>{program.name}</h4>
                <dl>
                  <div>
                    <dt>Price</dt>
                    <dd>{program.defaultPrice?.amount != null ? new Intl.NumberFormat("en-US", { style: "currency", currency: program.defaultPrice.currency || "USD", maximumFractionDigits: 0 }).format(program.defaultPrice.amount) : "Not set"}</dd>
                  </div>
                  <div>
                    <dt>Visibility</dt>
                    <dd>
                      {visible ? "Shown on website" : "Not shown publicly"}
                    </dd>
                  </div>
                </dl>
              </div>
              <div className="program-website-actions">
                <Button
                  variant="outline"
                  onClick={() =>
                    setEditing(presentationForEditing(program))
                  }
                >
                  Edit Website Content
                </Button>
                {visible ? (
                  <a
                    href={`${websiteUrl.replace(/\/$/, "")}/#programs`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View on website ↗
                  </a>
                ) : null}
                <Button
                  variant={visible ? "ghost" : "primary"}
                  disabled={saving || (program.status !== "active" && !visible)}
                  onClick={() => setVisibility(program, !visible)}
                >
                  {visible ? "Hide" : "Publish"}
                </Button>
              </div>
            </article>
          );
        })}
      </div>
      <Modal
        isOpen={Boolean(editing)}
        onClose={() => {
          setEditing(null);
          setShowLibrary(false);
        }}
        title={editing ? `Edit ${editing.name}` : "Edit program"}
        footer={
          <div className="modal-action-row">
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button loading={saving} onClick={save}>
              Save website presentation
            </Button>
          </div>
        }
      >
        {editing ? (
          <div className="program-presentation-form">
            <section className="program-editor-group">
              <header>
                <span>1</span>
                <div>
                  <h4>Publishing</h4>
                  <p>Choose whether this active program appears publicly.</p>
                </div>
              </header>
              <label className="website-toggle">
                <input
                  type="checkbox"
                  checked={editing.publicPresentation?.status === "published"}
                  onChange={(e) =>
                    patch("status", e.target.checked ? "published" : "hidden")
                  }
                />
                <span>
                  <strong>Show on website</strong>
                  <small>
                    A program name and description are required to publish.
                  </small>
                </span>
              </label>
            </section>
            <section className="program-editor-group">
              <header>
                <span>2</span>
                <div>
                  <h4>Public content</h4>
                  <p>Write the complete visitor-facing program information.</p>
                </div>
              </header>
              <label>
                Program name shown on the website
                <input
                  value={editing.publicPresentation?.title || editing.name}
                  onChange={(e) => patch("title", e.target.value)}
                />
              </label>
              <label>
                Program description
                <textarea
                  rows="9"
                  value={editing.publicPresentation?.description || ""}
                  onChange={(e) => patch("description", e.target.value)}
                />
              </label>
              <fieldset className="program-video-picker">
                <legend>Program image</legend>
                {editing.publicPresentation?.imageUrl ? (
                  <div className="program-video-preview">
                    <img src={editing.publicPresentation.imageUrl} alt="" />
                    <div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => chooseMedia("image")}
                      >
                        Replace image
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={saving}
                        onClick={async () => {
                          try {
                            setSaving(true);
                            await persistProgramImage("");
                          } catch (err) {
                            setError(
                              err.response?.data?.error ||
                                "Unable to remove the program image.",
                            );
                          } finally {
                            setSaving(false);
                          }
                        }}
                      >
                        Remove image
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="program-video-empty">
                    <div>
                      <label className="website-upload-button">
                        Upload image
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          onChange={(e) => uploadImage(e.target.files?.[0])}
                        />
                      </label>
                      <Button
                        variant="outline"
                        onClick={() => chooseMedia("image")}
                      >
                        Choose existing image
                      </Button>
                    </div>
                  </div>
                )}
                {showLibrary === "image" ? (
                  <div className="website-media-library">
                    <strong>Workspace media library</strong>
                    <p>Images already used by your programs or content appear here. Upload a new image above to add something new.</p>
                    {media.length ? (
                      media.map((asset) => (
                        <button
                          key={asset.url}
                          type="button"
                          disabled={saving}
                          onClick={async () => {
                            try {
                              setSaving(true);
                              await persistProgramImage(asset.url);
                              setShowLibrary(false);
                            } catch (err) {
                              setError(
                                err.response?.data?.error ||
                                  "Unable to save the program image.",
                              );
                            } finally {
                              setSaving(false);
                            }
                          }}
                        >
                          <img src={asset.url} alt="" />
                          <span>{asset.title || "Workspace image"}</span>
                        </button>
                      ))
                    ) : (
                      <p>No reusable images are in the media library yet.</p>
                    )}
                  </div>
                ) : null}
              </fieldset>
            </section>
            <section className="program-editor-group">
              <header>
                <span>3</span>
                <div>
                  <h4>Intro video</h4>
                  <p>
                    Add an optional hosted video without exposing technical
                    URLs.
                  </p>
                </div>
              </header>
              <fieldset className="program-video-picker">
                <legend className="sr-only">Intro video</legend>
                {editing.publicPresentation?.introVideoUrl ? (
                  <div className="program-video-preview">
                    <video
                      src={editing.publicPresentation.introVideoUrl}
                      controls
                      preload="metadata"
                    />
                    <div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => chooseMedia("video")}
                      >
                        Replace video
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          patch("introVideoUrl", "");
                          patch("introVideoPublicId", "");
                        }}
                      >
                        Remove video
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="program-video-empty">
                    <p>
                      Add an optional welcome video to the public program
                      presentation.
                    </p>
                    <div>
                      <label className="website-upload-button">
                        Upload video
                        <input
                          type="file"
                          accept="video/mp4,video/webm,video/quicktime"
                          onChange={(e) => upload(e.target.files?.[0])}
                        />
                      </label>
                      <Button
                        variant="outline"
                        onClick={() => chooseMedia("video")}
                      >
                        Choose existing media
                      </Button>
                    </div>
                  </div>
                )}
                {showLibrary === "video" ? (
                  <div className="website-media-library">
                    <strong>Choose existing media</strong>
                    {media.length ? (
                      media.map((asset) => (
                        <button
                          key={`${asset.contentId}-${asset.publicId || asset.url}`}
                          type="button"
                          onClick={() => {
                            patch("introVideoUrl", asset.url);
                            patch("introVideoPublicId", asset.publicId || "");
                            setShowLibrary(false);
                          }}
                        >
                          <video src={asset.url} preload="metadata" />
                          <span>{asset.title || "Workspace video"}</span>
                        </button>
                      ))
                    ) : (
                      <p>No reusable videos are in the media library yet.</p>
                    )}
                  </div>
                ) : null}
              </fieldset>
            </section>
            <section className="program-editor-group">
              <header>
                <span>4</span>
                <div>
                  <h4>Display order</h4>
                  <p>Lower numbers appear first on the public website.</p>
                </div>
              </header>
              <label>
                Display order
                <input
                  type="number"
                  value={editing.publicPresentation?.sortOrder || 0}
                  onChange={(e) => patch("sortOrder", Number(e.target.value))}
                />
              </label>
            </section>
          </div>
        ) : null}
      </Modal>
    </section>
  );
}
