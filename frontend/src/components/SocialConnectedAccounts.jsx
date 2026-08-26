import { Link } from "react-router-dom";
import { FaFacebookF, FaInstagram, FaLinkedinIn } from "react-icons/fa";
import Button from "./Button.jsx";
import { channelDefinitions, connectionState } from "./socialConnectionPresentation.js";
import "./SocialConnectedAccounts.css";

const icons = { meta: FaFacebookF, instagram: FaInstagram, linkedin: FaLinkedinIn };
const date = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : "Not recorded";
function ChannelRow({ channel, connection, busy, onConnect, onDisconnect, onSelectAssets }) {
  const Icon = icons[channel.provider];
  const state = connectionState(connection);
  const selectedIds = connection.selectedAssetIds || [];
  const assets = connection.assets || [];
  const selected = assets.filter(asset => selectedIds.includes(asset.id) && (!channel.assetType || asset.type === channel.assetType));
  return <article className={`social-channel ${channel.secondary ? "social-channel--secondary" : ""}`}>
    <div className="social-channel-main">
      <span className={`social-channel-icon social-channel-icon--${channel.provider}`} aria-hidden="true">{Icon ? <Icon/> : "𝕏"}</span>
      <div className="social-channel-copy"><h3>{channel.name}</h3><p>{connection.connected ? selected.map(asset => asset.username ? `@${asset.username.replace(/^@/, "")}` : asset.name).filter(Boolean).join(", ") || connection.account?.name || "Account authorized — choose an account below" : channel.description}</p></div>
      <span className={`social-connection-badge social-connection-badge--${state.tone}`}>{state.label}</span>
      <div className="social-channel-action">{connection.configured ? <Button disabled={busy} onClick={() => onConnect(connection.provider)}>{connection.connected || state.tone === "attention" ? `Reconnect ${channel.name}` : `Connect ${channel.name}`}</Button> : <span className="social-setup-label">Setup required</span>}</div>
    </div>
    {connection.connected && !selected.length && <p className="social-channel-hint">Choose which {channel.provider === "meta" ? "Page or linked Instagram account" : "accounts"} Growth Operator can use.</p>}
    <details className="social-connection-details"><summary>{connection.connected ? "Manage connection" : "Connection details"}</summary>
      {connection.connected && assets.length > 0 && <fieldset disabled={busy}><legend>Authorized accounts</legend>{assets.map(asset => <label key={asset.id}><input type="checkbox" checked={selectedIds.includes(asset.id)} onChange={event => onSelectAssets(connection.provider, event.target.checked ? [...selectedIds, asset.id] : selectedIds.filter(id => id !== asset.id))}/><span>{asset.name || asset.username || "Account"}<small>{asset.type?.replaceAll("_", " ")}</small></span></label>)}</fieldset>}
      <dl><div><dt>Authorization method</dt><dd>{channel.method}</dd></div><div><dt>Last verified</dt><dd>{date(connection.lastVerifiedAt)}</dd></div><div><dt>Authorization expires</dt><dd>{date(connection.expiresAt)}</dd></div><div><dt>Granted permissions</dt><dd>{connection.scopes?.join(", ") || "None yet"}</dd></div>{connection.declinedScopes?.length > 0 && <div><dt>Permissions needing attention</dt><dd>{connection.declinedScopes.join(", ")}</dd></div>}</dl>
      {connection.webhookSubscriptions?.map(row => <p key={row.assetId}>Event subscription: {row.status?.replaceAll("_", " ")} · {row.fields?.join(", ")}</p>)}
      <p>{channel.provider === "meta" ? "Facebook Login can also authorize linked professional Instagram accounts. Available actions depend on the selected assets and approved permissions." : channel.provider === "instagram" ? "A professional Instagram account and approved permissions are required." : channel.provider === "linkedin" ? "Organization publishing requires approved Community Management access and organization permissions." : "Text publishing is available after external setup. Media upload and account-activity ingestion are not implemented."} Provider credentials and app approval are managed by your administrator.</p>
      {connection.connected && <Button variant="outline" disabled={busy} onClick={() => onDisconnect(connection.provider)}>Disconnect {channel.name}</Button>}
    </details>
  </article>;
}

export default function SocialConnectedAccounts({ data, busy, onConnect, onDisconnect, onSelectAssets }) {
  const render = channel => {
    const connection = data.connections.find(row => row.provider === channel.provider);
    return connection ? <ChannelRow key={channel.provider} {...{ channel, connection, busy, onConnect, onDisconnect, onSelectAssets }}/> : null;
  };
  return <div className="social-connections" aria-busy={busy}>
    <section aria-labelledby="connected-accounts-heading"><header className="social-connections-heading"><h2 id="connected-accounts-heading">Connected Accounts</h2><p>Choose the accounts you want to work with. You stay in control of what gets shared.</p></header><div className="social-channel-list">{channelDefinitions.filter(channel => !channel.secondary).map(render)}</div></section>
    <section aria-labelledby="more-channels-heading"><header className="social-connections-heading"><h2 id="more-channels-heading">More channels</h2><p>Additional channels may need provider setup and approval.</p></header><div className="social-channel-list">{channelDefinitions.filter(channel => channel.secondary).map(render)}</div></section>
    <section className="social-automation-safety" aria-labelledby="automation-safety-heading"><div><h2 id="automation-safety-heading">Automation safety</h2><p>Connecting an account does not enable publishing or automatic replies.</p></div><dl>{[["Publishing", data.publishingEnabled], ["Automatic replies", data.automaticRepliesEnabled]].map(([label, enabled]) => <div key={label}><dt>{label}</dt><dd className={`social-connection-badge social-connection-badge--${enabled === true ? "attention" : "neutral"}`}>{enabled === true ? "Enabled" : enabled === false ? "Disabled" : "Status unavailable"}</dd></div>)}</dl></section>
    <details className="social-workspace-details"><summary>Workspace tools</summary><p>AI: {data.ai?.enabled ? "Enabled" : "Setup required — manual creation remains available"}</p><Link to="/ambassadors/welcome-template">Manage Ambassador welcome templates</Link></details>
  </div>;
}
