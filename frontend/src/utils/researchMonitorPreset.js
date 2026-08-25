export function draftFromMonitorPreset(preset) {
  return {
    monitorType: preset.monitorType || "buyer_intent",
    name: preset.name || "",
    query: preset.query || "",
    keywords: (preset.intentCategories || []).flatMap((category) => category.phrases || []).join(", "),
    negativeKeywords: (preset.negativeKeywords || []).join(", "),
    feedUrls: (preset.feedUrls || []).join("\n"),
    intervalMinutes: preset.intervalMinutes || 30,
    intentCategories: (preset.intentCategories || []).map((category) => ({ ...category, phrases: [...(category.phrases || [])] })),
  };
}

export function sourcesFromMonitorPreset(preset, fallbackSources) {
  return Array.isArray(preset.sources) ? [...preset.sources] : [...fallbackSources];
}
