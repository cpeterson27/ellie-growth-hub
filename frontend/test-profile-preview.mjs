// Local-only browser harness. Actual MyProfile component; all API calls stay in memory.
import { createServer } from "vite";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL(".", import.meta.url));
const fixtureModule = `
import React from "react";
import { createRoot } from "react-dom/client";
import MyProfile from "/src/pages/MyProfile.jsx";
import AuthContext from "/src/context/AuthContextValue.js";
import api from "/src/services/api.js";
let user = { name: "Jordan Example", email: "jordan@example.test", jobTitle: "Community builder", company: "Example Organization", bio: "Connecting people and opportunities.", timezone: "America/Los_Angeles", socialProfiles: {}, avatarUrl: "" };
api.defaults.adapter = async (config) => {
  if (config.url !== "/auth/profile" && config.url !== "/auth/profile/avatar") throw Error("Unexpected API call blocked");
  if (config.method === "patch") user = { ...user, ...JSON.parse(config.data) };
  if (config.url.endsWith("/avatar")) user.avatarUrl = config.method === "delete" ? "" : JSON.parse(config.data).file;
  return { data: { user: { ...user } }, status: 200, statusText: "OK", headers: {}, config };
};
createRoot(document.getElementById("root")).render(React.createElement(AuthContext.Provider, { value: { session: { user, roles: ["ambassador"], workspace: { name: "Example Workspace" } }, updateSessionUser() {} } }, React.createElement(MyProfile)));
`;
const server = await createServer({ root, server: { host: "127.0.0.1", port: 5178, strictPort: true }, plugins: [{
  name: "profile-fixture",
  configureServer(server) { server.middlewares.use(async (req, res, next) => {
    if (req.url !== "/__profile_test") return next();
    res.setHeader("Content-Type", "text/html");
    res.end(await server.transformIndexHtml(req.url, '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"/><style>body{margin:24px;background:#f5f7f6;font-family:Arial,sans-serif}</style></head><body><div id="root"></div><script type="module" src="/@id/virtual:profile-fixture"></script></body></html>'));
  }); },
  resolveId(id) { if (id === "virtual:profile-fixture") return "\0profile-fixture.jsx"; },
  load(id) { if (id === "\0profile-fixture.jsx") return fixtureModule; },
}] });
await server.listen();
console.log("Local mocked profile preview: http://127.0.0.1:5178/__profile_test");
