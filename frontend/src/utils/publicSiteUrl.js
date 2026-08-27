export function publicSiteUrl(configuredUrl, currentOrigin = window.location.origin) {
  try {
    const url = new URL(String(configuredUrl || "/").trim() || "/", currentOrigin);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("Unsupported public website protocol");
    return `${url.origin}/`;
  } catch {
    return `${new URL(currentOrigin).origin}/`;
  }
}
