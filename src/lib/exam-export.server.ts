// Server-only: export sets. A set is a question bank filter; its members
// are the finished questions matching it now. Downloading a language's
// sheet records each row (order, how it looked); the app's ids are
// uploaded back; a set then knows what is new or changed (upload again) and
// which app ids left it (remove from the app).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { questionsByIds } from "@/lib/exam-papers.server";
import { questionBank } from "@/lib/exam-bank.server";
import { filterRows, type BankFilter } from "@/lib/exam-bank";
import {
  DEFAULT_TITLES,
  EXPORT_LANGS,
  exportFileName,
  exportRow,
  matchIds,
  planSet,
  sheetRow,
  type ExportItem,
  type ExportLang,
  type ExportRow,
  type SetStatus,
  type Titles,
} from "@/lib/exam-export";
import type { ExamQuestion } from "@/lib/exam-papers";

const from = (table: string) => supabaseAdmin.from(table as never);
const fail = (e: { message: string } | null) => {
  if (e) throw new Error(e.message);
};
const now = () => new Date().toISOString();
const missing = (e: { message: string } | null) =>
  !!e && /exam_export_sets|exam_export_items|schema cache/.test(e.message);
export const EXPORT_NOT_READY =
  "Export sets need a database update: run the latest migration (exam_export_sets) in Lovable or the SQL editor.";

export type ExportSet = {
  id: string;
  name: string;
  filter: BankFilter;
  titles: Titles;
  downloaded: Partial<Record<ExportLang, string>>;
  created_at: string;
};
export type ExportSetView = ExportSet & {
  status: Record<ExportLang, SetStatus>;
  remove: Record<ExportLang, { app_id: string; label: string }[]>;
};

const readSet = (r: unknown): ExportSet => {
  const s = r as ExportSet;
  return {
    ...s,
    filter: (s.filter ?? {}) as BankFilter,
    titles: { ...DEFAULT_TITLES, ...((s.titles ?? {}) as Partial<Titles>) },
    downloaded: (s.downloaded ?? {}) as ExportSet["downloaded"],
  };
};

async function loadSets(id?: string): Promise<ExportSet[]> {
  let q = from("exam_export_sets").select("*").order("created_at");
  if (id) q = q.eq("id", id);
  const { data, error } = await q;
  if (missing(error)) throw new Error(EXPORT_NOT_READY);
  fail(error);
  return ((data ?? []) as unknown[]).map(readSet);
}

async function loadItems(
  setIds: string[],
): Promise<(ExportItem & { set_id: string; lang: ExportLang })[]> {
  const out: (ExportItem & { set_id: string; lang: ExportLang })[] = [];
  if (!setIds.length) return out;
  for (let at = 0; ; at += 1000) {
    const { data, error } = await from("exam_export_items")
      .select("set_id,question_id,lang,position,app_id,sig,label,gone_at")
      .in("set_id", setIds)
      .order("set_id")
      .order("lang")
      .order("position")
      .range(at, at + 999);
    fail(error);
    out.push(...((data ?? []) as never[]));
    if ((data ?? []).length < 1000) return out;
  }
}

// Each set's members now (finished questions matching its filter, oldest
// paper first, by question number) and their questions in full.
async function membersOf(sets: ExportSet[]) {
  const bank = await questionBank();
  const year = new Map(bank.papers.map((p) => [p.id, `${p.year}\u0000${p.exam}`]));
  const exam = new Map(bank.papers.map((p) => [p.id, p.exam]));
  const ids = new Map<string, { id: string; done: boolean; label: string }[]>();
  for (const s of sets)
    ids.set(
      s.id,
      filterRows(bank.rows, bank.papers, { ...s.filter, status: undefined })
        // Not finished: kept only if already in the set (as downloaded).
        .filter((r) => !r.deleted)
        .sort(
          (a, b) =>
            (year.get(a.paper) ?? "").localeCompare(year.get(b.paper) ?? "") ||
            a.paper.localeCompare(b.paper) ||
            a.n - b.n,
        )
        .map((r) => ({
          id: r.id,
          done: r.done,
          label: `${exam.get(r.paper) ?? ""} Q${r.n}: ${r.text.slice(0, 80)}`,
        })),
    );
  const all = [...new Set([...ids.values()].flat().map((x) => x.id))];
  const full = new Map((await questionsByIds(all)).map((q) => [q.id, q]));
  return { ids, full };
}

function plan(
  members: { id: string; done: boolean; label: string }[],
  full: Map<string, ExamQuestion>,
  items: ExportItem[],
  lang: ExportLang,
) {
  let skipped = 0;
  const rows: { question_id: string; row: ExportRow; label: string }[] = [];
  const had = new Map(items.map((i) => [i.question_id, i]));
  for (const m of members) {
    // Being proofread again: stays as last downloaded until finished.
    if (!m.done) {
      const it = had.get(m.id);
      if (it?.sig && !it.gone_at)
        try {
          rows.push({ question_id: m.id, row: JSON.parse(it.sig) as ExportRow, label: it.label });
        } catch {
          // An old row that can't be read: left out.
        }
      continue;
    }
    const q = full.get(m.id);
    if (!q) continue;
    const r = exportRow(q, lang);
    if ("skip" in r) skipped++;
    else rows.push({ question_id: m.id, row: r, label: m.label });
  }
  return { ...planSet(rows, items), skipped };
}

export async function listSets(): Promise<{ ready: boolean; sets: ExportSetView[] }> {
  let sets: ExportSet[];
  try {
    sets = await loadSets();
  } catch (e) {
    if ((e as Error).message === EXPORT_NOT_READY) return { ready: false, sets: [] };
    throw e;
  }
  const items = await loadItems(sets.map((s) => s.id));
  const { ids, full } = await membersOf(sets);
  return {
    ready: true,
    sets: sets.map((s) => {
      const status = {} as Record<ExportLang, SetStatus>;
      const remove = {} as ExportSetView["remove"];
      for (const lang of EXPORT_LANGS) {
        const mine = items.filter((i) => i.set_id === s.id && i.lang === lang);
        const p = plan(ids.get(s.id) ?? [], full, mine, lang);
        status[lang] = {
          questions: p.rows.length,
          fresh: p.rows.filter((r) => r.status === "new").length,
          changed: p.rows.filter((r) => r.status === "changed").length,
          remove: p.gone.length,
          noIds: s.downloaded[lang]
            ? p.rows.filter((r) => r.status === "same" && !r.app_id).length
            : 0,
          noExplanation: p.rows.filter((r) => !r.row.explanation).length,
          skipped: p.skipped,
          downloaded: s.downloaded[lang] ?? null,
        };
        remove[lang] = p.gone.map((g) => ({ app_id: g.app_id, label: g.label }));
      }
      return { ...s, status, remove };
    }),
  };
}

export async function createSet(name: string, filter: BankFilter) {
  const clean = Object.fromEntries(
    Object.entries(filter).filter(([k, v]) => v && k !== "status"),
  ) as BankFilter;
  const { data, error } = await from("exam_export_sets")
    .insert({ name: name.trim().slice(0, 120) || "Questions", filter: clean } as never)
    .select("*")
    .single();
  if (missing(error)) throw new Error(EXPORT_NOT_READY);
  fail(error);
  return readSet(data);
}

export async function updateSet(id: string, patch: { name?: string; titles?: Partial<Titles> }) {
  const [s] = await loadSets(id);
  if (!s) throw new Error("That set is gone.");
  const row: Record<string, unknown> = { updated_at: now() };
  if (patch.name !== undefined) row.name = patch.name.trim().slice(0, 120) || s.name;
  if (patch.titles)
    row.titles = Object.fromEntries(
      EXPORT_LANGS.map((l) => [
        l,
        (patch.titles![l] ?? s.titles[l]).trim().slice(0, 40) || DEFAULT_TITLES[l],
      ]),
    );
  fail(
    (
      await from("exam_export_sets")
        .update(row as never)
        .eq("id", id)
    ).error,
  );
}

export async function deleteSet(id: string) {
  fail((await from("exam_export_sets").delete().eq("id", id)).error);
}

// A language's sheet: the rows in the app's layout, recorded as downloaded.
export async function downloadSet(id: string, lang: ExportLang) {
  const [s] = await loadSets(id);
  if (!s) throw new Error("That set is gone.");
  const items = (await loadItems([id])).filter((i) => i.lang === lang);
  const { ids, full } = await membersOf([s]);
  const p = plan(ids.get(id) ?? [], full, items, lang);
  if (!p.rows.length)
    throw new Error(
      `No finished questions in ${lang === "hi" ? "Hindi" : "English"} in this set yet.`,
    );
  const at = now();
  const rows = p.rows.map((r) => ({
    set_id: id,
    question_id: r.question_id,
    lang,
    position: r.position,
    app_id: r.app_id,
    sig: r.sig,
    label: r.label,
    gone_at: null,
    updated_at: at,
  }));
  for (let i = 0; i < rows.length; i += 500)
    fail(
      (
        await from("exam_export_items").upsert(rows.slice(i, i + 500) as never, {
          onConflict: "set_id,question_id,lang",
        })
      ).error,
    );
  // Left the set: kept to remove from the app when it has an id.
  for (const g of p.newlyGone) {
    if (g.app_id)
      fail(
        (
          await from("exam_export_items")
            .update({ gone_at: at, updated_at: at } as never)
            .eq("set_id", id)
            .eq("lang", lang)
            .eq("question_id", g.question_id)
        ).error,
      );
    else
      fail(
        (
          await from("exam_export_items")
            .delete()
            .eq("set_id", id)
            .eq("lang", lang)
            .eq("question_id", g.question_id)
        ).error,
      );
  }
  fail(
    (
      await from("exam_export_sets")
        .update({ downloaded: { ...s.downloaded, [lang]: at }, updated_at: at } as never)
        .eq("id", id)
    ).error,
  );
  return {
    fileName: exportFileName(s.name, lang),
    rows: p.rows.map((r) => sheetRow(r.app_id, r.position, r.row, s.titles[lang])),
    fresh: p.rows.filter((r) => r.status === "new").length,
    noExplanation: p.rows.filter((r) => !r.row.explanation).length,
    skipped: p.skipped,
    remove: p.gone.length,
  };
}

// The app's sheet uploaded back: its ids saved on the set's rows.
export async function importIds(
  id: string,
  lang: ExportLang,
  uploaded: { id: string; order: number | null; text: string }[],
) {
  const items = (await loadItems([id])).filter((i) => i.lang === lang && !i.gone_at);
  if (!items.length)
    throw new Error("Download this sheet first, then upload the app's sheet back.");
  const rows = items.map((i) => {
    let text = "";
    try {
      text = (JSON.parse(i.sig) as ExportRow).text;
    } catch {
      // Not downloaded yet.
    }
    return { question_id: i.question_id, position: i.position, text };
  });
  const { ids, unmatched } = matchIds(uploaded, rows);
  const at = now();
  for (const [qid, appId] of ids)
    fail(
      (
        await from("exam_export_items")
          .update({ app_id: appId.slice(0, 120), updated_at: at } as never)
          .eq("set_id", id)
          .eq("lang", lang)
          .eq("question_id", qid)
      ).error,
    );
  return { matched: ids.size, unmatched, without: items.length - ids.size };
}

// The listed app ids removed from the app: forgotten.
export async function clearRemoved(id: string, lang: ExportLang) {
  const [s0] = await loadSets(id);
  if (!s0) throw new Error("That set is gone.");
  const items = (await loadItems([id])).filter((i) => i.lang === lang);
  const { ids, full } = await membersOf([s0]);
  const gone = plan(ids.get(id) ?? [], full, items, lang).gone.map((g) => g.question_id);
  for (let i = 0; i < gone.length; i += 200)
    fail(
      (
        await from("exam_export_items")
          .delete()
          .eq("set_id", id)
          .eq("lang", lang)
          .in("question_id", gone.slice(i, i + 200))
      ).error,
    );
  return { cleared: gone.length };
}
