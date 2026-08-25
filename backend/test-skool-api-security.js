const assert = require("assert");
const fs = require("fs");
const path = require("path");

const routes = fs.readFileSync(path.join(__dirname, "routes/coaching.js"), "utf8");
const server = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");

assert.match(routes, /router\.put\("\/skool\/configure", requireAdmin/);
assert.match(routes, /router\.patch\("\/programs\/:id\/skool-mapping", requireAdmin/);
assert.match(routes, /router\.get\("\/skool\/access-requests", requireAdmin/);
assert.match(routes, /router\.get\("\/skool\/purchases", requireAdmin/);
assert.match(routes, /router\.post\("\/enrollments\/:id\/skool-access", requireAdmin/);
assert.match(routes, /workspaceId: req\.auth\.workspaceId/g);
assert.match(routes, /x-growth-operator-signature/);
assert.match(routes, /x-growth-operator-workspace/);
assert.match(server, /\/api\/coaching\/skool\/adapter\/events/);
assert.match(routes, /externalRefs\.skoolStatus/);
assert.doesNotMatch(routes, /req\.body\?\.workspaceId|req\.body\.workspaceId/);

console.log("Skool API security contract tests passed");
