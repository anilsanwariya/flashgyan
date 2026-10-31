// Server-only: practice from the Rajasthan atlas. MCQs are made from the
// verified atlas (and the notes' own questions, their wrong options written
// by the AI a batch a step), checked by the editor, and the approved ones
// published as MCQ Practice sets (rebuilt after the sets made by hand).
// Revision cards go to a Card studio topic of their own.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { saathiComplete, saathiErrorDetail } from "../../supabase/functions/_shared/saathi-core.ts";
import { RAJ_DISTRICTS } from "@/lib/geo-admin";
import type { AtlasPlace, DistrictMeta } from "@/lib/atlas";
import type { Bi } from "@/lib/current-affairs";
import {
  DISTRACTOR_SYSTEM,
  districtMcqs,
  joinBi,
  notesMcq,
  notesPairs,
  orphanAnswers,
  parseDistractors,
  placeDistrictMcqs,
  revisionCards,
  seeded,
  shuffle,
  type AtlasCard,
  type AtlasMcq,
  type PracticeFact,
} from "@/lib/atlas-practice";

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
const missing = (e: { message: string } | null) =>
  !!e && /atlas_mcqs|from_atlas|schema cache|does not exist/i.test(e.message);
export const PRACTICE_NOT_READY =
  "Atlas practice needs its migration (20261213090000_atlas_practice.sql).";

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
async function setting<T>(key: string, dflt: T): Promise<T> {
  const { data } = await from("bot_settings").select("value").eq("key", key).maybeSingle();
  return ((data as Row | null)?.value as T) ?? dflt;
}
async function saveSetting(key: string, value: unknown) {
  fail((await from("bot_settings").upsert({ key, value, updated_at: now() } as never)).error);
}

// The AI's wrong options: on while notes questions wait for them.
type PracticeJob = { distractors: boolean; error: string | null };
const JOB_KEY = "atlas_practice_job";
const STUDIO_KEY = "atlas_studio";
type Studio = { topic: string | null; cards: Record<string, string> };

const MCQ_COLS =
  "id,key,kind,set_name,question,options,answer,explanation,source,status,pending,edited,note,updated_at";
export type AtlasMcqRow = AtlasMcq & {
  id: string;
  status: "draft" | "approved" | "rejected";
  edited: boolean;
  // Why the AI set it aside (its answer answers another question).
  note: string;
  updated_at: string;
};
const readMcq = (r: Row) => r as unknown as AtlasMcqRow;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const FACT_SELECT = "id,key,chapter,chapter_key,heading,text_en,text_hi,flags,position";
const verifiedFacts = () =>
  all<PracticeFact>(() =>
    from("atlas_facts")
      .select(FACT_SELECT)
      .eq("status", "verified")
      .gt("flags", 0)
      .order("position"),
  ).then((fs) => fs.filter((f) => f.flags & (64 | 128)));

// ---------- Making the questions ----------

export async function generateMcqs(): Promise<{
  added: number;
  changed: number;
  removed: number;
  waiting: number;
}> {
  const probe = await from("atlas_mcqs").select("id").limit(1);
  if (missing(probe.error)) throw new Error(PRACTICE_NOT_READY);
  fail(probe.error);
  const { data: d } = await from("atlas_districts").select("district,meta");
  const meta = new Map(
    ((d ?? []) as Row[]).map((r) => [String(r.district), r.meta as DistrictMeta]),
  );
  const districts = RAJ_DISTRICTS.map((x) => ({
    en: x.en,
    hi: x.hi,
    meta: meta.get(x.en) ?? ({} as DistrictMeta),
  }));
  const places = await all<AtlasPlace>(() =>
    from("atlas_places")
      .select("key,name_en,name_hi,label_en,label_hi,cat,district")
      .eq("status", "verified")
      .neq("district", "")
      .order("key"),
  );
  const facts = await verifiedFacts();
  const made: AtlasMcq[] = [
    ...districtMcqs(districts),
    ...placeDistrictMcqs(places, districts),
    ...notesPairs(facts).map(({ q, a }) => notesMcq(q, a)),
  ];

  const old = new Map(
    (await all<Row>(() => from("atlas_mcqs").select(MCQ_COLS).order("key")))
      .map(readMcq)
      .map((r) => [r.key, r]),
  );
  let added = 0;
  let changed = 0;
  const inserts: Row[] = [];
  for (const m of made) {
    const o = old.get(m.key);
    old.delete(m.key);
    if (!o) {
      inserts.push({ ...m, status: "draft" });
      added++;
      continue;
    }
    if (o.edited) continue;
    // A notes question keeps the AI's options while its question and
    // answer are the same.
    const fresh =
      m.kind === "notes"
        ? !same(o.question, m.question) || !same(o.explanation, m.explanation)
        : !same(o.question, m.question) ||
          !same(o.options, m.options) ||
          o.answer !== m.answer ||
          !same(o.explanation, m.explanation) ||
          o.set_name !== m.set_name;
    if (!fresh) continue;
    fail(
      (
        await from("atlas_mcqs")
          .update({ ...m, status: "draft", note: "", updated_at: now() } as never)
          .eq("id", o.id)
      ).error,
    );
    changed++;
  }
  for (let i = 0; i < inserts.length; i += 200)
    fail((await from("atlas_mcqs").insert(inserts.slice(i, i + 200) as never)).error);
  // Gone from the atlas: drafts are removed, checked ones kept for the editor.
  const gone = [...old.values()].filter((o) => !o.edited && o.status === "draft").map((o) => o.id);
  for (let i = 0; i < gone.length; i += 200)
    fail(
      (
        await from("atlas_mcqs")
          .delete()
          .in("id", gone.slice(i, i + 200))
      ).error,
    );
  const { count } = await from("atlas_mcqs")
    .select("id", { count: "exact", head: true })
    .eq("pending", true);
  if (count) await saveSetting(JOB_KEY, { distractors: true, error: null } satisfies PracticeJob);
  return { added, changed, removed: gone.length, waiting: count ?? 0 };
}

const BATCH = 12;
export const MISMATCH =
  'The answer after this question in the notes answers something else. In the Facts tab, put the right answer in the question\'s fact ("Question? Answer") and make the questions again.';
// Writes the wrong options of a batch of notes questions. False: none left.
async function distractorStep(): Promise<boolean> {
  const { data, error } = await from("atlas_mcqs")
    .select(MCQ_COLS)
    .eq("pending", true)
    .order("key")
    .limit(BATCH);
  fail(error);
  const rows = ((data ?? []) as Row[]).map(readMcq);
  if (!rows.length) return false;
  const raw = await saathiComplete(apiKey(), [
    { role: "system", content: DISTRACTOR_SYSTEM },
    {
      role: "user",
      content: rows
        .map(
          (r, i) =>
            `${i + 1}. Q: ${r.question.en} / ${r.question.hi}\n   Answer: ${r.explanation.en} / ${r.explanation.hi}`,
        )
        .join("\n"),
    },
  ]);
  const got = parseDistractors(raw);
  if (!got.size) throw new Error("The AI gave no usable options.");
  for (const [n, x] of got) {
    const r = rows[n - 1];
    if (!r) continue;
    if ("mismatch" in x) {
      fail(
        (
          await from("atlas_mcqs")
            .update({
              pending: false,
              status: "rejected",
              note: MISMATCH,
              updated_at: now(),
            } as never)
            .eq("id", r.id)
        ).error,
      );
      continue;
    }
    const opts = shuffle([x.right, ...x.wrong], seeded(r.key));
    fail(
      (
        await from("atlas_mcqs")
          .update({
            options: opts,
            answer: opts.indexOf(x.right) + 1,
            pending: false,
            note: "",
            updated_at: now(),
          } as never)
          .eq("id", r.id)
      ).error,
    );
  }
  return true;
}

// One step of the background work (the tick and the admin page).
export async function practiceStep(): Promise<{ did: string | null }> {
  const job = await setting<PracticeJob>(JOB_KEY, { distractors: false, error: null });
  if (!job.distractors) return { did: null };
  try {
    if (await distractorStep()) return { did: "mcq-options" };
    await saveSetting(JOB_KEY, { distractors: false, error: null } satisfies PracticeJob);
  } catch (e) {
    console.error("atlas MCQ options:", saathiErrorDetail(e));
    await saveSetting(JOB_KEY, {
      distractors: false,
      error: e instanceof Error ? e.message : String(e),
    } satisfies PracticeJob);
  }
  return { did: null };
}

export async function resumeDistractors() {
  await saveSetting(JOB_KEY, { distractors: true, error: null } satisfies PracticeJob);
}

// ---------- Checking ----------

export async function practiceStatus() {
  const probe = await from("atlas_mcqs").select("id").limit(1);
  if (missing(probe.error)) return { ready: false } as const;
  fail(probe.error);
  const rows = await all<Row>(() => from("atlas_mcqs").select("kind,status,pending,set_name"));
  const by = (f: (r: Row) => boolean) => rows.filter(f).length;
  const { data: sets } = await from("mcq_practice_tests").select("id").eq("from_atlas", true);
  const studio = await setting<Studio>(STUDIO_KEY, { topic: null, cards: {} });
  const orphans = orphanAnswers(await verifiedFacts());
  return {
    ready: true,
    // Self-test answers with no question before them in the notes.
    orphans: orphans
      .slice(0, 200)
      .map((f) => ({ chapter: f.chapter, heading: f.heading, text: f.text_en })),
    total: rows.length,
    draft: by((r) => r.status === "draft" && !r.pending),
    approved: by((r) => r.status === "approved"),
    rejected: by((r) => r.status === "rejected"),
    waiting: by((r) => !!r.pending),
    kinds: Object.fromEntries(
      ["place-district", "district-division", "district-zone", "notes"].map((k) => [
        k,
        by((r) => r.kind === k),
      ]),
    ) as Record<AtlasMcq["kind"], number>,
    sets: [...new Set(rows.map((r) => String(r.set_name)))].sort(),
    publishedSets: (sets ?? []).length,
    job: await setting<PracticeJob>(JOB_KEY, { distractors: false, error: null }),
    studio: { topic: studio.topic, cards: Object.keys(studio.cards).length },
  } as const;
}

export async function listMcqs(f: {
  status?: string;
  kind?: string;
  set?: string;
  q?: string;
  page?: number;
}): Promise<{ rows: AtlasMcqRow[]; total: number }> {
  const size = 100;
  let q = from("atlas_mcqs").select(MCQ_COLS, { count: "exact" });
  if (f.status === "waiting") q = q.eq("pending", true);
  else if (f.status) q = q.eq("status", f.status).eq("pending", false);
  if (f.kind) q = q.eq("kind", f.kind);
  if (f.set) q = q.eq("set_name", f.set);
  if (f.q?.trim()) q = q.ilike("question->>en", `%${f.q.trim()}%`);
  const at = (f.page ?? 0) * size;
  const { data, error, count } = await q.order("key").range(at, at + size - 1);
  fail(error);
  return { rows: ((data ?? []) as Row[]).map(readMcq), total: count ?? 0 };
}

const cleanBi = (b: Bi): Bi => ({ en: b.en.trim(), hi: b.hi.trim() });
export async function saveMcq(
  id: string,
  p: { question: Bi; options: Bi[]; answer: number; explanation: Bi; set_name: string },
): Promise<AtlasMcqRow> {
  if (p.options.length !== 4 || p.options.some((o) => !o.en.trim() && !o.hi.trim()))
    throw new Error("A question needs four options.");
  const { data, error } = await from("atlas_mcqs")
    .update({
      question: cleanBi(p.question),
      options: p.options.map(cleanBi),
      answer: p.answer,
      explanation: cleanBi(p.explanation),
      set_name: p.set_name.trim() || "Atlas",
      pending: false,
      edited: true,
      note: "",
      updated_at: now(),
    } as never)
    .eq("id", id)
    .select(MCQ_COLS)
    .single();
  fail(error);
  return readMcq(data as unknown as Row);
}

export async function setMcqStatus(ids: string[], status: AtlasMcqRow["status"]) {
  for (let i = 0; i < ids.length; i += 200)
    fail(
      (
        await from("atlas_mcqs")
          .update({ status, updated_at: now() } as never)
          .in("id", ids.slice(i, i + 200))
          .eq("pending", false)
      ).error,
    );
}

// ---------- Publishing to MCQ Practice ----------

// Notes questions keep their chapter's subject (source "F:geo-ch1:id").
const SUBJECTS: Record<string, string> = {
  geo: "Rajasthan Geography",
  his: "Rajasthan History",
  art: "Rajasthan Art & Culture",
  pol: "Rajasthan Polity",
  eco: "Rajasthan Economy",
};
const SUBJECT = (m: AtlasMcqRow) =>
  SUBJECTS[m.source.split(":")[1]?.split("-")[0] ?? ""] ?? "Rajasthan Geography";

export function mcqRow(m: AtlasMcqRow, index: number) {
  const o = (i: number) => joinBi(m.options[i] ?? { en: "", hi: "" });
  return {
    order_index: index,
    question: joinBi(m.question),
    question_ext: "",
    option_1: o(0),
    option_2: o(1),
    option_3: o(2),
    option_4: o(3),
    answer: m.answer,
    explanation_sections: [
      m.explanation.hi ? { title: "व्याख्या", body: m.explanation.hi } : null,
      m.explanation.en && m.explanation.en !== m.explanation.hi
        ? { title: "Explanation", body: m.explanation.en }
        : null,
      { title: "Source / स्रोत", body: "Rajasthan Atlas / राजस्थान एटलस" },
    ].filter(Boolean),
  };
}

// The approved questions as sets (one per set name, at most 50 a set),
// replacing the atlas sets before, after the sets made by hand.
export async function publishMcqs(): Promise<{ sets: number; questions: number }> {
  const probe = await from("mcq_practice_tests").select("id").eq("from_atlas", true).limit(1);
  if (missing(probe.error)) throw new Error(PRACTICE_NOT_READY);
  fail(probe.error);
  const approved = (
    await all<Row>(() =>
      from("atlas_mcqs")
        .select(MCQ_COLS)
        .eq("status", "approved")
        .eq("pending", false)
        .order("key"),
    )
  ).map(readMcq);
  const groups = new Map<string, AtlasMcqRow[]>();
  for (const m of approved) groups.set(m.set_name, [...(groups.get(m.set_name) ?? []), m]);
  const sets: { name: string; subject: string; qs: AtlasMcqRow[] }[] = [];
  for (const [name, qs] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    const parts = Math.ceil(qs.length / 50);
    for (let i = 0; i < parts; i++)
      sets.push({
        name: parts > 1 ? `${name} (${i + 1})` : name,
        subject: SUBJECT(qs[0]),
        qs: qs.slice(i * 50, i * 50 + 50),
      });
  }
  const { data: last } = await from("mcq_practice_tests")
    .select("order_index")
    .eq("from_papers", false)
    .eq("from_atlas", false)
    .order("order_index", { ascending: false })
    .limit(1);
  const after = ((last ?? []) as { order_index: number }[])[0]?.order_index ?? 0;
  fail((await from("mcq_practice_tests").delete().eq("from_atlas", true)).error);
  let count = 0;
  for (let i = 0; i < sets.length; i++) {
    const s = sets[i];
    const { data: t, error } = await from("mcq_practice_tests")
      .insert({
        name: s.name.slice(0, 200),
        description: `${s.qs.length} questions from the Rajasthan Atlas / राजस्थान एटलस से ${s.qs.length} प्रश्न`,
        subject: s.subject,
        topic: "Rajasthan Atlas / राजस्थान एटलस",
        order_index: after + 1 + i,
        from_atlas: true,
      } as never)
      .select("id")
      .single();
    fail(error);
    const id = (t as unknown as { id: string }).id;
    const rows = s.qs.map((m, k) => ({ test_id: id, ...mcqRow(m, k) }));
    fail((await from("mcq_practice_questions").insert(rows as never)).error);
    count += rows.length;
  }
  return { sets: sets.length, questions: count };
}

// ---------- Flashcards to the Card studio ----------

// The atlas's flashcards: the notes' revision lines, and the notes'
// questions once approved as MCQs (their answers checked).
async function atlasCards() {
  const approved = (
    await all<Row>(() =>
      from("atlas_mcqs")
        .select(MCQ_COLS)
        .eq("kind", "notes")
        .eq("status", "approved")
        .eq("pending", false)
        .order("key"),
    ).catch(() => [] as Row[])
  ).map(readMcq);
  return [
    ...revisionCards(await verifiedFacts()),
    ...approved.map((m) => ({
      key: `qa:${m.key}`,
      front: m.question,
      back: m.explanation,
      chapter: m.set_name.replace(/^Atlas · /, "").split(" / ")[0],
      heading: "",
    })),
  ];
}

// The same cards for students to revise in the atlas (on a schedule kept
// on their device). A memory line without a question of its own ("Sunel
// in, Sironj out…") gets its chapter on the front.
let cardsCache: { at: number; cards: AtlasCard[] } | null = null;
export async function publicAtlasCards(): Promise<AtlasCard[]> {
  if (cardsCache && Date.now() - cardsCache.at < 10 * 60_000) return cardsCache.cards;
  const cards = (await atlasCards()).map((c) =>
    / revise$/.test(c.front.en)
      ? {
          ...c,
          front: { en: `${c.chapter} — memory line`, hi: `${c.chapter} — याद रखने की पंक्ति` },
        }
      : c,
  );
  cardsCache = { at: Date.now(), cards };
  return cards;
}

export const STUDIO_TOPIC = "Rajasthan Atlas · revision cards";

// New revision cards (and the notes' questions) added to the atlas's Card
// studio topic; cards sent before are left as the editor has them.
export async function sendCardsToStudio(): Promise<{
  topic: string;
  added: number;
  kept: number;
}> {
  const studio = await setting<Studio>(STUDIO_KEY, { topic: null, cards: {} });
  let topic = studio.topic;
  if (topic) {
    const { data } = await from("flash_topics").select("id").eq("id", topic).maybeSingle();
    if (!data) topic = null;
  }
  if (!topic) {
    const { data, error } = await from("flash_topics")
      .insert({ name: STUDIO_TOPIC } as never)
      .select("id")
      .single();
    fail(error);
    topic = String((data as unknown as Row).id);
    studio.cards = {};
  }
  const cards = await atlasCards();
  const { data: last } = await from("flash_cards")
    .select("pos")
    .eq("topic_id", topic)
    .order("pos", { ascending: false })
    .limit(1);
  let pos = ((last ?? []) as Row[])[0] ? Number(((last ?? []) as Row[])[0].pos) + 1 : 0;
  const fresh = cards.filter((c) => !studio.cards[c.key]);
  for (let i = 0; i < fresh.length; i += 200) {
    const part = fresh.slice(i, i + 200);
    const { data, error } = await from("flash_cards")
      .insert(
        part.map((c) => ({
          topic_id: topic,
          pos: pos++,
          front: joinBi(c.front),
          back: joinBi(c.back),
          sources: [
            {
              book: "Rajasthan Atlas",
              heading: [c.chapter, c.heading].filter(Boolean).join(" · "),
            },
          ],
        })) as never,
      )
      .select("id,pos");
    fail(error);
    const ids = ((data ?? []) as Row[]).sort((a, b) => Number(a.pos) - Number(b.pos));
    part.forEach((c, k) => {
      if (ids[k]) studio.cards[c.key] = String(ids[k].id);
    });
  }
  await from("flash_topics")
    .update({ updated_at: now() } as never)
    .eq("id", topic);
  await saveSetting(STUDIO_KEY, { topic, cards: studio.cards } satisfies Studio);
  return { topic, added: fresh.length, kept: cards.length - fresh.length };
}
