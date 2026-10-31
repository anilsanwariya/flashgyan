// Server-only: keeping the atlas complete. Each district's checklist (atlas
// data, notes imported, both languages, fact-checked, published), notes
// files matched to their districts for importing many at once, the queue
// of Hindi the AI wrote (facts and place names) for the editor to check,
// and the report of what's thin or missing.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { RAJ_DISTRICTS } from "@/lib/geo-admin";
import {
  ATLAS_GROUPS,
  atlasCat,
  normalizeOverview,
  type DistrictMeta,
  type DistrictOverview,
} from "@/lib/atlas";
import {
  groupMatrix,
  guessDistrict,
  inLanguage,
  notesLang,
  thin,
  type ChecklistRow,
} from "@/lib/atlas-review";
import { notesParts, notesText, type OverviewCheck } from "@/lib/atlas.server";
import { orphanAnswers, type PracticeFact } from "@/lib/atlas-practice";

const from = (table: string) => supabaseAdmin.from(table as never);
const fail = (e: { message: string } | null) => {
  if (e) throw new Error(e.message);
};
const now = () => new Date().toISOString();
type Row = Record<string, unknown>;
const noHiAi = (e: { message: string } | null) => !!e && /hi_ai/.test(e.message);
export const REVIEW_NOT_READY =
  "Checking place names needs the migration 20261214090000_atlas_review.sql (facts work already).";

type Rangeable = {
  range: (
    a: number,
    b: number,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};
async function all<T>(q: () => Rangeable): Promise<T[]> {
  const out: T[] = [];
  for (let at = 0; ; at += 1000) {
    const { data, error } = await q().range(at, at + 999);
    fail(error);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}
// Places, with their AI-Hindi mark once the column is there.
async function places(cols: string): Promise<{ rows: Row[]; hiAi: boolean }> {
  const probe = await from("atlas_places").select("hi_ai").limit(1);
  const hiAi = !noHiAi(probe.error);
  const rows = await all<Row>(() =>
    from("atlas_places")
      .select(hiAi ? `${cols},hi_ai` : cols)
      .neq("status", "hidden")
      .order("key"),
  );
  return { rows, hiAi };
}
const districtOf = (entities: unknown) =>
  ((entities as string[]) ?? []).filter((e) => e.startsWith("D:")).map((e) => e.slice(2));

// ---------- The district checklist ----------

export async function districtChecklist(): Promise<ChecklistRow[]> {
  const { data, error } = await from("atlas_districts")
    .select("district,name_hi,meta,overview,status,checks")
    .order("district");
  fail(error);
  const ps = (await places("district,status")).rows;
  const fs = await all<Row>(() =>
    from("atlas_facts").select("entities,status,hi_ai").neq("status", "hidden").order("position"),
  );
  const count = new Map<string, { facts: number; toCheck: number; aiHi: number }>();
  for (const f of fs)
    for (const d of districtOf(f.entities)) {
      const c = count.get(d) ?? { facts: 0, toCheck: 0, aiHi: 0 };
      if (f.status === "verified") c.facts++;
      else c.toCheck++;
      if (f.hi_ai) c.aiHi++;
      count.set(d, c);
    }
  return ((data ?? []) as Row[]).map((r) => {
    const d = String(r.district);
    const meta = (r.meta ?? {}) as DistrictMeta & {
      checked?: string;
      job?: { kind: string; done: number; parts: unknown[]; error?: string };
    };
    const ov = r.overview ? normalizeOverview(r.overview) : null;
    const secs = ov?.sections ?? [];
    const mine = ps.filter((p) => p.district === d);
    const c = count.get(d) ?? { facts: 0, toCheck: 0, aiHi: 0 };
    const job = meta.job && meta.job.done < meta.job.parts.length ? meta.job : null;
    return {
      district: d,
      name_hi: String(r.name_hi),
      places: mine.length,
      facts: c.facts,
      factsToCheck: c.toCheck,
      placesAiHindi: mine.filter((p) => p.hi_ai).length,
      factsAiHindi: c.aiHi,
      meta: {
        division: !!meta.division,
        zone: !!meta.zone,
        neighbours: !!meta.neighbours?.length,
      },
      sections: secs.length,
      en: secs.filter((s) => inLanguage(s, "en")).length,
      hi: secs.filter((s) => inLanguage(s, "hi")).length,
      checked: meta.checked ?? null,
      openChecks: ((r.checks as OverviewCheck[]) ?? []).filter((x) => x.state === "open").length,
      status: r.status === "published" ? "published" : "draft",
      job: job
        ? {
            kind: job.kind,
            done: job.done,
            total: job.parts.length,
            error: job.error ?? null,
          }
        : null,
    } satisfies ChecklistRow;
  });
}

// ---------- Notes for many districts ----------

export type NotesMatch = {
  district: string | null;
  sure: boolean;
  others: string[];
  lang: "hi" | "en";
  parts: number;
  chars: number;
  hasPage: boolean;
  busy: boolean;
};
// Which district a notes file is about, and what importing it would do.
export async function matchNotes(fileName: string, input: string): Promise<NotesMatch> {
  const text = notesText(input);
  const g = guessDistrict(fileName, input, RAJ_DISTRICTS, text);
  let hasPage = false;
  let busy = false;
  if (g.district) {
    const { data } = await from("atlas_districts")
      .select("overview,meta")
      .eq("district", g.district)
      .maybeSingle();
    const r = (data ?? {}) as Row;
    hasPage = !!(r.overview as DistrictOverview | null)?.sections?.length;
    const job = (r.meta as Row | undefined)?.job as
      | { done: number; parts: unknown[]; error?: string }
      | undefined;
    busy = !!job && !job.error && job.done < job.parts.length;
  }
  return {
    district: g.district,
    sure: g.sure,
    others: g.scores.slice(1, 4).map((s) => s.district),
    lang: notesLang(text),
    parts: text.length >= 200 ? notesParts(text).length : 0,
    chars: text.length,
    hasPage,
    busy,
  };
}

// ---------- The Hindi review queue ----------

export type HindiItem = {
  kind: "fact" | "place";
  id: string;
  where: string;
  en: string;
  hi: string;
  // A place's map label (its name is `en` / `hi`).
  label_en?: string;
  label_hi?: string;
};

export async function hindiCounts(): Promise<{ facts: number; places: number | null }> {
  const head = (t: string) =>
    from(t).select("id", { count: "exact", head: true }).eq("hi_ai", true).neq("status", "hidden");
  const f = await head("atlas_facts");
  fail(f.error);
  // (A count's error has no text: the column is looked for first.)
  const probe = await from("atlas_places").select("hi_ai").limit(1);
  if (noHiAi(probe.error)) return { facts: f.count ?? 0, places: null };
  const p = await head("atlas_places");
  fail(p.error);
  return { facts: f.count ?? 0, places: p.count ?? 0 };
}

// The next items to check, in reading order; `skip`: ones put aside for now.
export async function hindiQueue(
  kind: "fact" | "place",
  skip: string[] = [],
  size = 20,
): Promise<HindiItem[]> {
  const notIn = skip.length ? `(${skip.map((s) => `"${s}"`).join(",")})` : null;
  if (kind === "fact") {
    let q = from("atlas_facts")
      .select("id,chapter,heading,text_en,text_hi")
      .eq("hi_ai", true)
      .neq("status", "hidden");
    if (notIn) q = q.not("id", "in", notIn);
    const { data, error } = await q.order("position").limit(size);
    fail(error);
    return ((data ?? []) as Row[]).map((r) => ({
      kind: "fact",
      id: String(r.id),
      where: `${r.chapter} · ${r.heading}`,
      en: String(r.text_en),
      hi: String(r.text_hi),
    }));
  }
  let q = from("atlas_places")
    .select("id,cat,district,name_en,name_hi,label_en,label_hi")
    .eq("hi_ai", true)
    .neq("status", "hidden");
  if (notIn) q = q.not("id", "in", notIn);
  const { data, error } = await q.order("district").order("name_en").limit(size);
  if (noHiAi(error)) throw new Error(REVIEW_NOT_READY);
  fail(error);
  return ((data ?? []) as Row[]).map((r) => ({
    kind: "place",
    id: String(r.id),
    where: `${r.district || "Outside every district"} · ${atlasCat(String(r.cat)).name.en}`,
    en: String(r.name_en),
    hi: String(r.name_hi),
    label_en: String(r.label_en),
    label_hi: String(r.label_hi),
  }));
}

// The editor's Hindi (as it was, or corrected): no longer the AI's.
export async function acceptHindi(
  items: { kind: "fact" | "place"; id: string; hi?: string; label_hi?: string }[],
) {
  for (const it of items) {
    const patch: Row = { hi_ai: false, updated_at: now() };
    if (it.kind === "fact") {
      if (it.hi !== undefined) Object.assign(patch, { text_hi: it.hi.trim(), edited: true });
      fail(
        (
          await from("atlas_facts")
            .update(patch as never)
            .eq("id", it.id)
        ).error,
      );
    } else {
      if (it.hi !== undefined) Object.assign(patch, { name_hi: it.hi.trim(), edited: true });
      if (it.label_hi !== undefined)
        Object.assign(patch, { label_hi: it.label_hi.trim(), edited: true });
      const { error } = await from("atlas_places")
        .update(patch as never)
        .eq("id", it.id);
      if (noHiAi(error)) throw new Error(REVIEW_NOT_READY);
      fail(error);
    }
  }
  // The students' cached atlas and the chapters' knowledge base follow.
  const { invalidateAtlas, queueKb } = await import("@/lib/atlas.server");
  invalidateAtlas();
  const chapters = items.filter((i) => i.kind === "fact" && i.hi !== undefined).map((i) => i.id);
  if (chapters.length) {
    const { data } = await from("atlas_facts").select("chapter_key").in("id", chapters);
    await queueKb([...new Set(((data ?? []) as Row[]).map((r) => String(r.chapter_key)))]);
  }
}

// ---------- Gaps ----------

export async function gapReport() {
  const names = RAJ_DISTRICTS.map((d) => d.en);
  const ps = (await places("key,name_en,label_en,cat,district,name_hi,lat,lon")).rows;
  const fs = await all<Row>(() =>
    from("atlas_facts")
      .select("id,key,chapter,chapter_key,heading,text_en,text_hi,flags,position,entities,status")
      .neq("status", "hidden")
      .order("position"),
  );
  const verified = fs.filter((f) => f.status === "verified");
  const { data: dd } = await from("atlas_districts").select("district,meta");
  const meta = new Map(
    ((dd ?? []) as Row[]).map((r) => [String(r.district), r.meta as DistrictMeta]),
  );

  const placeCount = Object.fromEntries(names.map((d) => [d, 0]));
  for (const p of ps) if (String(p.district) in placeCount) placeCount[String(p.district)]++;
  const factCount = Object.fromEntries(names.map((d) => [d, 0]));
  for (const f of verified)
    for (const d of districtOf(f.entities)) if (d in factCount) factCount[d]++;
  const linked = new Set(
    verified.flatMap((f) =>
      ((f.entities as string[]) ?? []).filter((e) => e.startsWith("P:")).map((e) => e.slice(2)),
    ),
  );
  const toCheck = new Map<string, number>();
  for (const f of fs)
    if (f.status === "to_check")
      toCheck.set(String(f.chapter), (toCheck.get(String(f.chapter)) ?? 0) + 1);
  const list = <T>(xs: T[], n = 60) => ({ total: xs.length, items: xs.slice(0, n) });
  return {
    districts: names,
    groups: ATLAS_GROUPS.map((g) => ({ key: g.key, name: g.name.en })),
    matrix: groupMatrix(
      ps.map((p) => ({ district: String(p.district), cat: String(p.cat) })),
      names,
    ),
    placeCount,
    factCount,
    thinPlaces: thin(placeCount),
    thinFacts: thin(factCount),
    missingMeta: names
      .map((d) => {
        const m = meta.get(d) ?? {};
        const miss = [
          !m.division && "division",
          !m.zone && "agro-climatic zone",
          !m.neighbours?.length && "neighbours",
        ].filter(Boolean) as string[];
        return { district: d, missing: miss };
      })
      .filter((x) => x.missing.length),
    noDistrict: list(
      ps
        .filter((p) => !p.district)
        .map((p) => ({
          key: String(p.key),
          name: String(p.label_en || p.name_en),
          cat: atlasCat(String(p.cat)).name.en,
        })),
    ),
    placesWithoutFacts: list(
      ps
        .filter((p) => !linked.has(String(p.key)))
        .map((p) => ({
          key: String(p.key),
          name: String(p.label_en || p.name_en),
          cat: atlasCat(String(p.cat)).name.en,
          district: String(p.district),
        })),
    ),
    factsUnlinked: list(
      verified
        .filter((f) => !((f.entities as string[]) ?? []).length)
        .map((f) => ({ chapter: String(f.chapter), text: String(f.text_en).slice(0, 160) })),
    ),
    noHindi: {
      places: ps.filter((p) => !p.name_hi).length,
      facts: fs.filter((f) => !f.text_hi).length,
    },
    toCheck: [...toCheck].map(([chapter, n]) => ({ chapter, n })).sort((a, b) => b.n - a.n),
    orphanAnswers: list(
      orphanAnswers(verified as unknown as PracticeFact[]).map((f) => ({
        chapter: f.chapter,
        text: f.text_en,
      })),
    ),
    at: now(),
  };
}
export type GapReport = Awaited<ReturnType<typeof gapReport>>;
