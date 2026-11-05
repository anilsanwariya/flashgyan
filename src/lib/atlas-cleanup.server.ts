// Server-only: keeping the atlas's links clean (admin).
//
// - Duplicate places: the same place twice (the master map's "Karni Mata,
//   Deshnok" and the notes' "Karni Mata temple, Deshnok"), found by name,
//   district and kind; merging moves the facts to the one kept and hides
//   the other. Merges are remembered (atlas_place_merged) so importing the
//   files again doesn't bring the duplicate back; pairs the editor keeps
//   apart (atlas_place_apart) aren't suggested again.
// - Unlinking: a fact linked to a place it is only loosely about (dune
//   types on Karni Mata) loses that link; remembered (atlas_unlinked) for
//   the next import.
// - AI pre-check: a fact the notes flag "to check" compared with SAATHI's
//   books (not the atlas's own notes); the verdict and a suggestion go into
//   the fact's note for the editor to decide.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  matchLabel,
  relevantMatches,
  saathiComplete,
  saathiSearchQuery,
  type SaathiRpc,
} from "../../supabase/functions/_shared/saathi-core.ts";
import type { AtlasFact, AtlasPlace } from "@/lib/atlas";
import { CA_SUBJECT } from "@/lib/current-affairs.server";

const from = (table: string) => supabaseAdmin.from(table as never);
const rpc: SaathiRpc = (fn, args) => supabaseAdmin.rpc(fn as never, args as never);
const fail = (e: { message: string } | null) => {
  if (e) throw new Error(e.message);
};
type Row = Record<string, unknown>;
function apiKey(): string {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY is not configured");
  return key;
}
async function setting<T>(key: string, dflt: T): Promise<T> {
  const { data } = await from("bot_settings").select("value").eq("key", key).maybeSingle();
  return ((data as Row | null)?.value as T) ?? dflt;
}
async function saveSetting(key: string, value: unknown) {
  fail(
    (
      await from("bot_settings").upsert({
        key,
        value,
        updated_at: new Date().toISOString(),
      } as never)
    ).error,
  );
}
async function all<T>(
  q: () => {
    range: (
      a: number,
      b: number,
    ) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
  },
): Promise<T[]> {
  const out: T[] = [];
  for (let a = 0; ; a += 1000) {
    const { data, error } = await q().range(a, a + 999);
    fail(error);
    out.push(...((data ?? []) as T[]));
    if ((data ?? []).length < 1000) return out;
  }
}

export const MERGED_KEY = "atlas_place_merged";
export const APART_KEY = "atlas_place_apart";
export const UNLINKED_KEY = "atlas_unlinked";

// ---------- Links on import ----------

// Tags the editor added while proofreading ("P:<place>", "D:<district>"),
// and facts they deleted: kept through every import too.
export const LINKED_KEY = "atlas_linked";
export const DELETED_KEY = "atlas_fact_deleted";
export type LinkFixes = {
  merged: Record<string, string>;
  unlinked: Record<string, string[]>;
  linked: Record<string, string[]>;
  deleted: Set<string>;
};
export async function linkFixes(): Promise<LinkFixes> {
  return {
    merged: await setting<Record<string, string>>(MERGED_KEY, {}),
    unlinked: await setting<Record<string, string[]>>(UNLINKED_KEY, {}),
    linked: await setting<Record<string, string[]>>(LINKED_KEY, {}),
    deleted: new Set(await setting<string[]>(DELETED_KEY, [])),
  };
}
// A fact's entities with merged places pointing at the one kept and the
// links the editor removed left out.
export function fixEntities(factKey: string, entities: string[], fx: LinkFixes): string[] {
  // Unlinked: a place's key, or a whole entity ("D:Bikaner").
  const off = new Set(fx.unlinked[factKey] ?? []);
  const out = [...entities, ...(fx.linked?.[factKey] ?? [])]
    .map((e) => (e.startsWith("P:") && fx.merged[e.slice(2)] ? `P:${fx.merged[e.slice(2)]}` : e))
    .filter((e) => !(e.startsWith("P:") && off.has(e.slice(2))) && !off.has(e));
  return [...new Set(out)].sort();
}

// ---------- Duplicate places ----------

// "Karni Mata temple, Deshnok" and "Karni Mata, Deshnok" → "karni mata".
export const placeBase = (name: string) =>
  (name.split(",")[0] ?? "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(temple|fort|palace|mahal|mandir|dargah|fair|festival|lake|ji|the)\b/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
// Categories that can be the same place: a fort and a palace or heritage
// site; a temple and a folk deity's or saint's seat.
const family = (cat: string) =>
  ["fort", "heritage"].includes(cat)
    ? "fort"
    : ["temple", "folkdeity", "saint"].includes(cat)
      ? "temple"
      : cat;
const pairKey = (a: string, b: string) => [a, b].sort().join("~");

export type DuplicateGroup = {
  district: string;
  places: {
    key: string;
    name: string;
    cat: string;
    source: string;
    facts: number;
    lat: number;
    lon: number;
  }[];
};

export async function placeDuplicates(): Promise<DuplicateGroup[]> {
  const places = await all<AtlasPlace>(() =>
    from("atlas_places")
      .select("key,name_en,label_en,cat,district,source,status,lat,lon")
      .neq("status", "hidden")
      .order("key"),
  );
  const apart = new Set(await setting<string[]>(APART_KEY, []));
  const groups = new Map<string, AtlasPlace[]>();
  for (const p of places) {
    const base = placeBase(p.label_en || p.name_en);
    if (base.length < 3 || !p.district) continue;
    const k = `${p.district}|${family(p.cat)}|${base}`;
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }
  const found = [...groups.values()].filter(
    (g) =>
      g.length > 1 &&
      // Not every pair kept apart.
      g.some((a, i) => g.slice(i + 1).some((b) => !apart.has(pairKey(a.key, b.key)))),
  );
  // How many facts each is linked to (to keep the fuller one).
  const keys = found.flat().map((p) => `P:${p.key}`);
  const counts = new Map<string, number>();
  for (let i = 0; i < keys.length; i += 100) {
    const { data, error } = await from("atlas_facts")
      .select("entities")
      .overlaps("entities", keys.slice(i, i + 100))
      .limit(5000);
    fail(error);
    for (const r of (data ?? []) as Row[])
      for (const e of (r.entities as string[]) ?? [])
        if (e.startsWith("P:")) counts.set(e.slice(2), (counts.get(e.slice(2)) ?? 0) + 1);
  }
  return found.map((g) => ({
    district: g[0].district,
    places: g
      .map((p) => ({
        key: p.key,
        name: p.label_en || p.name_en,
        cat: p.cat,
        source: p.source,
        facts: counts.get(p.key) ?? 0,
        lat: p.lat,
        lon: p.lon,
      }))
      .sort((a, b) => b.facts - a.facts),
  }));
}

// The others merged into `keep`: their facts linked to it, they hidden.
export async function mergePlaces(keep: string, others: string[]) {
  const drop = others.filter((k) => k && k !== keep);
  if (!drop.length) return { moved: 0 };
  const { data: kept, error } = await from("atlas_places")
    .select("id,key,name_hi,label_hi,cat")
    .eq("key", keep)
    .single();
  fail(error);
  const k = kept as unknown as AtlasPlace;
  let moved = 0;
  for (const d of drop) {
    const facts = await all<AtlasFact>(() =>
      from("atlas_facts")
        .select("id,entities")
        .contains("entities", [`P:${d}`])
        .order("id"),
    );
    for (const f of facts) {
      const entities = [
        ...new Set(f.entities.map((e) => (e === `P:${d}` ? `P:${keep}` : e))),
      ].sort();
      fail(
        (
          await from("atlas_facts")
            .update({ entities } as never)
            .eq("id", f.id)
        ).error,
      );
      moved++;
    }
    const { data: o } = await from("atlas_places")
      .select("name_hi,label_hi,note_en")
      .eq("key", d)
      .maybeSingle();
    // The kept one takes the other's Hindi name if it has none.
    const other = (o ?? {}) as Partial<AtlasPlace>;
    if (!k.name_hi && other.name_hi)
      fail(
        (
          await from("atlas_places")
            .update({ name_hi: other.name_hi, label_hi: k.label_hi || other.label_hi } as never)
            .eq("key", keep)
        ).error,
      );
    fail(
      (
        await from("atlas_places")
          .update({
            status: "hidden",
            // Its own note stays below, so nothing is lost if it's brought back.
            note_en: [
              `Merged into ${keep}`,
              (other.note_en ?? "").replace(/^Merged into .*\n?/, ""),
            ]
              .filter(Boolean)
              .join("\n"),
          } as never)
          .eq("key", d)
      ).error,
    );
  }
  const merged = await setting<Record<string, string>>(MERGED_KEY, {});
  for (const d of drop) merged[d] = keep;
  // Earlier merges into one now merged go straight to the one kept.
  for (const [a, b] of Object.entries(merged)) if (drop.includes(b)) merged[a] = keep;
  await saveSetting(MERGED_KEY, merged);
  (await import("@/lib/atlas.server")).invalidateAtlas();
  return { moved };
}

// A pair (or group) the editor says are different places.
export async function keepApart(keys: string[]) {
  const apart = new Set(await setting<string[]>(APART_KEY, []));
  for (const a of keys) for (const b of keys) if (a < b) apart.add(pairKey(a, b));
  await saveSetting(APART_KEY, [...apart]);
}

// ---------- Unlinking a fact from a place ----------

export async function unlinkFactPlace(factId: string, placeKey: string) {
  const { data, error } = await from("atlas_facts")
    .select("id,key,entities")
    .eq("id", factId)
    .single();
  fail(error);
  const f = data as unknown as AtlasFact;
  const entities = f.entities.filter((e) => e !== `P:${placeKey}`);
  fail(
    (
      await from("atlas_facts")
        .update({ entities } as never)
        .eq("id", factId)
    ).error,
  );
  const off = await setting<Record<string, string[]>>(UNLINKED_KEY, {});
  off[f.key] = [...new Set([...(off[f.key] ?? []), placeKey])];
  await saveSetting(UNLINKED_KEY, off);
  (await import("@/lib/atlas.server")).invalidateAtlas();
}

// ---------- AI pre-check of a doubtful fact ----------

// The first system message stays the same for every fact (prompt caching).
const PRECHECK_SYSTEM = `You check one fact from Rajasthan GK study notes (for RPSC and RSSB exams) against passages from textbooks and reference books. The notes' editor flagged a doubt about it. Use only the passages: say whether they support the fact, contradict it, or don't cover it. When they contradict it, give the fact as the passages state it. Never use your own knowledge to decide.
Reply with JSON only: {"verdict": "supported" | "contradicted" | "not found", "correct": "the fact as the passages give it, when it differs; else empty", "source": "the title of the passage you used; empty when not found", "why": "one short line"}`;

export type Precheck = {
  verdict: "supported" | "contradicted" | "not found";
  correct: string;
  source: string;
  why: string;
};

export const PRECHECK_TAG = "AI pre-check:";

export async function precheckFact(id: string): Promise<Precheck> {
  const { data, error } = await from("atlas_facts")
    .select("id,text_en,note,heading,chapter")
    .eq("id", id)
    .single();
  fail(error);
  const f = data as unknown as AtlasFact;
  const doubt = (f.note ?? "")
    .split("\n")
    .filter((l) => !l.startsWith(PRECHECK_TAG))
    .join(" ")
    .trim();
  // SAATHI's books, not current affairs and not the atlas's own notes.
  const { data: subj } = await from("saathi_knowledge")
    .select("subject")
    .is("parent_id", null)
    .limit(2000);
  const subjects = [
    ...new Set(((subj ?? []) as { subject: string }[]).map((r) => r.subject)),
  ].filter((s) => s && s !== CA_SUBJECT && s !== "Rajasthan Atlas");
  const matches = subjects.length
    ? await saathiSearchQuery(
        apiKey(),
        rpc,
        {
          standalone: `${f.heading}: ${f.text_en}`.slice(0, 1000),
          english: f.text_en.slice(0, 300),
        },
        subjects,
      )
        .then((m) => relevantMatches(m).slice(0, 4))
        .catch(() => [])
    : [];
  let result: Precheck = { verdict: "not found", correct: "", source: "", why: "" };
  if (matches.length) {
    const raw = await saathiComplete(apiKey(), [
      { role: "system", content: PRECHECK_SYSTEM },
      {
        role: "user",
        content: `Fact (${f.chapter} › ${f.heading}): ${f.text_en}\nThe editor's doubt: ${doubt || "(none given)"}\n\nPassages:\n${matches
          .map((m, i) => `[${i + 1}] ${matchLabel(m)}\n${m.content.slice(0, 2500)}`)
          .join("\n\n")}`,
      },
    ]);
    try {
      const t = raw.replace(/```(?:json)?/g, "");
      const o = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1)) as Partial<Precheck>;
      result = {
        verdict: ["supported", "contradicted"].includes(String(o.verdict))
          ? (o.verdict as Precheck["verdict"])
          : "not found",
        correct: String(o.correct ?? "").slice(0, 600),
        source: String(o.source ?? "").slice(0, 200),
        why: String(o.why ?? "").slice(0, 300),
      };
    } catch {
      result.why = "The AI's reply couldn't be read.";
    }
  } else result.why = "SAATHI's books have nothing on it.";
  // The note: the notes' doubt, then this pre-check (an earlier one replaced).
  const line = `${PRECHECK_TAG} ${result.verdict}${result.why ? ` — ${result.why}` : ""}${
    result.correct ? ` | Books say: ${result.correct}` : ""
  }${result.source ? ` [${result.source}]` : ""}`;
  const note = [
    ...(f.note ?? "").split("\n").filter((l) => l.trim() && !l.startsWith(PRECHECK_TAG)),
    line,
  ].join("\n");
  fail(
    (
      await from("atlas_facts")
        .update({ note } as never)
        .eq("id", id)
    ).error,
  );
  return result;
}

// The facts still to check, for the editor's "pre-check all".
export async function toCheckIds(): Promise<{ id: string; prechecked: boolean }[]> {
  const rows = await all<Row>(() =>
    from("atlas_facts").select("id,note").eq("status", "to_check").order("position"),
  );
  return rows.map((r) => ({
    id: String(r.id),
    prechecked: String(r.note ?? "").includes(PRECHECK_TAG),
  }));
}
