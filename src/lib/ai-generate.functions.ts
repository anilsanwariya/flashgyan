// Server functions that turn parsed PDF markdown into flashcards / MCQs
// using the Gemini API. Output rows exactly match the shape our existing
// Excel importer produces, so the same bulk-import path is reused.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

const SYSTEM_PROMPT = `You are an expert item-writer for Indian competitive state exams (RAS, REET, PSI, Patwari, LDC, and similar).
Your job is to transform the given study material into rigorous, high-quality ACTIVE-RECALL items.

Hard rules:
1. Language & fidelity:
   - Preserve the source language exactly. If a fact is in Hindi (Devanagari), keep it in Hindi. If English, keep it in English. Bilingual source → produce bilingual items where natural.
   - For Hindi, strictly preserve grammar, spelling, matras, and idioms. Never transliterate or "translate" Hindi to English silently.
   - Preserve श्रुतिसम भिन्नार्थक शब्द pairs / near-homophone word pairs verbatim (e.g., अभिराम / अविराम, अन्न / अन्य). Never merge or "correct" them.
2. Exam relevance:
   - Focus on facts, dates, definitions, formulas, causal links, comparisons, and named entities that are testable in objective exams.
   - Prefer specific, unambiguous items over vague / opinion-based ones. Skip filler / marketing / narrative fluff from the source.
3. Fabrication ban:
   - Use ONLY information present in the source. If the source lacks the answer, do not invent it — skip that item.
4. Output:
   - Return STRICT JSON matching the given schema. No prose, no markdown fences.`;

const FLASHCARD_USER_INSTRUCTIONS = `Produce flashcards suitable for daily active recall.

Per card:
- "prompt": a short cue (max ~60 chars) — a term, name, date, or hint. This is what the user sees on the front.
- "question": a full, self-contained recall question expanded from the prompt.
- "answer": the correct, concise, fact-checked answer.
- "explanations": 0–3 optional short sections that give context, mnemonics, or comparisons. Each has "title" (2–4 words, e.g. "Context", "Related", "Mnemonic", "श्रुतिसम पेयर") and "body".

Aim for ${"${count}"} well-formed cards. Skip items you cannot confidently answer from the source.`;

const MCQ_USER_INSTRUCTIONS = `Produce single-correct-answer MCQs suitable for objective exams.

Per question:
- "question": stem, self-contained, unambiguous.
- "question_ext": OPTIONAL extended context (case, passage snippet, or clarification). Empty string if not needed.
- "options": EXACTLY 4 distinct plausible options. Distractors must be believable, not throwaway.
- "answer": integer 1–4, index of the correct option.
- "explanations": 0–3 short sections explaining why the answer is correct (title + body). Include a "श्रुतिसम पेयर" or "Related" section when the item hinges on a near-homophone or commonly-confused pair.

Aim for ${"${count}"} MCQs. Skip anything the source does not clearly support.`;

const flashcardSchema = {
  type: "OBJECT",
  properties: {
    cards: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          prompt: { type: "STRING" },
          question: { type: "STRING" },
          answer: { type: "STRING" },
          explanations: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                title: { type: "STRING" },
                body: { type: "STRING" },
              },
              required: ["title", "body"],
            },
          },
        },
        required: ["prompt", "question", "answer"],
      },
    },
  },
  required: ["cards"],
} as const;

const mcqSchema = {
  type: "OBJECT",
  properties: {
    questions: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          question: { type: "STRING" },
          question_ext: { type: "STRING" },
          options: { type: "ARRAY", items: { type: "STRING" } },
          answer: { type: "INTEGER" },
          explanations: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                title: { type: "STRING" },
                body: { type: "STRING" },
              },
              required: ["title", "body"],
            },
          },
        },
        required: ["question", "options", "answer"],
      },
    },
  },
  required: ["questions"],
} as const;

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin role required");
}

async function callGemini(
  markdown: string,
  userInstructions: string,
  responseSchema: unknown,
) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");
  // Cap the input to keep the request safe (~ well under 1M-token context).
  const truncated = markdown.length > 200_000 ? markdown.slice(0, 200_000) : markdown;
  const body = {
    system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [
      {
        role: "user",
        parts: [
          { text: userInstructions },
          { text: "\n---\nSOURCE MATERIAL (markdown):\n\n" + truncated },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema,
      temperature: 0.4,
    },
  };
  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Gemini failed (${res.status}): ${txt.slice(0, 500)}`);
  }
  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text.trim()) throw new Error("Gemini returned empty output");
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Gemini returned non-JSON output");
  }
}

// ---------- Flashcards ----------

export type GeneratedFcRow = {
  order_index: number;
  prompt: string;
  question: string;
  answer: string;
  sections: { title: string; body: string }[];
};

export const generateFlashcardsFromMarkdown = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        markdown: z.string().min(20),
        count: z.number().int().min(1).max(80).default(25),
        startOrder: z.number().int().default(1),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ rows: GeneratedFcRow[] }> => {
    await assertAdmin(context.userId);
    const instructions = FLASHCARD_USER_INSTRUCTIONS.replace("${count}", String(data.count));
    const parsed = await callGemini(data.markdown, instructions, flashcardSchema);
    const raw = Array.isArray(parsed?.cards) ? parsed.cards : [];
    const rows: GeneratedFcRow[] = [];
    let ord = data.startOrder;
    for (const c of raw) {
      const prompt = String(c?.prompt ?? "").trim();
      const question = String(c?.question ?? "").trim();
      const answer = String(c?.answer ?? "").trim();
      if (!prompt || !question || !answer) continue;
      const sections = Array.isArray(c?.explanations)
        ? c.explanations
            .map((s: { title?: unknown; body?: unknown }) => ({
              title: String(s?.title ?? "").trim(),
              body: String(s?.body ?? "").trim(),
            }))
            .filter((s: { title: string; body: string }) => s.title && s.body)
        : [];
      rows.push({ order_index: ord++, prompt, question, answer, sections });
    }
    if (rows.length === 0) throw new Error("Gemini did not produce any usable cards");
    return { rows };
  });

// ---------- MCQs ----------

export type GeneratedMcqRow = {
  order_index: number;
  question: string;
  question_ext: string;
  option_1: string;
  option_2: string;
  option_3: string;
  option_4: string;
  answer: number;
  explanation_sections: { title: string; body: string }[];
};

export const generateMcqsFromMarkdown = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        markdown: z.string().min(20),
        count: z.number().int().min(1).max(80).default(20),
        startOrder: z.number().int().default(1),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ rows: GeneratedMcqRow[] }> => {
    await assertAdmin(context.userId);
    const instructions = MCQ_USER_INSTRUCTIONS.replace("${count}", String(data.count));
    const parsed = await callGemini(data.markdown, instructions, mcqSchema);
    const raw = Array.isArray(parsed?.questions) ? parsed.questions : [];
    const rows: GeneratedMcqRow[] = [];
    let ord = data.startOrder;
    for (const q of raw) {
      const question = String(q?.question ?? "").trim();
      const opts: string[] = Array.isArray(q?.options)
        ? (q.options as unknown[]).map((o) => String(o ?? "").trim())
        : [];
      if (!question || opts.length !== 4 || opts.some((o) => !o)) continue;
      const answer = Number(q?.answer);
      if (!Number.isInteger(answer) || answer < 1 || answer > 4) continue;
      const sections = Array.isArray(q?.explanations)
        ? q.explanations
            .map((s: { title?: unknown; body?: unknown }) => ({
              title: String(s?.title ?? "").trim(),
              body: String(s?.body ?? "").trim(),
            }))
            .filter((s: { title: string; body: string }) => s.title && s.body)
        : [];
      rows.push({
        order_index: ord++,
        question,
        question_ext: String(q?.question_ext ?? "").trim(),
        option_1: opts[0],
        option_2: opts[1],
        option_3: opts[2],
        option_4: opts[3],
        answer,
        explanation_sections: sections,
      });
    }
    if (rows.length === 0) throw new Error("Gemini did not produce any usable questions");
    return { rows };
  });
