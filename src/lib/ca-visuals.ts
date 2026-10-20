// Visuals for magazine items: key numbers, bar, pie and trend charts,
// timelines, flow charts, cycles, tables, fact sheets, comparisons, before →
// after changes, rankings, pros and challenges, hierarchies and mind maps.
// SAATHI picks the visual that makes a story easiest to learn (or makes the
// type the editor asks for), built only from the item's facts; every number
// in it must appear in those facts, or it is rejected. The editor can also
// change a visual's text and numbers by hand. Rendered as plain HTML/SVG so
// the PDF stays sharp.
import type { Bi, CaFact, CaQuick } from "@/lib/current-affairs";

export type Visual =
  | { type: "stats"; title: Bi; stats: { value: string; label: Bi }[] }
  | { type: "bar"; title: Bi; unit: string; bars: { label: Bi; value: number }[] }
  | { type: "pie"; title: Bi; unit: string; slices: { label: Bi; value: number }[] }
  | { type: "timeline"; title: Bi; events: { when: string; text: Bi }[] }
  | { type: "flow"; title: Bi; steps: Bi[] }
  | { type: "table"; title: Bi; columns: Bi[]; rows: Bi[][] }
  | { type: "mindmap"; title: Bi; center: Bi; branches: Bi[] }
  | { type: "glance"; title: Bi; rows: { label: Bi; value: Bi }[] }
  | { type: "compare"; title: Bi; a: Bi; b: Bi; rows: { aspect: Bi; a: Bi; b: Bi }[] }
  | { type: "change"; title: Bi; changes: { label: Bi; from: Bi; to: Bi }[] }
  | { type: "trend"; title: Bi; unit: string; points: { label: string; value: number }[] }
  | {
      type: "ranking";
      title: Bi;
      items: { rank: number; label: Bi; value: string; highlight: boolean }[];
    }
  | { type: "proscons"; title: Bi; pros: Bi[]; cons: Bi[] }
  | { type: "hierarchy"; title: Bi; root: Bi; children: { label: Bi; items: Bi[] }[] }
  | { type: "cycle"; title: Bi; steps: Bi[] };

export type VisualType = Visual["type"];

// Every type, in the order the editor's picker shows them, with what each
// suits.
export const VISUAL_INFO: { type: VisualType; label: string; hint: string }[] = [
  {
    type: "glance",
    label: "At a glance",
    hint: "A scheme's key details: launched by, date, outlay, ministry",
  },
  { type: "stats", label: "Key numbers", hint: "2-4 headline figures" },
  { type: "table", label: "Table", hint: "Features, or several things across the same columns" },
  {
    type: "compare",
    label: "Comparison",
    hint: "Two things side by side: old vs new, India vs another country",
  },
  { type: "change", label: "Before → after", hint: "Revised rates, targets or names" },
  { type: "timeline", label: "Timeline", hint: "Dated events in order" },
  { type: "flow", label: "Flow chart", hint: "A process or a chain of cause and effect" },
  { type: "cycle", label: "Cycle", hint: "A process that comes back to its start" },
  { type: "bar", label: "Bar chart", hint: "Amounts in the same unit to compare" },
  { type: "pie", label: "Pie chart", hint: "Percentage shares of one whole" },
  { type: "trend", label: "Trend line", hint: "One figure over 3 or more years" },
  { type: "ranking", label: "Ranking", hint: "Index ranks, top states, medal tallies" },
  {
    type: "proscons",
    label: "Pros & challenges",
    hint: "Benefits and concerns, for Mains answers",
  },
  {
    type: "hierarchy",
    label: "Hierarchy",
    hint: "Ministry → body → committee; an institution's structure",
  },
  { type: "mindmap", label: "Mind map", hint: "A concept with 4-6 key aspects" },
];

export const VISUAL_LABELS = Object.fromEntries(
  VISUAL_INFO.map((i) => [i.type, i.label]),
) as Record<VisualType, string>;
export const VISUAL_TYPES = VISUAL_INFO.map((i) => i.type);

// Whether the facts can make a type, as a reason when they likely can't (null:
// they can). A quick guess for the editor's picker; SAATHI has the last word.
export function visualFit(type: VisualType, facts: { text: string }[]): string | null {
  const texts = facts.map((f) => f.text);
  const withNumbers = texts.filter((t) => numbersIn(t).length).length;
  const numbers = texts.flatMap(numbersIn).length;
  const years = new Set(texts.join(" ").match(/\b(19|20)\d{2}\b/g) ?? []).size;
  const dated = texts.filter(
    (t) =>
      /\b(19|20)\d{2}\b/.test(t) ||
      /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(
        t,
      ),
  ).length;
  switch (type) {
    case "stats":
      return withNumbers >= 2 ? null : "Needs at least 2 facts with numbers";
    case "bar":
      return numbers >= 2 ? null : "Needs at least 2 amounts";
    case "pie":
      return texts.filter((t) => /%|per ?cent|प्रतिशत/i.test(t)).length >= 2
        ? null
        : "Needs at least 2 percentage shares";
    case "trend":
      return years >= 3 && numbers >= 3 ? null : "Needs one figure for 3 or more years";
    case "timeline":
      return dated >= 2 ? null : "Needs at least 2 dated events";
    case "ranking":
      return texts.some((t) =>
        /\brank|ranked|\b\d+(st|nd|rd|th)\b|position|top \d|स्थान|रैंक/i.test(t),
      )
        ? null
        : "No ranks in the facts";
    case "change":
      return texts.some((t) =>
        /\bfrom\b.*\bto\b|increas|decreas|reduc|raised|revised|renamed|replac|cut|hike|से .* (कर|हो)/i.test(
          t,
        ),
      )
        ? null
        : "No change from one value to another in the facts";
    case "mindmap":
      return facts.length >= 3 ? null : "Needs at least 3 facts";
    default:
      return facts.length >= 2 ? null : "Needs at least 2 facts";
  }
}

type ChatMessage = { role: "system" | "user"; content: string };

function parseJson(raw: string): unknown {
  const text = raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  try {
    return JSON.parse(text);
  } catch {
    const m = /\{[\s\S]*\}/.exec(text);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

const bi = (v: unknown, max = 160): Bi | null => {
  if (typeof v === "string") {
    const s = str(v, max);
    return s ? { en: s, hi: s } : null;
  }
  const o = (v ?? {}) as Record<string, unknown>;
  const en = str(o.en, max);
  const hi = str(o.hi, max);
  return en || hi ? { en: en || hi, hi: hi || en } : null;
};

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const biList = (v: unknown, max: number) =>
  list(v)
    .map((x) => bi(x, max))
    .filter((x): x is Bi => !!x);

// ---------- Numbers ----------

const DEVANAGARI = "०१२३४५६७८९";

const normNumber = (n: string) => String(Number(n.replace(/,/g, "")));

// The numbers written in a text (Indian or Devanagari digits, commas ignored),
// normalised so "6.50", "06" and "1,25,000" compare as 6.5, 6 and 125000.
export function numbersIn(text: string): string[] {
  const t = text.replace(/[०-९]/g, (d) => String(DEVANAGARI.indexOf(d)));
  return (t.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map(normNumber);
}

// Every text and value in the visual, for checking its numbers.
function visualTexts(v: Visual): string[] {
  const b = (x: Bi) => [x.en, x.hi];
  const out = [...b(v.title)];
  switch (v.type) {
    case "stats":
      v.stats.forEach((s) => out.push(s.value, ...b(s.label)));
      break;
    case "bar":
      v.bars.forEach((x) => out.push(String(x.value), ...b(x.label)));
      break;
    case "pie":
      v.slices.forEach((x) => out.push(String(x.value), ...b(x.label)));
      break;
    case "timeline":
      v.events.forEach((e) => out.push(e.when, ...b(e.text)));
      break;
    case "flow":
      v.steps.forEach((s) => out.push(...b(s)));
      break;
    case "table":
      [...v.columns, ...v.rows.flat()].forEach((c) => out.push(...b(c)));
      break;
    case "mindmap":
      [v.center, ...v.branches].forEach((c) => out.push(...b(c)));
      break;
    case "glance":
      v.rows.forEach((r) => out.push(...b(r.label), ...b(r.value)));
      break;
    case "compare":
      out.push(...b(v.a), ...b(v.b));
      v.rows.forEach((r) => out.push(...b(r.aspect), ...b(r.a), ...b(r.b)));
      break;
    case "change":
      v.changes.forEach((c) => out.push(...b(c.label), ...b(c.from), ...b(c.to)));
      break;
    case "trend":
      v.points.forEach((p) => out.push(p.label, String(p.value)));
      break;
    case "ranking":
      v.items.forEach((i) => out.push(String(i.rank), i.value, ...b(i.label)));
      break;
    case "proscons":
      [...v.pros, ...v.cons].forEach((x) => out.push(...b(x)));
      break;
    case "hierarchy":
      out.push(...b(v.root));
      v.children.forEach((c) => [c.label, ...c.items].forEach((x) => out.push(...b(x))));
      break;
    case "cycle":
      v.steps.forEach((x) => out.push(...b(x)));
      break;
  }
  return out;
}

// Numbers in the visual that are not in the facts (or the headline).
export function unverifiedNumbers(v: Visual, facts: CaFact[], headline = ""): string[] {
  const allowed = new Set(numbersIn([headline, ...facts.map((f) => f.text)].join("\n")));
  const bad = new Set<string>();
  for (const t of visualTexts(v)) for (const n of numbersIn(t)) if (!allowed.has(n)) bad.add(n);
  return [...bad];
}

// ---------- Asking SAATHI ----------

export function visualMessages(opts: {
  headline: string;
  category: string;
  facts: CaFact[];
  problem?: string;
  // The type the editor asked for, and their note ("compare with 2023").
  type?: VisualType;
  note?: string;
  // The story's other visual: this one must show something else.
  other?: Visual | null;
}): ChatMessage[] {
  const facts = opts.facts.map((f, i) => `${i + 1}. ${f.text}`).join("\n");
  return [
    {
      role: "system",
      content: `You design one learning visual for a news item in a bilingual (Hindi and English) current affairs magazine for Rajasthan competitive exam aspirants (RPSC and RSSB exams, with depth for RAS Mains), and a one-line revision note. Pick the visual that makes the story easiest to understand and remember:
- "stats": 2-4 headline numbers (outlay, beneficiaries, rank, districts covered). {"type":"stats","title":{...},"stats":[{"value":"₹500 crore","label":{"en":"...","hi":"..."}}]}
- "bar": 2-8 quantities in the same unit to compare (allocations, ranks, figures over years). {"type":"bar","title":{...},"unit":"crore","bars":[{"label":{...},"value":500}]}
- "pie": ONLY when the facts give percentage shares of one whole. {"type":"pie","title":{...},"unit":"%","slices":[{"label":{...},"value":40}]}
- "timeline": 3-6 dated events. {"type":"timeline","title":{...},"events":[{"when":"2019","text":{...}}]}
- "flow": a process, procedure or cause-and-effect chain in 3-5 steps. {"type":"flow","title":{...},"steps":[{"en":"...","hi":"..."}]}
- "table": compares 2-4 things across features, or lists a scheme's key features (columns like "Feature" / "Details"); 2-4 columns, 2-6 rows. {"type":"table","title":{...},"columns":[{...}],"rows":[[{...},{...}]]}
- "mindmap": a concept, scheme or event with 4-6 key aspects (aims, features, significance). {"type":"mindmap","title":{...},"center":{...},"branches":[{...}]}
- "glance": a scheme's, mission's or body's key details as label → value, 3-8 rows (launched by, date, outlay, ministry, beneficiaries). {"type":"glance","title":{...},"rows":[{"label":{...},"value":{...}}]}
- "compare": two things side by side across 2-6 aspects (old vs new policy, two countries, two missiles). {"type":"compare","title":{...},"a":{...},"b":{...},"rows":[{"aspect":{...},"a":{...},"b":{...}}]}
- "change": 1-5 values that changed, each from → to (revised rate, target, name). {"type":"change","title":{...},"changes":[{"label":{...},"from":{...},"to":{...}}]}
- "trend": one figure over 3-12 years or periods, in one unit. {"type":"trend","title":{...},"unit":"%","points":[{"label":"2021","value":5.2}]}
- "ranking": 2-10 ranked entries (index ranks, top states, medal tally); mark the one the news is about with "highlight": true. {"type":"ranking","title":{...},"items":[{"rank":1,"label":{...},"value":"score or empty","highlight":false}]}
- "proscons": 2-5 benefits and 2-5 challenges or concerns, for Mains answers. {"type":"proscons","title":{...},"pros":[{...}],"cons":[{...}]}
- "hierarchy": a structure of 2-5 parts under one head, each with up to 4 items (ministry → bodies → committees; an institution's members). {"type":"hierarchy","title":{...},"root":{...},"children":[{"label":{...},"items":[{...}]}]}
- "cycle": a process of 3-6 steps that returns to its start. {"type":"cycle","title":{...},"steps":[{...}]}
"title" is a short heading naming what the visual shows ("Stepwell scheme at a glance"), in both languages.
STRICT RULES: Use only the numbered facts. Every number you write (in values, labels, dates and in both languages) must appear in the facts exactly as written there: no totals, differences, percentages, conversions (no lakh/crore/हजार conversions) or rounding of your own. Never number the steps or branches yourself. Keep every label short (at most 8 words; table cells at most 12). Hindi is natural standard Hindi as used in RPSC exams; use the same digits as English. If the facts are too thin for a useful visual, use null.
The visual replaces text: the story's written points leave out every fact the visual shows completely, so prefer a visual that carries as many facts as possible. List those facts in "covers": the numbers of facts whose every figure, name and date is in the visual.
"oneliner" is the single most exam-worthy line of the story, at most 20 words, for a last-minute revision page.
"quick" is one short exam question on the fact RPSC is most likely to ask (where, which district, who, how many, which edition), with its answer in at most 8 words, taken exactly from the facts. Ask it the way exam papers do ("Where will the ₹300 crore AI Hub be built?" → "Jodhpur"); never ask about something the facts don't state.
Reply with JSON only: {"visual": {...} or null, "covers": [fact numbers], "oneliner": {"en": "...", "hi": "..."}, "quick": {"q": {"en": "...", "hi": "..."}, "a": {"en": "...", "hi": "..."}}}`,
    },
    {
      role: "user",
      content: `Section: ${opts.category}\nHeadline: ${opts.headline}\n\nFacts:\n${facts}${
        opts.type
          ? `\n\nThe editor asked for a "${opts.type}" visual: make that type (null only if the facts can't make it).`
          : ""
      }${opts.note ? `\nEditor's note: ${opts.note}` : ""}${
        opts.other
          ? `\nThe story already has a ${opts.other.type} visual titled "${opts.other.title.en}": show something different.`
          : ""
      }${opts.problem ? `\n\nYour previous visual was rejected: ${opts.problem} Fix it.` : ""}`,
    },
  ];
}

const MAX = {
  stats: 4,
  bar: 8,
  pie: 8,
  timeline: 6,
  flow: 5,
  table: 6,
  mindmap: 6,
  glance: 8,
  compare: 6,
  change: 5,
  trend: 12,
  ranking: 10,
  proscons: 5,
  hierarchy: 5,
  cycle: 6,
};

// The visual's shape, cleaned up: unknown types, empty labels and impossible
// charts are rejected. Numbers are checked separately.
export function cleanVisual(v: unknown): { visual: Visual | null; problem: string | null } {
  if (!v || typeof v !== "object") return { visual: null, problem: null };
  const o = v as Record<string, unknown>;
  const type = str(o.type, 20) as VisualType;
  const title = bi(o.title, 120) ?? { en: "", hi: "" };
  const fail = (problem: string) => ({ visual: null, problem });
  const num = (x: unknown) => {
    const n = typeof x === "number" ? x : Number(String(x ?? "").replace(/,/g, ""));
    return Number.isFinite(n) ? n : NaN;
  };
  switch (type) {
    case "stats": {
      const stats = list(o.stats)
        .map((s) => {
          const r = (s ?? {}) as Record<string, unknown>;
          const value = str(r.value, 40);
          const label = bi(r.label, 100);
          return value && label ? { value, label } : null;
        })
        .filter((s): s is { value: string; label: Bi } => !!s)
        .slice(0, MAX.stats);
      return stats.length >= 2
        ? { visual: { type, title, stats }, problem: null }
        : fail("Give 2-4 numbers.");
    }
    case "bar":
    case "pie": {
      const key = type === "bar" ? "bars" : "slices";
      const parts = list(o[key])
        .map((s) => {
          const r = (s ?? {}) as Record<string, unknown>;
          const label = bi(r.label, 80);
          const value = num(r.value);
          return label && value >= 0 ? { label, value } : null;
        })
        .filter((s): s is { label: Bi; value: number } => !!s)
        .slice(0, MAX[type]);
      const unit = str(o.unit, 30);
      if (parts.length < 2) return fail(`A ${type} chart needs at least 2 values.`);
      if (parts.every((p) => p.value === 0)) return fail("All values are zero.");
      if (type === "pie") {
        if (unit !== "%")
          return fail("A pie chart is only for percentage shares; use a bar chart.");
        const sum = parts.reduce((a, p) => a + p.value, 0);
        if (sum > 100.5) return fail(`The shares add up to ${sum}%, more than 100%.`);
        return { visual: { type, title, unit, slices: parts }, problem: null };
      }
      return { visual: { type, title, unit, bars: parts }, problem: null };
    }
    case "timeline": {
      const events = list(o.events)
        .map((e) => {
          const r = (e ?? {}) as Record<string, unknown>;
          const when = str(r.when, 30);
          const text = bi(r.text, 160);
          return when && text ? { when, text } : null;
        })
        .filter((e): e is { when: string; text: Bi } => !!e)
        .slice(0, MAX.timeline);
      return events.length >= 2
        ? { visual: { type, title, events }, problem: null }
        : fail("A timeline needs at least 2 dated events.");
    }
    case "flow": {
      const steps = biList(o.steps, 140).slice(0, MAX.flow);
      return steps.length >= 2
        ? { visual: { type, title, steps }, problem: null }
        : fail("A flow chart needs at least 2 steps.");
    }
    case "table": {
      const columns = biList(o.columns, 60).slice(0, 4);
      const rows = list(o.rows)
        .map((r) => biList(r, 140))
        .filter((r) => r.length === columns.length)
        .slice(0, MAX.table);
      return columns.length >= 2 && rows.length >= 1
        ? { visual: { type, title, columns, rows }, problem: null }
        : fail("A table needs 2-4 columns and rows with one cell per column.");
    }
    case "mindmap": {
      const center = bi(o.center, 80);
      const branches = biList(o.branches, 120).slice(0, MAX.mindmap);
      return center && branches.length >= 3
        ? { visual: { type, title, center, branches }, problem: null }
        : fail("A mind map needs a centre and at least 3 branches.");
    }
    case "glance": {
      const rows = list(o.rows)
        .map((x) => {
          const r = (x ?? {}) as Record<string, unknown>;
          const label = bi(r.label, 60);
          const value = bi(r.value, 160);
          return label && value ? { label, value } : null;
        })
        .filter((r): r is { label: Bi; value: Bi } => !!r)
        .slice(0, MAX.glance);
      return rows.length >= 2
        ? { visual: { type, title, rows }, problem: null }
        : fail("A fact sheet needs at least 2 rows of label and value.");
    }
    case "compare": {
      const a = bi(o.a, 60);
      const b = bi(o.b, 60);
      const rows = list(o.rows)
        .map((x) => {
          const r = (x ?? {}) as Record<string, unknown>;
          const aspect = bi(r.aspect, 60);
          const ra = bi(r.a, 140);
          const rb = bi(r.b, 140);
          return aspect && ra && rb ? { aspect, a: ra, b: rb } : null;
        })
        .filter((r): r is { aspect: Bi; a: Bi; b: Bi } => !!r)
        .slice(0, MAX.compare);
      return a && b && rows.length >= 1
        ? { visual: { type, title, a, b, rows }, problem: null }
        : fail("A comparison needs two names and at least one aspect with both sides.");
    }
    case "change": {
      const changes = list(o.changes)
        .map((x) => {
          const r = (x ?? {}) as Record<string, unknown>;
          const label = bi(r.label, 80);
          const from = bi(r.from, 80);
          const to = bi(r.to, 80);
          return label && from && to ? { label, from, to } : null;
        })
        .filter((r): r is { label: Bi; from: Bi; to: Bi } => !!r)
        .slice(0, MAX.change);
      return changes.length >= 1
        ? { visual: { type, title, changes }, problem: null }
        : fail("A change needs at least one value with its before and after.");
    }
    case "trend": {
      const points = list(o.points)
        .map((x) => {
          const r = (x ?? {}) as Record<string, unknown>;
          const label = str(r.label, 20) || (typeof r.label === "number" ? String(r.label) : "");
          const value = num(r.value);
          return label && Number.isFinite(value) ? { label, value } : null;
        })
        .filter((r): r is { label: string; value: number } => !!r)
        .slice(0, MAX.trend);
      return points.length >= 3
        ? { visual: { type, title, unit: str(o.unit, 30), points }, problem: null }
        : fail("A trend line needs at least 3 points.");
    }
    case "ranking": {
      const items = list(o.items)
        .map((x) => {
          const r = (x ?? {}) as Record<string, unknown>;
          const rank = num(r.rank);
          const label = bi(r.label, 80);
          return label && Number.isInteger(rank) && rank > 0
            ? { rank, label, value: str(r.value, 40), highlight: r.highlight === true }
            : null;
        })
        .filter((r): r is { rank: number; label: Bi; value: string; highlight: boolean } => !!r)
        .sort((p, q) => p.rank - q.rank)
        .slice(0, MAX.ranking);
      return items.length >= 2
        ? { visual: { type, title, items }, problem: null }
        : fail("A ranking needs at least 2 ranked entries.");
    }
    case "proscons": {
      const pros = biList(o.pros, 140).slice(0, MAX.proscons);
      const cons = biList(o.cons, 140).slice(0, MAX.proscons);
      return pros.length >= 1 && cons.length >= 1
        ? { visual: { type, title, pros, cons }, problem: null }
        : fail("Give at least one benefit and one challenge.");
    }
    case "hierarchy": {
      const root = bi(o.root, 80);
      const children = list(o.children)
        .map((x) => {
          const r = (x ?? {}) as Record<string, unknown>;
          const label = bi(r.label, 80);
          return label ? { label, items: biList(r.items, 100).slice(0, 4) } : null;
        })
        .filter((r): r is { label: Bi; items: Bi[] } => !!r)
        .slice(0, MAX.hierarchy);
      return root && children.length >= 2
        ? { visual: { type, title, root, children }, problem: null }
        : fail("A hierarchy needs a head and at least 2 parts under it.");
    }
    case "cycle": {
      const steps = biList(o.steps, 120).slice(0, MAX.cycle);
      return steps.length >= 3
        ? { visual: { type, title, steps }, problem: null }
        : fail("A cycle needs at least 3 steps.");
    }
    default:
      return fail(`Unknown visual type "${type}".`);
  }
}

// The facts (0-based) the visual shows, as SAATHI listed them (1-based). A
// fact only counts when every number in it is also in the visual, so a
// figure is never hidden from the text without being shown.
export function coveredFacts(v: Visual, listed: unknown, facts: CaFact[]): number[] {
  const shown = new Set(visualTexts(v).flatMap(numbersIn));
  const out = new Set<number>();
  for (const x of list(listed)) {
    const i = Number(x) - 1;
    if (!Number.isInteger(i) || i < 0 || i >= facts.length) continue;
    if (numbersIn(facts[i].text).every((n) => shown.has(n))) out.add(i);
  }
  return [...out].sort((a, b) => a - b);
}

// Reads SAATHI's reply: the visual (only if all its numbers are in the facts),
// the facts it shows and the revision line.
export function parseVisual(
  raw: string,
  facts: CaFact[],
  headline = "",
): {
  visual: Visual | null;
  covers: number[];
  oneliner: Bi | null;
  quick: CaQuick | null;
  problem: string | null;
} {
  const o = (parseJson(raw) ?? {}) as Record<string, unknown>;
  const oneliner = bi(o.oneliner, 300);
  const quick = parseQuick(o.quick, facts, headline);
  const { visual, problem } = cleanVisual(o.visual);
  if (!visual) return { visual: null, covers: [], oneliner, quick, problem };
  const bad = unverifiedNumbers(visual, facts, headline);
  if (bad.length) {
    return {
      visual: null,
      covers: [],
      oneliner,
      quick,
      problem: `These numbers are not in the facts: ${bad.join(", ")}.`,
    };
  }
  return {
    visual,
    covers: coveredFacts(visual, o.covers, facts),
    oneliner,
    quick,
    problem: null,
  };
}

// The quick question and answer, kept only when both languages are there and
// every number in the answer is in the facts.
export function parseQuick(v: unknown, facts: CaFact[], headline = ""): CaQuick | null {
  const o = (v ?? {}) as Record<string, unknown>;
  const q = bi(o.q, 300);
  const a = bi(o.a, 120);
  if (!q?.en || !q.hi || !a?.en || !a.hi) return null;
  const known = new Set(numbersIn([headline, ...facts.map((f) => f.text)].join(" ")));
  if (numbersIn(`${a.en} ${a.hi}`).some((n) => !known.has(n))) return null;
  return { q, a };
}

// The written points to print: those the visual doesn't already show.
export function pointsToShow<T>(content: {
  points: T[];
  visual?: Visual | null;
  visual_covers?: number[];
  visual2?: Visual | null;
  visual2_covers?: number[];
}): T[] {
  const hidden = new Set([
    ...(content.visual ? (content.visual_covers ?? []) : []),
    ...(content.visual2 ? (content.visual2_covers ?? []) : []),
  ]);
  return content.points.filter((_, i) => !hidden.has(i));
}

// ---------- Rendering ----------

const esc = (s: string | null | undefined) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// Hindi above English; once when both are the same. With a language (the
// Hindi or English issue), that one only (the other when it's missing).
function labelIn(b: Bi, cls = "", lang?: "en" | "hi"): string {
  const hi = b.hi.trim();
  const en = b.en.trim();
  if (lang) {
    const t = (lang === "hi" ? hi || en : en || hi) ?? "";
    return `<span class="vl ${cls}" lang="${lang}">${esc(t)}</span>`;
  }
  if (!hi || !en || hi === en) return `<span class="vl ${cls}">${esc(hi || en)}</span>`;
  return `<span class="vl ${cls}"><span lang="hi">${esc(hi)}</span><span class="ven" lang="en">${esc(en)}</span></span>`;
}

const fmt = (n: number) =>
  Number.isInteger(n) ? n.toLocaleString("en-IN") : String(Math.round(n * 100) / 100);

export const PALETTE = [
  "#0ea5e9",
  "#f59e0b",
  "#10b981",
  "#ef4444",
  "#8b5cf6",
  "#14b8a6",
  "#f97316",
  "#64748b",
];

function arc(cx: number, cy: number, r: number, ri: number, a0: number, a1: number): string {
  const p = (a: number, rad: number) =>
    `${(cx + rad * Math.sin(a)).toFixed(2)} ${(cy - rad * Math.cos(a)).toFixed(2)}`;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M ${p(a0, r)} A ${r} ${r} 0 ${large} 1 ${p(a1, r)} L ${p(a1, ri)} A ${ri} ${ri} 0 ${large} 0 ${p(a0, ri)} Z`;
}

function pieSvg(slices: { value: number }[], colors: string[]): string {
  const total = Math.max(
    100,
    slices.reduce((a, s) => a + s.value, 0),
  );
  let a = 0;
  const paths: string[] = [];
  const all = [...slices];
  const rest = total - slices.reduce((x, s) => x + s.value, 0);
  if (rest > 0.01) all.push({ value: rest });
  all.forEach((s, i) => {
    const sweep = (s.value / total) * Math.PI * 2;
    if (sweep <= 0) return;
    const color = i < slices.length ? colors[i % colors.length] : "#e2e8f0";
    if (sweep >= Math.PI * 2 - 1e-6) {
      paths.push(
        `<circle cx="60" cy="60" r="44" fill="none" stroke="${color}" stroke-width="32"/>`,
      );
    } else {
      paths.push(
        `<path d="${arc(60, 60, 60, 28, a, a + sweep)}" fill="${color}" stroke="#fff" stroke-width="1.5"/>`,
      );
    }
    a += sweep;
  });
  return `<svg class="pie" viewBox="0 0 120 120" width="120" height="120">${paths.join("")}</svg>`;
}

function mindmapSvg(
  v: Extract<Visual, { type: "mindmap" }>,
  accent: string,
  lang?: "en" | "hi",
): string {
  const n = v.branches.length;
  const left = v.branches.slice(0, Math.ceil(n / 2));
  const right = v.branches.slice(Math.ceil(n / 2));
  const rowH = 64;
  const rows = Math.max(left.length, right.length);
  const H = rows * rowH + 16;
  const W = 640;
  const boxW = 210;
  const cW = 160;
  const cH = 64;
  const cx = W / 2;
  const cy = H / 2;
  const ys = (count: number) =>
    Array.from({ length: count }, (_, i) => cy + (i - (count - 1) / 2) * rowH);
  const node = (
    x: number,
    y: number,
    w: number,
    h: number,
    html: string,
    cls: string,
    style: string,
  ) =>
    `<foreignObject x="${x}" y="${y}" width="${w}" height="${h}"><div xmlns="http://www.w3.org/1999/xhtml" class="mm-node ${cls}" style="${style}">${html}</div></foreignObject>`;
  const parts: string[] = [];
  const branch = (b: Bi, y: number, side: "l" | "r", i: number) => {
    const x = side === "l" ? 0 : W - boxW;
    const edge = side === "l" ? boxW : W - boxW;
    const color = PALETTE[i % PALETTE.length];
    parts.push(
      `<path d="M ${cx + (side === "l" ? -cW / 2 : cW / 2)} ${cy} C ${cx + (side === "l" ? -cW / 2 - 40 : cW / 2 + 40)} ${cy}, ${edge + (side === "l" ? 40 : -40)} ${y}, ${edge} ${y}" fill="none" stroke="${color}" stroke-width="2.5"/>`,
    );
    parts.push(
      node(
        x,
        y - (rowH - 10) / 2,
        boxW,
        rowH - 10,
        labelIn(b, "", lang),
        "mm-branch",
        `border-color:${color}`,
      ),
    );
  };
  ys(left.length).forEach((y, i) => branch(left[i], y, "l", i));
  ys(right.length).forEach((y, i) => branch(right[i], y, "r", i + left.length));
  parts.push(
    node(
      cx - cW / 2,
      cy - cH / 2,
      cW,
      cH,
      labelIn(v.center, "", lang),
      "mm-center",
      `background:${accent}`,
    ),
  );
  return `<svg class="mindmap" viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet">${parts.join("")}</svg>`;
}

// The visual as HTML, for the magazine (in its language) and the admin
// preview (both languages).
export function visualHtml(v: Visual, accent = "#6d28d9", lang?: "en" | "hi"): string {
  const label = (b: Bi, cls = "") => labelIn(b, cls, lang);
  const colors = [accent, ...PALETTE];
  const caption = v.title.en || v.title.hi ? `<div class="v-caption">${label(v.title)}</div>` : "";
  let body = "";
  switch (v.type) {
    case "stats":
      body = `<div class="v-stats">${v.stats
        .map((s) => `<div class="v-stat"><b>${esc(s.value)}</b>${label(s.label)}</div>`)
        .join("")}</div>`;
      break;
    case "bar": {
      const max = Math.max(...v.bars.map((b) => b.value), 0) || 1;
      body = `<div class="v-bars">${v.bars
        .map(
          (b, i) =>
            `<div class="v-bar-row"><div class="v-bar-label">${label(b.label)}</div><div class="v-bar-track"><div class="v-bar" style="width:${Math.max(1.5, (b.value / max) * 100).toFixed(1)}%;background:${colors[i % colors.length]}"></div><span class="v-bar-val">${esc(fmt(b.value))}${v.unit ? `${v.unit === "%" ? "" : " "}${esc(v.unit)}` : ""}</span></div></div>`,
        )
        .join("")}</div>`;
      break;
    }
    case "pie":
      body = `<div class="v-pie">${pieSvg(v.slices, colors)}<ul class="v-legend">${v.slices
        .map(
          (s, i) =>
            `<li><i style="background:${colors[i % colors.length]}"></i><b>${esc(fmt(s.value))}%</b>${label(s.label)}</li>`,
        )
        .join("")}</ul></div>`;
      break;
    case "timeline":
      body = `<ol class="v-timeline">${v.events
        .map((e) => `<li><span class="v-when">${esc(e.when)}</span>${label(e.text)}</li>`)
        .join("")}</ol>`;
      break;
    case "flow":
      body = `<div class="v-flow">${v.steps
        .map(
          (s, i) =>
            `${i ? `<div class="v-arrow">&#10140;</div>` : ""}<div class="v-step"><span class="v-step-n">${i + 1}</span>${label(s)}</div>`,
        )
        .join("")}</div>`;
      break;
    case "table":
      body = `<table class="v-table"><thead><tr>${v.columns
        .map((c) => `<th>${label(c)}</th>`)
        .join("")}</tr></thead><tbody>${v.rows
        .map((r) => `<tr>${r.map((c) => `<td>${label(c)}</td>`).join("")}</tr>`)
        .join("")}</tbody></table>`;
      break;
    case "mindmap":
      body = mindmapSvg(v, accent, lang);
      break;
    case "glance":
      body = `<dl class="v-glance">${v.rows
        .map((r) => `<div><dt>${label(r.label)}</dt><dd>${label(r.value)}</dd></div>`)
        .join("")}</dl>`;
      break;
    case "compare":
      body = `<table class="v-compare"><thead><tr><th class="ca">${label(v.a)}</th><th class="vs">vs</th><th class="cb">${label(v.b)}</th></tr></thead><tbody>${v.rows
        .map(
          (r) =>
            `<tr><td class="ca">${label(r.a)}</td><td class="asp">${label(r.aspect)}</td><td class="cb">${label(r.b)}</td></tr>`,
        )
        .join("")}</tbody></table>`;
      break;
    case "change":
      body = `<div class="v-change">${v.changes
        .map(
          (c) =>
            `<div class="v-chg"><div class="v-chg-l">${label(c.label)}</div><div class="v-chg-v"><span class="from">${label(c.from)}</span><span class="v-chg-arrow">&#10140;</span><span class="to">${label(c.to)}</span></div></div>`,
        )
        .join("")}</div>`;
      break;
    case "trend":
      body = trendSvg(v, accent);
      break;
    case "ranking":
      body = `<ol class="v-rank">${v.items
        .map(
          (i) =>
            `<li class="${[i.highlight ? "hl" : "", i.rank <= 3 ? `r${i.rank}` : ""].join(" ").trim()}"><span class="v-rank-n">${i.rank}</span>${label(i.label)}${i.value ? `<b class="v-rank-v">${esc(i.value)}</b>` : ""}</li>`,
        )
        .join("")}</ol>`;
      break;
    case "proscons": {
      const words = lang === "hi" ? ["लाभ", "चुनौतियाँ"] : ["Benefits", "Challenges"];
      const col = (cls: string, head: string, mark: string, xs: Bi[]) =>
        `<div class="v-pc ${cls}"><div class="v-pc-h">${head}</div><ul>${xs
          .map((x) => `<li><i>${mark}</i>${label(x)}</li>`)
          .join("")}</ul></div>`;
      body = `<div class="v-proscons">${col("pro", words[0], "&#10003;", v.pros)}${col("con", words[1], "!", v.cons)}</div>`;
      break;
    }
    case "hierarchy":
      body = `<div class="v-tree"><div class="v-tree-root">${label(v.root)}</div><div class="v-tree-kids">${v.children
        .map(
          (c, i) =>
            `<div class="v-tree-kid"><div class="v-tree-node" style="border-color:${colors[(i + 1) % colors.length]}">${label(c.label)}</div>${
              c.items.length
                ? `<ul>${c.items.map((x) => `<li>${label(x)}</li>`).join("")}</ul>`
                : ""
            }</div>`,
        )
        .join("")}</div></div>`;
      break;
    case "cycle":
      body = cycleSvg(v, accent, lang);
      break;
  }
  // No type heading: the visual's own title says what it shows.
  return `<div class="box visual visual-${v.type}">${caption}${body}</div>`;
}

// One figure over the years: a line with each value marked.
function trendSvg(v: Extract<Visual, { type: "trend" }>, accent: string): string {
  const W = 600;
  const H = 190;
  const pad = { l: 24, r: 24, t: 26, b: 28 };
  const vals = v.points.map((p) => p.value);
  // The axis starts near the lowest value, so small changes show.
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const lo = min >= 0 && min - (max - min) * 0.6 <= 0 ? 0 : min - (max - min) * 0.6 || min - 1;
  const span = max - lo || 1;
  const x = (i: number) => pad.l + (i * (W - pad.l - pad.r)) / Math.max(1, v.points.length - 1);
  const y = (n: number) => pad.t + (1 - (n - lo) / span) * (H - pad.t - pad.b);
  const line = v.points.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const unit = v.unit ? `${v.unit === "%" ? "" : " "}${esc(v.unit)}` : "";
  const area = `${pad.l},${y(lo).toFixed(1)} ${line} ${x(v.points.length - 1).toFixed(1)},${y(lo).toFixed(1)}`;
  return `<svg class="v-trend" viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet">
<line x1="${pad.l}" y1="${y(lo).toFixed(1)}" x2="${W - pad.r}" y2="${y(lo).toFixed(1)}" stroke="#cbd5e1" stroke-width="1"/>
<polygon points="${area}" fill="${accent}" fill-opacity=".08"/>
<polyline points="${line}" fill="none" stroke="${accent}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
${v.points
  .map(
    (p, i) =>
      `<circle cx="${x(i).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="4.5" fill="#fff" stroke="${accent}" stroke-width="2.5"/><text x="${x(i).toFixed(1)}" y="${(y(p.value) - 10).toFixed(1)}" text-anchor="middle" font-size="12" font-weight="700" fill="#1f2937">${esc(fmt(p.value))}${unit}</text><text x="${x(i).toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="11.5" fill="#64748b">${esc(p.label)}</text>`,
  )
  .join("")}
</svg>`;
}

// Steps around a ring, arrows showing the way round.
function cycleSvg(
  v: Extract<Visual, { type: "cycle" }>,
  accent: string,
  lang?: "en" | "hi",
): string {
  const n = v.steps.length;
  const W = 620;
  const H = n <= 4 ? 250 : 300;
  const cx = W / 2;
  const cy = H / 2;
  const rx = W / 2 - 100;
  const ry = H / 2 - 38;
  const boxW = 176;
  const boxH = 58;
  const at = (i: number) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a), a };
  };
  const parts: string[] = [
    `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="${accent}" stroke-opacity=".35" stroke-width="2.5" stroke-dasharray="6 5"/>`,
  ];
  // An arrowhead halfway between each step and the next, pointing onward.
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + ((i + 0.5) * 2 * Math.PI) / n;
    const px = cx + rx * Math.cos(a);
    const py = cy + ry * Math.sin(a);
    const tx = -rx * Math.sin(a);
    const ty = ry * Math.cos(a);
    const deg = (Math.atan2(ty, tx) * 180) / Math.PI;
    parts.push(
      `<path d="M -7 -6 L 7 0 L -7 6 Z" fill="${accent}" transform="translate(${px.toFixed(1)} ${py.toFixed(1)}) rotate(${deg.toFixed(1)})"/>`,
    );
  }
  v.steps.forEach((s, i) => {
    const p = at(i);
    parts.push(
      `<foreignObject x="${(p.x - boxW / 2).toFixed(1)}" y="${(p.y - boxH / 2).toFixed(1)}" width="${boxW}" height="${boxH}"><div xmlns="http://www.w3.org/1999/xhtml" class="mm-node cy-node" style="border-color:${PALETTE[i % PALETTE.length]}"><span class="cy-n" style="background:${PALETTE[i % PALETTE.length]}">${i + 1}</span>${labelIn(s, "", lang)}</div></foreignObject>`,
    );
  });
  return `<svg class="v-cycle" viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet">${parts.join("")}</svg>`;
}

export const VISUAL_CSS = (accent: string) => `
.visual { border: 1px solid #e2e8f0; background: #fff; break-inside: avoid; }
.v-caption { font-weight: 700; color: ${accent}; margin: 0 0 2mm; }
.v-caption .vl { flex-direction: row; gap: 2mm; flex-wrap: wrap; }
.vl { display: inline-flex; flex-direction: column; line-height: 1.3; }
.ven { color: #64748b; font-size: .9em; }
.v-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(32mm, 1fr)); gap: 2.5mm; }
.v-stat { border-radius: 2.5mm; padding: 2.5mm 3mm; background: #f5f3ff; border-top: 3px solid ${accent}; }
.v-stat b { display: block; font-size: 14pt; line-height: 1.15; color: ${accent}; margin-bottom: .8mm; }
.v-bars { display: flex; flex-direction: column; gap: 1.8mm; }
.v-bar-row { display: grid; grid-template-columns: 38% 1fr; gap: 3mm; align-items: center; }
.v-bar-track { display: flex; align-items: center; gap: 2mm; }
.v-bar { height: 5mm; border-radius: 1.2mm; }
.v-bar-val { flex: none; font-weight: 700; font-size: 9pt; white-space: nowrap; }
.v-pie { display: flex; align-items: center; gap: 6mm; }
.v-pie .pie { flex: none; width: 32mm; height: 32mm; }
.v-legend { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 1.5mm; }
.v-legend li { display: flex; align-items: flex-start; gap: 2mm; }
.v-legend i { flex: none; width: 3.2mm; height: 3.2mm; border-radius: .8mm; margin-top: .8mm; }
.v-legend b { flex: none; min-width: 10mm; }
.v-timeline { list-style: none; margin: 0; padding: 0 0 0 3mm; border-left: 2px solid ${accent}; }
.v-timeline li { position: relative; display: flex; gap: 3mm; align-items: flex-start; padding: 0 0 2mm 3mm; }
.v-timeline li::before { content: ""; position: absolute; left: -4.6mm; top: 1.2mm; width: 2.6mm; height: 2.6mm; border-radius: 50%; background: #fff; border: 2px solid ${accent}; }
.v-when { flex: none; min-width: 16mm; font-weight: 700; color: ${accent}; }
.v-flow { display: flex; align-items: stretch; gap: 1.5mm; }
.v-step { flex: 1; min-width: 0; position: relative; border-radius: 2.5mm; padding: 4mm 2.5mm 2.5mm; background: #f8fafc; border: 1px solid #cbd5e1; font-size: 8.8pt; text-align: center; display: flex; justify-content: center; }
.v-step-n { position: absolute; top: -2.4mm; left: 50%; transform: translateX(-50%); width: 5mm; height: 5mm; border-radius: 50%; background: ${accent}; color: #fff; font-size: 7.5pt; font-weight: 700; display: flex; align-items: center; justify-content: center; }
.v-arrow { flex: none; align-self: center; color: ${accent}; font-size: 12pt; }
.v-table { width: 100%; border-collapse: collapse; font-size: 8.8pt; }
.v-table th { background: ${accent}; color: #fff; text-align: left; padding: 1.5mm 2mm; font-weight: 600; }
.v-table th .ven { color: rgba(255,255,255,.8); }
.v-table td { border: 1px solid #e2e8f0; padding: 1.5mm 2mm; vertical-align: top; }
.v-table tbody tr:nth-child(even) td { background: #f8fafc; }
.mindmap { display: block; max-height: 80mm; }
.mm-node { box-sizing: border-box; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; text-align: center; border-radius: 10px; font-size: 12px; line-height: 1.25; padding: 4px 8px; overflow: hidden; }
.mm-branch { background: #fff; border: 2px solid; }
.mm-center { color: #fff; font-weight: 700; font-size: 13px; }
.mm-center .ven { color: rgba(255,255,255,.85); }
.v-glance { display: grid; grid-template-columns: 1fr 1fr; gap: 0; margin: 0; border: 1px solid #e2e8f0; border-radius: 2.5mm; overflow: hidden; }
.v-glance > div { padding: 2mm 3mm; border-bottom: 1px solid #e2e8f0; break-inside: avoid; }
.v-glance > div:nth-child(odd) { border-right: 1px solid #e2e8f0; }
.v-glance > div:nth-last-child(-n+2) { border-bottom: 0; }
.v-glance > div:nth-child(odd):last-child { grid-column: 1 / -1; border-right: 0; }
.v-glance dt { font-size: 7.8pt; font-weight: 700; text-transform: uppercase; letter-spacing: .03em; color: ${accent}; }
.v-glance dd { margin: .5mm 0 0; font-weight: 600; }
.v-compare { width: 100%; border-collapse: separate; border-spacing: 0 1.2mm; font-size: 9pt; }
.v-compare th { padding: 1.8mm 2mm; color: #fff; font-weight: 700; text-align: center; }
.v-compare th.ca { background: ${accent}; border-radius: 2mm 0 0 2mm; width: 40%; }
.v-compare th.cb { background: ${PALETTE[0]}; border-radius: 0 2mm 2mm 0; width: 40%; }
.v-compare th.vs { background: #1f2937; font-size: 8pt; text-transform: uppercase; }
.v-compare th .ven { color: rgba(255,255,255,.85); }
.v-compare td { padding: 1.6mm 2mm; background: #f8fafc; vertical-align: middle; }
.v-compare td.ca { text-align: right; border-left: 3px solid ${accent}; }
.v-compare td.cb { border-right: 3px solid ${PALETTE[0]}; }
.v-compare td.asp { text-align: center; font-size: 8pt; font-weight: 700; color: #475569; background: #eef2f7; }
.v-change { display: flex; flex-direction: column; gap: 1.8mm; }
.v-chg { display: grid; grid-template-columns: 36% 1fr; gap: 3mm; align-items: center; padding: 1.8mm 2.5mm; border-radius: 2mm; background: #f8fafc; break-inside: avoid; }
.v-chg-l { font-weight: 600; }
.v-chg-v { display: flex; align-items: center; gap: 2.5mm; flex-wrap: wrap; }
.v-chg .from { color: #94a3b8; text-decoration: line-through; }
.v-chg .to { font-weight: 700; color: ${accent}; font-size: 10.5pt; }
.v-chg-arrow { color: ${accent}; }
.v-trend { display: block; max-height: 62mm; }
.v-rank { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 1.2mm; }
.v-rank li { display: flex; align-items: center; gap: 2.5mm; padding: 1.4mm 2.5mm; border-radius: 2mm; background: #f8fafc; break-inside: avoid; }
.v-rank li.hl { background: #f5f3ff; outline: 1.5px solid ${accent}; font-weight: 700; }
.v-rank-n { flex: none; min-width: 7mm; height: 7mm; border-radius: 3.5mm; padding: 0 1.5mm; background: #e2e8f0; color: #1f2937; font-weight: 700; display: flex; align-items: center; justify-content: center; font-size: 9pt; }
.v-rank li.r1 .v-rank-n { background: #fbbf24; }
.v-rank li.r2 .v-rank-n { background: #cbd5e1; }
.v-rank li.r3 .v-rank-n { background: #d97706; color: #fff; }
.v-rank li.hl .v-rank-n { background: ${accent}; color: #fff; }
.v-rank .vl { flex: 1; }
.v-rank-v { flex: none; color: ${accent}; }
.v-proscons { display: grid; grid-template-columns: 1fr 1fr; gap: 3mm; }
.v-pc { border-radius: 2.5mm; padding: 2mm 3mm; break-inside: avoid; }
.v-pc.pro { background: #ecfdf5; border: 1px solid #a7f3d0; }
.v-pc.con { background: #fff7ed; border: 1px solid #fed7aa; }
.v-pc-h { font-weight: 700; font-size: 9pt; text-transform: uppercase; letter-spacing: .03em; margin-bottom: 1mm; }
.v-pc.pro .v-pc-h { color: #047857; }
.v-pc.con .v-pc-h { color: #c2410c; }
.v-pc ul { list-style: none; margin: 0; padding: 0; }
.v-pc li { display: flex; gap: 2mm; margin-bottom: 1mm; }
.v-pc li i { flex: none; font-style: normal; font-weight: 700; width: 4mm; text-align: center; }
.v-pc.pro li i { color: #059669; }
.v-pc.con li i { color: #ea580c; }
.v-tree { display: flex; flex-direction: column; align-items: center; }
.v-tree-root { padding: 2mm 5mm; border-radius: 2.5mm; background: ${accent}; color: #fff; font-weight: 700; text-align: center; max-width: 80%; }
.v-tree-root .ven { color: rgba(255,255,255,.85); }
.v-tree-kids { display: flex; gap: 2.5mm; width: 100%; margin-top: 3mm; position: relative; padding-top: 3mm; }
.v-tree-kids::before { content: ""; position: absolute; left: 50%; top: -3mm; height: 3mm; border-left: 2px solid #cbd5e1; }
.v-tree-kid { flex: 1; min-width: 0; position: relative; }
.v-tree-kid::before { content: ""; position: absolute; left: 50%; top: -3mm; height: 3mm; border-left: 2px solid #cbd5e1; }
.v-tree-kid::after { content: ""; position: absolute; top: -3mm; left: -1.25mm; right: -1.25mm; border-top: 2px solid #cbd5e1; }
.v-tree-kid:first-child::after { left: 50%; }
.v-tree-kid:last-child::after { right: 50%; }
.v-tree-node { border: 2px solid; border-radius: 2mm; padding: 1.5mm 2mm; text-align: center; font-weight: 600; background: #fff; font-size: 9pt; }
.v-tree-kid ul { margin: 1.5mm 0 0; padding-left: 4mm; font-size: 8.6pt; }
.v-cycle { display: block; max-height: 78mm; }
.cy-node { background: #fff; border: 2px solid; gap: 6px; justify-content: flex-start; text-align: left; }
.cy-n { flex: none; width: 20px; height: 20px; border-radius: 50%; color: #fff; font-weight: 700; font-size: 11px; display: flex; align-items: center; justify-content: center; }
`;
