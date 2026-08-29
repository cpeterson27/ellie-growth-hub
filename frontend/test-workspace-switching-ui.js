import assert from "node:assert/strict";
import fs from "node:fs";

const read = file => fs.readFileSync(new URL(file, import.meta.url), "utf8");
const auth = read("src/context/AuthContext.jsx");
const login = read("src/pages/Login.jsx");
const navbar = read("src/components/Navbar.jsx");
const businesses = read("src/pages/Businesses.jsx");
const invitation = read("src/pages/AcceptInvitation.jsx");

assert(auth.includes('api.post("/auth/switch-workspace", { workspaceId })'));
assert(auth.includes('sessionStorage.setItem("ellie-csrf-token", sessionData.csrfToken)'));
assert(auth.includes('sessionStorage.setItem("ellie-session-token", sessionToken)'));
assert(login.includes("WORKSPACE_SELECTION_REQUIRED"));
assert(login.includes("Choose the workspace you want to open"));
assert(navbar.includes('aria-label="Current workspace"'));
assert(navbar.includes("session?.workspace?.name"));
assert(businesses.includes("Create an empty workspace"));
assert(businesses.includes("No customer data, configuration, credentials, integrations, or automations are copied."));
assert(invitation.includes("requiresAccountActivation"));
assert(invitation.includes("existing Growth Operator password"));
console.log("Workspace creation, explicit current workspace, multi-workspace selection, secure switching, and existing-user invitation UI checks passed.");
