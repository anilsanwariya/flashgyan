// Exam papers (RPSC, RSSB…), saved exam by exam with their answer keys.
// Pure helpers shared by the server and the admin page: the Excel layout,
// reading a question paper's page (AI prompt and parser), reading an answer
// key, and the prompts for checking a paper against the magazine.

type ChatMessage = { role: "system" | "user"; content: string };
export type Bi = { en: string; hi: string };

export type ExamPaper = {
  id: string;
  exam: string;
  subject: string;
  conducted_by: string;
  exam_date: string | null;
  paper_code: string;
  questions_total: number | null;
  source: "pdf" | "excel";
  pages: number;
  pages_done: number;
  key_added: boolean;
  checked_at: string | null;
  lessons: string[];
  error: string | null;
  created_at: string;
  updated_at: string;
};

export type ExamQuestion = {
  id: string;
  paper_id: string;
  q_no: number;
  question_en: string;
  question_hi: string;
  extra_en: string;
  extra_hi: string;
  options: Bi[];
  correct: number | null;
  deleted: boolean;
  ca: boolean | null;
  matched_item: string | null;
  match: "covered" | "low" | "missed" | null;
  match_note: string | null;
};

// A question as read (from a page, or a row of Excel), before it is saved.
export type QuestionDraft = {
  q_no: number;
  question_en: string;
  question_hi: string;
  extra_en: string;
  extra_hi: string;
  options: Bi[];
  correct?: number | null;
  deleted?: boolean;
};

export const OPTION_COUNT = 4;

const str = (v: unknown, max = 4000) =>
  typeof v === "string" ? v.replace(/\r/g, "").trim().slice(0, max) : "";
const hasDevanagari = (s: string) => /[ऀ-ॿ]/.test(s);

function parseJson<T>(raw: string): T | null {
  const text = raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  const start = text.search(/[[{]/);
  if (start < 0) return null;
  try {
    return JSON.parse(text.slice(start)) as T;
  } catch {
    return null;
  }
}

// ---------- Excel ----------

// The columns of an exported (or imported) paper, one sheet per language.
export const EXCEL_COLUMNS = [
  "Exam name",
  "Subject",
  "Question No.",
  "Question",
  "Other part of question",
  "Option 1",
  "Option 2",
  "Option 3",
  "Option 4",
  "Correct Option No.",
] as const;

// The rows of one language's sheet. A question the key deleted says
// "Deleted"; one without a key, nothing.
export function questionsToRows(
  paper: Pick<ExamPaper, "exam" | "subject">,
  questions: Pick<
    ExamQuestion,
    | "q_no"
    | "question_en"
    | "question_hi"
    | "extra_en"
    | "extra_hi"
    | "options"
    | "correct"
    | "deleted"
  >[],
  lang: "en" | "hi",
): Record<(typeof EXCEL_COLUMNS)[number], string | number>[] {
  return [...questions]
    .sort((a, b) => a.q_no - b.q_no)
    .map((q) => {
      const opt = (i: number) => q.options[i]?.[lang] ?? "";
      return {
        "Exam name": paper.exam,
        Subject: paper.subject,
        "Question No.": q.q_no,
        Question: lang === "hi" ? q.question_hi : q.question_en,
        "Other part of question": lang === "hi" ? q.extra_hi : q.extra_en,
        "Option 1": opt(0),
        "Option 2": opt(1),
        "Option 3": opt(2),
        "Option 4": opt(3),
        "Correct Option No.": q.deleted ? "Deleted" : (q.correct ?? ""),
      };
    });
}

// A header's column, ignoring case, spaces, dots and brackets.
const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const COLUMN_KEYS: Record<string, (typeof EXCEL_COLUMNS)[number]> = Object.fromEntries(
  EXCEL_COLUMNS.map((c) => [key(c), c]),
);
// Other headings people use for the same columns.
Object.assign(COLUMN_KEYS, {
  exam: "Exam name",
  examname: "Exam name",
  qno: "Question No.",
  questionno: "Question No.",
  questionnumber: "Question No.",
  sno: "Question No.",
  otherpart: "Other part of question",
  statements: "Other part of question",
  correctoption: "Correct Option No.",
  correctoptionno: "Correct Option No.",
  answer: "Correct Option No.",
  correctanswer: "Correct Option No.",
  key: "Correct Option No.",
});

export type ImportedPaper = { exam: string; subject: string; questions: QuestionDraft[] };

// Papers from a workbook's sheets (in the columns above; one sheet per
// language, or both languages' rows in one sheet). A sheet named Hindi (or
// a row in Devanagari) gives the Hindi text; rows of the same exam, subject
// and question number make one question.
export function rowsToPapers(
  sheets: { name: string; rows: Record<string, unknown>[] }[],
  fallback: { exam: string; subject: string },
): ImportedPaper[] {
  const papers = new Map<string, ImportedPaper>();
  for (const sheet of sheets) {
    const sheetLang: "en" | "hi" | null = /hindi|हिंदी|हिन्दी/i.test(sheet.name)
      ? "hi"
      : /english|अंग्रेज़ी|अंग्रेजी/i.test(sheet.name)
        ? "en"
        : null;
    for (const raw of sheet.rows) {
      const row: Partial<Record<(typeof EXCEL_COLUMNS)[number], string>> = {};
      for (const [h, v] of Object.entries(raw)) {
        const col = COLUMN_KEYS[key(h)];
        if (col) row[col] = String(v ?? "").trim();
      }
      const qNo = Number(String(row["Question No."] ?? "").replace(/[^\d]/g, ""));
      const question = row.Question ?? "";
      if (!Number.isInteger(qNo) || qNo < 1 || !question) continue;
      const exam = row["Exam name"] || fallback.exam;
      const subject = row.Subject || fallback.subject;
      if (!exam) continue;
      const lang = sheetLang ?? (hasDevanagari(question) ? "hi" : "en");
      const id = `${exam}\u0000${subject}`;
      const paper = papers.get(id) ?? { exam, subject, questions: [] };
      papers.set(id, paper);
      let q = paper.questions.find((x) => x.q_no === qNo);
      if (!q) {
        q = {
          q_no: qNo,
          question_en: "",
          question_hi: "",
          extra_en: "",
          extra_hi: "",
          options: Array.from({ length: OPTION_COUNT }, () => ({ en: "", hi: "" })),
        };
        paper.questions.push(q);
      }
      q[lang === "hi" ? "question_hi" : "question_en"] = question;
      q[lang === "hi" ? "extra_hi" : "extra_en"] = row["Other part of question"] ?? "";
      for (let i = 0; i < OPTION_COUNT; i++) {
        const text = row[`Option ${i + 1}` as (typeof EXCEL_COLUMNS)[number]] ?? "";
        if (text) q.options[i][lang] = text;
      }
      const ans = (row["Correct Option No."] ?? "").trim();
      if (/^(deleted|delete|\*|विलोपित)$/i.test(ans)) q.deleted = true;
      else if (/^[1-4]$/.test(ans)) q.correct = Number(ans);
    }
  }
  return [...papers.values()].map((p) => ({
    ...p,
    questions: p.questions.sort((a, b) => a.q_no - b.q_no),
  }));
}

// ---------- Reading a question paper's page (AI) ----------

export function pageMessages(page: number, pages: number): ChatMessage[] {
  return [
    {
      role: "system",
      content: `You read pages of Indian competitive exam question papers (RPSC, RSSB and similar) into data. A paper is usually bilingual: each question appears in Hindi and in English (often Hindi in the left column and English in the right, each with its own question number). For every question on this page, give its number, its question text in English and in Hindi, its other part in each language (statements, List I and List II of a match-the-following, assertion and reason, codes — keep each on its own line), and its four options in each language, in order. Leave out option 5 when it only says "Question not attempted" / "अनुत्तरित प्रश्न". Copy the text exactly as printed (fix only broken line breaks); keep every number, name and symbol. A question cut off at the top or bottom of the page: give the part on this page with "partial": true. Leave out instructions, headers and page numbers.
On the cover page (instructions, no questions), give the paper's details instead: the exam, subject, paper code and number of questions as printed.
Reply with JSON only: {"paper": {"exam": "...", "subject": "...", "paper_code": "...", "questions": number} or null, "questions": [{"n": number, "en": {"question": "...", "extra": "...", "options": ["...", "...", "...", "..."]}, "hi": {"question": "...", "extra": "...", "options": ["...", "...", "...", "..."]}, "partial": false}]}`,
    },
    {
      role: "user",
      content: `Page ${page} of ${pages}.`,
    },
  ];
}

export type PageRead = {
  paper: { exam: string; subject: string; paper_code: string; questions: number | null } | null;
  questions: QuestionDraft[];
};

export function parsePage(raw: string): PageRead {
  const o = parseJson<Record<string, unknown>>(raw);
  if (!o || typeof o !== "object" || Array.isArray(o)) return { paper: null, questions: [] };
  const p = (o.paper ?? null) as Record<string, unknown> | null;
  const paper =
    p && typeof p === "object"
      ? {
          exam: str(p.exam, 200),
          subject: str(p.subject, 200),
          paper_code: str(p.paper_code, 60),
          questions:
            Number.isInteger(Number(p.questions)) && Number(p.questions) > 0
              ? Number(p.questions)
              : null,
        }
      : null;
  const side = (v: unknown) => {
    const s = (v ?? {}) as Record<string, unknown>;
    const options = (Array.isArray(s.options) ? s.options : [])
      .map((x) => str(x, 1000))
      .filter((x) => !/^(question not attempted|अनुत्तरित प्रश्न)$/i.test(x))
      .slice(0, OPTION_COUNT);
    return { question: str(s.question), extra: str(s.extra), options };
  };
  const questions = (Array.isArray(o.questions) ? o.questions : [])
    .map((x) => {
      const q = (x ?? {}) as Record<string, unknown>;
      const n = Number(q.n);
      if (!Number.isInteger(n) || n < 1 || n > 1000) return null;
      const en = side(q.en);
      const hi = side(q.hi);
      if (!en.question && !hi.question && !en.options.length && !hi.options.length) return null;
      return {
        q_no: n,
        question_en: en.question,
        question_hi: hi.question,
        extra_en: en.extra,
        extra_hi: hi.extra,
        options: Array.from({ length: OPTION_COUNT }, (_, i) => ({
          en: en.options[i] ?? "",
          hi: hi.options[i] ?? "",
        })),
      };
    })
    .filter((q): q is QuestionDraft => q !== null);
  return { paper, questions };
}

// A question read again (the rest of a question cut off at a page's end, or
// its other language): what was empty is filled in, longer text is kept.
export function mergeQuestion<T extends QuestionDraft>(had: T, fresh: QuestionDraft): T {
  const pickText = (a: string, b: string) => (b.length > a.length ? b : a);
  return {
    ...had,
    question_en: pickText(had.question_en, fresh.question_en),
    question_hi: pickText(had.question_hi, fresh.question_hi),
    extra_en: pickText(had.extra_en, fresh.extra_en),
    extra_hi: pickText(had.extra_hi, fresh.extra_hi),
    options: Array.from({ length: OPTION_COUNT }, (_, i) => ({
      en: had.options[i]?.en || fresh.options[i]?.en || "",
      hi: had.options[i]?.hi || fresh.options[i]?.hi || "",
    })),
  };
}

// What is still missing in a question (for the editor to check).
export function questionGaps(q: QuestionDraft): string[] {
  const gaps: string[] = [];
  if (!q.question_en) gaps.push("English question");
  if (!q.question_hi) gaps.push("Hindi question");
  const missing = q.options.filter((o) => !o.en || !o.hi).length;
  if (q.options.length < OPTION_COUNT || missing) gaps.push("options");
  return gaps;
}

// ---------- The answer key ----------

export type KeyEntry = { q_no: number; correct: number | null; deleted: boolean };

// A key printed as a table ("Q. No. RES" columns side by side, "*" for a
// deleted question): each line's numbers in pairs. Lines that aren't pairs
// (titles, dates) are left out.
export function parseKeyText(text: string): KeyEntry[] {
  const out = new Map<number, KeyEntry>();
  for (const line of text.split(/\n+/)) {
    if (/[a-z]{3,}/i.test(line.replace(/deleted|delete/gi, ""))) continue;
    const tokens = line.match(/\d+|\*/g) ?? [];
    if (tokens.length < 2 || tokens.length % 2) continue;
    const pairs: KeyEntry[] = [];
    let ok = true;
    for (let i = 0; i < tokens.length; i += 2) {
      const q = Number(tokens[i]);
      const a = tokens[i + 1];
      if (!Number.isInteger(q) || q < 1 || q > 1000) ok = false;
      else if (a === "*") pairs.push({ q_no: q, correct: null, deleted: true });
      else if (/^[1-4]$/.test(a)) pairs.push({ q_no: q, correct: Number(a), deleted: false });
      else ok = false;
    }
    if (ok) for (const p of pairs) out.set(p.q_no, p);
  }
  return [...out.values()].sort((a, b) => a.q_no - b.q_no);
}

// A key that is only an image (a scan or a photo): the AI reads it.
export function keyImageMessages(): ChatMessage[] {
  return [
    {
      role: "system",
      content: `This is an exam's answer key. Read every question number and its correct option (1 to 4). A question marked deleted ("*", "Deleted", "विलोपित") has "deleted": true.
Reply with JSON only: [{"n": question number, "answer": 1-4 or null, "deleted": false}]`,
    },
    { role: "user", content: "Read the answer key." },
  ];
}

export function parseKeyJson(raw: string): KeyEntry[] {
  const list = parseJson<unknown[]>(raw);
  if (!Array.isArray(list)) return [];
  const out = new Map<number, KeyEntry>();
  for (const x of list) {
    const o = (x ?? {}) as Record<string, unknown>;
    const n = Number(o.n);
    if (!Number.isInteger(n) || n < 1 || n > 1000) continue;
    const a = Number(o.answer ?? o.correct);
    if (o.deleted === true) out.set(n, { q_no: n, correct: null, deleted: true });
    else if (a >= 1 && a <= 4 && Number.isInteger(a))
      out.set(n, { q_no: n, correct: a, deleted: false });
  }
  return [...out.values()].sort((a, b) => a.q_no - b.q_no);
}

// A key that is an Excel sheet ("Question No." and "Correct Option No."
// columns, or the first two columns).
export function keyFromRows(rows: Record<string, unknown>[]): KeyEntry[] {
  const text = rows
    .map((r) => {
      const entries = Object.entries(r);
      const find = (col: string) =>
        entries.find(([h]) => COLUMN_KEYS[key(h)] === col)?.[1] ?? undefined;
      const q = find("Question No.") ?? entries[0]?.[1];
      const a = find("Correct Option No.") ?? entries[1]?.[1];
      const ans = String(a ?? "").trim();
      return `${String(q ?? "").trim()} ${/^(deleted|delete|विलोपित)$/i.test(ans) ? "*" : ans}`;
    })
    .join("\n");
  return parseKeyText(text);
}

// ---------- Checking a paper against the magazine ----------

// Which questions are on current affairs (news of the 18 months before the
// exam) rather than static syllabus, with words to find the story by.
export function classifyMessages(
  questions: { n: number; text: string }[],
  examDate: string | null,
): ChatMessage[] {
  return [
    {
      role: "system",
      content: `You sort the questions of an Indian competitive exam paper (RPSC/RSSB pattern) for a current affairs magazine. A question is current affairs when it asks about news of the 18 months before the exam${examDate ? ` (held on ${examDate})` : ""}: a scheme launched or changed, an appointment, award, report or index, an event, a sports result, a new policy or law, a place or person in the news, recent data. Static syllabus (history, geography, polity basics, science concepts) is not, even if a recent event mentions it.
For each current affairs question, give English search words naming the news it is about (5 to 15 words).
Reply with JSON only: [{"n": question number, "ca": true or false, "search": "..." (current affairs only)}]`,
    },
    {
      role: "user",
      content: questions.map((q) => `${q.n}. ${q.text}`).join("\n\n"),
    },
  ];
}

export function parseClassify(
  raw: string,
  nums: number[],
): Map<number, { ca: boolean; search: string }> {
  const list = parseJson<unknown[]>(raw);
  const out = new Map<number, { ca: boolean; search: string }>();
  if (!Array.isArray(list)) return out;
  for (const x of list) {
    const o = (x ?? {}) as Record<string, unknown>;
    const n = Number(o.n);
    if (!nums.includes(n)) continue;
    const ca = o.ca === true;
    out.set(n, { ca, search: ca ? str(o.search, 300) : "" });
  }
  return out;
}

// Does one of our stories give the answer to the question?
export function storyMatchMessages(
  question: string,
  answer: string | null,
  stories: { date: string; headline: string; facts: string[] }[],
): ChatMessage[] {
  return [
    {
      role: "system",
      content: `You check whether a current affairs magazine covered an exam question. A story covers it when a student who read the story could answer the question (it has the fact asked, or the news with the answer in it).
Reply with JSON only: {"story": the number of the story that covers it, or 0 if none does, "note": "a few words on what the story had or lacked"}`,
    },
    {
      role: "user",
      content: `Question: ${question}${answer ? `\nCorrect answer: ${answer}` : ""}\n\nStories:\n${stories
        .map((s, i) => `${i + 1}. (${s.date}) ${s.headline} — ${s.facts.slice(0, 6).join("; ")}`)
        .join("\n")}`,
    },
  ];
}

export function parseStoryMatch(raw: string, count: number): { index: number; note: string } {
  const o = parseJson<Record<string, unknown>>(raw) ?? {};
  const n = Number(o.story);
  return {
    index: Number.isInteger(n) && n >= 1 && n <= count ? n - 1 : -1,
    note: str(o.note, 300),
  };
}

// Lessons for picking stories, from the questions the magazine missed or
// rated low.
export function lessonsMessages(
  missed: { question: string; note: string; kind: "missed" | "low" }[],
): ChatMessage[] {
  return [
    {
      role: "system",
      content: `You improve how a current affairs magazine for Rajasthan competitive exams (RPSC/RSSB) picks its news. These exam questions were on current affairs the magazine missed, or had but left out or rated low. Write 3 to 6 short rules for the editor's AI that picks stories from newspapers, so news like this is kept next time (name the kind of news and the facts to keep, e.g. "Keep district-level awards to Rajasthan officials, with the district and the award's name"). General rules, not about these particular events.
Reply with JSON only: ["rule", ...]`,
    },
    {
      role: "user",
      content: missed
        .map(
          (m, i) =>
            `${i + 1}. [${m.kind === "missed" ? "missed" : "left out / rated low"}] ${m.question}${m.note ? ` (${m.note})` : ""}`,
        )
        .join("\n"),
    },
  ];
}

export function parseLessons(raw: string): string[] {
  const list = parseJson<unknown[]>(raw);
  return (Array.isArray(list) ? list : [])
    .map((x) => str(x, 300))
    .filter(Boolean)
    .slice(0, 6);
}
