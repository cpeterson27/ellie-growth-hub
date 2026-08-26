import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import { createServer } from "vite";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

const members = [
  { id: "owner", name: "Alexandra Catherine Montgomery-Sutherland", email: "alexandra.montgomery.sutherland+workspace.administration@example.test", roles: ["owner", "coach", "ambassador"], status: "active" },
  { id: "pending", name: "Jordan Taylor", email: "averylongunbrokenemailaddressforresponsiveverification@example.test", roles: ["coach", "ambassador", "closer"], status: "invited", invitation: { status: "sent", sentAt: "2026-08-26" } },
  { id: "inactive", name: "Inactive team member", email: "inactive@example.test", roles: ["member"], status: "suspended" },
  { id: "expired", name: "Expired invitation", email: "expired@example.test", roles: ["viewer"], status: "invited", invitation: { status: "expired", sentAt: "2026-08-01" } },
];
const server = await createServer({
  server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom",
  plugins: [{ name: "team-layout-fixtures", enforce: "pre", transform(code, id) {
    if (id.endsWith("/components/TeamAccess.jsx")) return code.replace("useState([]), [catalog", `useState(${JSON.stringify(members)}), [catalog`);
  } }],
});
let html;
try {
  const { default: TeamAccess } = await server.ssrLoadModule("/src/components/TeamAccess.jsx");
  const render = roles => renderToStaticMarkup(createElement(MemoryRouter, null, createElement(TeamAccess, { canManage: true, actorRoles: roles })));
  const owner = render(["owner"]);
  assert.equal((owner.match(/team-access__identity-copy/g) || []).length, 4);
  assert.equal((owner.match(/Manage access/g) || []).length, 4);
  assert.equal((owner.match(/Resend invitation/g) || []).length, 2);
  assert.equal((render(["admin"]).match(/Manage access/g) || []).length, 3);
  assert(owner.includes(members[0].name) && owner.includes(members[1].email));
  assert(owner.includes("Pending signup") && owner.includes("Owner / Business Owner"));
  assert(owner.includes('class="team-access__status">Inactive</span>'));
  assert(owner.includes('class="team-access__status">Expired</span>'));
  const source = fs.readFileSync("src/components/TeamAccess.jsx", "utf8");
  assert(source.includes("onClick={() => begin(member)}"));
  assert(source.includes("onClick={() => reopen(member)}"));
  const css = fs.readFileSync("src/components/TeamAccess.css", "utf8");
  assert(css.includes("container-type:inline-size"));
  assert(css.includes("@container(max-width:440px)"));
  assert(css.includes("white-space:nowrap;overflow-wrap:normal"));
  const styles = ["src/index.css", "src/pages/Settings.css", "src/components/Button.css", "src/components/UserAvatar.css", "src/components/TeamAccess.css"].map(path => fs.readFileSync(path, "utf8")).join("\n");
  html = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Team layout fixtures</title><style>${styles}body{margin:0;padding:24px}main{max-width:1100px;margin:auto}</style><main>${owner}</main>`;
  console.log("Team member fixture rendering, long content, role visibility, actions and responsive layout contracts passed.");
} finally { await server.close(); }
if (process.argv.includes("--preview")) {
  http.createServer((_request, response) => { response.writeHead(200, { "Content-Type": "text/html" }); response.end(html); }).listen(4179, "127.0.0.1", () => console.log("Static fixture preview: http://127.0.0.1:4179"));
}
