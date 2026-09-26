// USD per 1M tokens (Anthropic first-party list prices, 2026). Used only for the
// "estimated cost" figure in Settings. Unknown models are reported without a cost.
const PRICES: Record<string, { input: number; output: number }> = {
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-haiku-4-5-20251001": { input: 1, output: 5 },
  "claude-opus-5": { input: 5, output: 25 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "mock-heuristics": { input: 0, output: 0 },
};

export function priceFor(model: string): { input: number; output: number } | null {
  return PRICES[model] ?? PRICES[model.replace(/^.*\//, "")] ?? null;
}

export function estimateCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number | null {
  const p = priceFor(model);
  if (!p) return null;
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}
