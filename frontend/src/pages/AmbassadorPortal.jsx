import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FiCheck, FiDollarSign, FiLink, FiUsers } from "react-icons/fi";
import AmbassadorContentTasks from "../components/AmbassadorContentTasks.jsx";
import Button from "../components/Button.jsx";
import UserAvatar from "../components/UserAvatar.jsx";
import { fetchMyAmbassadorPayouts, fetchMyAmbassadorProfile, fetchMyAmbassadorReferrals } from "../services/api.js";
import { copyReferralLink } from "../utils/ambassadorReferralFields.js";
import "./AmbassadorPortal.css";
import "./AmbassadorProfile.css";

const money = (amount, currency = "USD") => new Intl.NumberFormat("en-US", { style: "currency", currency }).format((amount || 0) / 100);
const date = (value) => value ? new Date(value).toLocaleDateString() : "Not yet";
const label = (value) => String(value || "").replaceAll("_", " ");

export default function AmbassadorPortal() {
  const [profile, setProfile] = useState(null), [referrals, setReferrals] = useState([]), [payouts, setPayouts] = useState([]), [error, setError] = useState(""), [copyStatus, setCopyStatus] = useState("");
  const load = () => Promise.all([fetchMyAmbassadorProfile(), fetchMyAmbassadorReferrals(), fetchMyAmbassadorPayouts()]).then(([a, b, c]) => { setProfile(a); setReferrals(b); setPayouts(c); }).catch((err) => setError(err.response?.data?.error || "Unable to load ambassador dashboard."));
  useEffect(() => { load(); }, []);
  const total = (status) => payouts.filter((row) => row.status === status).reduce((sum, row) => sum + row.commissionAmountMinor, 0);
  const copyLink = async () => { setCopyStatus(""); try { await copyReferralLink(profile?.referralUrl); setCopyStatus("Referral link copied."); } catch { setCopyStatus("Copy failed. Select and copy the link manually."); } };

  return <div className="ambassador-page">
    <header className="ambassador-profile-header"><UserAvatar user={profile?.userId} name={profile?.displayName} size="lg"/><div><p>Brand Ambassador</p><h1>{profile?.displayName || "My ambassador dashboard"}</h1><span>Your referral activity and commission history are private to your account.</span><Link to="/profile">View shared profile</Link></div></header>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    <section className="ambassador-referral-card" aria-labelledby="my-referral-link-title">
      <div className="ambassador-referral-card__heading"><FiLink aria-hidden="true"/><div><p>Referral tools</p><h2 id="my-referral-link-title">My referral link</h2></div></div>
      <p>Share this complete link with people who have asked to learn more. Lead Porch will preserve your referral when they submit the public program application.</p>
      <dl><div><dt>Referral code</dt><dd>{profile?.referralCode || "Not configured"}</dd></div></dl>
      <div className="ambassador-copy-row"><input aria-label="My complete referral URL" readOnly value={profile?.referralUrl || "Your link will appear after your account is activated."}/><Button onClick={copyLink} disabled={!profile?.referralUrl}>Copy referral link</Button></div>
      {copyStatus ? <p className="ambassador-copy-status" role="status"><FiCheck aria-hidden="true"/>{copyStatus}</p> : null}
      <small>Use the full link exactly as shown. Referral progress appears below after a person submits an application.</small>
    </section>
    <section className="ambassador-panel"><div className="ambassador-profile-complete"><span><strong>Profile {profile?.completeness?.percent || 0}% complete</strong><small>Required: {(profile?.completeness?.requiredFields || []).join(" · ")}</small></span><progress max="100" value={profile?.completeness?.percent || 0}/><Link to="/profile">Edit My Profile</Link></div><p><strong>Welcome post:</strong> {label(profile?.welcomePost?.status || "waiting_for_profile")}</p><small>Referral identity, commission settings, role, and account status are managed by the workspace Owner/Admin.</small></section>
    <AmbassadorContentTasks/>
    <section className="ambassador-summary"><article><FiUsers/><strong>{referrals.length}</strong><span>My referrals</span></article><article><FiDollarSign/><strong>{money(total("pending"), payouts[0]?.currency)}</strong><span>Pending commission</span></article><article><FiDollarSign/><strong>{money(total("approved"), payouts[0]?.currency)}</strong><span>Approved commission</span></article><article><FiDollarSign/><strong>{money(total("paid"), payouts[0]?.currency)}</strong><span>Paid commission</span></article></section>
    {profile?.communityUrl ? <section className="ambassador-panel"><h2>Ambassador community</h2><p>This community entry point was explicitly enabled for your ambassador profile.</p><a href={profile.communityUrl} target="_blank" rel="noreferrer">Open community</a></section> : null}
    <section className="ambassador-panel"><h2>My referrals</h2><p className="ambassador-panel__intro">You see only referrals attributed to your ambassador profile. Contact details and private application answers remain with the workspace team.</p>{referrals.length ? referrals.map((row) => <article className="ambassador-row" key={row._id}><span><strong>{row.referredPerson || "Referred person"}</strong><small>Referred {date(row.attributedAt)}{row.applicationStatus ? ` · Application ${label(row.applicationStatus)}` : ""}{row.enrollmentStatus ? ` · Enrollment ${label(row.enrollmentStatus)}` : ""}</small></span><em>{label(row.state)}</em></article>) : <p className="ambassador-empty">No referrals yet. When someone uses your link and submits an application, their referral status will appear here.</p>}</section>
    <section className="ambassador-panel"><h2>My commission and payment history</h2><p className="ambassador-panel__intro">Commission approval and payment are managed by the workspace team; this history is read-only.</p>{payouts.length ? payouts.map((row) => <article className="ambassador-row" key={row._id}><span><strong>{money(row.commissionAmountMinor, row.currency)}</strong><small>{row.productLabel || "Qualifying referral"} · Recorded {date(row.calculatedAt)}{row.approvedAt ? ` · Approved ${date(row.approvedAt)}` : ""}{row.paidAt ? ` · Paid ${date(row.paidAt)}` : ""}</small></span><em>{label(row.status)}</em></article>) : <p className="ambassador-empty">No commissions yet. A commission appears after the workspace records a qualifying conversion.</p>}</section>
  </div>;
}
