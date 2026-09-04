export const defaultWorkspaceSettings = {
  workspaceName: "Lead Porch",
  defaultCampaignKind: "event",
  senderName: "Ellie’s Coaching",
  customContactFields: [],
};

export function getWorkspaceSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem("ellie-settings") || "{}");
    const legacyFields = ["Relationship type", "Referral source", "Investment interests"];
    if (JSON.stringify(stored.customContactFields) === JSON.stringify(legacyFields)) stored.customContactFields = [];
    const settings = { ...defaultWorkspaceSettings, ...stored };
    if (["Ellie AI Lead Porch", "Lead Porch Lead Porch"].includes(settings.workspaceName)) settings.workspaceName = "Lead Porch";
    return settings;
  } catch {
    return defaultWorkspaceSettings;
  }
}

export function saveWorkspaceSettings(settings) {
  localStorage.setItem("ellie-settings", JSON.stringify(settings));
  window.dispatchEvent(new Event("ellie-settings-changed"));
}
