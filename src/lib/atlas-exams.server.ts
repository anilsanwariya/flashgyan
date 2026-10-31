// Server-only: the atlas and past exam papers. Questions of published
// papers are matched to the atlas places and Rajasthan districts they name
// (no AI: the same name matching as SAATHI's map), shown as "Asked in
// exams" on the place or district; and every question filed under a master
// outline topic is counted for the editor's syllabus page. Rebuilt every
// half hour, or when the editor asks.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { findMentions } from "@/lib/atlas";
import type { Bi } from "@/lib/current-affairs";
import { DISTRICTS, placeIndex } from "@/lib/atlas-news.server";

const from = (table: string) => supabaseAdmin.from(table as never);
type Row = Record<string, unknown>;

export type AskedQ = {
  id: string;
  paper: string; // "RAS Pre 2023 · GS"
  year: number | null;
  kind: "objective" | "subjective";
  q_no: number;
  question: Bi;
  extra: Bi;
  options: Bi[];
  correct: number | null; // 1-4
  marks: number | null;
};
type Index = {
  at: number;
  questions: Map<string, AskedQ>;
  places: Map<string, string[]>;
  districts: Map<string, string[]>;
  topics: Map<string, number>; // master topic → questions (any paper)
};
let cache: Index | null = null;
const TTL = 30 * 60_000;

const bi = (v: unknown): Bi => {
  const o = (v ?? {}) as Row;
  return { en: String(o.en ?? ""), hi: String(o.hi ?? "") };
};
const add = (m: Map<string, string[]>, k: string, id: string) => {
  const l = m.get(k) ?? [];
  if (!l.includes(id)) l.push(id);
  m.set(k, l);
};

async function rows(table: string, cols: string, live = false): Promise<Row[]> {
  const out: Row[] = [];
  for (let at = 0; ; at += 1000) {
    const q = from(table).select(cols);
    const { data, error } = await (live ? q.eq("deleted" as never, false as never) : q)
      .order("id")
      .range(at, at + 999);
    if (error) return out; // no exam papers yet
    out.push(...((data ?? []) as Row[]));
    if ((data ?? []).length < 1000) return out;
  }
}

async function build(): Promise<Index> {
  const papers = new Map(
    (await rows("exam_papers", "id,exam,subject,exam_date,status,kind")).map((p) => [
      String(p.id),
      p,
    ]),
  );
  const qs = await rows(
    "exam_questions",
    "id,paper_id,q_no,question_en,question_hi,extra_en,extra_hi,options,correct,marks,subject_section,master_topic_id,deleted",
    true,
  );
  const places = await placeIndex();
  const idx: Index = {
    at: Date.now(),
    questions: new Map(),
    places: new Map(),
    districts: new Map(),
    topics: new Map(),
  };
  for (const q of qs) {
    const paper = papers.get(String(q.paper_id));
    if (!paper) continue;
    if (q.master_topic_id)
      idx.topics.set(
        String(q.master_topic_id),
        (idx.topics.get(String(q.master_topic_id)) ?? 0) + 1,
      );
    if (paper.status !== "published") continue;
    const options = (Array.isArray(q.options) ? q.options : []).map(bi);
    const text = [
      q.question_en,
      q.question_hi,
      q.extra_en,
      q.extra_hi,
      ...options.flatMap((o) => [o.en, o.hi]),
    ]
      .filter(Boolean)
      .join("\n");
    const districts = findMentions(text, DISTRICTS, 4);
    // The districts a question is about: those its question names (when
    // not a whole list), and the one its right answer names. Wrong options
    // name districts too, but the question isn't about them.
    const stem = [q.question_en, q.question_hi, q.extra_en, q.extra_hi].filter(Boolean).join("\n");
    const right = q.correct ? options[Number(q.correct) - 1] : undefined;
    const inStem = findMentions(stem, DISTRICTS, 4);
    const about = [
      ...(inStem.length <= 2 ? inStem : []),
      ...(right ? findMentions(`${right.en}\n${right.hi}`, DISTRICTS, 4) : []),
    ];
    // Places only in a question about Rajasthan (its section, the state or a
    // district named): "Chittorgarh fort", not a Bihar "Rohtas fort".
    const raj =
      String(q.subject_section ?? "").startsWith("Rajasthan") ||
      /rajasthan|राजस्थान/i.test(text) ||
      districts.length > 0;
    const named = raj ? findMentions(text, places).map((e) => e.p) : [];
    if (!about.length && !named.length) continue;
    const id = String(q.id);
    const date = paper.exam_date ? String(paper.exam_date) : "";
    idx.questions.set(id, {
      id,
      paper: [paper.exam, paper.subject].filter(Boolean).join(" · "),
      year: date ? Number(date.slice(0, 4)) : null,
      kind: paper.kind === "subjective" ? "subjective" : "objective",
      q_no: Number(q.q_no),
      question: { en: String(q.question_en ?? ""), hi: String(q.question_hi ?? "") },
      extra: { en: String(q.extra_en ?? ""), hi: String(q.extra_hi ?? "") },
      options,
      correct: q.correct == null ? null : Number(q.correct),
      marks: q.marks == null ? null : Number(q.marks),
    });
    for (const d of about) add(idx.districts, d.en, id);
    for (const p of named.slice(0, 4)) add(idx.places, p[0], id);
  }
  return idx;
}

async function index(): Promise<Index> {
  if (!cache || Date.now() - cache.at > TTL) cache = await build();
  return cache;
}
export function resetAskedIndex() {
  cache = null;
}

const newestFirst = (a: AskedQ, b: AskedQ) => (b.year ?? 0) - (a.year ?? 0) || a.q_no - b.q_no;

// How many questions each place and district has (for the map's filter).
export async function askedCounts(): Promise<{
  places: Record<string, number>;
  districts: Record<string, number>;
}> {
  const i = await index();
  return {
    places: Object.fromEntries([...i.places].map(([k, v]) => [k, v.length])),
    districts: Object.fromEntries([...i.districts].map(([k, v]) => [k, v.length])),
  };
}

// The questions about a place ("cat:slug") or a district.
export async function askedAbout(f: { place?: string; district?: string }): Promise<AskedQ[]> {
  const i = await index();
  const ids =
    (f.place ? i.places.get(f.place) : f.district ? i.districts.get(f.district) : []) ?? [];
  return ids
    .map((id) => i.questions.get(id)!)
    .filter(Boolean)
    .sort(newestFirst)
    .slice(0, 30);
}

// Questions per master outline topic (every paper, published or not).
export async function askedPerTopic(): Promise<Map<string, number>> {
  return (await index()).topics;
}
