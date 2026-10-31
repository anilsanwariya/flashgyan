// Server-only: the editor's recheck list of dated atlas facts. Rechecks are
// kept in bot_settings ("atlas_rechecks": the day each fact was last found
// still true, and how often it is rechecked when not the usual 6 months).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { cleanFactText, headingSources } from "@/lib/atlas";
import { DEFAULT_RECHECK, bumpAsOf, datedFact, recheckDue } from "@/lib/atlas-recheck";
import { invalidateAtlas, queueKb, saveFact } from "@/lib/atlas.server";

const from = (table: string) => supabaseAdmin.from(table as never);
const fail = (e: { message: string } | null) => {
  if (e) throw new Error(e.message);
};
type Row = Record<string, unknown>;
const KEY = "atlas_rechecks";
type Rechecks = { months: number; checked: Record<string, string>; every: Record<string, number> };

async function rechecks(): Promise<Rechecks> {
  const { data } = await from("bot_settings").select("value").eq("key", KEY).maybeSingle();
  const v = ((data as Row | null)?.value ?? {}) as Partial<Rechecks>;
  return { months: v.months ?? DEFAULT_RECHECK, checked: v.checked ?? {}, every: v.every ?? {} };
}
async function saveRechecks(r: Rechecks) {
  fail(
    (
      await from("bot_settings").upsert({
        key: KEY,
        value: r,
        updated_at: new Date().toISOString(),
      } as never)
    ).error,
  );
}

export type RecheckFact = {
  id: string;
  chapter: string;
  chapter_key: string;
  heading: string;
  text_en: string;
  text_hi: string;
  shown: string; // what students read
  district: string | null;
  asOf: string | null; // "2026-09"
  label: string; // "Sep 2026"
  checkedOn: string | null;
  every: number;
  due: string; // "2027-03"
  isDue: boolean;
};

async function datedFacts(): Promise<Row[]> {
  const out: Row[] = [];
  for (let at = 0; ; at += 1000) {
    const { data, error } = await from("atlas_facts")
      .select("id,chapter,chapter_key,heading,text_en,text_hi,entities,position")
      .neq("status", "hidden")
      .or("text_en.ilike.%as of%,text_en.like.%🔄%")
      .order("chapter_key")
      .order("position")
      .range(at, at + 999);
    fail(error);
    out.push(...((data ?? []) as Row[]));
    if ((data ?? []).length < 1000) return out;
  }
}

// Every dated fact, the ones due first.
export async function recheckList(today = new Date()) {
  const r = await rechecks();
  const facts: RecheckFact[] = [];
  for (const f of await datedFacts()) {
    const d = datedFact(String(f.text_en));
    if (!d) continue;
    const id = String(f.id);
    const every = r.every[id] ?? r.months;
    const checkedOn = r.checked[id] ?? null;
    const due = recheckDue(d.asOf, checkedOn, every, today);
    const district = ((f.entities as string[] | null) ?? [])
      .find((e) => e.startsWith("D:"))
      ?.slice(2);
    facts.push({
      id,
      chapter: String(f.chapter ?? ""),
      chapter_key: String(f.chapter_key ?? ""),
      heading: headingSources(String(f.heading ?? "")).heading,
      text_en: String(f.text_en ?? ""),
      text_hi: String(f.text_hi ?? ""),
      shown: cleanFactText(String(f.text_en ?? "")),
      district: district ?? null,
      asOf: d.asOf,
      label: d.label,
      checkedOn,
      every,
      due: due.due,
      isDue: due.isDue,
    });
  }
  facts.sort((a, b) => a.due.localeCompare(b.due) || a.chapter.localeCompare(b.chapter));
  return { months: r.months, due: facts.filter((f) => f.isDue).length, facts };
}

export async function recheckDueCount(): Promise<number> {
  try {
    return (await recheckList()).due;
  } catch {
    return 0;
  }
}

const today = () => new Date().toISOString().slice(0, 10);

// "Still true": recorded for today, and the fact's "as of" date moved to
// this month (when `bump`). `every`: how often to recheck this fact.
export async function confirmRecheck(id: string, opts: { bump: boolean; every?: number }) {
  const { data, error } = await from("atlas_facts")
    .select("text_en,text_hi,chapter_key")
    .eq("id", id)
    .maybeSingle();
  fail(error);
  if (!data) throw new Error("That fact is gone.");
  const f = data as Row;
  let moved = false;
  if (opts.bump) {
    const next = bumpAsOf(String(f.text_en), String(f.text_hi ?? ""), new Date());
    if (next.en !== f.text_en) {
      fail(
        (
          await from("atlas_facts")
            .update({
              text_en: next.en,
              text_hi: next.hi,
              updated_at: new Date().toISOString(),
            } as never)
            .eq("id", id)
        ).error,
      );
      await queueKb([String(f.chapter_key ?? "")]);
      invalidateAtlas();
      moved = true;
    }
  }
  await markChecked(id, opts.every);
  return { moved };
}

// The fact corrected by the editor, which counts as rechecked.
export async function editRecheck(
  id: string,
  p: { text_en: string; text_hi: string; chapter_key?: string; every?: number },
) {
  await saveFact({ id, text_en: p.text_en, text_hi: p.text_hi, chapter_key: p.chapter_key });
  await markChecked(id, p.every);
}

async function markChecked(id: string, every?: number) {
  const r = await rechecks();
  r.checked[id] = today();
  if (every && every !== r.months) r.every[id] = every;
  else if (every) delete r.every[id];
  await saveRechecks(r);
}

export async function setRecheckMonths(months: number) {
  await saveRechecks({ ...(await rechecks()), months });
}

// For the weekly report: dated facts due and students' open reports.
export async function atlasWeekly(): Promise<{ recheck: number; reports: number }> {
  const { count } = await from("atlas_reports")
    .select("id", { count: "exact", head: true })
    .eq("status", "open");
  return { recheck: await recheckDueCount(), reports: count ?? 0 };
}
