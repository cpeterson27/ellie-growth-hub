export const channelDefinitions = [
  { provider: "meta", name: "Facebook Page and linked Instagram", description: "Connect a Facebook Page and choose its linked professional Instagram account", method: "Facebook Login for Business", assetType: "facebook_page" },
  { provider: "instagram", name: "Instagram", description: "Alternative: sign in directly to the professional Instagram account", method: "Direct Instagram Login", assetType: "instagram_business" },
  { provider: "linkedin", name: "LinkedIn", description: "Company and professional publishing", method: "LinkedIn OAuth", secondary: true },
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
