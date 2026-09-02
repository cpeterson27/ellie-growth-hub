import assert from "node:assert/strict";
import fs from "node:fs";
const component = fs.readFileSync(new URL("./src/components/PaymentSettings.jsx", import.meta.url), "utf8");
const settings = fs.readFileSync(new URL("./src/pages/Settings.jsx", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("./src/components/PaymentSettings.css", import.meta.url), "utf8");
for (const text of ["Connect Square", "Reconnect Square", "Create a payment link", "Payment activity", "Enrollment safety", "Submit refund", "Square collects the customer’s card details", "Growth Operator never receives your Square password", "Disconnect Square?"]) assert(component.includes(text), `Missing payment UI: ${text}`);
assert(component.includes("window.location.assign(data.authorizationUrl)")); assert(component.includes('role="dialog"')); assert(component.includes("setConfirmDisconnect(true)")); assert(settings.includes('navigate("/settings/payments")')); assert(css.includes("@media(max-width:850px)")); assert(css.includes("@media(max-width:560px)"));
console.log("Payment Settings connection, checkout, refund, responsive, and navigation UI checks passed.");
