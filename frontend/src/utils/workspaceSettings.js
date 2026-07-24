export const defaultWorkspaceSettings = {
  workspaceName: "Ellie AI Growth Operator",
  defaultCampaignKind: "event",
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
