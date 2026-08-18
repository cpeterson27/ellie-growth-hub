import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../components/Button.jsx";
import { PageHeader, StatusBadge, Tabs, Toolbar } from "../components/WorkspaceUI.jsx";
import { completeTask, fetchTasks } from "../services/api.js";
import "./Tasks.css";

const views = [{ id: "due", label: "Due now" }, { id: "upcoming", label: "Upcoming" }, { id: "all", label: "All open" }, { id: "completed", label: "Completed" }];

function taskRelationship(task) {
  return task.contactId?.name || task.organizationId?.name || task.metadata?.opportunityName || "Unlinked CRM task";
}

export default function Tasks() {
  const navigate = useNavigate();
  const [view, setView] = useState("due");
  const [tasks, setTasks] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  async function load(completed = view === "completed") {
    try { const result = await fetchTasks(completed); setTasks(result.data || []); setError(""); }
    catch { setError("Unable to load tasks."); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    let active = true;
    fetchTasks(view === "completed").then((result) => { if (active) { setTasks(result.data || []); setError(""); } }).catch(() => { if (active) setError("Unable to load tasks."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [view]);

  const visible = useMemo(() => {
    const endOfToday = new Date(); endOfToday.setHours(23, 59, 59, 999);
    return tasks.filter((task) => {
      const due = new Date(task.dueAt || task.occurredAt);
      const matchesView = view === "due" ? due <= endOfToday : view === "upcoming" ? due > endOfToday : true;
      const haystack = `${task.title} ${task.body || ""} ${taskRelationship(task)}`.toLowerCase();
      return matchesView && haystack.includes(search.toLowerCase());
    });
  }, [tasks, view, search]);

  async function markComplete(task) {
    const [origin, id] = task.taskId.split(":");
    try { setBusyId(task.taskId); await completeTask(origin, id); await load(false); }
    catch { setError("Unable to complete that task."); }
    finally { setBusyId(""); }
  }

  function openRelationship(task) {
    if (task.contactId?._id) navigate(`/crm/contacts/${task.contactId._id}`);
    else if (task.organizationId?._id) navigate(`/crm/companies/${task.organizationId._id}`);
    else if (task.origin === "opportunity") navigate("/opportunities");
  }

  return <div className="page-dashboard tasks-page">
    <PageHeader eyebrow="CRM execution" title="Tasks" description="One dependable queue for relationship follow-up and opportunity next actions." actions={<Button onClick={() => navigate("/crm/contacts")}>Open CRM</Button>} />
    <section className="task-summary"><div><span>Due now</span><strong>{tasks.filter((task) => new Date(task.dueAt || task.occurredAt) <= new Date()).length}</strong></div><div><span>Open queue</span><strong>{view === "completed" ? "—" : tasks.length}</strong></div><div><span>Opportunity actions</span><strong>{tasks.filter((task) => task.origin === "opportunity").length}</strong></div></section>
    <Tabs items={views} activeId={view} onChange={setView} label="Task views" />
    <Toolbar search={<input aria-label="Search tasks" placeholder="Search tasks or relationships" value={search} onChange={(event) => setSearch(event.target.value)} />} results={loading ? "Loading tasks" : `${visible.length} shown`} />
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    {!loading && !visible.length ? <section className="tasks-empty"><strong>{view === "due" ? "Nothing is due right now" : "No tasks match this view"}</strong><p>Tasks logged from contact or company timelines and opportunity next actions appear here automatically.</p></section> : <section className="task-list">{visible.map((task) => {
      const due = new Date(task.dueAt || task.occurredAt); const overdue = !task.completedAt && due < new Date();
      return <article key={task.taskId}><button className="task-check" type="button" disabled={Boolean(task.completedAt) || busyId === task.taskId} onClick={() => markComplete(task)} aria-label={`Complete ${task.title}`}>{task.completedAt ? "✓" : ""}</button><div><header><strong>{task.title}</strong><StatusBadge tone={task.completedAt ? "success" : overdue ? "danger" : "info"}>{task.completedAt ? "completed" : overdue ? "overdue" : "scheduled"}</StatusBadge></header>{task.body ? <p>{task.body}</p> : null}<button type="button" onClick={() => openRelationship(task)}>{taskRelationship(task)} →</button></div><time>{task.completedAt ? `Completed ${new Date(task.completedAt).toLocaleString()}` : `Due ${due.toLocaleString()}`}</time></article>;
    })}</section>}
  </div>;
}
