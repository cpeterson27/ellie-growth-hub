export function communityUrlError(value) {
  const clean = String(value || "").trim();
  if (!clean) return "";
  try { const parsed = new URL(clean); return ["http:", "https:"].includes(parsed.protocol) ? "" : "Enter a complete http:// or https:// URL."; }
  catch { return "Enter a complete http:// or https:// URL."; }
}

export async function copyReferralLink(value, clipboard = navigator.clipboard) {
  if (!value) throw new Error("Save the ambassador profile before copying its referral link.");
  await clipboard.writeText(value);
  return value;
}
