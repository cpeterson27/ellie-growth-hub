import { useEffect, useState } from "react";
import { FiCheck, FiClipboard, FiCode, FiX } from "react-icons/fi";
import Button from "../components/Button.jsx";
import { approveDevelopmentRequest, fetchDevelopmentRequests, rejectDevelopmentRequest } from "../services/api.js";
import "./DevelopmentRequests.css";

export default function DevelopmentRequests() {
  const [secret, setSecret] = useState(() => sessionStorage.getItem("ellie-development-approval-secret") || "");
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState("");

  const load = async (approvalSecret = secret) => {
    if (!approvalSecret) return;
    try {
      setLoading(true);
      setError("");
      const response = await fetchDevelopmentRequests(approvalSecret);
      setRequests(response.data || []);
      sessionStorage.setItem("ellie-development-approval-secret", approvalSecret);
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Unable to open the developer approval queue.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (secret) load(secret); }, []);

  const updateRequest = async (id, decision) => {
    try {
      setError("");
      if (decision === "approve") await approveDevelopmentRequest(id, secret);
      else await rejectDevelopmentRequest(id, secret);
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Unable to update this request.");
    }
  };

  const copyBrief = async (request) => {
    await navigator.clipboard.writeText(request.codexBrief);
    setCopiedId(request._id);
    window.setTimeout(() => setCopiedId(""), 1800);
  };

  return <div className="page-dashboard development-requests-page">
    <div className="page-header">
      <div>
        <h1 className="page-title">Development requests</h1>
        <p className="page-subtitle">Review software changes Jarvis captured. Approval creates a Codex-ready brief; it does not edit or deploy code automatically.</p>
      </div>
    </div>

    <section className="development-access-card">
      <div><strong>Developer approval access</strong><p>The secret stays in this browser session and is never included in a Jarvis conversation.</p></div>
      <input type="password" value={secret} onChange={(event) => setSecret(event.target.value)} placeholder="Development approval secret" />
      <Button onClick={() => load(secret)} loading={loading}>Open queue</Button>
    </section>

    {error ? <p className="form-error">{error}</p> : null}

    <div className="development-request-list">
      {requests.map((request) => <article className="development-request-card" key={request._id}>
        <div className="development-request-heading">
          <div className="development-request-icon"><FiCode /></div>
          <div><span className={`development-status development-status--${request.status}`}>{request.status.replaceAll("_", " ")}</span><h2>{request.title}</h2></div>
          <time>{new Date(request.createdAt).toLocaleString()}</time>
        </div>
        <p>{request.description}</p>
        <div className="development-request-meta"><span>Priority: {request.priority}</span><span>Risk: {request.risk}</span><span>Requested by: {request.requestedBy}</span></div>
        {request.codexBrief ? <pre className="development-codex-brief">{request.codexBrief}</pre> : null}
        <div className="development-request-actions">
          {request.status === "pending_approval" ? <>
            <Button onClick={() => updateRequest(request._id, "approve")}><FiCheck /> Approve</Button>
            <Button variant="outline" onClick={() => updateRequest(request._id, "reject")}><FiX /> Reject</Button>
          </> : null}
          {request.status === "approved" && request.codexBrief ? <Button variant="outline" onClick={() => copyBrief(request)}><FiClipboard /> {copiedId === request._id ? "Copied" : "Copy for Codex"}</Button> : null}
        </div>
      </article>)}
      {!loading && secret && !error && requests.length === 0 ? <div className="table-state table-state--empty">No development requests yet. Ask Jarvis to draft a software change.</div> : null}
    </div>
  </div>;
}
