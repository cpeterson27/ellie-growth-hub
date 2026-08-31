import assert from "node:assert/strict";
import {
  createOwnerConfirmedVerificationResults,
  isUsableLinkedinConnectionRow,
  normalizeContactRows,
} from "./src/utils/contactImport.js";

const [linkedinContact] = normalizeContactRows([{
  "First Name": "Jordan",
  "Last Name": "Example",
  URL: "https://www.linkedin.com/in/jordan-example",
  "Email Address": "jordan@example.com",
  Company: "Example Capital",
  Position: "Principal",
}]);

assert.equal(linkedinContact.Email, "jordan@example.com");
assert.equal(linkedinContact["Person Linkedin Url"], "https://www.linkedin.com/in/jordan-example");
assert.equal(linkedinContact["Company Name"], "Example Capital");
assert.equal(linkedinContact.Title, "Principal");
assert.equal(isUsableLinkedinConnectionRow(linkedinContact), true);

const [footerRow] = normalizeContactRows([{
  "First Name": "cash app",
  "Last Name": "608",
}]);
assert.equal(isUsableLinkedinConnectionRow(footerRow), false);

const ownerConfirmed = createOwnerConfirmedVerificationResults([
  "Jordan@Example.com",
  "not-an-email",
]);
assert.deepEqual(ownerConfirmed["jordan@example.com"], {
  email: "jordan@example.com",
  state: "deliverable",
  reason: "owner_confirmation",
});
assert.equal(Object.hasOwn(ownerConfirmed, "not-an-email"), false);

console.log("LinkedIn contact import tests passed.");
