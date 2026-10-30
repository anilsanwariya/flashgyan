// AI usage: the tokens each kind of AI call used a day, what that cost and
// what prompt caching saved. Pure helpers, shared by the server, the admin
// page and tests.

export type AiUsageRow = {
  day: string;
  label: string;
  model: string;
  calls: number;
  input_tokens: number;
  cache_write_tokens: number;
  cache_read_tokens: number;
  output_tokens: number;
};

// US dollars per million tokens: fresh input, a 5-minute cache write, a
// cache read, and output.
export type AiPrice = { input: number; write: number; read: number; output: number };
const SONNET: AiPrice = { input: 2, write: 2.5, read: 0.2, output: 10 };
export const AI_PRICES: Record<string, AiPrice> = {
  "claude-sonnet-5": SONNET,
  "claude-sonnet-5-5": SONNET,
};
export const priceOf = (model: string): AiPrice => AI_PRICES[model] ?? SONNET;

export type AiCost = {
  calls: number;
  input: number;
  write: number;
  read: number;
  output: number;
  // What it cost, and what it would have cost with no cache (the cached
  // parts at the fresh-input price).
  cost: number;
  without: number;
};

export function costOf(rows: AiUsageRow[]): AiCost {
  const out: AiCost = { calls: 0, input: 0, write: 0, read: 0, output: 0, cost: 0, without: 0 };
  for (const r of rows) {
    const p = priceOf(r.model);
    out.calls += r.calls;
    out.input += r.input_tokens;
    out.write += r.cache_write_tokens;
    out.read += r.cache_read_tokens;
    out.output += r.output_tokens;
    out.cost +=
      (r.input_tokens * p.input +
        r.cache_write_tokens * p.write +
        r.cache_read_tokens * p.read +
        r.output_tokens * p.output) /
      1e6;
    out.without +=
      ((r.input_tokens + r.cache_write_tokens + r.cache_read_tokens) * p.input +
        r.output_tokens * p.output) /
      1e6;
  }
  return out;
}

// The share of the input read from the cache (0 to 1).
export function cachedShare(c: Pick<AiCost, "input" | "write" | "read">): number {
  const all = c.input + c.write + c.read;
  return all ? c.read / all : 0;
}

// Rows grouped by a key, most costly first.
export function groupCost(
  rows: AiUsageRow[],
  key: (r: AiUsageRow) => string,
): { key: string; cost: AiCost }[] {
  const m = new Map<string, AiUsageRow[]>();
  for (const r of rows) m.set(key(r), [...(m.get(key(r)) ?? []), r]);
  return [...m.entries()]
    .map(([k, rs]) => ({ key: k, cost: costOf(rs) }))
    .sort((a, b) => b.cost.cost - a.cost.cost);
}
