// Server-only master outlines: made by the AI from the official syllabus
// lines of a subject section, kept up to date as syllabi are added, edited
// by hand, and the links from official lines to topics.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { saathiComplete } from "../../supabase/functions/_shared/saathi-core.ts";
import {
  childLevel,
  childrenOf,
  fitMessages,
  outlineMessages,
  outlineText,
  parseFit,
  parseOutline,
  parseQuestionTopics,
  QUESTION_LINK_BATCH,
  questionTopicMessages,
  type Level,
  type MasterTopic,
  type OutlineLine,
  type PlannedTopic,
} from "@/lib/outline";
import { examTitle, KIND_DEPTH, type SyllabusExam, type SyllabusNode } from "@/lib/syllabus";
import { SUBJECT_SECTIONS } from "@/lib/exam-papers";
import * as CA from "@/lib/current-affairs.server";

const from = (table: string) => supabaseAdmin.from(table as never);
const fail = (e: { message: string } | null) => {
  if (e) throw new Error(e.message);
};
function apiKey(): string {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY is not configured");
  return key;
}
const now = () => new Date().toISOString();
const missing = (e: { message: string } | null) =>
  !!e && /master_topics|syllabus_links|schema cache/.test(e.message);
export const OUTLINES_NOT_READY =
  "Master outlines need a database update: run the latest migration (master_outlines) in Lovable or the SQL editor.";

async function all<T>(table: string, cols: string, order = "id"): Promise<T[]> {
  const out: T[] = [];
  for (let at = 0; ; at += 1000) {
    const { data, error } = (await from(table)
      .select(cols)
      .order(order)
      .order(cols.split(",")[1] ?? order)
      .range(at, at + 999)) as { data: T[] | null; error: { message: string } | null };
    if (missing(error)) throw new Error(OUTLINES_NOT_READY);
    fail(error);
    out.push(...(data ?? []));
    if ((data ?? []).length < 1000) return out;
  }
}

// "Unit III- Earth Science" → "Unit III" (a name without its number kept
// whole, to 40 letters).
const shortHead = (s: string) => {
  const short = s.replace(/\s*[-–:]\s+.*$/, "");
  return /\d|\b[IVXLC]+\b|\s[A-Z]$/.test(short) ? short : s.slice(0, 40);
};

// Every official line (of a section, or all), with its exam, where it sits
// in its syllabus, and the topics it's linked to.
async function officialLines(
  section?: string,
): Promise<(OutlineLine & { section: string; stage: SyllabusExam["stage"] })[]> {
  const exams = await all<SyllabusExam>("syllabus_exams", "id,name,stage");
  const names = new Map(exams.map((e) => [e.id, examTitle(e)]));
  const stages = new Map(exams.map((e) => [e.id, e.stage]));
  // In a steady order: exam by exam (Prelims before Mains), as printed.
  const STAGE_ORDER = { prelims: 0, mains: 1, single: 2 } as const;
  const rank = new Map(
    [...exams]
      .sort(
        (a, b) =>
          a.name.localeCompare(b.name) ||
          STAGE_ORDER[a.stage] - STAGE_ORDER[b.stage] ||
          a.id.localeCompare(b.id),
      )
      .map((e, i) => [e.id, i]),
  );
  const nodes = (
    await all<SyllabusNode>("syllabus_nodes", "id,exam_id,position,kind,text_en,text_hi,section")
  ).sort(
    (a, b) => (rank.get(a.exam_id) ?? 0) - (rank.get(b.exam_id) ?? 0) || a.position - b.position,
  );
  const links = await all<{ node_id: string; topic_id: string }>(
    "syllabus_links",
    "node_id,topic_id",
    "node_id",
  );
  const linked = new Map<string, string[]>();
  for (const l of links) linked.set(l.node_id, [...(linked.get(l.node_id) ?? []), l.topic_id]);
  const out: (OutlineLine & { section: string; stage: SyllabusExam["stage"] })[] = [];
  let exam = "";
  let path: SyllabusNode[] = [];
  for (const n of nodes) {
    if (n.exam_id !== exam) {
      exam = n.exam_id;
      path = [];
    }
    if (n.kind !== "line") {
      path = path.filter((p) => KIND_DEPTH[p.kind] < KIND_DEPTH[n.kind]);
      path.push(n);
      continue;
    }
    if (section !== undefined && n.section !== section) continue;
    out.push({
      id: n.id,
      exam: names.get(n.exam_id) ?? "",
      where: path.map((p) => shortHead(p.text_en || p.text_hi)).join(" › "),
      text_en: n.text_en,
      text_hi: n.text_hi,
      topics: linked.get(n.id) ?? [],
      section: n.section,
      stage: stages.get(n.exam_id) ?? "single",
    });
  }
  return out;
}

// A section's outline and its official lines (with each line's stage), for
// the notes books' front pages.
export async function sectionOutline(section: string) {
  const [topics, lines] = await Promise.all([sectionTopics(section), officialLines(section)]);
  return { topics, lines };
}

async function sectionTopics(section: string): Promise<MasterTopic[]> {
  const { data, error } = await from("master_topics")
    .select("id,section,parent_id,level,position,name_en,name_hi")
    .eq("section", section);
  if (missing(error)) throw new Error(OUTLINES_NOT_READY);
  fail(error);
  return (data ?? []) as unknown as MasterTopic[];
}

export type OutlineSummary = { section: string; lines: number; linked: number; topics: number };

export async function listOutlines(): Promise<{ ready: boolean; sections: OutlineSummary[] }> {
  try {
    const [lines, topics] = await Promise.all([
      officialLines(),
      all<{ section: string }>("master_topics", "id,section"),
    ]);
    const bySection = new Map<string, OutlineSummary>();
    const get = (s: string) => {
      if (!bySection.has(s)) bySection.set(s, { section: s, lines: 0, linked: 0, topics: 0 });
      return bySection.get(s)!;
    };
    for (const l of lines) {
      const s = get(l.section);
      s.lines++;
      if (l.topics.length) s.linked++;
    }
    for (const t of topics) get(t.section).topics++;
    const order = SUBJECT_SECTIONS.map((s) => s.en as string);
    return {
      ready: true,
      sections: [...bySection.values()]
        .filter((s) => s.section)
        .sort((a, b) => order.indexOf(a.section) - order.indexOf(b.section)),
    };
  } catch (e) {
    if (e instanceof Error && e.message === OUTLINES_NOT_READY)
      return { ready: false, sections: [] };
    throw e;
  }
}

// A past question filed under a topic.
export type TopicQuestion = {
  id: string;
  topic_id: string;
  exam: string;
  q_no: number;
  text: string;
  marks: number | null;
  written: boolean;
  published: boolean;
};

export async function getOutline(
  section: string,
): Promise<{ topics: MasterTopic[]; lines: OutlineLine[]; questions: TopicQuestion[] }> {
  const [topics, lines] = await Promise.all([sectionTopics(section), officialLines(section)]);
  return { topics, lines, questions: await topicQuestions(topics.map((t) => t.id)) };
}

// The past questions filed under these topics (none before the mains_papers
// migration).
async function topicQuestions(ids: string[]): Promise<TopicQuestion[]> {
  const out: TopicQuestion[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await from("exam_questions")
      .select(
        "id,q_no,question_en,question_hi,marks,master_topic_id,deleted,paper:exam_papers(exam,kind,status)",
      )
      .in("master_topic_id", ids.slice(i, i + 100));
    if (error) return [];
    for (const r of (data ?? []) as unknown as {
      id: string;
      q_no: number;
      question_en: string;
      question_hi: string;
      marks: number | null;
      master_topic_id: string;
      deleted: boolean;
      paper: { exam: string; kind?: string; status?: string } | null;
    }[]) {
      if (r.deleted) continue;
      out.push({
        id: r.id,
        topic_id: r.master_topic_id,
        exam: r.paper?.exam ?? "",
        q_no: r.q_no,
        text: (r.question_en || r.question_hi).slice(0, 300),
        marks: r.marks,
        written: r.paper?.kind === "subjective",
        published: r.paper?.status === "published",
      });
    }
  }
  return out.sort((a, b) => a.exam.localeCompare(b.exam) || a.q_no - b.q_no);
}

// ---------- Past questions on the outline ----------

// The next questions of a paper (with a subject section whose outline is
// made) filed under the outline's topics, one section's batch per call.
// `skip`: questions the AI couldn't place before. Returns how many are left
// and the sections that have no outline yet.
export async function linkPaperTopics(
  paperId: string,
  skip: string[] = [],
): Promise<{ done: number; missed: string[]; left: number; noOutline: string[] }> {
  const { data, error } = await from("exam_questions")
    .select("id,q_no,question_en,question_hi,extra_en,subject_section,master_topic_id,deleted")
    .eq("paper_id", paperId)
    .order("q_no");
  if (error && /master_topic_id/.test(error.message))
    throw new Error(
      "Linking questions to the outlines needs a database update: run the latest migration (mains_papers) in Lovable or the SQL editor.",
    );
  fail(error);
  const all = (data ?? []) as unknown as {
    id: string;
    q_no: number;
    question_en: string;
    question_hi: string;
    extra_en: string;
    subject_section: string;
    master_topic_id: string | null;
    deleted: boolean;
  }[];
  const pending = all.filter(
    (q) => !q.deleted && !q.master_topic_id && q.subject_section && !skip.includes(q.id),
  );
  const sections = [...new Set(pending.map((q) => q.subject_section))];
  const outlines = new Map<string, MasterTopic[]>();
  for (const s of sections) {
    const t = await sectionTopics(s);
    if (t.length) outlines.set(s, t);
  }
  const noOutline = sections.filter((s) => !outlines.has(s));
  const todo = pending.filter((q) => outlines.has(q.subject_section));
  if (!todo.length) return { done: 0, missed: [], left: 0, noOutline };
  const section = todo[0].subject_section;
  const batch = todo.filter((q) => q.subject_section === section).slice(0, QUESTION_LINK_BATCH);
  const { text, ids } = outlineText(outlines.get(section)!);
  const placed = parseQuestionTopics(
    await saathiComplete(
      apiKey(),
      questionTopicMessages(
        section,
        text,
        batch.map((q) => ({
          n: q.q_no,
          text: [q.question_en || q.question_hi, q.extra_en]
            .filter(Boolean)
            .join(" ")
            .slice(0, 600),
        })),
      ),
    ),
    batch.map((q) => q.q_no),
    ids.length,
  );
  let done = 0;
  const missed: string[] = [];
  for (const q of batch) {
    const t = placed.get(q.q_no);
    if (!t) {
      missed.push(q.id);
      continue;
    }
    fail(
      (
        await from("exam_questions")
          .update({ master_topic_id: ids[t - 1] } as never)
          .eq("id", q.id)
      ).error,
    );
    done++;
  }
  return { done, missed, left: todo.length - batch.length, noOutline };
}

// Planned topics saved a level at a time (each level's ids for the next),
// with their lines' links.
async function savePlanned(
  section: string,
  planned: PlannedTopic[],
  parent: string | null,
  level: Level,
  lineIds: string[],
  startAt = 0,
) {
  if (!planned.length) return;
  const { data, error } = await from("master_topics")
    .insert(
      planned.map((p, i) => ({
        section,
        parent_id: parent,
        level,
        position: startAt + i,
        name_en: p.en,
        name_hi: p.hi,
      })) as never,
    )
    .select("id,position");
  fail(error);
  const rows = ((data ?? []) as { id: string; position: number }[]).sort(
    (a, b) => a.position - b.position,
  );
  const links = planned.flatMap((p, i) =>
    p.lines.map((n) => ({ node_id: lineIds[n - 1], topic_id: rows[i].id })),
  );
  if (links.length)
    fail(
      (
        await from("syllabus_links").upsert(links as never, {
          onConflict: "node_id,topic_id",
          ignoreDuplicates: true,
        })
      ).error,
    );
  const next = childLevel(level);
  if (next)
    for (let i = 0; i < planned.length; i++)
      await savePlanned(section, planned[i].children, rows[i].id, next, lineIds);
}

// The section's outline made (again) by the AI from all its official lines.
export async function makeOutline(section: string, replace = false) {
  const lines = await officialLines(section);
  if (!lines.length) throw new Error(`No syllabus lines in ${section} yet.`);
  const had = await sectionTopics(section);
  if (had.length && !replace) throw new Error(`${section} already has an outline.`);
  const { glossary } = await CA.getMagazineSettings();
  let planned: PlannedTopic[] | null = null;
  for (let attempt = 0; attempt < 2 && !planned; attempt++)
    planned = parseOutline(
      await saathiComplete(apiKey(), outlineMessages(section, lines, glossary)),
      lines.length,
    );
  if (!planned) throw new Error("The AI's outline couldn't be read: try again.");
  if (had.length) fail((await from("master_topics").delete().eq("section", section)).error);
  await savePlanned(
    section,
    planned,
    null,
    "chapter",
    lines.map((l) => l.id),
  );
  return getOutline(section);
}

// Lines not linked yet fitted into the outline (new topics where nothing
// covers them). Returns how many were linked.
export async function fitLines(section: string): Promise<{ linked: number; added: number }> {
  const [topics, lines] = await Promise.all([sectionTopics(section), officialLines(section)]);
  if (!topics.length) throw new Error(`Make the ${section} outline first.`);
  const todo = lines.filter((l) => !l.topics.length).slice(0, 60);
  if (!todo.length) return { linked: 0, added: 0 };
  const { text, ids } = outlineText(topics);
  const { glossary } = await CA.getMagazineSettings();
  const fits = parseFit(
    await saathiComplete(apiKey(), fitMessages(section, text, todo, glossary)),
    todo.length,
    ids.length,
  );
  let added = 0;
  const links: { node_id: string; topic_id: string }[] = [];
  for (const f of fits) {
    const node = todo[f.line - 1].id;
    for (const t of f.topics) links.push({ node_id: node, topic_id: ids[t - 1] });
    if (!f.fresh) continue;
    let parent = f.fresh.under ? ids[f.fresh.under - 1] : null;
    const parentTopic = topics.find((t) => t.id === parent);
    if (parentTopic && !childLevel(parentTopic.level)) parent = parentTopic.parent_id;
    if (!parent) {
      parent = await addTopic(
        section,
        null,
        f.fresh.chapter?.en ?? f.fresh.en,
        f.fresh.chapter?.hi ?? f.fresh.hi,
      );
      added++;
      if (!f.fresh.chapter) {
        links.push({ node_id: node, topic_id: parent });
        continue;
      }
    }
    const id = await addTopic(section, parent, f.fresh.en, f.fresh.hi);
    added++;
    links.push({ node_id: node, topic_id: id });
  }
  if (links.length)
    fail(
      (
        await from("syllabus_links").upsert(links as never, {
          onConflict: "node_id,topic_id",
          ignoreDuplicates: true,
        })
      ).error,
    );
  return { linked: new Set(links.map((l) => l.node_id)).size, added };
}

// ---------- Editing ----------

export async function addTopic(
  section: string,
  parent: string | null,
  name_en: string,
  name_hi: string,
): Promise<string> {
  let level: Level = "chapter";
  if (parent) {
    const { data, error } = await from("master_topics").select("level").eq("id", parent).single();
    fail(error);
    const next = childLevel((data as unknown as { level: Level }).level);
    if (!next) throw new Error("A subtopic can't have topics under it.");
    level = next;
  }
  const siblings = childrenOf(await sectionTopics(section), parent);
  const { data, error } = await from("master_topics")
    .insert({
      section,
      parent_id: parent,
      level,
      position: (siblings.at(-1)?.position ?? -1) + 1,
      name_en: name_en.replace(/\s+/g, " ").trim().slice(0, 160),
      name_hi: name_hi.replace(/\s+/g, " ").trim().slice(0, 160),
    } as never)
    .select("id")
    .single();
  if (missing(error)) throw new Error(OUTLINES_NOT_READY);
  fail(error);
  return (data as unknown as { id: string }).id;
}

export async function updateTopic(id: string, patch: { name_en?: string; name_hi?: string }) {
  const row: Record<string, unknown> = { updated_at: now() };
  if (patch.name_en !== undefined)
    row.name_en = patch.name_en.replace(/\s+/g, " ").trim().slice(0, 160);
  if (patch.name_hi !== undefined)
    row.name_hi = patch.name_hi.replace(/\s+/g, " ").trim().slice(0, 160);
  fail(
    (
      await from("master_topics")
        .update(row as never)
        .eq("id", id)
    ).error,
  );
}

export async function deleteTopic(id: string) {
  fail((await from("master_topics").delete().eq("id", id)).error);
}

// One place up (-1) or down (1) among its siblings.
export async function moveTopic(id: string, dir: -1 | 1) {
  const { data, error } = await from("master_topics")
    .select("id,section,parent_id,position")
    .eq("id", id)
    .single();
  fail(error);
  const t = data as unknown as MasterTopic;
  const siblings = childrenOf(await sectionTopics(t.section), t.parent_id);
  const i = siblings.findIndex((s) => s.id === id);
  const j = i + dir;
  if (j < 0 || j >= siblings.length) return;
  // Numbered again in the new order (positions may have gaps or ties).
  const order = siblings.map((s) => s.id);
  [order[i], order[j]] = [order[j], order[i]];
  for (let k = 0; k < order.length; k++)
    fail(
      (
        await from("master_topics")
          .update({ position: k } as never)
          .eq("id", order[k])
      ).error,
    );
}

export async function setLink(node: string, topic: string, on: boolean) {
  if (on)
    fail(
      (
        await from("syllabus_links").upsert({ node_id: node, topic_id: topic } as never, {
          onConflict: "node_id,topic_id",
          ignoreDuplicates: true,
        })
      ).error,
    );
  else
    fail((await from("syllabus_links").delete().eq("node_id", node).eq("topic_id", topic)).error);
}

// For an exam's syllabus page: each line's topics (names), when the
// outlines exist.
export async function linksForExam(
  examId: string,
): Promise<Record<string, { id: string; name_en: string; section: string }[]>> {
  const { data: nodes } = await from("syllabus_nodes").select("id").eq("exam_id", examId);
  const ids = ((nodes ?? []) as { id: string }[]).map((n) => n.id);
  const out: Record<string, { id: string; name_en: string; section: string }[]> = {};
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await from("syllabus_links")
      .select("node_id,topic:master_topics(id,name_en,section)")
      .in("node_id", ids.slice(i, i + 200));
    if (missing(error)) return {};
    fail(error);
    for (const r of (data ?? []) as unknown as {
      node_id: string;
      topic: { id: string; name_en: string; section: string } | null;
    }[])
      if (r.topic) out[r.node_id] = [...(out[r.node_id] ?? []), r.topic];
  }
  return out;
}

// Topics' names, for the questions filed under them.
export async function topicNames(
  ids: string[],
): Promise<Record<string, { name_en: string; name_hi: string; section: string }>> {
  const out: Record<string, { name_en: string; name_hi: string; section: string }> = {};
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await from("master_topics")
      .select("id,name_en,name_hi,section")
      .in("id", ids.slice(i, i + 200));
    if (error) return out;
    for (const t of (data ?? []) as {
      id: string;
      name_en: string;
      name_hi: string;
      section: string;
    }[])
      out[t.id] = { name_en: t.name_en, name_hi: t.name_hi, section: t.section };
  }
  return out;
}
