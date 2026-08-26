export function publishingBlocker(item, matrix, enabled) {
  if (enabled !== true) return "Publishing is currently disabled. You can still create, edit, and approve drafts.";
  const destinations = item.social?.destinations || [];
  if (!destinations.length) return "Choose a connected account before publishing.";
  for (const destination of destinations) {
    if (!matrix.some(row => row.provider === destination.provider && row.status === "api" && String(row.asset?.id) === String(destination.assetId))) return "A selected destination is unavailable. Reconnect or update the destination.";
  }
  const media = item.social?.media || [];
  if (media.length > 1 || media.some(asset => asset.type !== "image")) return "Publishing currently supports a single image, not video or carousels.";
  if (destinations.some(row => row.provider === "instagram") && (!media[0]?.url || !media[0].url.startsWith("https://"))) return "Instagram requires one hosted HTTPS image.";
  if (destinations.some(row => ["linkedin","x"].includes(row.provider)) && media.length) return "LinkedIn and X currently support text-only publishing.";
  return "";
}
