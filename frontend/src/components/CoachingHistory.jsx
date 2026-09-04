import { useMemo, useState } from "react";
import { FiCheckCircle, FiClipboard, FiEdit3, FiFlag } from "react-icons/fi";
import Button from "./Button.jsx";
import { EmptyState, StatusBadge } from "./WorkspaceUI.jsx";
import useAuth from "../context/useAuth.js";
import { createCoachingNote, fetchCoachingHandoffs, fetchCoachingNotes, saveAssignmentHandoff } from "../services/api.js";

const categories = ["general", "progress", "concern", "action_item", "handoff"];
const human = (value) => String(value || "").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const dateTime = (value) => value ? new Date(value).toLocaleString() : "Not recorded";
const idOf = (value) => value?._id || value || "";
const contactName = (contact) => contact?.name || [contact?.firstName, contact?.lastName].filter(Boolean).join(" ") || contact?.email || "Student";

function authorName(note) {
  return note.authorCoachProfileId?.displayName || note.authorUserId?.name || note.authorUserId?.email || "Lead Porch user";
}

export default function CoachingHistory({ student, coachMode = false }) {
  const { session } = useAuth();
  const [notes, setNotes] = useState(student.coachingNotes || []);
  const [handoffs, setHandoffs] = useState(student.coachingHandoffs || []);
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const openAssignments = useMemo(() => (student.coachAssignments || []).filter((item) => ["active", "scheduled"].includes(item.status)), [student.coachAssignments]);
  const [noteForm, setNoteForm] = useState(() => ({
    enrollmentId: idOf(openAssignments[0]?.enrollmentId) || idOf(student.enrollments?.[0]),
    coachAssignmentId: coachMode ? idOf(openAssignments[0]) : "",
    category: "general",
    body: "",
  }));
  const [handoffForm, setHandoffForm] = useState({ assignmentId: idOf(openAssignments.find((item) => item.status === "active") || openAssignments[0]), summary: "", progress: "", observations: "", actionItems: "" });
  const refresh = async () => {
    const [nextNotes, nextHandoffs] = await Promise.all([fetchCoachingNotes(student.contact._id), fetchCoachingHandoffs(student.contact._id)]);
    setNotes(nextNotes); setHandoffs(nextHandoffs);
  };
  const addNote = async (event) => {
    event.preventDefault(); setSaving(true); setNotice("");
    try { await createCoachingNote(student.contact._id, { ...noteForm, coachAssignmentId: noteForm.coachAssignmentId || null }); setNoteForm({ ...noteForm, body: "" }); await refresh(); setNotice("Internal coaching note added."); }
    catch (error) { setNotice(error?.response?.data?.error || error.message); }
    finally { setSaving(false); }
  };
  const submitHandoff = async (event) => {
    event.preventDefault(); setSaving(true); setNotice("");
    try { await saveAssignmentHandoff(handoffForm.assignmentId, { ...handoffForm, submit: true }); await refresh(); setNotice("Handoff submitted for the next coaching transition."); }
    catch (error) { setNotice(error?.response?.data?.error || error.message); }
    finally { setSaving(false); }
  };
  const enrollmentOptions = student.enrollments || [];
  const currentUserId = session?.user?._id;

  return <div className="coaching-history">
    {notice ? <p className="coaching-notice" role="status">{notice}</p> : null}
    <section className="coaching-panel coaching-panel--wide">
      <div className="coaching-panel__heading"><div><p className="workspace-eyebrow">Internal context</p><h2>Coaching notes</h2></div><FiEdit3 /></div>
      <form className="coaching-history__composer" onSubmit={addNote}>
        <div className="coaching-form__grid">
          <label>Enrollment<select required value={noteForm.enrollmentId} onChange={(event) => setNoteForm({ ...noteForm, enrollmentId: event.target.value })}>{enrollmentOptions.map((item) => <option key={item._id} value={item._id}>{item.coachingProgramId?.name || "Program"} · {human(item.currentStageKey)}</option>)}</select></label>
          <label>Assignment context<select required={coachMode} value={noteForm.coachAssignmentId} onChange={(event) => setNoteForm({ ...noteForm, coachAssignmentId: event.target.value })}><option value="">Enrollment-level note</option>{openAssignments.map((item) => <option key={item._id} value={item._id}>{human(item.stageKey)} · {human(item.status)}</option>)}</select></label>
          <label>Category<select value={noteForm.category} onChange={(event) => setNoteForm({ ...noteForm, category: event.target.value })}>{categories.map((item) => <option key={item} value={item}>{human(item)}</option>)}</select></label>
        </div>
        <label>Internal note<textarea required rows="4" value={noteForm.body} onChange={(event) => setNoteForm({ ...noteForm, body: event.target.value })} placeholder={`Record coaching context for ${contactName(student.contact)}. These notes are never student-facing.`} /></label>
        <Button type="submit" loading={saving}><FiEdit3 /> Add internal note</Button>
      </form>
      {notes.length ? <div className="coaching-history__records">{notes.map((note) => <article className="coaching-history__record" key={note._id}><header><div><strong>{authorName(note)}</strong><span>{dateTime(note.createdAt)}{note.updatedAt && note.updatedAt !== note.createdAt ? ` · updated ${dateTime(note.updatedAt)}` : ""}</span></div><StatusBadge tone={note.category === "concern" ? "danger" : note.category === "progress" ? "success" : "info"}>{human(note.category)}</StatusBadge></header><p>{note.body}</p><small>{note.coachAssignmentId?.stageKey ? `${human(note.coachAssignmentId.stageKey)} assignment` : "Enrollment context"}{String(note.authorUserId?._id || note.authorUserId) === String(currentUserId) ? " · Your note" : ""}</small></article>)}</div> : <EmptyState icon={<FiClipboard />} title="No coaching notes yet" description="Authorized coaches and administrators can record internal progress and continuity context here." />}
    </section>

    {coachMode && openAssignments.some((item) => item.status === "active") ? <section className="coaching-panel coaching-panel--wide">
      <div className="coaching-panel__heading"><div><p className="workspace-eyebrow">Stage completion</p><h2>Prepare coach handoff</h2></div><FiFlag /></div>
      <p className="coaching-muted">Submit the context an incoming coach needs. An administrator controls the actual assignment transition.</p>
      <form className="coaching-form" onSubmit={submitHandoff}>
        <label>Current assignment<select required value={handoffForm.assignmentId} onChange={(event) => setHandoffForm({ ...handoffForm, assignmentId: event.target.value })}>{openAssignments.filter((item) => item.status === "active").map((item) => <option key={item._id} value={item._id}>{human(item.stageKey)}</option>)}</select></label>
        <label>What was covered<textarea required rows="3" value={handoffForm.summary} onChange={(event) => setHandoffForm({ ...handoffForm, summary: event.target.value })} /></label>
        <label>Student progress<textarea rows="3" value={handoffForm.progress} onChange={(event) => setHandoffForm({ ...handoffForm, progress: event.target.value })} /></label>
        <label>Important observations<textarea rows="3" value={handoffForm.observations} onChange={(event) => setHandoffForm({ ...handoffForm, observations: event.target.value })} /></label>
        <label>Outstanding action items<textarea rows="3" value={handoffForm.actionItems} onChange={(event) => setHandoffForm({ ...handoffForm, actionItems: event.target.value })} /></label>
        <Button type="submit" loading={saving}><FiCheckCircle /> Submit handoff</Button>
      </form>
    </section> : null}

    <section className="coaching-panel coaching-panel--wide">
      <div className="coaching-panel__heading"><div><p className="workspace-eyebrow">Continuity</p><h2>Coach handoff history</h2></div><FiFlag /></div>
      {handoffs.length ? <div className="coaching-history__records">{handoffs.map((handoff) => <article className="coaching-history__record" key={handoff._id}><header><div><strong>{handoff.fromCoachProfileId?.displayName || "Previous coach"} → {handoff.toCoachProfileId?.displayName || "Next coach pending"}</strong><span>{human(handoff.fromStageKey)} → {human(handoff.toStageKey || "Pending stage")} · {dateTime(handoff.completedAt || handoff.submittedAt || handoff.createdAt)}</span></div><StatusBadge tone={handoff.status === "completed" ? "success" : "warning"}>{human(handoff.status)}</StatusBadge></header><p>{handoff.summary}</p>{handoff.progress ? <p><strong>Progress:</strong> {handoff.progress}</p> : null}{handoff.observations ? <p><strong>Observations:</strong> {handoff.observations}</p> : null}{handoff.actionItems ? <p><strong>Next actions:</strong> {handoff.actionItems}</p> : null}</article>)}</div> : <EmptyState icon={<FiFlag />} title="No coach handoffs yet" description="Handoffs remain preserved when a student moves between coaches or program stages." />}
    </section>

    <section className="coaching-panel coaching-panel--wide">
      <div className="coaching-panel__heading"><div><p className="workspace-eyebrow">Audit history</p><h2>Coaching activity</h2></div></div>
      {(student.coachingActivities || []).length ? <div className="coaching-history__timeline">{student.coachingActivities.map((item) => <article key={item._id}><i /><div><strong>{item.title}</strong><p>{item.body}</p><span>{dateTime(item.occurredAt || item.createdAt)}</span></div></article>)}</div> : <p className="coaching-muted">Coaching activity events will appear here as notes, handoffs, and assignment transitions occur.</p>}
    </section>

    <section className="coaching-panel coaching-panel--wide">
      <div className="coaching-panel__heading"><div><p className="workspace-eyebrow">Unified inbox history</p><h2>Email and SMS</h2></div></div>
      {(student.communicationMessages || []).length ? <div className="coaching-history__records">{student.communicationMessages.map((item) => <article className="coaching-history__record" key={item._id}><header><div><strong>{human(item.channel)} · {human(item.direction)}</strong><span>{dateTime(item.sentAt || item.receivedAt || item.createdAt)}</span></div><StatusBadge tone={item.deliveryStatus === "failed" ? "danger" : "info"}>{human(item.deliveryStatus)}</StatusBadge></header>{item.subject ? <strong>{item.subject}</strong> : null}<p>{item.body}</p></article>)}</div> : <p className="coaching-muted">No canonical email or SMS messages are attached to this Contact yet.</p>}
    </section>
  </div>;
}
