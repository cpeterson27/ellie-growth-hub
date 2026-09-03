export const channelDefinitions = [
  { provider: "meta", name: "Facebook + Instagram", description: "Connect your Facebook Page and the professional Instagram account linked to it.", connectLabel: "Connect Facebook & Instagram", method: "Facebook Login for Business", assetType: "facebook_page", recommended: true },
  { provider: "instagram", name: "Instagram only", description: "Connect an Instagram professional account without connecting Facebook.", connectLabel: "Connect Instagram only", method: "Direct Instagram Login", assetType: "instagram_business" },
  { provider: "linkedin", name: "LinkedIn", description: "Connect a LinkedIn Page your business is authorized to manage.", connectLabel: "Connect LinkedIn", method: "LinkedIn OAuth", assetType: "linkedin_organization", secondary: true },
  { provider: "x", name: "X / Twitter", description: "Text publishing after provider setup", method: "OAuth 2.0 with PKCE", secondary: true },
];

export function connectionState(connection, now = Date.now()) {
  if (["expired", "failed"].includes(connection.status) ||
      (connection.connected && (connection.authorization?.valid === false ||
        connection.declinedScopes?.length ||
        [connection.expiresAt, connection.authorization?.dataAccessExpiresAt].some(value => value && new Date(value).getTime() <= now + 7 * 86400000) ||
        connection.webhookSubscriptions?.some(row => ["failed", "not_subscribed"].includes(row.status))))) {
    return { label: "Needs attention", tone: "attention" };
  }
  return connection.connected ? { label: "Connected", tone: "connected" } : { label: "Not connected", tone: "neutral" };
}
