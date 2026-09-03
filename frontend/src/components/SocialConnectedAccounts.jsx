import { Link } from "react-router-dom";
import { FaFacebookF, FaInstagram, FaLinkedinIn } from "react-icons/fa";
import Button from "./Button.jsx";
import { channelDefinitions, connectionState } from "./socialConnectionPresentation.js";
import "./SocialConnectedAccounts.css";

const icons = { meta: FaFacebookF, instagram: FaInstagram, linkedin: FaLinkedinIn };
const date = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : "Not recorded";
const socialAssetIdentity = asset => ({
  primary: asset?.username ? `@${String(asset.username).replace(/^@/, "")}` : asset?.name || "Account",
  secondary: asset?.username && asset?.name && asset.name !== asset.username ? asset.name : "",
});
function ChannelRow({ channel, connection, connections, busy, onConnect, onDisconnect, onSelectAssets, onRefresh }) {
  const Icon = icons[channel.provider];
  const state = connectionState(connection);
  const selectedIds = connection.selectedAssetIds || [];
  const assets = connection.assets || [];
  const selected = assets.filter(asset => selectedIds.includes(asset.id) && (!channel.assetType || asset.type === channel.assetType));
  const visibleAssets = channel.provider === "meta" ? assets.filter(asset => ["facebook_page", "instagram_business"].includes(asset.type)) : assets.filter(asset => !channel.assetType || asset.type === channel.assetType);
  const elsewhere = new Set(connections.filter(row => row.provider !== connection.provider).flatMap(row => row.selectedAssetIds || []));
  const choose = (asset, checked) => onSelectAssets(connection.provider, checked ? [...selectedIds, asset.id] : selectedIds.filter(id => id !== asset.id && !assets.some(row => row.id === id && row.parentId === asset.id)));
  const accountPicker = connection.connected && assets.length > 0 && <fieldset className="social-page-picker" disabled={busy}>
    <legend>{channel.provider === "meta" ? "Choose the Facebook Page Growth Operator should manage" : channel.provider === "linkedin" ? "Choose the LinkedIn Page Growth Operator should manage" : "Choose your professional account"}</legend>
    <p>Only selected accounts are used. Discovering an account does not activate it.</p>
    {assets.map(asset => {
      const ownedElsewhere = elsewhere.has(asset.id);
      const needsParent = asset.type === "instagram_business" && asset.parentId && !selectedIds.includes(asset.parentId);
      const linked = assets.find(row => row.parentId === asset.id);
      const identity = socialAssetIdentity(asset);
      return <label key={asset.id}><input type="checkbox" checked={selectedIds.includes(asset.id)} disabled={ownedElsewhere || needsParent} onChange={event => choose(asset, event.target.checked)}/>
        {asset.avatarUrl ? <img className="social-asset-avatar" src={asset.avatarUrl} alt={`${identity.primary} profile`} referrerPolicy="no-referrer"/> : <span className="social-asset-avatar social-asset-initials" aria-hidden="true">{(asset.name || asset.username || "Account").slice(0, 1).toUpperCase()}</span>}
        <span>{identity.primary}<small>{[identity.secondary, ownedElsewhere ? "Already connected through another method — deselect it there to switch" : needsParent ? "Select its Facebook Page first" : selectedIds.includes(asset.id) ? "Selected" : "Available to select", linked ? `Linked Instagram: @${linked.username || linked.name}` : ""].filter(Boolean).join(" · ")}</small></span></label>;
    })}
    {channel.provider === "meta" && <p>A linked Instagram account becomes active only after you select it with its Facebook Page.</p>}
  </fieldset>;
  if (!connection.connected && !channel.secondary) return <article className="social-channel social-channel--choice">
    <div className="social-choice-heading">
      <span className={`social-channel-icon social-channel-icon--${channel.provider}`} aria-hidden="true">{Icon ? <Icon/> : "𝕏"}</span>
      {channel.recommended && <span className="social-recommended-badge">Recommended</span>}
    </div>
    <div className="social-channel-copy"><h3>{channel.name}</h3><p>{channel.description}</p></div>
    {connection.configured ? <Button disabled={busy} onClick={() => onConnect(connection.provider)}>{channel.connectLabel || `Connect ${channel.name}`}</Button> : <span className="social-setup-label">Setup required</span>}
    {(connection.authorizationNotice || connection.lastError) && <details className="social-connection-details"><summary>Connection details</summary><p role="status">{connection.authorizationNotice || connection.lastError}</p></details>}
  </article>;
  return <article className={`social-channel ${connection.connected ? "social-channel--connected" : ""} ${channel.secondary ? "social-channel--secondary" : ""}`}>
    <div className="social-channel-main">
      <span className={`social-channel-icon social-channel-icon--${channel.provider}`} aria-hidden="true">{Icon ? <Icon/> : "𝕏"}</span>
      <div className="social-channel-copy"><h3>{channel.name}</h3><p>{connection.connected ? "Connected accounts" : channel.description}</p></div>
      <span className={`social-connection-badge social-connection-badge--${state.tone}`}>{state.label}</span>
      {connection.connected && <div className="social-channel-action"><button type="button" className="social-manage-link" onClick={event => event.currentTarget.closest("article")?.querySelector("details")?.setAttribute("open", "")}>Manage connection</button></div>}
    </div>
    {connection.connected && <div className="social-connected-assets">{visibleAssets.length ? visibleAssets.map(asset => { const identity = socialAssetIdentity(asset); const isSelected = selectedIds.includes(asset.id); return <div className="social-connected-asset" key={asset.id}>
      {asset.avatarUrl ? <img className="social-asset-avatar" src={asset.avatarUrl} alt={`${identity.primary} profile`} referrerPolicy="no-referrer"/> : <span className="social-asset-avatar social-asset-initials" aria-hidden="true">{(asset.name || asset.username || "Account").slice(0, 1).toUpperCase()}</span>}
      <span><strong>{asset.type === "facebook_page" ? "Facebook" : asset.type === "linkedin_organization" ? "LinkedIn" : asset.type === "x_account" ? "X" : "Instagram"}</strong><span>{identity.primary}</span>{identity.secondary && <small>{identity.secondary}</small>}</span>
      <span className={`social-asset-state ${isSelected ? "social-asset-state--selected" : ""}`}>{isSelected ? "Connected" : "Available"}</span>
    </div>; }) : <p className="social-empty-assets">{channel.provider === "linkedin" ? "No manageable LinkedIn Pages were returned. Confirm that you administer a LinkedIn Page and that organization access is approved, then reconnect." : "Account authorized — choose an account in Manage connection."}</p>}</div>}
    {connection.connected && !selected.length && accountPicker}
    <details className="social-connection-details"><summary>{connection.connected ? "Connection details" : "Connection details"}</summary>
      {connection.authorizationNotice && <p role="status">{connection.authorizationNotice}</p>}
      {selected.length > 0 && accountPicker}
      <dl><div><dt>Authorization method</dt><dd>{channel.method}</dd></div><div><dt>Last verified</dt><dd>{date(connection.lastVerifiedAt)}</dd></div><div><dt>Authorization expires</dt><dd>{date(connection.expiresAt)}</dd></div><div><dt>Granted permissions</dt><dd>{connection.scopes?.join(", ") || "None yet"}</dd></div>{connection.declinedScopes?.length > 0 && <div><dt>Permissions needing attention</dt><dd>{connection.declinedScopes.join(", ")}</dd></div>}</dl>
      {connection.webhookSubscriptions?.map(row => <p key={row.assetId}>Event subscription: {row.status?.replaceAll("_", " ")} · {row.fields?.join(", ")}</p>)}
      <p>{channel.provider === "meta" ? "Facebook Login can also authorize linked professional Instagram accounts. Available actions depend on the selected assets and approved permissions." : channel.provider === "instagram" ? "A professional Instagram account and approved permissions are required." : channel.provider === "linkedin" ? "Organization publishing requires approved Community Management access and organization permissions." : "Text publishing is available after external setup. Media upload and account-activity ingestion are not implemented."} Provider credentials and app approval are managed by your administrator.</p>
      {connection.disconnectNotice && <p>{connection.disconnectNotice}</p>}
      {connection.connected && <div className="social-connection-actions">{onRefresh && channel.provider === "instagram" && <Button variant="outline" disabled={busy} onClick={() => onRefresh("instagram")}>Refresh authorization</Button>}<Button variant="outline" disabled={busy} onClick={() => onConnect(connection.provider)}>Reconnect</Button><Button variant="outline" disabled={busy} onClick={() => onDisconnect(connection.provider)}>Disconnect</Button></div>}
    </details>
  </article>;
}

export default function SocialConnectedAccounts({ data, busy, onConnect, onDisconnect, onSelectAssets, onRefresh }) {
  const render = channel => {
    const connection = data.connections.find(row => row.provider === channel.provider);
    return connection ? <ChannelRow key={channel.provider} connections={data.connections} {...{ channel, connection, busy, onConnect, onDisconnect, onSelectAssets, onRefresh }}/> : null;
  };
  return <div className="social-connections" aria-busy={busy}>
    <section aria-labelledby="connected-accounts-heading"><header className="social-connections-heading"><h2 id="connected-accounts-heading">Connect your social accounts</h2><p>Choose how you want to connect. You can change or disconnect accounts later.</p></header><div className="social-channel-list social-channel-list--choices">{channelDefinitions.filter(channel => !channel.secondary).map(render)}</div><details className="social-choice-help"><summary>Which option should I choose?</summary><p><strong>Facebook + Instagram:</strong> Choose this when your Facebook Page and professional Instagram account are linked in Meta.</p><p><strong>Instagram only:</strong> Choose this when connecting an Instagram professional account directly.</p></details></section>
    <section aria-labelledby="more-channels-heading"><header className="social-connections-heading"><h2 id="more-channels-heading">More channels</h2><p>Additional channels may need provider setup and approval.</p></header><div className="social-channel-list">{channelDefinitions.filter(channel => channel.secondary).map(render)}</div></section>
    <section className="social-automation-safety" aria-labelledby="automation-safety-heading"><div><h2 id="automation-safety-heading">Automation safety</h2><p>Connecting an account does not enable publishing or automatic replies.</p></div><dl>{[["Publishing", data.publishingEnabled], ["Automatic replies", data.automaticRepliesEnabled]].map(([label, enabled]) => <div key={label}><dt>{label}</dt><dd className={`social-connection-badge social-connection-badge--${enabled === true ? "attention" : "neutral"}`}>{enabled === true ? "Enabled" : enabled === false ? "Disabled" : "Status unavailable"}</dd></div>)}</dl></section>
    <details className="social-workspace-details"><summary>Workspace tools</summary><p>AI: {data.ai?.enabled ? "Enabled" : "Setup required — manual creation remains available"}</p><Link to="/automations/content-template">Manage introduction content template</Link></details>
  </div>;
}
