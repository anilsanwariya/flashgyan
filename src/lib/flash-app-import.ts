// A topic already uploaded to the app, brought into the studio: its final
// master sheet (sheet, order, books…) and the chunks downloaded from the
// app's admin panel (each card's app id). Cards are matched by their number;
// where the master and the app differ, the app's version is kept (it is what
// students see). Pure: shared by the import dialog and tests.
import type { FlashCard, FlashTopic, ParsedSheet, SheetCard } from "@/lib/flash-studio";

export type AppDiff = { order: number; field: string; master: string; app: string };

export type AppImportPlan = {
  // The cards to add, numbered, with their app ids.
  cards: SheetCard[];
  // Explanation column titles (the master's, then any only in the app).
  columns: string[];
  prompt: string;
  chunks: { n: number; from: number; to: number; cards: number; fromApp: boolean; file?: string }[];
  // Text the app has differently from the master (the app's kept).
  differ: AppDiff[];
  // A different word at the same number: the app's card kept.
  mismatched: { order: number; master: string; app: string }[];
  // In the app, not in the master: added.
  appOnly: { order: number; front: string }[];
  // In the master, missing from the app's export of its chunk: left out.
  notInApp: { order: number; front: string }[];
  // A master with numbers (order) but no chunks (sheet): the app files'
  // number ranges are chunks; the cards no app file covers are cut into
  // chunks of these sizes (by default, each unbroken run of numbers).
  ordered?: {
    uncovered: number;
    runs: { from: number; to: number; count: number }[];
    sizes: number[];
  };
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

// A master's cards numbered (order) but not chunked (sheet), given their
// chunks: each app file's number range is one; the cards outside them are
// cut, in number order, into chunks of `sizes` (default: each unbroken run
// of numbers between the app files' ranges). Chunks are numbered by their
// first card.
export function chunkByOrder(
  cards: SheetCard[],
  ranges: { from: number; to: number }[],
  sizes?: number[],
): { cards: SheetCard[]; ordered: NonNullable<AppImportPlan["ordered"]>; problems: string[] } {
  const problems: string[] = [];
  const inRange = (o: number) => ranges.findIndex((r) => o >= r.from && o <= r.to);
  const sorted = [...cards].sort((a, b) => a.order! - b.order!);
  const rest = sorted.filter((c) => inRange(c.order!) < 0);
  // Unbroken runs: an app file's range between two cards breaks a run.
  const runs: SheetCard[][] = [];
  for (const c of rest) {
    const last = runs[runs.length - 1];
    const prev = last?.[last.length - 1];
    if (prev && !ranges.some((r) => r.from > prev.order! && r.to < c.order!)) last.push(c);
    else runs.push([c]);
  }
  const runSizes = runs.map((r) => r.length);
  let use = sizes?.length ? sizes : runSizes;
  const sum = use.reduce((a, b) => a + b, 0);
  if (sum !== rest.length) {
    problems.push(
      `The chunk sizes add up to ${sum}; the cards outside the app files are ${rest.length}.`,
    );
    use = runSizes;
  }
  // Cut; a chunk mustn't reach across an app file's range.
  const cut = (list: number[]) => {
    const segs: SheetCard[][] = [];
    let at = 0;
    for (const n of list) {
      segs.push(rest.slice(at, at + n));
      at += n;
    }
    return segs;
  };
  let segs = cut(use);
  const crosses = segs.some((seg) =>
    seg.some((c, i) => i > 0 && ranges.some((r) => r.from > seg[i - 1].order! && r.to < c.order!)),
  );
  if (crosses) {
    problems.push("A chunk of those sizes would reach across a chunk from the app: sizes reset.");
    use = runSizes;
    segs = cut(use);
  }
  const chunks = [
    ...ranges.map((r) => ({
      from: r.from,
      range: r as { from: number; to: number } | null,
      seg: null as SheetCard[] | null,
    })),
    ...segs.filter((x) => x.length).map((seg) => ({ from: seg[0].order!, range: null, seg })),
  ].sort((a, b) => a.from - b.from);
  const sheetOf = new Map<SheetCard, number>();
  chunks.forEach((ch, i) => {
    if (ch.seg) for (const c of ch.seg) sheetOf.set(c, i + 1);
    else
      for (const c of sorted)
        if (c.order! >= ch.range!.from && c.order! <= ch.range!.to) sheetOf.set(c, i + 1);
  });
  return {
    cards: cards.map((c) => ({ ...c, sheet: sheetOf.get(c) ?? null })),
    ordered: {
      uncovered: rest.length,
      runs: runs.map((r) => ({ from: r[0].order!, to: r[r.length - 1].order!, count: r.length })),
      sizes: use,
    },
    problems,
  };
}

export function planAppImport(
  master: ParsedSheet | null,
  apps: ParsedSheet[],
  // The app files' names, in the same order (each chunk named after its file).
  fileNames: string[] = [],
  // A master without chunks: the sizes for its cards outside the app files.
  restSizes?: number[],
): AppImportPlan {
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
  let masterCards = master?.numbered ? master.cards : [];
  // Numbered but not chunked: chunks from the app files and the sizes.
  const ordered =
    !!master &&
    !master.numbered &&
    master.cards.length > 0 &&
    master.cards.every((c) => c.order !== null && c.order > 0);
  if (master && !master.numbered && !ordered)
    problems.push("The master sheet needs an order number (its number in the app) on every card.");
  if (ordered) {
    const ranges = apps
      .map((a) => a.cards.map((c) => c.order).filter((o): o is number => o !== null))
      .filter((l) => l.length)
      .map((l) => ({ from: Math.min(...l), to: Math.max(...l) }))
      .sort((a, b) => a.from - b.from);
    for (let i = 1; i < ranges.length; i++)
      if (ranges[i].from <= ranges[i - 1].to)
        problems.push("Two app files share card numbers: is one of them added twice?");
    const got = chunkByOrder(master.cards, ranges, restSizes);
    masterCards = got.cards;
    plan.ordered = got.ordered;
    problems.push(...got.problems);
  }
  const byOrder = new Map<number, SheetCard>();
  for (const c of masterCards) {
    if (byOrder.has(c.order!)) problems.push(`The master has number ${c.order} twice.`);
    byOrder.set(c.order!, c);
  }
  // Each app file: one chunk (the master's chunk most of its numbers are in;
  // without a master, the files in number order).
  const files = apps
    .map((a, i) => ({
      cards: a.cards.filter((c) => c.order !== null),
      sheet: a,
      file: (fileNames[i] ?? "").replace(/\.[^.]+$/, "").trim(),
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
      ...(fromApp.get(n)?.file ? { file: fromApp.get(n)!.file } : {}),
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

// ---------- Comparing the studio with the app ----------

export type AppField = { field: string; studio: string; app: string };

export type AppCompare = {
  // Cards the same in both.
  same: number;
  // Cards that differ: each field that does, and the app's text by field.
  differ: {
    id: string;
    order: number | null;
    chunk: number | null;
    front: string;
    fields: AppField[];
    app: {
      front: string;
      back: string;
      prompt: string;
      back_hint: string;
      ex: Record<string, string>;
    };
  }[];
  // In the app's file, not a card here (by id or number).
  appOnly: { order: number | null; front: string }[];
  // Cards here in the compared chunks, not in the app's file.
  studioOnly: { id: string; order: number | null; front: string }[];
  // Removed here, still in the app.
  removedHere: { id: string; order: number | null; front: string }[];
  // The chunks the app's files cover.
  chunks: number[];
};

// The topic's cards against chunks exported from the app: matched by the
// app's id, else by number.
export function compareWithApp(
  topic: Pick<FlashTopic, "prompt" | "columns">,
  cards: FlashCard[],
  apps: ParsedSheet[],
): AppCompare {
  const out: AppCompare = {
    same: 0,
    differ: [],
    appOnly: [],
    studioOnly: [],
    removedHere: [],
    chunks: [],
  };
  const byId = new Map(cards.filter((c) => c.app_id).map((c) => [c.app_id!, c]));
  const byOrder = new Map(
    cards.filter((c) => c.card_order !== null).map((c) => [c.card_order!, c]),
  );
  const colOf = new Map(topic.columns.map((c) => [c.title.trim(), c.id]));
  const seen = new Set<string>();
  const chunks = new Set<number>();
  for (const sheet of apps) {
    const titles = sheet.columns.filter((t) => colOf.has(t.trim()));
    for (const a of sheet.cards) {
      const c =
        (a.app_id && byId.get(a.app_id)) || (a.order !== null ? byOrder.get(a.order) : undefined);
      if (!c) {
        out.appOnly.push({ order: a.order, front: first(a.front) });
        continue;
      }
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      if (c.chunk !== null) chunks.add(c.chunk);
      if (c.removed) {
        out.removedHere.push({ id: c.id, order: c.card_order, front: first(c.front) });
        continue;
      }
      const app = {
        front: a.front,
        back: a.back,
        prompt: a.prompt,
        back_hint: a.back_hint,
        ex: Object.fromEntries(titles.map((t) => [colOf.get(t.trim())!, a.ex[t] ?? ""])),
      };
      const fields: AppField[] = [];
      const cmp = (field: string, studio: string, appText: string) => {
        if (norm(studio) !== norm(appText)) fields.push({ field, studio, app: appText });
      };
      cmp("front", c.front, a.front);
      cmp("back", c.back, a.back);
      cmp("prompt", c.prompt ?? topic.prompt, a.prompt || topic.prompt);
      cmp("backHint", c.back_hint, a.back_hint);
      for (const t of titles)
        cmp(`explanation_${t}`, c.ex[colOf.get(t.trim())!] ?? "", a.ex[t] ?? "");
      if (fields.length)
        out.differ.push({
          id: c.id,
          order: c.card_order,
          chunk: c.chunk,
          front: first(c.front),
          fields,
          app,
        });
      else out.same++;
    }
  }
  out.chunks = [...chunks].sort((a, b) => a - b);
  for (const c of cards)
    if (!c.removed && c.chunk !== null && chunks.has(c.chunk) && !seen.has(c.id))
      out.studioOnly.push({ id: c.id, order: c.card_order, front: first(c.front) });
  out.differ.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return out;
}
