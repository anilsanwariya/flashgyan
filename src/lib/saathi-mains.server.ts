// Server-only SAATHI answer writing: analysing model answers, rebuilding
// blueprints from them, and writing or scoring answers for the admin tools.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  cleanHistory,
  collectSources,
  saathiComplete,
  saathiEmbed,
  stripNoAnswer,
  type SaathiRpc,
  type SaathiSource,
} from "../../supabase/functions/_shared/saathi-core.ts";
import {
  MIN_BLUEPRINT_SAMPLES,
  aggregateAnalyses,
  analysisMessages,
  countWords,
  defaultGuide,
  defaultWordLimit,
  detectDirective,
  fallbackTips,
  judgeMessages,
  mainsInfo,
  mainsMessages,
  mainsNoMaterialReply,
  parseAnalysis,
  parseJudge,
  parseTips,
  renderBlueprintGuide,
  saathiMainsPlan,
  tipsMessages,
  type AnswerAnalysis,
  type BlueprintDirective,
  type BlueprintStats,
  type MainsDirective,
  type MainsInfo,
  type MainsScore,
} from "../../supabase/functions/_shared/saathi-mains.ts";

export const rpc: SaathiRpc = (fn, args) => supabaseAdmin.rpc(fn as never, args as never);

// The generated types don't know these tables yet.
const from = (table: string) => supabaseAdmin.from(table as never);

function apiKey(): string {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY is not configured");
  return key;
}

export type ModelAnswer = {
  id: string;
  question: string;
  answer: string;
  marks: number;
  directive: MainsDirective;
  exam: string;
  year: number | null;
  paper: string | null;
  subject: string | null;
  source: string | null;
  holdout: boolean;
  word_count: number;
  analysis: AnswerAnalysis | null;
  analysis_error: string | null;
  created_at: string;
  updated_at: string;
};

export const MODEL_ANSWER_COLS =
  "id,question,answer,marks,directive,exam,year,paper,subject,source,holdout,word_count,analysis,analysis_error,created_at,updated_at";

export type Blueprint = {
  id: string;
  marks: number;
  directive: BlueprintDirective;
  version: number;
  status: "active" | "draft" | "archived";
  locked: boolean;
  guide: string;
  stats: BlueprintStats | null;
  tips: string[];
  sample_count: number;
  answer_ids: string[];
  created_at: string;
};

export async function wordLimitFor(marks: number): Promise<number> {
  const { data } = await from("saathi_answer_formats")
    .select("word_limit")
    .eq("marks", marks)
    .maybeSingle();
  return (data as { word_limit: number } | null)?.word_limit ?? defaultWordLimit(marks);
}

// Reads a model answer's structure and embeds its question. The answer is saved
// either way; a failed analysis is recorded so it can be retried.
// With adoptDirective, the question type the AI read replaces the one guessed
// from the question's wording (used when the admin didn't pick one).
export async function analyseModelAnswer(id: string, adoptDirective = false): Promise<ModelAnswer> {
  const { data, error } = await from("saathi_model_answers")
    .select(MODEL_ANSWER_COLS)
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  const row = data as unknown as ModelAnswer;
  const key = apiKey();

  const [embedding, analysisResult] = await Promise.all([
    saathiEmbed(key, row.question),
    saathiComplete(key, analysisMessages(row.question, row.answer, row.marks)).then(
      (raw) => ({ raw, error: null as string | null }),
      (e: unknown) => ({ raw: "", error: e instanceof Error ? e.message : String(e) }),
    ),
  ]);
  const analysis = analysisResult.error
    ? null
    : parseAnalysis(analysisResult.raw, row.answer, row.directive);
  const update = {
    embedding: embedding as unknown as string,
    word_count: countWords(row.answer),
    ...(adoptDirective && analysis ? { directive: analysis.directive } : {}),
    analysis,
    analysis_error: analysis
      ? null
      : (analysisResult.error ?? "The AI's reply could not be read. Try again."),
    updated_at: new Date().toISOString(),
  };
  const { data: saved, error: uErr } = await from("saathi_model_answers")
    .update(update as never)
    .eq("id", id)
    .select(MODEL_ANSWER_COLS)
    .single();
  if (uErr) throw new Error(uErr.message);
  return saved as unknown as ModelAnswer;
}

export type ModelAnswerInput = {
  question: string;
  answer: string;
  marks: number;
  directive?: MainsDirective | null;
  year?: number | null;
  paper?: string | null;
  subject?: string | null;
  source?: string | null;
  holdout?: boolean;
};

export async function saveModelAnswer(input: ModelAnswerInput & { id?: string }) {
  const row = {
    question: input.question.trim(),
    answer: input.answer.trim(),
    marks: input.marks,
    directive: input.directive ?? detectDirective(input.question) ?? "explain",
    year: input.year ?? null,
    paper: input.paper?.trim() || null,
    subject: input.subject?.trim() || null,
    source: input.source?.trim() || null,
    holdout: input.holdout ?? false,
    word_count: countWords(input.answer),
    updated_at: new Date().toISOString(),
  };
  if (input.id) {
    const { data: before, error: bErr } = await from("saathi_model_answers")
      .select("question,answer,marks")
      .eq("id", input.id)
      .single();
    if (bErr) throw new Error(bErr.message);
    const prev = before as { question: string; answer: string; marks: number };
    const { error } = await from("saathi_model_answers")
      .update(row as never)
      .eq("id", input.id);
    if (error) throw new Error(error.message);
    // Only re-read the answer when its text or marks changed.
    const changed =
      prev.question !== row.question || prev.answer !== row.answer || prev.marks !== row.marks;
    if (changed) {
      return { answer: await analyseModelAnswer(input.id, !input.directive), oldMarks: prev.marks };
    }
    const { data, error: rErr } = await from("saathi_model_answers")
      .select(MODEL_ANSWER_COLS)
      .eq("id", input.id)
      .single();
    if (rErr) throw new Error(rErr.message);
    return { answer: data as unknown as ModelAnswer, oldMarks: prev.marks };
  }
  const { data, error } = await from("saathi_model_answers")
    .insert(row as never)
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const id = (data as { id: string }).id;
  return { answer: await analyseModelAnswer(id, !input.directive), oldMarks: null };
}

const sameIds = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().join() === [...b].sort().join();

async function mergeTips(strengths: string[]): Promise<string[]> {
  if (strengths.length === 0) return [];
  try {
    const tips = parseTips(await saathiComplete(apiKey(), tipsMessages(strengths.slice(0, 120))));
    return tips.length ? tips : fallbackTips(strengths);
  } catch {
    return fallbackTips(strengths);
  }
}

// Makes `next` the active version of its blueprint.
async function activate(next: Blueprint) {
  const { error: aErr } = await from("saathi_blueprints")
    .update({ status: "archived" } as never)
    .eq("marks", next.marks)
    .eq("directive", next.directive)
    .eq("status", "active")
    .neq("id", next.id);
  if (aErr) throw new Error(aErr.message);
  const { error } = await from("saathi_blueprints")
    .update({ status: "active" } as never)
    .eq("id", next.id);
  if (error) throw new Error(error.message);
}

async function blueprintVersions(marks: number, directive: BlueprintDirective) {
  const { data, error } = await from("saathi_blueprints")
    .select("*")
    .eq("marks", marks)
    .eq("directive", directive)
    .order("version", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Blueprint[];
}

async function insertBlueprint(
  row: Omit<Blueprint, "id" | "created_at" | "version" | "status">,
  makeActive: boolean,
): Promise<Blueprint> {
  const versions = await blueprintVersions(row.marks, row.directive);
  const version = (versions[0]?.version ?? 0) + 1;
  // Older drafts are replaced by the new version.
  const drafts = versions.filter((v) => v.status === "draft").map((v) => v.id);
  if (drafts.length) {
    await from("saathi_blueprints")
      .update({ status: "archived" } as never)
      .in("id", drafts);
  }
  const { data, error } = await from("saathi_blueprints")
    .insert({ ...row, version, status: "draft" } as never)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  const created = data as unknown as Blueprint;
  if (makeActive) {
    await activate(created);
    created.status = "active";
  }
  return created;
}

export type RebuildResult = {
  marks: number;
  directive: BlueprintDirective;
  outcome: "created" | "draft" | "unchanged" | "too_few" | "retired";
  version?: number;
  samples: number;
};

// Rebuilds the blueprints of one marks band from its analysed model answers:
// one for all question types together ('any') and one per question type with
// enough answers. Nothing changes when the set of answers is the same, unless
// forced (e.g. after a word limit change). A blueprint an admin edited (locked)
// is never replaced: the rebuilt version is saved as a draft to review.
export async function rebuildBlueprints(marks: number, force = false): Promise<RebuildResult[]> {
  const { data, error } = await from("saathi_model_answers")
    .select("id,directive,analysis")
    .eq("marks", marks)
    .eq("holdout", false)
    .not("analysis", "is", null);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as {
    id: string;
    directive: MainsDirective;
    analysis: AnswerAnalysis;
  }[];
  const wordLimit = await wordLimitFor(marks);

  const groups = new Map<BlueprintDirective, typeof rows>([["any", rows]]);
  for (const r of rows) {
    const list = groups.get(r.directive) ?? [];
    list.push(r);
    groups.set(r.directive, list);
  }
  // Question types that had a blueprint before but may now have too few answers.
  const { data: existing } = await from("saathi_blueprints")
    .select("directive")
    .eq("marks", marks)
    .eq("status", "active");
  for (const e of (existing ?? []) as { directive: BlueprintDirective }[]) {
    if (!groups.has(e.directive)) groups.set(e.directive, []);
  }

  const results: RebuildResult[] = [];
  for (const [directive, list] of groups) {
    const versions = await blueprintVersions(marks, directive);
    const active = versions.find((v) => v.status === "active");
    const ids = list.map((r) => r.id);
    if (list.length < MIN_BLUEPRINT_SAMPLES) {
      // A learned blueprint whose answers were removed stops being used.
      if (active && !active.locked) {
        await from("saathi_blueprints")
          .update({ status: "archived" } as never)
          .eq("id", active.id);
        results.push({ marks, directive, outcome: "retired", samples: list.length });
      } else {
        results.push({ marks, directive, outcome: "too_few", samples: list.length });
      }
      continue;
    }
    const latest = versions[0];
    if (!force && latest && !latest.locked && sameIds(latest.answer_ids, ids)) {
      results.push({ marks, directive, outcome: "unchanged", samples: list.length });
      continue;
    }
    const analyses = list.map((r) => r.analysis);
    const stats = aggregateAnalyses(analyses);
    const tips = await mergeTips(analyses.flatMap((a) => a.strengths));
    const guide = renderBlueprintGuide({ marks, wordLimit, directive, stats, tips });
    const makeActive = !active?.locked;
    const created = await insertBlueprint(
      {
        marks,
        directive,
        locked: false,
        guide,
        stats,
        tips,
        sample_count: list.length,
        answer_ids: ids,
      },
      makeActive,
    );
    results.push({
      marks,
      directive,
      outcome: makeActive ? "created" : "draft",
      version: created.version,
      samples: list.length,
    });
  }
  return results;
}

// An admin's own wording: saved as a new locked version and made active.
export async function editBlueprintGuide(id: string, guide: string): Promise<Blueprint> {
  const { data, error } = await from("saathi_blueprints").select("*").eq("id", id).single();
  if (error) throw new Error(error.message);
  const base = data as unknown as Blueprint;
  return insertBlueprint(
    {
      marks: base.marks,
      directive: base.directive,
      locked: true,
      guide,
      stats: base.stats,
      tips: base.tips,
      sample_count: base.sample_count,
      answer_ids: base.answer_ids,
    },
    true,
  );
}

// Starts a blueprint by hand for a marks band or question type with no answers yet.
export async function createManualBlueprint(
  marks: number,
  directive: BlueprintDirective,
  guide: string | null,
): Promise<Blueprint> {
  const text = guide?.trim() || defaultGuide(marks, await wordLimitFor(marks));
  return insertBlueprint(
    {
      marks,
      directive,
      locked: true,
      guide: text,
      stats: null,
      tips: [],
      sample_count: 0,
      answer_ids: [],
    },
    true,
  );
}

export async function activateBlueprint(id: string) {
  const { data, error } = await from("saathi_blueprints").select("*").eq("id", id).single();
  if (error) throw new Error(error.message);
  await activate(data as unknown as Blueprint);
}

// ---------- Writing and scoring answers (admin tools) ----------

export type WrittenAnswer = {
  answer: string;
  noAnswer: boolean;
  info: MainsInfo;
  guide: string;
  blueprintId: string | null;
  exemplars: { question: string; year: number | null; paper: string | null }[];
  sources: SaathiSource[];
};

export async function writeMainsAnswer(opts: {
  question: string;
  marks: number | null;
  subjects: string[];
  excludeAnswerId?: string;
}): Promise<WrittenAnswer> {
  const key = apiKey();
  const plan = await saathiMainsPlan({
    apiKey: key,
    rpc,
    history: cleanHistory([]),
    question: opts.question,
    subjects: opts.subjects,
    marks: opts.marks,
    excludeAnswerId: opts.excludeAnswerId,
  });
  const guide = plan.blueprint?.guide ?? defaultGuide(plan.marks, plan.wordLimit);
  const base = {
    guide,
    blueprintId: plan.blueprint?.id ?? null,
    exemplars: plan.exemplars.map((e) => ({ question: e.question, year: e.year, paper: e.paper })),
  };
  if (plan.matches.length === 0) {
    return {
      ...base,
      answer: mainsNoMaterialReply(opts.question),
      noAnswer: true,
      info: mainsInfo(plan),
      sources: [],
    };
  }
  const raw = await saathiComplete(
    key,
    mainsMessages({ channel: "web", history: [], question: opts.question, plan }),
  );
  const parsed = stripNoAnswer(raw);
  const text = parsed.text.trim();
  return {
    ...base,
    answer: text || mainsNoMaterialReply(opts.question),
    noAnswer: parsed.noAnswer || !text,
    info: mainsInfo(plan, text),
    sources: parsed.noAnswer ? [] : collectSources(plan.matches),
  };
}

export type BlueprintScore = {
  id: string;
  answer_id: string;
  blueprint_id: string | null;
  generated: string;
  word_count: number;
  scores: MainsScore;
  total: number;
  created_at: string;
};

// Writes SAATHI's answer to a held-out question (its own model answer is never
// used as an example) and has the AI mark it against the model answer.
export async function scoreModelAnswer(answerId: string): Promise<BlueprintScore> {
  const { data, error } = await from("saathi_model_answers")
    .select(MODEL_ANSWER_COLS)
    .eq("id", answerId)
    .single();
  if (error) throw new Error(error.message);
  const model = data as unknown as ModelAnswer;
  // Answers that taught the blueprint would mark SAATHI against its own examples.
  if (!model.holdout) throw new Error("Only answers kept aside for testing can be scored.");
  const written = await writeMainsAnswer({
    question: model.question,
    marks: model.marks,
    subjects: [],
    excludeAnswerId: model.id,
  });
  let scores: MainsScore | null = null;
  const words = written.noAnswer ? 0 : countWords(written.answer);
  if (written.noAnswer) {
    scores = {
      structure: 0,
      coverage: 0,
      specificity: 0,
      presentation: 0,
      length: 0,
      total: 0,
      feedback: "SAATHI found no study material for this question.",
    };
  } else {
    const raw = await saathiComplete(
      apiKey(),
      judgeMessages({
        question: model.question,
        marks: model.marks,
        wordLimit: written.info.wordLimit,
        modelAnswer: model.answer,
        answer: written.answer,
      }),
    );
    scores = parseJudge(raw, words, written.info.wordLimit);
    if (!scores) throw new Error("The AI's marking could not be read. Please try again.");
  }
  const { data: saved, error: sErr } = await from("saathi_blueprint_scores")
    .insert({
      answer_id: model.id,
      blueprint_id: written.blueprintId,
      generated: written.answer,
      word_count: words,
      scores,
      total: scores.total,
    } as never)
    .select("*")
    .single();
  if (sErr) throw new Error(sErr.message);
  return saved as unknown as BlueprintScore;
}
