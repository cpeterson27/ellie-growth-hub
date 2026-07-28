export const defaultWorkspaceSettings = {
  workspaceName: "Ellie AI Growth Operator",
  defaultCampaignKind: "event",
  businessType: "coaching",
  timezone: "America/Los_Angeles",
  senderName: "Ellie’s Coaching",
  contactStages: ["New lead", "Qualified", "Campaign assigned", "Contacted", "Responded", "Registered", "Attended", "Purchased", "Not interested"],
  customContactFields: ["Relationship type", "Referral source", "Investment interests"],
};

export function getWorkspaceSettings() {
  try {
    return { ...defaultWorkspaceSettings, ...JSON.parse(localStorage.getItem("ellie-settings") || "{}") };
  } catch {
    return defaultWorkspaceSettings;
  }
}

export function saveWorkspaceSettings(settings) {
  localStorage.setItem("ellie-settings", JSON.stringify(settings));
  window.dispatchEvent(new Event("ellie-settings-changed"));
}
