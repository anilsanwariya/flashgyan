// A topic already uploaded to the app, brought into the studio: its final
// master sheet (sheet, order, books…) and the chunks downloaded from the
// app's admin panel (each card's app id). Cards are matched by their number;
// where the master and the app differ, the app's version is kept (it is what
// students see). Pure: shared by the import dialog and tests.
import type { ParsedSheet, SheetCard } from "@/lib/flash-studio";

export type AppDiff = { order: number; field: string; master: string; app: string };

export type AppImportPlan = {
  // The cards to add, numbered, with their app ids.
  cards: SheetCard[];
  // Explanation column titles (the master's, then any only in the app).
  columns: string[];
  prompt: string;
  chunks: { n: number; from: number; to: number; cards: number; fromApp: boolean }[];
  // Text the app has differently from the master (the app's kept).
  differ: AppDiff[];
  // A different word at the same number: the app's card kept.
  mismatched: { order: number; master: string; app: string }[];
  // In the app, not in the master: added.
  appOnly: { order: number; front: string }[];
  // In the master, missing from the app's export of its chunk: left out.
  notInApp: { order: number; front: string }[];
  problems: string[];
};

// Text compared without the spaces at line ends (the app trims them).
const norm = (s: string) =>
  s
    .normalize("NFC")
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .trim();

const first = (s: string) => norm(s).split("\n")[0] ?? "";

const FIELDS: [keyof SheetCard, string][] = [
  ["front", "front"],
  ["back", "back"],
  ["prompt", "prompt"],
  ["back_hint", "backHint"],
];

export function planAppImport(master: ParsedSheet | null, apps: ParsedSheet[]): AppImportPlan {
  const problems: string[] = [];
  const plan: AppImportPlan = {
    cards: [],
    columns: [],
    prompt: "",
    chunks: [],
    differ: [],
    mismatched: [],
    appOnly: [],
    notInApp: [],
    problems,
  };
  if (master && !master.numbered)
    problems.push("The master sheet needs a sheet (chunk) and an order number on every card.");
  const masterCards = master?.numbered ? master.cards : [];
  const byOrder = new Map<number, SheetCard>();
  for (const c of masterCards) {
    if (byOrder.has(c.order!)) problems.push(`The master has number ${c.order} twice.`);
    byOrder.set(c.order!, c);
  }
  // Each app file: one chunk (the master's chunk most of its numbers are in;
  // without a master, the files in number order).
  const files = apps
    .map((a) => ({
      cards: a.cards.filter((c) => c.order !== null),
      sheet: a,
      skipped: a.cards.filter((c) => c.order === null).length,
    }))
    .filter((f) => f.cards.length);
  for (const f of files)
    if (f.skipped)
      problems.push(`${f.skipped} rows of an app file have no order number: left out.`);
  files.sort(
    (a, b) => Math.min(...a.cards.map((c) => c.order!)) - Math.min(...b.cards.map((c) => c.order!)),
  );
  const chunkOf = new Map<(typeof files)[number], number>();
  files.forEach((f, i) => {
    const votes = new Map<number, number>();
    for (const c of f.cards) {
      const s = byOrder.get(c.order!)?.sheet;
      if (s != null) votes.set(s, (votes.get(s) ?? 0) + 1);
    }
    const best = [...votes].sort((a, b) => b[1] - a[1])[0]?.[0];
    chunkOf.set(
      f,
      best ??
        (masterCards.length ? Math.max(0, ...masterCards.map((c) => c.sheet!)) + i + 1 : i + 1),
    );
  });
  const fromApp = new Map<number, (typeof files)[number]>();
  for (const f of files) {
    const n = chunkOf.get(f)!;
    if (fromApp.has(n)) problems.push(`Two app files are chunk ${n}: only the first is used.`);
    else fromApp.set(n, f);
  }
  // Columns: the master's, then the app's.
  plan.columns = [...new Set([...(master?.columns ?? []), ...apps.flatMap((a) => a.columns)])];
  const seenIds = new Set<string>();
  const out = new Map<number, SheetCard>();
  // Chunks with no app file: the master's cards as they are.
  for (const c of masterCards) if (!fromApp.has(c.sheet!)) out.set(c.order!, { ...c });
  for (const [n, f] of fromApp) {
    const inFile = new Set<number>();
    for (const a of f.cards) {
      const order = a.order!;
      if (inFile.has(order) || out.has(order)) {
        problems.push(`Number ${order} is in the app files twice: the second left out.`);
        continue;
      }
      inFile.add(order);
      if (a.app_id) {
        if (seenIds.has(a.app_id)) problems.push(`App id ${a.app_id} is on two cards.`);
        seenIds.add(a.app_id);
      }
      const m = byOrder.get(order);
      const app: SheetCard = { ...a, sheet: n, sheet_order: null, book: "", book_order: null };
      if (!m) {
        if (masterCards.length) plan.appOnly.push({ order, front: first(a.front) });
        out.set(order, app);
        continue;
      }
      if (first(m.front) !== first(a.front) && norm(m.back) !== norm(a.back)) {
        plan.mismatched.push({ order, master: first(m.front), app: first(a.front) });
        out.set(order, app);
        continue;
      }
      for (const [k, label] of FIELDS)
        if (norm(String(m[k] ?? "")) !== norm(String(a[k] ?? "")))
          plan.differ.push({
            order,
            field: label,
            master: String(m[k] ?? ""),
            app: String(a[k] ?? ""),
          });
      for (const t of new Set([...Object.keys(m.ex), ...Object.keys(a.ex)]))
        if (f.sheet.columns.includes(t) && norm(m.ex[t] ?? "") !== norm(a.ex[t] ?? ""))
          plan.differ.push({
            order,
            field: `explanation_${t}`,
            master: m.ex[t] ?? "",
            app: a.ex[t] ?? "",
          });
      out.set(order, {
        // The master's books and numbers; the app's text and id.
        ...m,
        front: a.front,
        back: a.back,
        prompt: a.prompt || m.prompt,
        back_hint: a.back_hint,
        is_revealed: a.is_revealed,
        word_key: a.word_key || m.word_key,
        // Columns the app's file has come from it; the others stay.
        ex: {
          ...Object.fromEntries(Object.entries(m.ex).filter(([t]) => !f.sheet.columns.includes(t))),
          ...a.ex,
        },
        app_id: a.app_id,
        sheet: n,
      });
    }
    for (const c of masterCards)
      if (c.sheet === n && !inFile.has(c.order!))
        plan.notInApp.push({ order: c.order!, front: first(c.front) });
  }
  plan.cards = [...out.values()].sort((a, b) => a.order! - b.order!);
  // Each chunk's place for a card (1, 2, 3… within it).
  const at = new Map<number, number>();
  for (const c of plan.cards) {
    const k = (at.get(c.sheet!) ?? 0) + 1;
    at.set(c.sheet!, k);
    c.sheet_order = k;
  }
  const byChunk = new Map<number, SheetCard[]>();
  for (const c of plan.cards) byChunk.set(c.sheet!, [...(byChunk.get(c.sheet!) ?? []), c]);
  plan.chunks = [...byChunk]
    .map(([n, list]) => ({
      n,
      from: list[0].order!,
      to: list[list.length - 1].order!,
      cards: list.length,
      fromApp: fromApp.has(n),
    }))
    .sort((a, b) => a.n - b.n);
  for (let i = 1; i < plan.chunks.length; i++)
    if (plan.chunks[i].from <= plan.chunks[i - 1].to)
      problems.push(
        `Chunks ${plan.chunks[i - 1].n} and ${plan.chunks[i].n} overlap in their numbers.`,
      );
  const counts = new Map<string, number>();
  for (const c of plan.cards)
    if (c.prompt.trim()) counts.set(c.prompt, (counts.get(c.prompt) ?? 0) + 1);
  plan.prompt = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? master?.prompt ?? "";
  if (!plan.cards.length && !problems.length) problems.push("No cards in these files.");
  return plan;
}
