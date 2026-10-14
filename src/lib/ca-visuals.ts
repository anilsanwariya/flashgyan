// Visuals for magazine items: key-number cards, bar and pie charts,
// timelines, flow charts, comparison tables and mind maps. SAATHI picks the
// visual that makes a story easiest to learn, built only from the item's
// facts; every number in it must appear in those facts, or it is rejected.
// Rendered as plain HTML/SVG so the PDF stays sharp.
import type { Bi, CaFact } from "@/lib/current-affairs";

export type Visual =
  | { type: "stats"; title: Bi; stats: { value: string; label: Bi }[] }
  | { type: "bar"; title: Bi; unit: string; bars: { label: Bi; value: number }[] }
  | { type: "pie"; title: Bi; unit: string; slices: { label: Bi; value: number }[] }
  | { type: "timeline"; title: Bi; events: { when: string; text: Bi }[] }
  | { type: "flow"; title: Bi; steps: Bi[] }
  | { type: "table"; title: Bi; columns: Bi[]; rows: Bi[][] }
  | { type: "mindmap"; title: Bi; center: Bi; branches: Bi[] };

export type VisualType = Visual["type"];

export const VISUAL_LABELS: Record<VisualType, string> = {
  stats: "Key numbers",
  bar: "Bar chart",
  pie: "Pie chart",
  timeline: "Timeline",
  flow: "Flow chart",
  table: "Table",
  mindmap: "Mind map",
};

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
}): ChatMessage[] {
  const facts = opts.facts.map((f, i) => `${i + 1}. ${f.text}`).join("\n");
  return [
    {
      role: "system",
      content: `You design one learning visual for a news item in a bilingual (Hindi and English) current affairs magazine for RAS exam aspirants, and a one-line revision note. Pick the visual that makes the story easiest to understand and remember:
- "stats": 2-4 headline numbers (outlay, beneficiaries, rank, districts covered). {"type":"stats","title":{...},"stats":[{"value":"₹500 crore","label":{"en":"...","hi":"..."}}]}
- "bar": 2-8 quantities in the same unit to compare (allocations, ranks, figures over years). {"type":"bar","title":{...},"unit":"crore","bars":[{"label":{...},"value":500}]}
- "pie": ONLY when the facts give percentage shares of one whole. {"type":"pie","title":{...},"unit":"%","slices":[{"label":{...},"value":40}]}
- "timeline": 3-6 dated events. {"type":"timeline","title":{...},"events":[{"when":"2019","text":{...}}]}
- "flow": a process, procedure or cause-and-effect chain in 3-5 steps. {"type":"flow","title":{...},"steps":[{"en":"...","hi":"..."}]}
- "table": compares 2-4 things across features, or lists a scheme's key features (columns like "Feature" / "Details"); 2-4 columns, 2-6 rows. {"type":"table","title":{...},"columns":[{...}],"rows":[[{...},{...}]]}
- "mindmap": a concept, scheme or event with 4-6 key aspects (aims, features, significance). {"type":"mindmap","title":{...},"center":{...},"branches":[{...}]}
STRICT RULES: Use only the numbered facts. Every number you write (in values, labels, dates and in both languages) must appear in the facts exactly as written there: no totals, differences, percentages, conversions (no lakh/crore/हजार conversions) or rounding of your own. Never number the steps or branches yourself. Keep every label short (at most 8 words; table cells at most 12). Hindi is natural standard Hindi as used in RPSC exams; use the same digits as English. If the facts are too thin for a useful visual, use null.
"oneliner" is the single most exam-worthy line of the story, at most 20 words, for a last-minute revision page.
Reply with JSON only: {"visual": {...} or null, "oneliner": {"en": "...", "hi": "..."}}`,
    },
    {
      role: "user",
      content: `Section: ${opts.category}\nHeadline: ${opts.headline}\n\nFacts:\n${facts}${
        opts.problem ? `\n\nYour previous visual was rejected: ${opts.problem} Fix it.` : ""
      }`,
    },
  ];
}

const MAX = { stats: 4, bar: 8, pie: 8, timeline: 6, flow: 5, table: 6, mindmap: 6 };

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
    default:
      return fail(`Unknown visual type "${type}".`);
  }
}

// Reads SAATHI's reply: the visual (only if all its numbers are in the facts)
// and the revision line.
export function parseVisual(
  raw: string,
  facts: CaFact[],
  headline = "",
): { visual: Visual | null; oneliner: Bi | null; problem: string | null } {
  const o = (parseJson(raw) ?? {}) as Record<string, unknown>;
  const oneliner = bi(o.oneliner, 300);
  const { visual, problem } = cleanVisual(o.visual);
  if (!visual) return { visual: null, oneliner, problem };
  const bad = unverifiedNumbers(visual, facts, headline);
  if (bad.length) {
    return {
      visual: null,
      oneliner,
      problem: `These numbers are not in the facts: ${bad.join(", ")}.`,
    };
  }
  return { visual, oneliner, problem: null };
}

// ---------- Rendering ----------

const esc = (s: string | null | undefined) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// Hindi above English; once when both are the same.
function label(b: Bi, cls = ""): string {
  const hi = b.hi.trim();
  const en = b.en.trim();
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

function mindmapSvg(v: Extract<Visual, { type: "mindmap" }>, accent: string): string {
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
      node(x, y - (rowH - 10) / 2, boxW, rowH - 10, label(b), "mm-branch", `border-color:${color}`),
    );
  };
  ys(left.length).forEach((y, i) => branch(left[i], y, "l", i));
  ys(right.length).forEach((y, i) => branch(right[i], y, "r", i + left.length));
  parts.push(
    node(cx - cW / 2, cy - cH / 2, cW, cH, label(v.center), "mm-center", `background:${accent}`),
  );
  return `<svg class="mindmap" viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet">${parts.join("")}</svg>`;
}

// The visual as HTML, for the magazine and the admin preview.
export function visualHtml(v: Visual, accent = "#6d28d9"): string {
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
      body = mindmapSvg(v, accent);
      break;
  }
  return `<div class="box visual visual-${v.type}"><div class="box-title">${esc(VISUAL_LABELS[v.type])}</div>${caption}${body}</div>`;
}

export const VISUAL_CSS = (accent: string) => `
.visual { border: 1px solid #e2e8f0; background: #fff; break-inside: avoid; }
.visual .box-title { color: ${accent}; }
.v-caption { font-weight: 600; margin: .5mm 0 2mm; }
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
`;
