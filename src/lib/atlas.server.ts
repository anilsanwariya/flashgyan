// Server-only: the Rajasthan atlas. The editor's master map is imported
// (places, facts, layers, district details), Hindi is filled in by the AI
// a batch at a time (marked as the AI's until checked), the verified facts
// go to the knowledge base (so SAATHI and GK infographics use them), and
// each district's overview page is imported from the editor's notes,
// translated, drafted from the facts and fact-checked, a section a step.
// Students read only verified places and facts and published overviews.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { saathiComplete, saathiErrorDetail } from "../../supabase/functions/_shared/saathi-core.ts";
import { hindiGuide } from "../../supabase/functions/_shared/ca-hindi.ts";
import * as CA from "@/lib/current-affairs.server";
import { RAJ_DISTRICTS } from "@/lib/geo-admin";
import { RAJ_RIVERS } from "@/lib/geo-data";
import {
  ATLAS_SUBJECTS,
  EMPTY_OVERVIEW,
  OVERVIEW_SECTIONS,
  cleanFactText,
  normalizeOverview,
  overviewText,
  type AtlasFact,
  type AtlasLang,
  type AtlasLayer,
  type AtlasPlace,
  type AtlasStatus,
  type DistrictMeta,
  type DistrictOverview,
  type LonLat,
  type OverviewSection,
} from "@/lib/atlas";
import { parseMasterMap, slug, districtAt } from "@/lib/atlas-import.server";
import { practiceStep } from "@/lib/atlas-practice.server";
import type { Bi } from "@/lib/current-affairs";

const from = (table: string) => supabaseAdmin.from(table as never);
const fail = (e: { message: string } | null) => {
  if (e) throw new Error(e.message);
};
const now = () => new Date().toISOString();
type Row = Record<string, unknown>;
function apiKey(): string {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY is not configured");
  return key;
}
const glossary = async () => (await CA.getMagazineSettings()).glossary ?? [];
const missing = (e: { message: string } | null) =>
  !!e && /atlas_(places|facts|layers|districts)|schema cache|does not exist/i.test(e.message);

export const KB_SUBJECT = "Rajasthan Atlas";
const PLACE_COLS =
  "id,key,name_en,name_hi,label_en,label_hi,cat,lat,lon,district,tehsil,refs,note_en,note_hi,status,source,edited,in_file";
// With the time and month columns once their migration is in (checked
// again a minute later while it isn't).
let timeCols: { ok: boolean; at: number } = { ok: false, at: 0 };
export async function placeCols(): Promise<string> {
  if (!timeCols.ok && Date.now() - timeCols.at > 60_000) {
    const { error } = await from("atlas_places").select("era_from,era_to,months").limit(1);
    timeCols = { ok: !error, at: Date.now() };
  }
  return timeCols.ok ? `${PLACE_COLS},era_from,era_to,months` : PLACE_COLS;
}
const FACT_COLS =
  "id,key,subject,chapter_key,chapter,heading,text_en,text_hi,table_head,flags,entities,position,status,note,hi_ai,source,edited,in_file";
const LAYER_COLS = "key,name_en,name_hi,grp,note,approx,items,position,status";

// Reads every row of a query, a thousand at a time.
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

// ---------- Jobs (background work, a step at a time) ----------

type Jobs = { translate: boolean; kb: string[] };
const JOBS_KEY = "atlas_jobs";
const KB_KEY = "atlas_kb_docs";
async function setting<T>(key: string, dflt: T): Promise<T> {
  const { data } = await from("bot_settings").select("value").eq("key", key).maybeSingle();
  return ((data as Row | null)?.value as T) ?? dflt;
}
async function saveSetting(key: string, value: unknown) {
  fail((await from("bot_settings").upsert({ key, value, updated_at: now() } as never)).error);
}
const jobs = () => setting<Jobs>(JOBS_KEY, { translate: false, kb: [] });

// ---------- Import ----------

export type ImportResult = {
  places: { added: number; updated: number; kept: number; gone: number };
  facts: { added: number; updated: number; kept: number; gone: number };
  layers: number;
  districts: number;
  chapters: number;
};

export async function importMasterMap(html: string): Promise<ImportResult> {
  const map = parseMasterMap(html);
  const { matchPlace } = await import("@/lib/geo-places");

  // Places: new ones added, changed ones updated unless edited here.
  const oldPlaces = await all<AtlasPlace>(() =>
    from("atlas_places").select(PLACE_COLS).order("key"),
  );
  const byKey = new Map(oldPlaces.map((p) => [p.key, p]));
  const pr = { added: 0, updated: 0, kept: 0, gone: 0 };
  const placeRows: Row[] = [];
  for (const p of map.places) {
    const old = byKey.get(p.key);
    if (old?.edited) {
      pr.kept++;
      if (!old.in_file) placeRows.push({ ...old, in_file: true, updated_at: now() });
      continue;
    }
    // The Hindi name from the place list, where the place is in it.
    let hi = old?.name_hi ?? "";
    if (!hi) {
      const m = await matchPlace({ en: p.name_en }, { lat: p.lat, lon: p.lon }, 15).catch(
        () => null,
      );
      hi = m?.place.hi ?? "";
    }
    placeRows.push({
      key: p.key,
      name_en: p.name_en,
      name_hi: hi,
      label_en: p.label_en,
      label_hi: old?.label_hi ?? "",
      cat: p.cat,
      lat: p.lat,
      lon: p.lon,
      district: p.district,
      tehsil: p.tehsil,
      refs: p.refs,
      status: old?.status ?? "verified",
      source: "master-map",
      in_file: true,
      updated_at: now(),
    });
    if (old) pr.updated++;
    else pr.added++;
  }
  for (let i = 0; i < placeRows.length; i += 500)
    fail(
      (
        await from("atlas_places").upsert(placeRows.slice(i, i + 500) as never, {
          onConflict: "key",
        })
      ).error,
    );
  const inFile = new Set(map.places.map((p) => p.key));
  const gonePlaces = oldPlaces.filter(
    (p) => p.source === "master-map" && p.in_file && !inFile.has(p.key),
  );
  for (const p of gonePlaces)
    fail(
      (
        await from("atlas_places")
          .update({ in_file: false } as never)
          .eq("id", p.id)
      ).error,
    );
  pr.gone = gonePlaces.length;

  // Facts the same way (their Hindi kept while the English is the same).
  const oldFacts = await all<AtlasFact>(() => from("atlas_facts").select(FACT_COLS).order("key"));
  const factByKey = new Map(oldFacts.map((f) => [f.key, f]));
  const fr = { added: 0, updated: 0, kept: 0, gone: 0 };
  const factRows: Row[] = [];
  for (const f of map.facts) {
    const old = factByKey.get(f.key);
    if (old?.edited) {
      fr.kept++;
      factRows.push({
        ...old,
        entities: f.entities,
        position: f.position,
        in_file: true,
        updated_at: now(),
      });
      continue;
    }
    factRows.push({
      ...f,
      text_hi: old?.text_hi ?? "",
      hi_ai: old?.hi_ai ?? false,
      note: old?.note ?? "",
      status: old && old.status !== "verified" ? old.status : f.status,
      source: "master-map",
      in_file: true,
      updated_at: now(),
    });
    if (old) fr.updated++;
    else fr.added++;
  }
  for (let i = 0; i < factRows.length; i += 500)
    fail(
      (await from("atlas_facts").upsert(factRows.slice(i, i + 500) as never, { onConflict: "key" }))
        .error,
    );
  const factKeys = new Set(map.facts.map((f) => f.key));
  const goneFacts = oldFacts.filter(
    (f) => f.source === "master-map" && f.in_file && !factKeys.has(f.key),
  );
  for (let i = 0; i < goneFacts.length; i += 200)
    fail(
      (
        await from("atlas_facts")
          .update({ in_file: false } as never)
          .in(
            "id",
            goneFacts.slice(i, i + 200).map((f) => f.id),
          )
      ).error,
    );
  fr.gone = goneFacts.length;

  // Layers (unless edited here) and the districts' details.
  const { data: edited } = await from("atlas_layers").select("key").eq("edited", true);
  const keep = new Set(((edited ?? []) as Row[]).map((r) => String(r.key)));
  const layerRows = map.layers
    .filter((l) => !keep.has(l.key))
    .map((l) => ({ ...l, updated_at: now() }));
  if (layerRows.length)
    fail((await from("atlas_layers").upsert(layerRows as never, { onConflict: "key" })).error);
  for (const d of map.districts) {
    const hi = RAJ_DISTRICTS.find((x) => x.en === d.district)?.hi ?? "";
    const { data } = await from("atlas_districts")
      .select("meta")
      .eq("district", d.district)
      .maybeSingle();
    if (data)
      fail(
        (
          await from("atlas_districts")
            .update({
              meta: { ...((data as Row).meta as object), ...d.meta },
              updated_at: now(),
            } as never)
            .eq("district", d.district)
        ).error,
      );
    else
      fail(
        (
          await from("atlas_districts").insert({
            district: d.district,
            name_hi: hi,
            meta: d.meta,
          } as never)
        ).error,
      );
  }

  // Then, in the background: Hindi, and the knowledge base.
  await saveSetting(JOBS_KEY, {
    translate: true,
    kb: [...new Set(map.chapters.filter((c) => c.facts).map((c) => c.key))],
  } satisfies Jobs);
  invalidate();
  return {
    places: pr,
    facts: fr,
    layers: layerRows.length,
    districts: map.districts.length,
    chapters: map.chapters.length,
  };
}

// ---------- Translation (a batch a step) ----------

const TRANSLATE_SYSTEM = (g: Awaited<ReturnType<typeof glossary>>) =>
  `You translate the items of a Rajasthan GK atlas for Rajasthan competitive exam aspirants (RPSC, RSSB) from English into standard exam-book Hindi (Devanagari). Place names: their standard Hindi spelling as Rajasthan's exam books write them (e.g. "Kumbhalgarh" → "कुम्भलगढ़", "Sambhar" → "सांभर"). Keep numbers, dates, units and abbreviations (RPSC, IGNP, km) as they are. Keep **bold** marks. Translate every item fully; never summarise, add or drop a fact.${hindiGuide(g)}
Reply with JSON only: {"items": [{"n": item number, "hi": "Hindi"}]}`;

async function translateBatch(items: string[]): Promise<string[]> {
  const raw = await saathiComplete(apiKey(), [
    { role: "system", content: TRANSLATE_SYSTEM(await glossary()) },
    { role: "user", content: items.map((t, i) => `${i + 1}. ${t}`).join("\n") },
  ]);
  const t = raw.replace(/```(?:json)?/g, "");
  const o = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1)) as {
    items?: { n: number; hi: string }[];
  };
  const out = items.map(() => "");
  for (const x of o.items ?? [])
    if (Number(x.n) >= 1 && Number(x.n) <= items.length && typeof x.hi === "string")
      out[Number(x.n) - 1] = x.hi.trim();
  return out;
}

async function translateStep(): Promise<boolean> {
  // Place names first (short), then facts, then the layers' legends.
  const { data: places } = await from("atlas_places")
    .select("id,name_en,label_en,name_hi,label_hi")
    .or("name_hi.eq.,label_hi.eq.")
    .neq("status", "hidden")
    .limit(60);
  const ps = (places ?? []) as Row[];
  if (ps.length) {
    const items = ps.flatMap((p) => [String(p.name_en), String(p.label_en || p.name_en)]);
    const hi = await translateBatch(items);
    for (const [i, p] of ps.entries()) {
      const patch = {
        name_hi: String(p.name_hi) || hi[i * 2] || String(p.name_en),
        label_hi: String(p.label_hi) || hi[i * 2 + 1] || hi[i * 2] || String(p.label_en),
      };
      // Marked as the AI's for the Hindi review (once its migration is in).
      const { error } = await from("atlas_places")
        .update({ ...patch, hi_ai: true } as never)
        .eq("id", String(p.id));
      if (error && /hi_ai/.test(error.message))
        await from("atlas_places")
          .update(patch as never)
          .eq("id", String(p.id));
      else fail(error);
    }
    return true;
  }
  const { data: facts } = await from("atlas_facts")
    .select("id,text_en")
    .eq("text_hi", "")
    .neq("status", "hidden")
    .order("position")
    .limit(25);
  const fs = (facts ?? []) as Row[];
  if (fs.length) {
    const hi = await translateBatch(fs.map((f) => String(f.text_en)));
    for (const [i, f] of fs.entries())
      if (hi[i])
        await from("atlas_facts")
          .update({ text_hi: hi[i], hi_ai: true } as never)
          .eq("id", String(f.id));
    // A fact the AI left out is tried again next time; one it keeps
    // leaving out gets its English, marked to check.
    if (hi.every((x) => !x))
      for (const f of fs)
        await from("atlas_facts")
          .update({ text_hi: String(f.text_en), hi_ai: true } as never)
          .eq("id", String(f.id));
    return true;
  }
  const { data: layers } = await from("atlas_layers").select("key,items");
  for (const l of (layers ?? []) as Row[]) {
    const items = (l.items as AtlasLayer["items"]) ?? [];
    const names = [...new Set(items.filter((f) => f.name.en && !f.name.hi).map((f) => f.name.en))];
    if (!names.length) continue;
    const hi = await translateBatch(names.slice(0, 80));
    const map = new Map(names.slice(0, 80).map((n, i) => [n, hi[i] || n]));
    await from("atlas_layers")
      .update({
        items: items.map((f) =>
          map.has(f.name.en) && !f.name.hi
            ? { ...f, name: { ...f.name, hi: map.get(f.name.en)! } }
            : f,
        ),
      } as never)
      .eq("key", String(l.key));
    return true;
  }
  return false;
}

// ---------- The knowledge base (a chapter a step) ----------

async function kbStep(chapter: string): Promise<void> {
  const facts = await all<AtlasFact>(() =>
    from("atlas_facts")
      .select(FACT_COLS)
      .eq("chapter_key", chapter)
      .eq("status", "verified")
      .order("position"),
  );
  const docs = await setting<Record<string, string>>(KB_KEY, {});
  const ingest = await import("@/lib/saathi-ingest.server");
  if (!facts.length) {
    if (docs[chapter]) {
      await ingest.replaceDocument(docs[chapter], null).catch(() => undefined);
      delete docs[chapter];
      await saveSetting(KB_KEY, docs);
    }
    return;
  }
  const title = `Atlas notes · ${facts[0].chapter}`;
  let text = `# ${facts[0].chapter}\n`;
  let head = "";
  for (const f of facts) {
    if (f.heading !== head) {
      head = f.heading;
      text += `\n## ${head}\n`;
    }
    text += `- ${f.table_head ? `(${f.table_head}) ` : ""}${cleanFactText(f.text_en)}\n`;
  }
  if (docs[chapter]) {
    try {
      await ingest.replaceDocument(docs[chapter], text);
      return;
    } catch {
      // The document was deleted in the knowledge base: made again below.
    }
  }
  const subject = ATLAS_SUBJECTS.find((s) => s.key === facts[0].subject)?.name.en ?? "Geography";
  const doc = (await ingest.createDocument(
    {
      title,
      subject: KB_SUBJECT,
      topic: subject,
      medium: "English",
      source: "FlashGyan Rajasthan atlas notes",
    },
    text,
  )) as { id?: string; parentId?: string } | string;
  const id = typeof doc === "string" ? doc : (doc.id ?? doc.parentId ?? "");
  if (id) {
    docs[chapter] = id;
    await saveSetting(KB_KEY, docs);
  }
}

// ---------- Overview jobs (a section a step) ----------

type OverviewJob = {
  kind: "import" | "translate" | "draft" | "check";
  lang: AtlasLang;
  // The parts to work through; done counts them.
  parts: { id: string; title: string; text: string }[];
  done: number;
  error?: string;
  started: string;
};

const BLOCK_GUIDE = `Blocks ("type"):
- "big": one key fact card: {"type":"big","title":L,"value":L (short: a year, a number, a code),"text":L}
- "chips": short items: {"type":"chips","title":L,"items":[L],"hot":[indexes of the most important]}
- "text": a paragraph: {"type":"text","title":L,"text":L}
- "list": points: {"type":"list","title":L,"items":[L]}
- "table": {"type":"table","title":L,"cols":[L],"rows":[[L]]} (✓/— kept as they are)
- "callout": a memory trick, a "remember" line or a note: {"type":"callout","kind":"trick"|"remember"|"note","text":L}
- "timeline": dated events: {"type":"timeline","title":L,"eras":[{"title":L,"items":[{"when":"1488","text":L}]}]}
- "borders": a district's borders: {"type":"borders","title":L,"intl":L (an international border, or empty),"items":[{"name":L,"dir":L (direction)}]}
L is a text in both languages: {"en": "...", "hi": "..."}. **bold** marks key words.`;

const IMPORT_SYSTEM = `You turn one part of a teacher's district notes (Rajasthan GK, for RPSC and RSSB exams) into a structured section of a district overview page. Keep every fact, number, date, name and memory trick exactly as the notes give them; never add a fact the notes don't state, never drop one, never "correct" one (if the notes themselves flag a doubt, keep it as a "note" callout). Choose the block that shows each piece best: key facts as "big" cards, short names as "chips", comparisons and lists of places as tables, dates as a timeline, tricks as callouts.
${BLOCK_GUIDE}
Write each text in the notes' own language only (the other language left empty).
Reply with JSON only: {"id": section id, "title": L, "lede": L (one line: what the section covers), "blocks": [blocks]}`;

const HERO_SYSTEM = `From the opening of a teacher's district notes (Rajasthan GK), take the district overview's header. Use only what the notes state, in their own language (the other left empty).
Reply with JSON only: {"name": L, "tagline": L (its nicknames or what it is known for, one line), "badges": [L] (2-5 short labels: vehicle code, founding year, founder, tehsils), "revision": [{"q": L, "a": L}] (quick-revision questions if the notes have them, else []), "notes": [L] (the notes' own verification remarks, if any), "source": "the source the notes name, or empty"}
L is {"en": "...", "hi": "..."}.`;

const TRANSLATE_OVERVIEW_SYSTEM = (g: Awaited<ReturnType<typeof glossary>>) =>
  `You translate one section of a Rajasthan district overview page (GK notes for RPSC and RSSB exams) between Hindi and English. Every text is {"en": "...", "hi": "..."}; fill the empty language from the other, keeping every fact, number, date and name, the **bold** marks, and the JSON's structure exactly as it is. Hindi is standard exam-book Hindi; English uses the standard English spellings of Rajasthan's places (e.g. "कुम्भलगढ़" → "Kumbhalgarh"). A memory trick that only works in one language: translate its meaning and keep the original in brackets.${hindiGuide(g)}
Reply with JSON only: the same section, both languages filled.`;

const DRAFT_SYSTEM = `You write one section of a Rajasthan district overview page for RPSC and RSSB aspirants, from the facts given (a teacher's verified notes). Use only these facts; never add a fact, number, date or name they don't state. Arrange them for revision: key facts as "big" cards, names as "chips", lists of places with what each is known for as tables, dates as a timeline, a memory trick only where the facts give one.
${BLOCK_GUIDE}
Reply with JSON only: {"id": section id, "title": L, "lede": L, "blocks": [blocks]} (an empty "blocks" when no fact fits the section).`;

const CHECK_SYSTEM = `You fact-check one section of a Rajasthan district overview page (GK for RPSC and RSSB) against reference facts (a teacher's verified notes and book passages). Report only real problems: a number, date, name or claim that the references contradict, or a claim that sounds doubtful and that no reference supports. Don't report style.
Reply with JSON only: {"issues": [{"text": "the doubtful text as it stands", "why": "what the references say, briefly", "fix": "the corrected text, or empty"}]}; {"issues": []} when it agrees with the references.`;

const jsonOf = (raw: string): Row => {
  const t = raw.replace(/```(?:json)?/g, "");
  return JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1)) as Row;
};

// HTML notes as plain text that keeps their structure (headings, lists,
// tables as rows).
export function notesText(input: string): string {
  if (!/<[a-z][\s\S]*>/i.test(input)) return input;
  let t = input
    .replace(/<(script|style|svg|noscript)[\s\S]*?<\/\1>/gi, "")
    .replace(/<h1[^>]*>/gi, "\n# ")
    .replace(/<h2[^>]*>/gi, "\n## ")
    .replace(/<h[3-6][^>]*>/gi, "\n### ")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<tr[^>]*>/gi, "\n| ")
    .replace(/<\/t[dh]>/gi, " | ")
    .replace(/<(br|\/p|\/div|\/h\d|\/section|\/ul|\/ol|\/table)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  t = t
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
  return t
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .filter((l) => l && l !== "|" && l !== "-")
    .join("\n");
}

// The notes split into parts: the opening, then each "## " section (long
// ones split again at "### ").
export function notesParts(text: string): { id: string; title: string; text: string }[] {
  const lines = text.split("\n");
  const parts: { id: string; title: string; text: string }[] = [];
  let cur = { id: "hero", title: "", text: "" };
  for (const l of lines) {
    if (l.startsWith("## ")) {
      if (cur.text.trim()) parts.push(cur);
      cur = { id: `p${parts.length + 1}`, title: l.slice(3).trim(), text: `${l}\n` };
    } else cur.text += `${l}\n`;
  }
  if (cur.text.trim()) parts.push(cur);
  const out: typeof parts = [];
  for (const p of parts) {
    if (p.text.length <= 7000) {
      out.push(p);
      continue;
    }
    const chunks = p.text.split(/\n(?=### )/);
    let acc = "";
    for (const c of chunks) {
      if (acc.length + c.length > 7000 && acc) {
        out.push({ ...p, id: `${p.id}-${out.length}`, text: acc });
        acc = `## ${p.title} (continued)\n`;
      }
      acc += `${c}\n`;
    }
    if (acc.trim()) out.push({ ...p, id: `${p.id}-${out.length}`, text: acc });
  }
  return out;
}

async function getDistrictRow(district: string) {
  const { data, error } = await from("atlas_districts")
    .select("district,name_hi,meta,overview,status,checks,versions,published_at,updated_at")
    .eq("district", district)
    .maybeSingle();
  fail(error);
  if (!data)
    throw new Error(`No district "${district}" in the atlas: import the master map first.`);
  return data as Row & {
    meta: DistrictMeta & { job?: OverviewJob };
    overview: DistrictOverview | null;
    checks: OverviewCheck[];
    versions: { at: string; label: string; overview: DistrictOverview }[];
  };
}
export type OverviewCheck = {
  id: string;
  section: string;
  text: string;
  why: string;
  fix: string;
  state: "open" | "fixed" | "kept";
};

async function setJob(district: string, meta: Row, job: OverviewJob | null) {
  const next = { ...meta };
  if (job) next.job = job;
  else delete next.job;
  fail(
    (
      await from("atlas_districts")
        .update({ meta: next, updated_at: now() } as never)
        .eq("district", district)
    ).error,
  );
}

// A job started: the overview kept as a version first.
async function startJob(district: string, job: Omit<OverviewJob, "done" | "started">) {
  const row = await getDistrictRow(district);
  if (row.meta.job && row.meta.job.done < row.meta.job.parts.length && !row.meta.job.error)
    throw new Error("Another job is still running on this district.");
  if (row.overview && job.kind !== "check") await keepVersion(district, row, `Before ${job.kind}`);
  // Rewriting the page means it needs checking again.
  const { checked: _checked, ...rest } = row.meta as Row;
  await setJob(district, job.kind === "check" ? row.meta : rest, {
    ...job,
    done: 0,
    started: now(),
  });
}

async function keepVersion(
  district: string,
  row: Awaited<ReturnType<typeof getDistrictRow>>,
  label: string,
) {
  if (!row.overview) return;
  const versions = [{ at: now(), label, overview: row.overview }, ...(row.versions ?? [])].slice(
    0,
    15,
  );
  fail(
    (
      await from("atlas_districts")
        .update({ versions } as never)
        .eq("district", district)
    ).error,
  );
}

export async function importOverview(district: string, input: string, lang: AtlasLang) {
  const text = notesText(input);
  if (text.length < 200) throw new Error("The notes are too short to make an overview from.");
  await startJob(district, { kind: "import", lang, parts: notesParts(text) });
}

export async function translateOverview(district: string, to: AtlasLang) {
  const row = await getDistrictRow(district);
  if (!row.overview?.sections.length) throw new Error("There's no overview to translate yet.");
  await startJob(district, {
    kind: "translate",
    lang: to,
    parts: [
      { id: "hero", title: "", text: "" },
      ...row.overview.sections.map((s) => ({
        id: s.id,
        title: s.title.en || s.title.hi,
        text: "",
      })),
    ],
  });
}

export async function draftOverview(district: string, lang: AtlasLang) {
  const facts = await districtFacts(district);
  if (facts.length < 5)
    throw new Error("The atlas has too few verified facts on this district to draft from.");
  await startJob(district, {
    kind: "draft",
    lang,
    parts: OVERVIEW_SECTIONS.map((s) => ({ id: s.id, title: s.title.en, text: "" })),
  });
}

export async function checkOverview(district: string) {
  const row = await getDistrictRow(district);
  if (!row.overview?.sections.length) throw new Error("There's no overview to check yet.");
  await startJob(district, {
    kind: "check",
    lang: "en",
    parts: row.overview.sections.map((s) => ({
      id: s.id,
      title: s.title.en || s.title.hi,
      text: "",
    })),
  });
}

export async function cancelOverviewJob(district: string) {
  const row = await getDistrictRow(district);
  await setJob(district, row.meta, null);
}

// The verified facts about a district (itself, its tehsils, its places).
async function districtFacts(district: string): Promise<AtlasFact[]> {
  const { data: places } = await from("atlas_places").select("key").eq("district", district);
  const keys = ((places ?? []) as Row[]).map((p) => `P:${p.key}`);
  const out = new Map<string, AtlasFact>();
  const add = (rows: unknown) => {
    for (const f of (rows ?? []) as AtlasFact[]) out.set(f.id, f);
  };
  const base = () => from("atlas_facts").select(FACT_COLS).eq("status", "verified");
  add(
    (
      await base()
        .contains("entities", [`D:${district}`])
        .limit(1000)
    ).data,
  );
  for (let i = 0; i < keys.length; i += 100)
    add(
      (
        await base()
          .overlaps("entities", keys.slice(i, i + 100))
          .limit(1000)
      ).data,
    );
  // Its tehsils (their headquarters on the tehsil layer).
  const { data: hq } = await from("atlas_layers")
    .select("items")
    .eq("key", "tehsil-hq")
    .maybeSingle();
  const tehsils = (((hq as Row | null)?.items as AtlasLayer["items"]) ?? [])
    .filter((f) => f.district === district)
    .flatMap((f) => [`T:${district}|${f.name.en}`, `U:${district}|${f.name.en}`]);
  for (let i = 0; i < tehsils.length; i += 100)
    add(
      (
        await base()
          .overlaps("entities", tehsils.slice(i, i + 100))
          .limit(1000)
      ).data,
    );
  return [...out.values()].sort((a, b) => a.position - b.position);
}

const sectionJson = (raw: string, id: string): OverviewSection | null => {
  const o = jsonOf(raw);
  const ov = normalizeOverview({ sections: [{ ...o, id: (o.id as string) || id }] });
  return ov.sections[0] ?? null;
};

async function overviewStep(district: string): Promise<boolean> {
  const row = await getDistrictRow(district);
  const job = row.meta.job;
  if (!job || job.error || job.done >= job.parts.length) return false;
  const part = job.parts[job.done];
  const ov: DistrictOverview = row.overview ?? { ...EMPTY_OVERVIEW };
  const lang = job.lang === "hi" ? "Hindi" : "English";
  let next: DistrictOverview = ov;
  let checks: OverviewCheck[] | null = null;
  try {
    if (job.kind === "import") {
      if (job.done === 0) next = { ...EMPTY_OVERVIEW, sections: [] };
      if (part.id === "hero") {
        const o = jsonOf(
          await saathiComplete(apiKey(), [
            { role: "system", content: HERO_SYSTEM },
            {
              role: "user",
              content: `District: ${district}\nThe notes' language: ${lang}\n\n${part.text.slice(0, 7000)}`,
            },
          ]),
        );
        const hero = normalizeOverview(o);
        next = {
          ...next,
          name: hero.name,
          tagline: hero.tagline,
          badges: hero.badges,
          revision: hero.revision,
          notes: hero.notes,
          source: hero.source,
        };
      } else {
        const sec = sectionJson(
          await saathiComplete(apiKey(), [
            { role: "system", content: IMPORT_SYSTEM },
            {
              role: "user",
              content: `District: ${district}\nThe notes' language: ${lang}\nSection ids to use where they fit: ${OVERVIEW_SECTIONS.map((s) => `${s.id} (${s.title.en})`).join(", ")}\n\nThe notes:\n${part.text}`,
            },
          ]),
          part.id,
        );
        if (sec) {
          // A section split in two joins its first part.
          const same = next.sections.find((x) => x.id === sec.id);
          next = same
            ? {
                ...next,
                sections: next.sections.map((x) =>
                  x.id === sec.id ? { ...x, blocks: [...x.blocks, ...sec.blocks] } : x,
                ),
              }
            : { ...next, sections: [...next.sections, sec] };
        }
      }
    } else if (job.kind === "translate") {
      const g = await glossary();
      if (part.id === "hero") {
        const hero = {
          name: ov.name,
          tagline: ov.tagline,
          badges: ov.badges,
          revision: ov.revision,
          notes: ov.notes,
        };
        const o = jsonOf(
          await saathiComplete(apiKey(), [
            { role: "system", content: TRANSLATE_OVERVIEW_SYSTEM(g) },
            { role: "user", content: `Fill the ${lang} texts.\n${JSON.stringify(hero)}` },
          ]),
        );
        const t = normalizeOverview({ ...o, sections: [] });
        next = {
          ...ov,
          name: t.name,
          tagline: t.tagline,
          badges: t.badges,
          revision: t.revision,
          notes: t.notes,
        };
      } else {
        const sec = ov.sections.find((x) => x.id === part.id);
        if (sec) {
          const t = sectionJson(
            await saathiComplete(apiKey(), [
              { role: "system", content: TRANSLATE_OVERVIEW_SYSTEM(g) },
              { role: "user", content: `Fill the ${lang} texts.\n${JSON.stringify(sec)}` },
            ]),
            sec.id,
          );
          if (t) next = { ...ov, sections: ov.sections.map((x) => (x.id === sec.id ? t : x)) };
        }
      }
    } else if (job.kind === "draft") {
      if (job.done === 0)
        next = { ...EMPTY_OVERVIEW, name: { en: district, hi: String(row.name_hi) }, sections: [] };
      const facts = await districtFacts(district);
      const sec = sectionJson(
        await saathiComplete(apiKey(), [
          { role: "system", content: DRAFT_SYSTEM },
          {
            role: "user",
            content: `District: ${district}\nSection: ${part.id} (${part.title})\nWrite it in ${lang} (the other language empty).\n\nThe facts:\n${facts
              .slice(0, 400)
              .map((f) => `- [${f.chapter}] ${cleanFactText(f.text_en)}`)
              .join("\n")
              .slice(0, 60000)}`,
          },
        ]),
        part.id,
      );
      if (sec?.blocks.length) next = { ...next, sections: [...next.sections, sec] };
    } else if (job.kind === "check") {
      const sec = ov.sections.find((x) => x.id === part.id);
      if (sec) {
        const facts = await districtFacts(district);
        const one =
          overviewText({ ...EMPTY_OVERVIEW, sections: [sec] }, "en") ||
          overviewText({ ...EMPTY_OVERVIEW, sections: [sec] }, "hi");
        const kb = await kbPassages(`${district} ${sec.title.en} ${sec.title.hi}`);
        const o = jsonOf(
          await saathiComplete(apiKey(), [
            { role: "system", content: CHECK_SYSTEM },
            {
              role: "user",
              content: `District: ${district}\n\nThe section:\n${one}\n\nReference facts (the teacher's notes):\n${facts
                .map((f) => `- ${cleanFactText(f.text_en)}`)
                .join("\n")
                .slice(0, 40000)}\n\nBook passages:\n${kb}`,
            },
          ]),
        );
        const found = (Array.isArray(o.issues) ? o.issues : []) as Row[];
        checks = [
          ...(job.done === 0
            ? (row.checks ?? []).filter((c) => c.state !== "open")
            : (row.checks ?? [])),
          ...found
            .filter((x) => typeof x.text === "string" && x.text)
            .map((x) => ({
              id: crypto.randomUUID(),
              section: sec.id,
              text: String(x.text).slice(0, 600),
              why: String(x.why ?? "").slice(0, 600),
              fix: String(x.fix ?? "").slice(0, 600),
              state: "open" as const,
            })),
        ];
      }
    }
  } catch (e) {
    await setJob(district, row.meta, { ...job, error: saathiErrorDetail(e) });
    return true;
  }
  const done = job.done + 1;
  // A finished fact-check is recorded for the district checklist.
  const checked = job.kind === "check" && done >= job.parts.length ? { checked: now() } : {};
  fail(
    (
      await from("atlas_districts")
        .update({
          overview: next,
          ...(checks ? { checks } : {}),
          meta: { ...row.meta, ...checked, job: { ...job, done } },
          updated_at: now(),
        } as never)
        .eq("district", district)
    ).error,
  );
  return true;
}

async function kbPassages(query: string): Promise<string> {
  try {
    const { saathiSearchQuery, relevantMatches, matchLabel } =
      await import("../../supabase/functions/_shared/saathi-core.ts");
    const rpc = (fn: string, args: unknown) => supabaseAdmin.rpc(fn as never, args as never);
    const m = await saathiSearchQuery(
      apiKey(),
      rpc as never,
      { standalone: query, english: query },
      null,
      12,
    );
    return relevantMatches(m)
      .slice(0, 6)
      .map((x) => `[${matchLabel(x)}] ${x.content.slice(0, 1500)}`)
      .join("\n\n");
  } catch {
    return "(none)";
  }
}

// ---------- The step (tick and admin page) ----------

export async function atlasStep(): Promise<{ did: string | null }> {
  const { data, error } = await from("atlas_districts").select("district,meta");
  if (missing(error)) return { did: null };
  fail(error);
  for (const d of (data ?? []) as Row[]) {
    const job = (d.meta as Row)?.job as OverviewJob | undefined;
    if (job && !job.error && job.done < job.parts.length) {
      await overviewStep(String(d.district));
      return { did: `overview:${d.district}` };
    }
  }
  const j = await jobs();
  if (j.translate) {
    try {
      if (await translateStep()) return { did: "translate" };
    } catch (e) {
      console.error("atlas translate:", saathiErrorDetail(e));
      return { did: null };
    }
    await saveSetting(JOBS_KEY, { ...j, translate: false });
  }
  if (j.kb.length) {
    const [ch, ...rest] = j.kb;
    try {
      await kbStep(ch);
    } catch (e) {
      console.error("atlas knowledge base:", saathiErrorDetail(e));
    }
    await saveSetting(JOBS_KEY, { ...(await jobs()), kb: rest });
    return { did: `kb:${ch}` };
  }
  const practice = await practiceStep();
  if (practice.did) return practice;
  const themes = await (await import("@/lib/atlas-themes.server")).themesStep();
  if (themes.did) return themes;
  return (await import("@/lib/atlas-news.server")).newsStep();
}

// ---------- Admin reads and edits ----------

export async function atlasStatus() {
  const { count: places, error } = await from("atlas_places").select("id", {
    count: "exact",
    head: true,
  });
  if (missing(error)) return { ready: false } as const;
  fail(error);
  const head = (t: string) => from(t).select("*", { count: "exact", head: true });
  const n = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;
  const j = await jobs();
  return {
    ready: true,
    places: places ?? 0,
    placesToCheck: await n(head("atlas_places").eq("status", "to_check")),
    placesNoHindi: await n(head("atlas_places").eq("name_hi", "")),
    facts: await n(head("atlas_facts")),
    factsToCheck: await n(head("atlas_facts").eq("status", "to_check")),
    factsNoHindi: await n(head("atlas_facts").eq("text_hi", "")),
    factsAiHindi: await n(head("atlas_facts").eq("hi_ai", true)),
    layers: await n(head("atlas_layers")),
    overviews: await n(head("atlas_districts").not("overview", "is", null)),
    published: await n(head("atlas_districts").eq("status", "published")),
    jobs: j,
    kbDocs: Object.keys(await setting<Record<string, string>>(KB_KEY, {})).length,
  } as const;
}

export async function resumeAtlasJobs(what: { translate?: boolean; kb?: boolean }) {
  const j = await jobs();
  const { data } = await from("atlas_facts").select("chapter_key");
  const chapters = [
    ...new Set(((data ?? []) as Row[]).map((r) => String(r.chapter_key)).filter(Boolean)),
  ];
  await saveSetting(JOBS_KEY, {
    translate: what.translate ? true : j.translate,
    kb: what.kb ? chapters : j.kb,
  } satisfies Jobs);
}

export async function listPlaces(f: {
  district?: string;
  cat?: string;
  status?: AtlasStatus | "all";
  q?: string;
  page?: number;
}): Promise<{ rows: AtlasPlace[]; total: number }> {
  let q = from("atlas_places").select(await placeCols(), { count: "exact" });
  if (f.district) q = q.eq("district", f.district);
  if (f.cat) q = q.eq("cat", f.cat);
  if (f.status && f.status !== "all") q = q.eq("status", f.status);
  if (f.q?.trim()) {
    const t = f.q.trim().replace(/[%,()]/g, " ");
    q = q.or(`name_en.ilike.%${t}%,name_hi.ilike.%${t}%,label_en.ilike.%${t}%`);
  }
  const page = f.page ?? 0;
  const { data, count, error } = await q
    .order("district")
    .order("name_en")
    .range(page * 100, page * 100 + 99);
  fail(error);
  return { rows: (data ?? []) as unknown as AtlasPlace[], total: count ?? 0 };
}

export async function savePlace(p: Partial<AtlasPlace> & { id?: string }) {
  const patch: Row = { ...p, edited: true, updated_at: now() };
  if (
    (p.era_from !== undefined || p.era_to !== undefined || p.months !== undefined) &&
    !(await placeCols()).includes("era_from")
  ) {
    // Before the themes migration: the rest is saved, the time left out.
    delete patch.era_from;
    delete patch.era_to;
    delete patch.months;
  }
  delete patch.id;
  if (typeof p.lat === "number" && typeof p.lon === "number" && !p.district)
    patch.district = districtAt(p.lon, p.lat);
  // Hindi the editor wrote is no longer the AI's.
  if (p.id && (p.name_hi !== undefined || p.label_hi !== undefined)) {
    const { error } = await from("atlas_places")
      .update({ ...patch, hi_ai: false } as never)
      .eq("id", p.id);
    if (!error || !/hi_ai/.test(error.message)) {
      fail(error);
      invalidate();
      return;
    }
  }
  if (p.id)
    fail(
      (
        await from("atlas_places")
          .update(patch as never)
          .eq("id", p.id)
      ).error,
    );
  else {
    if (!p.name_en || !p.cat || typeof p.lat !== "number" || typeof p.lon !== "number")
      throw new Error("A new place needs a name, a category and a position.");
    patch.key = `${p.cat}:${slug(p.label_en || p.name_en)}-${Date.now().toString(36)}`;
    patch.source = "admin";
    patch.district = p.district || districtAt(p.lon, p.lat);
    fail((await from("atlas_places").insert(patch as never)).error);
  }
  invalidate();
}

export async function listFacts(f: {
  chapter?: string;
  entity?: string;
  status?: AtlasStatus | "all";
  q?: string;
  kind?: number;
  aiHindi?: boolean;
  page?: number;
}): Promise<{ rows: AtlasFact[]; total: number }> {
  let q = from("atlas_facts").select(FACT_COLS, { count: "exact" });
  if (f.chapter) q = q.eq("chapter_key", f.chapter);
  if (f.entity) q = q.contains("entities", [f.entity]);
  if (f.status && f.status !== "all") q = q.eq("status", f.status);
  if (f.aiHindi) q = q.eq("hi_ai", true);
  if (f.kind) q = q.filter("flags", "gt", 0);
  if (f.q?.trim()) {
    const t = f.q.trim().replace(/[%,()]/g, " ");
    q = q.or(`text_en.ilike.%${t}%,text_hi.ilike.%${t}%,heading.ilike.%${t}%`);
  }
  const page = f.page ?? 0;
  const { data, count, error } = await q.order("position").range(page * 100, page * 100 + 99);
  fail(error);
  let rows = (data ?? []) as unknown as AtlasFact[];
  if (f.kind) rows = rows.filter((r) => r.flags & f.kind!);
  return { rows, total: count ?? 0 };
}

export async function saveFact(p: Partial<AtlasFact> & { id?: string }) {
  const patch: Row = { ...p, edited: true, updated_at: now() };
  delete patch.id;
  if (p.text_hi !== undefined) patch.hi_ai = false;
  if (p.id)
    fail(
      (
        await from("atlas_facts")
          .update(patch as never)
          .eq("id", p.id)
      ).error,
    );
  else {
    if (!p.text_en && !p.text_hi) throw new Error("Write the fact.");
    patch.key = `admin-${crypto.randomUUID()}`;
    patch.source = "admin";
    fail((await from("atlas_facts").insert(patch as never)).error);
  }
  // The chapter's knowledge base document follows.
  if (p.chapter_key) {
    const j = await jobs();
    if (!j.kb.includes(p.chapter_key))
      await saveSetting(JOBS_KEY, { ...j, kb: [...j.kb, p.chapter_key] });
  }
  invalidate();
}

export async function chapters(): Promise<
  { key: string; title: string; subject: string; facts: number }[]
> {
  const rows = await all<Row>(() =>
    from("atlas_facts").select("chapter_key,chapter,subject").order("position"),
  );
  const m = new Map<string, { key: string; title: string; subject: string; facts: number }>();
  for (const r of rows) {
    const k = String(r.chapter_key);
    if (!m.has(k))
      m.set(k, { key: k, title: String(r.chapter), subject: String(r.subject), facts: 0 });
    m.get(k)!.facts++;
  }
  return [...m.values()];
}

export async function listLayers(): Promise<(AtlasLayer & { size: number })[]> {
  const { data, error } = await from("atlas_layers").select(LAYER_COLS).order("position");
  if (missing(error)) return [];
  fail(error);
  return ((data ?? []) as unknown as AtlasLayer[]).map((l) => ({
    ...l,
    size: l.items.length,
    items: [],
  }));
}

export async function saveLayer(
  key: string,
  patch: Partial<Pick<AtlasLayer, "name_en" | "name_hi" | "status" | "approx" | "note">>,
) {
  fail(
    (
      await from("atlas_layers")
        .update({ ...patch, edited: true, updated_at: now() } as never)
        .eq("key", key)
    ).error,
  );
  invalidate();
}

export type DistrictListRow = {
  district: string;
  name_hi: string;
  meta: DistrictMeta & { job?: OverviewJob };
  status: "draft" | "published";
  sections: number;
  openChecks: number;
  places: number;
  facts: number;
};
export async function listDistricts(): Promise<DistrictListRow[]> {
  const { data, error } = await from("atlas_districts")
    .select("district,name_hi,meta,overview,status,checks")
    .order("district");
  if (missing(error)) return [];
  fail(error);
  const places = await all<Row>(() =>
    from("atlas_places").select("district").neq("status", "hidden"),
  );
  const facts = await all<Row>(() =>
    from("atlas_facts").select("entities").eq("status", "verified").order("position"),
  );
  return ((data ?? []) as Row[]).map((r) => ({
    district: String(r.district),
    name_hi: String(r.name_hi),
    meta: r.meta as DistrictListRow["meta"],
    status: r.status as "draft" | "published",
    sections: ((r.overview as DistrictOverview | null)?.sections ?? []).length,
    openChecks: ((r.checks as OverviewCheck[]) ?? []).filter((c) => c.state === "open").length,
    places: places.filter((p) => p.district === r.district).length,
    facts: facts.filter((f) => ((f.entities as string[]) ?? []).includes(`D:${r.district}`)).length,
  }));
}

export async function getDistrict(district: string) {
  const row = await getDistrictRow(district);
  return {
    district,
    name_hi: String(row.name_hi),
    meta: row.meta,
    overview: row.overview ? normalizeOverview(row.overview) : null,
    status: row.status as "draft" | "published",
    checks: row.checks ?? [],
    versions: (row.versions ?? []).map((v) => ({ at: v.at, label: v.label })),
  };
}

export async function saveOverview(district: string, overview: DistrictOverview, label?: string) {
  const row = await getDistrictRow(district);
  if (label) await keepVersion(district, row, label);
  fail(
    (
      await from("atlas_districts")
        .update({ overview: normalizeOverview(overview), updated_at: now() } as never)
        .eq("district", district)
    ).error,
  );
  invalidate();
}

export async function restoreOverview(district: string, at: string) {
  const row = await getDistrictRow(district);
  const v = (row.versions ?? []).find((x) => x.at === at);
  if (!v) throw new Error("That version is no longer kept.");
  await saveOverview(district, v.overview, "Before a restore");
}

export async function setCheck(district: string, id: string, state: OverviewCheck["state"]) {
  const row = await getDistrictRow(district);
  const checks = (row.checks ?? []).map((c) => (c.id === id ? { ...c, state } : c));
  fail(
    (
      await from("atlas_districts")
        .update({ checks } as never)
        .eq("district", district)
    ).error,
  );
}

export async function publishDistrict(district: string, on: boolean) {
  const row = await getDistrictRow(district);
  if (on && !row.overview?.sections.length) throw new Error("Make the overview first.");
  if (on && (row.checks ?? []).some((c) => c.state === "open"))
    throw new Error("Decide the fact-check notes first.");
  fail(
    (
      await from("atlas_districts")
        .update({
          status: on ? "published" : "draft",
          ...(on ? { published_at: now() } : {}),
        } as never)
        .eq("district", district)
    ).error,
  );
  // The published overview goes to the knowledge base too.
  if (on && row.overview) {
    try {
      const docs = await setting<Record<string, string>>(KB_KEY, {});
      const key = `district:${district}`;
      const text = [overviewText(row.overview, "hi"), overviewText(row.overview, "en")].join(
        "\n\n",
      );
      const ingest = await import("@/lib/saathi-ingest.server");
      if (docs[key]) await ingest.replaceDocument(docs[key], text);
      else {
        const doc = (await ingest.createDocument(
          {
            title: `District overview · ${district}`,
            subject: KB_SUBJECT,
            topic: "Districts",
            medium: "Bilingual",
            source: "FlashGyan Rajasthan atlas",
          },
          text,
        )) as { id?: string } | string;
        const id = typeof doc === "string" ? doc : (doc.id ?? "");
        if (id) await saveSetting(KB_KEY, { ...docs, [key]: id });
      }
    } catch (e) {
      console.error("atlas overview to knowledge base:", saathiErrorDetail(e));
    }
  }
  invalidate();
}

// ---------- Students: public reads (verified and published only) ----------

let cache: { at: number; base?: unknown; places?: unknown } = { at: 0 };
const invalidate = () => {
  cache = { at: 0 };
};
const fresh = () => {
  if (Date.now() - cache.at > 5 * 60_000) cache = { at: Date.now() };
  return cache;
};
const round = (l: LonLat[]) =>
  l.map(([x, y]) => [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000] as LonLat);
// Fewer points where the line hardly turns (outlines read at state scale).
function simplify(l: LonLat[], tol = 0.004): LonLat[] {
  if (l.length < 4) return round(l);
  const out: LonLat[] = [l[0]];
  for (let i = 1; i < l.length - 1; i++) {
    const p = out[out.length - 1];
    const q = l[i];
    if (Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]) >= tol) out.push(q);
  }
  out.push(l[l.length - 1]);
  return round(out);
}

export type AtlasBase = {
  districts: {
    en: string;
    hi: string;
    at: LonLat;
    rings: LonLat[][];
    meta: DistrictMeta;
    published: boolean;
  }[];
  rivers: { en: string; hi: string; tier: number; lines: LonLat[][] }[];
  layers: AtlasLayer[];
};

export async function atlasBase(): Promise<AtlasBase> {
  const c = fresh();
  if (c.base) return c.base as AtlasBase;
  const { data: d } = await from("atlas_districts").select("district,meta,status");
  const meta = new Map(((d ?? []) as Row[]).map((r) => [String(r.district), r]));
  const { data: l } = await from("atlas_layers")
    .select(LAYER_COLS)
    .eq("status", "verified")
    .order("position");
  const base: AtlasBase = {
    districts: RAJ_DISTRICTS.map((x) => ({
      en: x.en,
      hi: x.hi,
      at: x.at,
      rings: x.rings.map((r) => simplify(r)),
      meta: ((meta.get(x.en)?.meta as DistrictMeta) ?? {}) as DistrictMeta,
      published: meta.get(x.en)?.status === "published",
    })),
    rivers: RAJ_RIVERS.filter((r) => (r.tier ?? 1) <= 2).map((r) => ({
      en: r.en,
      hi: r.hi,
      tier: r.tier ?? 1,
      lines: r.lines.map((x) => simplify(x, 0.006)),
    })),
    layers: ((l ?? []) as unknown as AtlasLayer[]).map((x) => ({
      ...x,
      items: x.items.map((f) => ({
        ...f,
        ...(f.rings ? { rings: f.rings.map((r) => simplify(r, 0.003)) } : {}),
        ...(f.line ? { line: round(f.line) } : {}),
      })),
    })),
  };
  c.base = base;
  return base;
}

// The places students see: [key, en, hi, cat, lat, lon, district, facts].
// Then, once known: the years it happened from / to, and a fair's months.
export type PublicPlace = [
  string,
  string,
  string,
  string,
  number,
  number,
  string,
  number,
  (number | null)?,
  (number | null)?,
  number[]?,
];
export async function atlasPublicPlaces(): Promise<PublicPlace[]> {
  const c = fresh();
  if (c.places) return c.places as PublicPlace[];
  const cols = await placeCols();
  const rows = await all<AtlasPlace>(() =>
    from("atlas_places").select(cols).eq("status", "verified").order("key"),
  );
  const counts = new Map<string, number>();
  const facts = await all<Row>(() =>
    from("atlas_facts").select("entities").eq("status", "verified"),
  );
  for (const f of facts)
    for (const e of (f.entities as string[]) ?? [])
      if (e.startsWith("P:")) counts.set(e.slice(2), (counts.get(e.slice(2)) ?? 0) + 1);
  const out: PublicPlace[] = rows.map((p) => {
    const row: PublicPlace = [
      p.key,
      p.label_en || p.name_en,
      p.label_hi || p.name_hi,
      p.cat,
      p.lat,
      p.lon,
      p.district,
      counts.get(p.key) ?? 0,
    ];
    if (p.era_from != null || p.era_to != null || p.months?.length)
      row.push(p.era_from ?? null, p.era_to ?? null, p.months ?? []);
    return row;
  });
  c.places = out;
  return out;
}

export type PublicFact = {
  id: string;
  chapter: string;
  heading: string;
  text: Bi;
  head: string;
  flags: number;
  hiAi: boolean;
};
const publicFact = (f: AtlasFact): PublicFact => ({
  id: f.id,
  chapter: f.chapter,
  heading: f.heading,
  text: { en: cleanFactText(f.text_en), hi: cleanFactText(f.text_hi) },
  head: f.table_head,
  flags: f.flags,
  hiAi: f.hi_ai,
});

// A place's card: the place and its verified facts.
export async function atlasPlace(key: string) {
  const { data, error } = await from("atlas_places")
    .select(await placeCols())
    .eq("key", key)
    .eq("status", "verified")
    .maybeSingle();
  fail(error);
  if (!data) throw new Error("That place isn't in the atlas.");
  const { data: facts } = await from("atlas_facts")
    .select(FACT_COLS)
    .contains("entities", [`P:${key}`])
    .eq("status", "verified")
    .order("position")
    .limit(80);
  const p = data as unknown as AtlasPlace;
  // Facts that name the place without being linked to it.
  const name = p.name_en
    .replace(/\([^)]*\)/g, " ")
    .replace(
      /\b(fort|palace|lake|dam|temple|sanctuary|national park|reserve|mine|mines|hill|peak|pass|festival|fair|plant|park|project|the|of)\b/gi,
      " ",
    )
    .replace(/[%,_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const linked = new Set(((facts ?? []) as unknown as AtlasFact[]).map((f) => f.id));
  const { data: named } =
    name.length >= 4
      ? await from("atlas_facts")
          .select(FACT_COLS)
          .ilike("text_en", `%${name}%`)
          .eq("status", "verified")
          .order("position")
          .limit(40)
      : { data: [] };
  return {
    mentions: ((named ?? []) as unknown as AtlasFact[])
      .filter((f) => !linked.has(f.id))
      .map(publicFact),
    place: {
      key: p.key,
      name: { en: p.label_en || p.name_en, hi: p.label_hi || p.name_hi },
      cat: p.cat,
      lat: p.lat,
      lon: p.lon,
      district: p.district,
      tehsil: p.tehsil,
      note: { en: p.note_en, hi: p.note_hi },
      chapters: [...new Set(p.refs.map((r) => r[0]))],
      era_from: p.era_from ?? null,
      era_to: p.era_to ?? null,
      months: p.months ?? [],
    },
    facts: ((facts ?? []) as unknown as AtlasFact[]).map(publicFact),
    // Current affairs stories about it (none before their migration).
    news: await (await import("@/lib/atlas-news.server")).placeNews(key).catch(() => []),
  };
}

// The facts on a district (for the map's district card), or on a
// physiographic division (S:/V:).
export async function atlasEntityFacts(entity: string): Promise<PublicFact[]> {
  const { data, error } = await from("atlas_facts")
    .select(FACT_COLS)
    .contains("entities", [entity])
    .eq("status", "verified")
    .order("position")
    .limit(300);
  fail(error);
  return ((data ?? []) as unknown as AtlasFact[]).map(publicFact);
}

// A district's page: its published overview, details and places.
export async function atlasDistrictPage(district: string) {
  const { data, error } = await from("atlas_districts")
    .select("district,name_hi,meta,overview,status,published_at")
    .eq("district", district)
    .maybeSingle();
  if (missing(error)) return null;
  fail(error);
  const r = data as Row | null;
  const d = RAJ_DISTRICTS.find((x) => x.en === district);
  if (!d) return null;
  const places = (await atlasPublicPlaces()).filter((p) => p[6] === district);
  return {
    district,
    name: { en: d.en, hi: d.hi },
    meta: ((r?.meta as DistrictMeta) ?? {}) as DistrictMeta,
    overview: r?.status === "published" && r.overview ? normalizeOverview(r.overview) : null,
    publishedAt: (r?.published_at as string | null) ?? null,
    rings: d.rings.map((x) => simplify(x, 0.0015)),
    places,
  };
}

// ---------- For the maps (notes, magazine, GK cards) ----------

let mapCache: { at: number; layers: AtlasLayer[]; places: AtlasPlace[] } | null = null;
async function mapData() {
  if (mapCache && Date.now() - mapCache.at < 5 * 60_000) return mapCache;
  try {
    const { data: l } = await from("atlas_layers")
      .select(LAYER_COLS)
      .eq("status", "verified")
      .order("position");
    const places = await all<AtlasPlace>(() =>
      from("atlas_places").select(PLACE_COLS).eq("status", "verified").order("key"),
    );
    mapCache = { at: Date.now(), layers: (l ?? []) as unknown as AtlasLayer[], places };
  } catch {
    mapCache = { at: Date.now(), layers: [], places: [] };
  }
  return mapCache;
}

// Before a map is drawn: the atlas's layers handed to the map maker.
export async function primeAtlasLayers(): Promise<void> {
  const { setAtlasLayers } = await import("@/lib/notes-map");
  setAtlasLayers((await mapData()).layers);
}

// The layers a map can use (for the AI and the editor).
export async function atlasLayerChoices(): Promise<{ key: string; name: Bi; grp: string }[]> {
  return (await mapData()).layers
    .filter((l) => l.key !== "tehsil-hq")
    .map((l) => ({ key: l.key, name: { en: l.name_en, hi: l.name_hi }, grp: l.grp }));
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(fort|lake|dam|temple|sanctuary|national park|the)\b/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, "");

// A place the place list doesn't have, in the editor's atlas: by name,
// near where it is said to be.
export async function matchAtlasPlace(
  name: { en?: string; hi?: string },
  near: { lat: number; lon: number } | null,
  withinKm = 60,
): Promise<AtlasPlace | null> {
  const key = norm(name.en ?? "");
  const hi = (name.hi ?? "").replace(/\s+/g, "");
  if (!key && !hi) return null;
  const km = (p: AtlasPlace) =>
    near
      ? Math.hypot(
          (p.lat - near.lat) * 111,
          (p.lon - near.lon) * 111 * Math.cos((p.lat * Math.PI) / 180),
        )
      : 0;
  const hits = (await mapData()).places.filter(
    (p) =>
      (key && key.length >= 3 && (norm(p.name_en) === key || norm(p.label_en) === key)) ||
      (hi && (p.name_hi.replace(/\s+/g, "") === hi || p.label_hi.replace(/\s+/g, "") === hi)),
  );
  const best = hits.map((p) => ({ p, km: km(p) })).sort((a, b) => a.km - b.km)[0];
  return best && best.km <= withinKm ? best.p : null;
}

// Verified places of a category (and district), for "all X on one map".
export async function atlasPlacesOf(cat: string, district?: string): Promise<AtlasPlace[]> {
  return (await mapData()).places.filter(
    (p) => p.cat === cat && (!district || p.district === district),
  );
}

// The published district pages (for the sitemap); none before the
// migration.
export async function publishedDistricts(): Promise<{ district: string; at: string | null }[]> {
  const { data, error } = await from("atlas_districts")
    .select("district,published_at")
    .eq("status", "published")
    .order("district");
  if (error) return [];
  return ((data ?? []) as Row[]).map((r) => ({
    district: String(r.district),
    at: (r.published_at as string | null) ?? null,
  }));
}

// For the review tools: the students' cached atlas dropped, and chapters'
// knowledge base documents queued to follow edits.
export const invalidateAtlas = () => invalidate();
export async function queueKb(chapterKeys: string[]) {
  const j = await jobs();
  const kb = [...new Set([...j.kb, ...chapterKeys.filter(Boolean)])];
  if (kb.length !== j.kb.length) await saveSetting(JOBS_KEY, { ...j, kb });
}

// Everything the students' atlas needs to work offline: every verified fact
// (with what it is about) and every published district page.
export type OfflineFact = PublicFact & { entities: string[] };
export async function atlasOfflinePack() {
  const facts = await all<AtlasFact>(() =>
    from("atlas_facts").select(FACT_COLS).eq("status", "verified").order("position"),
  );
  const districts = [];
  for (const d of await publishedDistricts()) {
    const page = await atlasDistrictPage(d.district);
    if (page) districts.push(page);
  }
  return {
    at: now(),
    facts: facts.map((f): OfflineFact => ({ ...publicFact(f), entities: f.entities })),
    districts,
  };
}
