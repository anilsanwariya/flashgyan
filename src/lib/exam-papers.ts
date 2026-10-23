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
  // The booklet series (A, B, C, D), when the key has several.
  series: string;
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
On the cover page (instructions, no questions), give the paper's details instead: the exam, subject, paper code, booklet series (the set letter, e.g. "Series A" / "प्रश्न-पुस्तिका सीरीज A", or "" if none) and number of questions as printed.
Reply with JSON only: {"paper": {"exam": "...", "subject": "...", "paper_code": "...", "series": "A", "questions": number} or null, "questions": [{"n": number, "en": {"question": "...", "extra": "...", "options": ["...", "...", "...", "..."]}, "hi": {"question": "...", "extra": "...", "options": ["...", "...", "...", "..."]}, "partial": false}]}`,
    },
    {
      role: "user",
      content: `Page ${page} of ${pages}.`,
    },
  ];
}

export type PageRead = {
  paper: {
    exam: string;
    subject: string;
    paper_code: string;
    series: string;
    questions: number | null;
  } | null;
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
          series: /^[A-H]$/.test(normSeries(str(p.series, 20)))
            ? normSeries(str(p.series, 20))
            : "",
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

// A key can cover several booklet series (A, B, C, D: the same questions in
// another order). Its answers, by each series' question numbers; a plain key
// has one list under "".
export type KeySheet = { series: string[]; answers: Record<string, KeyEntry[]> };

// A series as written on a paper or a key: "B", "Series B", "set b" -> "B".
export function normSeries(v: string): string {
  const t = v.trim().toUpperCase();
  return /^(?:SERIES|SET|BOOKLET|सीरीज|सेट)?[\s.:-]*([A-H])$/.exec(t)?.[1] ?? t.slice(0, 10);
}

type Col = "Q" | "ANS" | string;

// A header line's columns ("Q. No. RES Q. No. RES", "A B C D Ans A B C D Ans",
// "Q.No A B C D"), or null when the line isn't a header.
function headerColumns(line: string, single = false): Col[] | null {
  const t = line
    .replace(
      /(?:question|q)\s*\.?\s*(?:no|number)\s*\.?|प्रश्न\s*(?:सं|संख्या)\.?|s\.?\s*no\.?/gi,
      " Q ",
    )
    .replace(
      /\b(?:answers?|ans|res(?:ult)?|key|correct(?:\s+option)?(?:\s+no\.?)?)\b\.?|उत्तर/gi,
      " ANS ",
    )
    .replace(/\b(?:set|series|booklet)\s*[-:]?\s*([A-H])\b/gi, " $1 ")
    .trim();
  const cols = t.split(/\s+/);
  if (!cols.every((c) => c === "Q" || c === "ANS" || /^[A-H]$/i.test(c))) return null;
  // A line of a table needs a question or answer column; an Excel column
  // heading can be a series alone.
  if (!single && (cols.length < 2 || (!cols.includes("Q") && !cols.includes("ANS")))) return null;
  return cols.map((c) => (c === "Q" || c === "ANS" ? c : c.toUpperCase()));
}

// The repeating group of a header ("A B C D Ans" twice -> one group of 5).
function headerGroup(cols: Col[]): Col[] {
  for (let n = 1; n <= cols.length; n++)
    if (cols.length % n === 0 && cols.every((c, i) => c === cols[i % n])) return cols.slice(0, n);
  return cols;
}

const answerOf = (a: string): Omit<KeyEntry, "q_no"> | null =>
  a === "*"
    ? { correct: null, deleted: true }
    : /^[1-4]$/.test(a)
      ? { correct: Number(a), deleted: false }
      : null;
const questionNo = (v: string) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 1000 ? n : null;
};

// A key printed as a table, "*" for a deleted question. The header says how
// to read the rows:
// - "Q. No. RES" (side by side): question, answer;
// - "A B C D Ans": one question's number in each series, then its answer;
// - "Q.No A B C D": a question, then its answer in each series.
// Without a header, each line's numbers are read in pairs. Lines that aren't
// rows (titles, dates) are left out.
export function parseKeySheet(text: string): KeySheet & { problems: string[] } {
  const maps = new Map<string, Map<number, KeyEntry>>();
  const put = (series: string, e: KeyEntry) => {
    const m = maps.get(series) ?? new Map<number, KeyEntry>();
    maps.set(series, m);
    m.set(e.q_no, e);
  };
  const problems: string[] = [];
  const twice = new Set<string>();
  let group: Col[] = ["Q", "ANS"];
  let perLine = Infinity;
  for (const line of text.split(/\n+/)) {
    const cols = headerColumns(line);
    if (cols) {
      group = headerGroup(cols);
      perLine = cols.length;
      continue;
    }
    if (/[a-z]{3,}|\p{Script=Devanagari}{2,}/iu.test(line.replace(/deleted|delete/gi, "")))
      continue;
    const tokens = line.match(/\d+|\*/g) ?? [];
    const size = group.length;
    if (tokens.length < size || tokens.length % size || tokens.length > perLine) continue;
    const rows: [string, KeyEntry][] = [];
    let ok = true;
    for (let i = 0; i < tokens.length && ok; i += size) {
      const g = tokens.slice(i, i + size);
      const ansAt = group.indexOf("ANS");
      const qAt = group.indexOf("Q");
      if (ansAt >= 0) {
        // One answer: for the question numbered in each series' column (or
        // in the Q column of a plain key).
        const a = answerOf(g[ansAt]);
        if (!a) ok = false;
        group.forEach((c, j) => {
          if (c === "ANS" || !a) return;
          const n = questionNo(g[j]);
          if (n === null) ok = false;
          else rows.push([c === "Q" ? "" : c, { q_no: n, ...a }]);
        });
      } else if (qAt >= 0) {
        // A question, then its answer in each series.
        const n = questionNo(g[qAt]);
        if (n === null) ok = false;
        group.forEach((c, j) => {
          if (c === "Q" || n === null) return;
          const a = answerOf(g[j]);
          if (!a) ok = false;
          else rows.push([c, { q_no: n, ...a }]);
        });
      } else ok = false;
    }
    if (!ok) continue;
    for (const [series, e] of rows) {
      if (maps.get(series)?.has(e.q_no))
        twice.add(`${series ? `series ${series} ` : ""}Q${e.q_no}`);
      put(series, e);
    }
  }
  if (twice.size)
    problems.push(`given twice: ${[...twice].slice(0, 5).join(", ")}${twice.size > 5 ? "…" : ""}`);
  const series = [...maps.keys()].filter(Boolean).sort();
  // Every series covers the same questions.
  const counts = new Set(series.map((x) => maps.get(x)!.size));
  if (counts.size > 1)
    problems.push(
      `the series don't have the same number of answers (${series.map((x) => `${x}: ${maps.get(x)!.size}`).join(", ")})`,
    );
  const sorted = (m?: Map<number, KeyEntry>) =>
    [...(m?.values() ?? [])].sort((a, b) => a.q_no - b.q_no);
  return {
    series,
    answers: series.length
      ? Object.fromEntries(series.map((x) => [x, sorted(maps.get(x))]))
      : { "": sorted(maps.get("")) },
    problems,
  };
}

// A plain key's answers (a key for several series gives none).
export function parseKeyText(text: string): KeyEntry[] {
  const sheet = parseKeySheet(text);
  return sheet.series.length ? [] : sheet.answers[""];
}

// The answers for a paper of this series. A plain key fits any paper; a key
// for several series needs the paper's series.
export function keyForSeries(sheet: KeySheet, series: string): KeyEntry[] {
  if (!sheet.series.length) return sheet.answers[""] ?? [];
  const s = normSeries(series);
  if (!s)
    throw new Error(
      `This key has answers for series ${sheet.series.join(", ")}. Choose your paper's series first.`,
    );
  if (!sheet.answers[s])
    throw new Error(
      `This key has series ${sheet.series.join(", ")}, not ${s}. Check the paper's series.`,
    );
  return sheet.answers[s];
}

// A key that is only an image (a scan or a photo): the AI reads it, for the
// paper's series when the key has several.
export function keyImageMessages(series = ""): ChatMessage[] {
  const s = normSeries(series);
  return [
    {
      role: "system",
      content: `This is an exam's answer key. Read every question number and its correct option (1 to 4). A question marked deleted ("*", "Deleted", "विलोपित") has "deleted": true.
A key can cover several booklet series (sets A, B, C, D: the same questions in another order). Then list them in "series", and ${
        s
          ? `give the answers by series ${s}'s question numbers: in a table where each row gives one question's number in every series and then its answer, use the number in the ${s} column; in a table with an answer column for each series, use the ${s} column.`
          : `give no answers ("answers": []): the paper's series is needed first.`
      }
Reply with JSON only: {"series": [] or ["A", "B", ...], "answers": [{"n": question number, "answer": 1-4 or null, "deleted": false}]}`,
    },
    { role: "user", content: "Read the answer key." },
  ];
}

const entriesFrom = (list: unknown): KeyEntry[] => {
  const out = new Map<number, KeyEntry>();
  for (const x of Array.isArray(list) ? list : []) {
    const o = (x ?? {}) as Record<string, unknown>;
    const n = Number(o.n);
    if (!Number.isInteger(n) || n < 1 || n > 1000) continue;
    const a = Number(o.answer ?? o.correct);
    if (o.deleted === true) out.set(n, { q_no: n, correct: null, deleted: true });
    else if (a >= 1 && a <= 4 && Number.isInteger(a))
      out.set(n, { q_no: n, correct: a, deleted: false });
  }
  return [...out.values()].sort((a, b) => a.q_no - b.q_no);
};

export function parseKeyJson(raw: string): { series: string[]; entries: KeyEntry[] } {
  const o = parseJson<unknown>(raw);
  if (Array.isArray(o)) return { series: [], entries: entriesFrom(o) };
  const r = (o ?? {}) as Record<string, unknown>;
  const series = (Array.isArray(r.series) ? r.series : [])
    .map((x) => normSeries(String(x)))
    .filter((x) => /^[A-H]$/.test(x));
  return { series: [...new Set(series)], entries: entriesFrom(r.answers) };
}

// A key that is an Excel sheet: the same tables as a printed key, by their
// column headings ("Question No." and "Correct Option No.", "A B C D Ans"…),
// else the first two columns as question and answer.
export function keyFromRows(rows: Record<string, unknown>[]): KeySheet & { problems: string[] } {
  const heads = Object.keys(rows[0] ?? {});
  const cols = heads.map((h) =>
    COLUMN_KEYS[key(h)] === "Question No."
      ? "Q"
      : COLUMN_KEYS[key(h)] === "Correct Option No."
        ? "ANS"
        : (headerColumns(h, true)?.join(" ") ?? null),
  );
  const known = cols.every((c) => c && !c.includes(" "));
  const cell = (v: unknown) => {
    const a = String(v ?? "").trim();
    return /^(deleted|delete|विलोपित)$/i.test(a) ? "*" : a;
  };
  const lines = known
    ? [cols.join(" "), ...rows.map((r) => heads.map((h) => cell(r[h])).join(" "))]
    : ["Q ANS", ...rows.map((r) => Object.values(r).slice(0, 2).map(cell).join(" "))];
  return parseKeySheet(lines.join("\n"));
}

// ---------- Checking a paper against the magazine ----------

// The magazine sections a current affairs question can be about (for the
// coverage meter: how often each section is asked).
export const QUESTION_SECTION_IDS = [
  "rajasthan",
  "national",
  "schemes",
  "international",
  "science",
  "economy",
  "sports",
  "persons",
  "places",
  "misc",
] as const;
const QUESTION_SECTIONS = `"rajasthan" (other Rajasthan news), "national" (India's polity, governance, laws, judgments), "schemes" (a government scheme, policy, or an official report, index or survey), "international", "science" (science, technology, defence, space, health, environment), "economy", "sports", "persons" (an appointment, award or person in the news, outside sports), "places" (a place in the news) or "misc" (days, books, conferences, other)`;
export const questionSection = (v: unknown): string | null =>
  typeof v === "string" && (QUESTION_SECTION_IDS as readonly string[]).includes(v) ? v : null;

// The sections of current affairs questions sorted before sections were
// asked for.
export function sectionMessages(questions: { n: number; text: string }[]): ChatMessage[] {
  return [
    {
      role: "system",
      content: `These are current affairs questions from Indian competitive exam papers (RPSC, RSSB). For each, say which magazine section the news it asks about belongs to: ${QUESTION_SECTIONS}.
Reply with JSON only: [{"n": question number, "section": "..."}]`,
    },
    { role: "user", content: questions.map((q) => `${q.n}. ${q.text}`).join("\n\n") },
  ];
}

export function parseSections(raw: string, nums: number[]): Map<number, string> {
  const list = parseJson<unknown[]>(raw);
  const out = new Map<number, string>();
  for (const x of Array.isArray(list) ? list : []) {
    const o = (x ?? {}) as Record<string, unknown>;
    const n = Number(o.n);
    const sec = questionSection(o.section);
    if (nums.includes(n) && sec) out.set(n, sec);
  }
  return out;
}

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
For each current affairs question, give English search words naming the news it is about (5 to 15 words), and the magazine section the news belongs to: ${QUESTION_SECTIONS}.
Reply with JSON only: [{"n": question number, "ca": true or false, "search": "..." (current affairs only), "section": "..." (current affairs only)}]`,
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
): Map<number, { ca: boolean; search: string; section: string | null }> {
  const list = parseJson<unknown[]>(raw);
  const out = new Map<number, { ca: boolean; search: string; section: string | null }>();
  if (!Array.isArray(list)) return out;
  for (const x of list) {
    const o = (x ?? {}) as Record<string, unknown>;
    const n = Number(o.n);
    if (!nums.includes(n)) continue;
    const ca = o.ca === true;
    out.set(n, {
      ca,
      search: ca ? str(o.search, 300) : "",
      section: ca ? questionSection(o.section) : null,
    });
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
