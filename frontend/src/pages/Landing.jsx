import { Link } from "react-router-dom";
import { FiArrowRight, FiCheck, FiLayers, FiLock, FiMail, FiSearch, FiStar, FiUsers, FiZap } from "react-icons/fi";
import { useAuth } from "../context/AuthContext.jsx";
import "./Landing.css";

const features = [
  [FiUsers, "A CRM that remembers", "Bring contacts, organizations, context, and correspondence into one working relationship history."],
  [FiSearch, "Focused prospect discovery", "Build precise audiences, research the right people, and move qualified prospects into campaigns."],
  [FiMail, "Professional outreach", "Create one approved campaign message, personalize it thoughtfully, test it, and preserve every sent version."],
  [FiZap, "Jarvis at your side", "Turn campaign details, CRM activity, and next steps into clear recommendations and prepared work."],
  [FiLayers, "One campaign command center", "Coordinate events, offers, audiences, outreach, replies, content, and performance without losing the thread."],
  [FiLock, "Private by design", "Each customer receives a protected workspace. Owners control who joins their team and what each member can do."],
];

export default function Landing() {
  const { loading, session } = useAuth();
  const signedIn = !loading && Boolean(session);

  return (
    <div className="ellie-site">
      <header className="ellie-site__nav">
        <Link className="ellie-wordmark" to="/" aria-label="Ellie AI home"><span>E</span><strong>Ellie AI</strong></Link>
        <nav aria-label="Main navigation">
          <a href="#platform">Platform</a>
          <a href="#how-it-works">How it works</a>
          <a href="#pricing">Pricing</a>
        </nav>
        <div className="ellie-site__nav-actions">
          {loading ? <span className="text-link" aria-live="polite">Checking session…</span> : signedIn ? <>
            <span className="text-link">You’re signed in</span>
            <Link className="site-button site-button--small" to="/dashboard">Open Ellie AI</Link>
          </> : <>
            <Link className="text-link" to="/login">Client login</Link>
            <a className="site-button site-button--small" href="#pricing">Start Ellie</a>
          </>}
        </div>
      </header>

      <main>
        <section className="ellie-hero">
          <div className="ellie-hero__copy">
            <p className="site-kicker"><FiStar /> The intelligent growth workspace</p>
            <h1>Turn scattered contacts into <em>intentional growth.</em></h1>
            <p className="ellie-hero__lead">Ellie brings your CRM, campaigns, outreach, events, and follow-up into one private command center—guided by an AI operator that understands the work.</p>
            <div className="ellie-hero__actions"><a className="site-button" href="#pricing">Explore Ellie <FiArrowRight /></a><a className="site-button site-button--ghost" href="#how-it-works">See how it works</a></div>
            <div className="ellie-hero__proof"><span><FiCheck /> Private client workspaces</span><span><FiCheck /> Human-approved outreach</span><span><FiCheck /> Built for focused teams</span></div>
          </div>
          <div className="ellie-hero__visual" aria-label="Ellie AI campaign overview preview">
            <div className="hero-orbit hero-orbit--one" /><div className="hero-orbit hero-orbit--two" />
            <article className="hero-console">
              <header><span className="hero-console__mark">E</span><div><small>Current campaign</small><strong>Deal to Close</strong></div><i>Live</i></header>
              <div className="hero-console__metric"><span>Qualified audience</span><strong>45</strong><small>contacts ready for review</small></div>
              <div className="hero-console__steps"><p className="is-complete"><b><FiCheck /></b><span>Audience matched<small>Research and qualification complete</small></span></p><p className="is-active"><b>2</b><span>Approve master message<small>One version, personalized safely</small></span></p><p><b>3</b><span>Test and launch<small>Review before anything is sent</small></span></p></div>
              <footer><span>Jarvis recommends</span><p>Send a test, review the campaign footer, then schedule the approved audience.</p></footer>
            </article>
          </div>
        </section>

        <section className="ellie-marquee" aria-label="Ellie capabilities"><span>CRM</span><i /> <span>Campaigns</span><i /> <span>Prospecting</span><i /> <span>Outreach</span><i /> <span>Events</span><i /> <span>AI Content</span><i /> <span>Analytics</span></section>

        <section className="ellie-section" id="platform">
          <div className="section-heading"><p className="site-kicker">One connected platform</p><h2>Everything your growth work needs.<br /><em>Nothing important gets lost.</em></h2><p>Ellie replaces scattered spreadsheets, disconnected drafts, and forgotten follow-ups with one operating system for relationships and revenue.</p></div>
          <div className="ellie-feature-grid">{features.map(([Icon, title, body], index) => <article key={title}><span>0{index + 1}</span><Icon /><h3>{title}</h3><p>{body}</p></article>)}</div>
        </section>

        <section className="ellie-workflow" id="how-it-works">
          <div className="ellie-workflow__intro"><p className="site-kicker">Built around responsible momentum</p><h2>AI prepares the work.<br /><em>You stay in command.</em></h2><p>Ellie is designed to make a small team more capable without turning judgment over to automation.</p></div>
          <div className="ellie-workflow__steps">
            <article><span>01</span><div><h3>Define the goal</h3><p>Create an event or offer campaign and tell Ellie who it is for.</p></div></article>
            <article><span>02</span><div><h3>Find and qualify</h3><p>Research prospects, bring in trusted contact sources, and approve the audience.</p></div></article>
            <article><span>03</span><div><h3>Approve the message</h3><p>Edit one master template while Ellie prepares relevant personalization.</p></div></article>
            <article><span>04</span><div><h3>Test, launch, learn</h3><p>Send a test, approve delivery, track replies, and preserve the exact history.</p></div></article>
          </div>
        </section>

        <section className="ellie-delivery">
          <div><p className="site-kicker">Professional email operations</p><h2>The right channel for every message.</h2></div>
          <div className="ellie-delivery__grid"><article><strong>Prospecting</strong><h3>Targeted B2B outreach</h3><p>Evidence-backed lead research and carefully paced outreach with clear opt-out controls.</p></article><article><strong>Marketing</strong><h3>Subscribed campaigns</h3><p>Resend broadcasts for event invitations, program offers, and educational newsletters.</p></article><article><strong>Conversations</strong><h3>Personal follow-up</h3><p>Gmail for replies and direct correspondence, kept beside the complete contact history.</p></article></div>
        </section>

        <section className="ellie-pricing" id="pricing">
          <div><p className="site-kicker">Founding customer access</p><h2>Build your growth system with Ellie.</h2><p>Early customers receive a private workspace, guided setup, campaign configuration, and direct onboarding while self-service subscriptions are prepared.</p><ul><li><FiCheck /> Private owner account and workspace</li><li><FiCheck /> CRM and campaign setup</li><li><FiCheck /> Integrations and outreach configuration</li><li><FiCheck /> Team members added by invitation</li></ul></div>
          <article><p>Early access</p><h3>Founding workspace</h3><span>Custom onboarding</span><a className="site-button" href="mailto:team@elliescoaching.com?subject=Ellie%20AI%20Founding%20Access">Request founding access <FiArrowRight /></a><small>{signedIn ? <>Your session is active. <Link to="/dashboard">Open Ellie AI</Link></> : <>Already a client? <Link to="/login">Sign in to Ellie</Link></>}</small></article>
        </section>
      </main>

      <footer className="ellie-site__footer"><Link className="ellie-wordmark" to="/"><span>E</span><strong>Ellie AI</strong></Link><p>Intelligent growth, operated with intention.</p><div><Link to={signedIn ? "/dashboard" : "/login"}>{signedIn ? "Open Ellie AI" : "Client login"}</Link><a href="mailto:team@elliescoaching.com">Contact</a></div></footer>
    </div>
  );
}
