const { AsyncLocalStorage } = require("async_hooks");

const storage = new AsyncLocalStorage();

function runWithWorkspace(workspaceId, callback) {
  if (!workspaceId) return callback();
  return storage.run({ workspaceId: String(workspaceId) }, callback);
}

function currentWorkspaceId() {
  return storage.getStore()?.workspaceId || null;
}

module.exports = { currentWorkspaceId, runWithWorkspace };
