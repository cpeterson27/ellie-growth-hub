// USD per one million text tokens. This is a deliberately small, versioned
// configuration snapshot; unknown models return unavailable rather than $0.
const PRICING_VERSION = "2026-08-27";
const MODEL_PRICING = Object.freeze({
  "gpt-4.1-mini": { input: 0.40, cachedInput: 0.10, output: 1.60 },
  "gpt-4.1-mini-2025-04-14": { input: 0.40, cachedInput: 0.10, output: 1.60 },
  "gpt-4o-mini": { input: 0.15, cachedInput: 0.075, output: 0.60 },
  "gpt-4o-mini-2024-07-18": { input: 0.15, cachedInput: 0.075, output: 0.60 },
});

function estimateCost(model, usage = {}) {
  const pricing = MODEL_PRICING[String(model || "")];
  if (!pricing) return { pricingAvailable: false, pricingVersion: PRICING_VERSION, inputCostUsd: null, outputCostUsd: null, totalCostUsd: null, costIsEstimate: true };
  const input = Math.max(0, Number(usage.inputTokens) || 0);
  const cached = Math.min(input, Math.max(0, Number(usage.cachedTokens) || 0));
  const output = Math.max(0, Number(usage.outputTokens) || 0);
  const inputCostUsd = ((input - cached) * pricing.input + cached * pricing.cachedInput) / 1_000_000;
  const outputCostUsd = output * pricing.output / 1_000_000;
  return { pricingAvailable: true, pricingVersion: PRICING_VERSION, inputCostUsd, outputCostUsd, totalCostUsd: inputCostUsd + outputCostUsd, costIsEstimate: true };
}

module.exports = { MODEL_PRICING, PRICING_VERSION, estimateCost };
