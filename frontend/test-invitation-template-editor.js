import assert from "node:assert/strict";
import fs from "node:fs";
import { insertPersonalization } from "./src/utils/invitationTemplateTokens.js";

const inserted = insertPersonalization("Hello , welcome", "First name", 6, 6);
assert.equal(inserted.value, "Hello [First name], welcome");
assert.equal(inserted.cursor, 18);
const replaced = insertPersonalization("Before selected after", "Business name", 7, 15);
assert.equal(replaced.value, "Before [Business name] after");

const component = fs.readFileSync(new URL("src/components/InvitationTemplates.jsx", import.meta.url), "utf8");
assert(component.includes('useRef(null)'));
assert(component.includes('input?.selectionStart'));
assert(component.includes('input?.selectionEnd'));
assert(component.includes('Email preview · sample data only'));
assert(component.includes('setSamples({ ...samples'));
assert(!component.includes('workspaceName: "Your business"'));
assert(!component.includes('body: `${draft.body}'));
assert(component.includes('fetchWorkspaceConfig()'));
console.log("Invitation editor cursor insertion, isolated preview samples, and workspace identity UI checks passed.");
