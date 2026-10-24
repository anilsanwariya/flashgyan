// Server-only syllabus library: exams' official syllabi read from their PDFs
// a page at a time (English and Hindi paired), the scheme of examination,
// and editing the lines.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { saathiComplete, type SaathiImage } from "../../supabase/functions/_shared/saathi-core.ts";
import {
  contextOf,
  examTitle,
  joinCut,
  NODE_KINDS,
  normalizeScheme,
  pageMessages,
  parsePage,
  parseScheme,
  schemeMessages,
  type NodeKind,
  type Stage,
  type SyllabusExam,
  type SyllabusNode,
} from "@/lib/syllabus";
import { subjectSection } from "@/lib/exam-papers";

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
  !!e && /syllabus_exams|syllabus_nodes|schema cache/.test(e.message);
export const SYLLABUS_NOT_READY =
  "The syllabus library needs a database update: run the latest migration (syllabus) in Lovable or the SQL editor.";

const readExam = (r: unknown): SyllabusExam => {
  const e = r as SyllabusExam;
  return { ...e, scheme: normalizeScheme(e.scheme) };
};

async function loadExam(id: string): Promise<SyllabusExam> {
  const { data, error } = await from("syllabus_exams").select("*").eq("id", id).single();
  if (missing(error)) throw new Error(SYLLABUS_NOT_READY);
  fail(error);
  return readExam(data);
}

async function loadNodes(examId: string): Promise<SyllabusNode[]> {
  const { data, error } = await from("syllabus_nodes")
    .select("id,exam_id,position,kind,text_en,text_hi,section,marks,page")
    .eq("exam_id", examId)
    .order("position");
  fail(error);
  return (data ?? []) as unknown as SyllabusNode[];
}

export type SyllabusSummary = SyllabusExam & {
  lines: number;
  headings: number;
  unsorted: number;
  sections: Record<string, number>;
};

export async function listSyllabi(): Promise<{ ready: boolean; exams: SyllabusSummary[] }> {
  const { data, error } = await from("syllabus_exams")
    .select("*")
    .order("name")
    .order("stage", { ascending: false });
  if (missing(error)) return { ready: false, exams: [] };
  fail(error);
  const exams = ((data ?? []) as unknown[]).map(readExam);
  const stats = new Map(
    exams.map((e) => [
      e.id,
      { lines: 0, headings: 0, unsorted: 0, sections: {} as Record<string, number> },
    ]),
  );
  for (let at = 0; exams.length; at += 1000) {
    const { data: rows, error: nErr } = await from("syllabus_nodes")
      .select("exam_id,kind,section")
      .order("id")
      .range(at, at + 999);
    fail(nErr);
    for (const r of (rows ?? []) as { exam_id: string; kind: NodeKind; section: string }[]) {
      const s = stats.get(r.exam_id);
      if (!s) continue;
      if (r.kind === "line") {
        s.lines++;
        if (!r.section) s.unsorted++;
        else s.sections[r.section] = (s.sections[r.section] ?? 0) + 1;
      } else s.headings++;
    }
    if ((rows ?? []).length < 1000) break;
  }
  return { ready: true, exams: exams.map((e) => ({ ...e, ...stats.get(e.id)! })) };
}

export async function createSyllabus(input: {
  name: string;
  body: string;
  stage: Stage;
  notified_on: string | null;
  pages: number;
}): Promise<SyllabusExam> {
  const { data, error } = await from("syllabus_exams")
    .insert({
      name: input.name.trim().slice(0, 120),
      body: input.body.trim().slice(0, 60),
      stage: input.stage,
      notified_on: input.notified_on,
      pages: input.pages,
    } as never)
    .select("*")
    .single();
  if (missing(error)) throw new Error(SYLLABUS_NOT_READY);
  fail(error);
  return readExam(data);
}

export async function getSyllabus(
  id: string,
): Promise<{ exam: SyllabusExam; nodes: SyllabusNode[] }> {
  const exam = await loadExam(id);
  return { exam, nodes: await loadNodes(id) };
}

// One page read: the English page (its text, or an image for a scan) and
// the Hindi page (an image), paired line by line and added after what was
// read before. A point cut across pages is joined.
export async function readSyllabusPage(
  id: string,
  page: number,
  pages: number,
  input: { enText?: string | null; enImage?: SaathiImage | null; hiImage?: SaathiImage | null },
): Promise<{ added: number }> {
  const exam = await loadExam(id);
  const nodes = await loadNodes(id);
  const images = [input.enImage, input.hiImage].filter((x): x is SaathiImage => !!x);
  if (!images.length && !input.enText) throw new Error("Nothing to read on this page.");
  const rows = parsePage(
    await saathiComplete(
      apiKey(),
      pageMessages({
        exam: examTitle(exam),
        page,
        pages,
        enText: input.enText ?? null,
        hasEnImage: !!input.enImage,
        hasHiImage: !!input.hiImage,
        context: contextOf(nodes),
      }),
      undefined,
      images,
    ),
  );
  const last = nodes[nodes.length - 1];
  let fresh = rows;
  if (rows[0]?.cont && last) {
    fail(
      (
        await from("syllabus_nodes")
          .update({
            text_en: joinCut(last.text_en, rows[0].en),
            text_hi: joinCut(last.text_hi, rows[0].hi),
            updated_at: now(),
          } as never)
          .eq("id", last.id)
      ).error,
    );
    fresh = rows.slice(1);
  }
  const start = (last?.position ?? -1) + 1;
  if (fresh.length)
    fail(
      (
        await from("syllabus_nodes").insert(
          fresh.map((r, i) => ({
            exam_id: id,
            position: start + i,
            kind: r.kind,
            text_en: r.en,
            text_hi: r.hi,
            section: r.section,
            marks: r.marks,
            page,
          })) as never,
        )
      ).error,
    );
  fail(
    (
      await from("syllabus_exams")
        .update({
          pages,
          pages_done: Math.max(exam.pages_done, page),
          error: null,
          updated_at: now(),
        } as never)
        .eq("id", id)
    ).error,
  );
  return { added: fresh.length };
}

// The scheme of examination from its text (its own PDF, or the syllabus's
// first page).
export async function readSyllabusScheme(id: string, text: string) {
  const exam = await loadExam(id);
  const scheme = parseScheme(await saathiComplete(apiKey(), schemeMessages(text, examTitle(exam))));
  if (!scheme) throw new Error("The scheme couldn't be read: try again.");
  fail(
    (
      await from("syllabus_exams")
        .update({ scheme, updated_at: now() } as never)
        .eq("id", id)
    ).error,
  );
  return scheme;
}

export async function updateSyllabusExam(
  id: string,
  patch: Partial<Pick<SyllabusExam, "name" | "body" | "stage" | "notified_on" | "status">>,
) {
  const row: Record<string, unknown> = { updated_at: now() };
  if (patch.name !== undefined) row.name = patch.name.trim().slice(0, 120);
  if (patch.body !== undefined) row.body = patch.body.trim().slice(0, 60);
  if (patch.stage !== undefined) row.stage = patch.stage;
  if (patch.notified_on !== undefined) row.notified_on = patch.notified_on;
  if (patch.status !== undefined) row.status = patch.status;
  fail(
    (
      await from("syllabus_exams")
        .update(row as never)
        .eq("id", id)
    ).error,
  );
  return loadExam(id);
}

export async function deleteSyllabus(id: string) {
  fail((await from("syllabus_exams").delete().eq("id", id)).error);
}

// Every line removed, to read the PDFs again from the first page.
export async function resetSyllabus(id: string) {
  fail((await from("syllabus_nodes").delete().eq("exam_id", id)).error);
  fail(
    (
      await from("syllabus_exams")
        .update({ pages_done: 0, status: "draft", error: null, updated_at: now() } as never)
        .eq("id", id)
    ).error,
  );
}

type NodePatch = Partial<Pick<SyllabusNode, "kind" | "text_en" | "text_hi" | "section" | "marks">>;
const cleanPatch = (p: NodePatch) => {
  const row: Record<string, unknown> = {};
  if (p.kind !== undefined && (NODE_KINDS as readonly string[]).includes(p.kind)) row.kind = p.kind;
  if (p.text_en !== undefined) row.text_en = p.text_en.replace(/\s+/g, " ").trim().slice(0, 2000);
  if (p.text_hi !== undefined) row.text_hi = p.text_hi.replace(/\s+/g, " ").trim().slice(0, 2000);
  if (p.section !== undefined) row.section = subjectSection(p.section);
  if (p.marks !== undefined) row.marks = p.marks;
  return row;
};

export async function updateSyllabusNode(id: string, patch: NodePatch) {
  fail(
    (
      await from("syllabus_nodes")
        .update({ ...cleanPatch(patch), updated_at: now() } as never)
        .eq("id", id)
    ).error,
  );
}

// A new item after another (or first), the ones after it moved down.
export async function addSyllabusNode(examId: string, afterId: string | null, patch: NodePatch) {
  const nodes = await loadNodes(examId);
  const at = afterId ? nodes.findIndex((n) => n.id === afterId) + 1 : 0;
  const after = nodes.slice(at);
  // Moved from the end, so no two share a place on the way.
  for (const n of [...after].reverse())
    fail(
      (
        await from("syllabus_nodes")
          .update({ position: n.position + 1 } as never)
          .eq("id", n.id)
      ).error,
    );
  const prev = nodes[at - 1];
  const { data, error } = await from("syllabus_nodes")
    .insert({
      exam_id: examId,
      position: prev ? prev.position + 1 : 0,
      kind: "line",
      section: prev?.section ?? "",
      page: prev?.page ?? null,
      ...cleanPatch(patch),
    } as never)
    .select("id")
    .single();
  fail(error);
  return (data as unknown as { id: string }).id;
}

export async function deleteSyllabusNode(id: string) {
  fail((await from("syllabus_nodes").delete().eq("id", id)).error);
}
