export function insertPersonalization(value, label, start, end = start) {
  const token = `[${label}]`;
  return {
    value: `${value.slice(0, start)}${token}${value.slice(end)}`,
    cursor: start + token.length,
  };
}

const previewTokenPattern =
  /(\[(?:First name|Full name|Role|Business name|Secure invitation button|Invited by)\]|{{(?:firstName|displayName|role|workspaceName|inviteLink|invitedBy)}})/g;
const previewKeys = {
  "First name": "firstName",
  "Full name": "displayName",
  Role: "role",
  "Business name": "workspaceName",
  "Secure invitation button": "inviteLink",
  "Invited by": "invitedBy",
};
export function invitationPreviewParts(value, variables = {}) {
  return String(value || "")
    .split(previewTokenPattern)
    .filter(Boolean)
    .map((part) => {
      const friendly = part.match(/^\[([^\]]+)\]$/)?.[1];
      const legacy = part.match(/^{{([^}]+)}}$/)?.[1];
      const key = legacy || previewKeys[friendly];
      if (!key) return { type: "text", value: part };
      if (key === "inviteLink")
        return { type: "button", value: "Accept invitation" };
      return { type: "text", value: String(variables[key] || "") };
    });
}
