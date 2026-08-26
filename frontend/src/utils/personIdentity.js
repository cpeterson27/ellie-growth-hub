export const personName = value => [value.firstName, value.lastName].map(part => String(part || "").trim().replace(/\s+/g, " ")).filter(Boolean).join(" ");
export function personFields(value = {}) {
  const parts = String(value.name || "").trim().split(/\s+/);
  const firstName = parts.shift() || "";
  return { firstName: value.firstName || firstName, lastName: value.lastName || parts.join(" "), email: value.email || "", phone: value.phone || "" };
}
