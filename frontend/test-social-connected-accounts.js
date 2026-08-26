import assert from "node:assert/strict";
import fs from "node:fs";
import { createServer } from "vite";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { connectionState, channelDefinitions } from "./src/components/socialConnectionPresentation.js";

assert.equal(connectionState({ connected: false, status: "disconnected" }).label, "Not connected");
assert.equal(connectionState({ connected: true }).label, "Connected");
for (const fixture of [{ status: "expired" }, { status: "failed" }, { connected: true, declinedScopes: ["messages"] }, { connected: true, authorization: { valid: false } }, { connected: true, expiresAt: "2020-01-01" }, { connected: true, webhookSubscriptions: [{ status: "failed" }] }]) assert.equal(connectionState(fixture).label, "Needs attention");
assert.equal(channelDefinitions.filter(row => row.provider === "x").length, 1);
assert.deepEqual(channelDefinitions.filter(row => !row.secondary).map(row => row.provider), ["meta", "instagram"]);
const source = fs.readFileSync("src/pages/SocialWorkspace.jsx", "utf8");
assert(source.includes("beginSocialConnection(provider)"));
assert(source.includes("window.location.assign(result.authorizationUrl)"));
assert(source.includes("disconnectSocialConnection(provider)"));
assert(source.includes("selectSocialAssets(provider, ids)"));
const component = fs.readFileSync("src/components/SocialConnectedAccounts.jsx", "utf8");
assert(component.includes("onConnect(connection.provider)"));
assert(component.includes("onSelectAssets(connection.provider"));
assert(!source.includes('className="social-account-grid"'));

// Render the actual component with fixtures; no HTTP listener, auth, or provider requests.
const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom" });
try {
  const { default: Accounts } = await server.ssrLoadModule("/src/components/SocialConnectedAccounts.jsx");
  const fixture = { connections: channelDefinitions.map(row => ({ provider: row.provider, configured: ["meta", "instagram"].includes(row.provider), assets: [], selectedAssetIds: [], scopes: [], connected: false })), publishingEnabled: false, automaticRepliesEnabled: false };
  const render = (data, busy = false) => renderToStaticMarkup(createElement(MemoryRouter, null, createElement(Accounts, { data, busy, onConnect() {}, onDisconnect() {}, onSelectAssets() {} })));
  const html = render(fixture);
  assert(html.includes("Connect Facebook")); assert(html.includes("Connect Instagram"));
  assert.equal((html.match(/<h3>X \/ Twitter<\/h3>/g) || []).length, 1);
  assert(!html.includes("Connect LinkedIn")); assert(!html.includes("Connect X"));
  assert(html.includes("More channels")); assert(html.includes("Automation safety"));
  assert.equal((html.match(/>Disabled<\/dd>/g) || []).length, 2);
  assert(!html.includes("<details open"));
  const connected = structuredClone(fixture);
  Object.assign(connected.connections[0], { connected: true, assets: [{ id: "page", type: "facebook_page", name: "Example Page" }], selectedAssetIds: ["page"] });
  Object.assign(connected.connections[1], { connected: true, assets: [{ id: "ig", type: "instagram_business", username: "example" }], selectedAssetIds: ["ig"] });
  const connectedHtml = render(connected);
  assert(connectedHtml.includes("Example Page")); assert(connectedHtml.includes("@example"));
  assert(connectedHtml.includes("Reconnect Facebook")); assert(connectedHtml.includes("Disconnect Instagram"));
  assert(connectedHtml.includes("checked"));
  assert(render(fixture, true).includes('disabled=""'));
  console.log("Connected Accounts: real component renders, Meta actions, statuses, selected assets, single X row, safety flags, setup states, and preserved handler contracts passed.");
} finally { await server.close(); }
