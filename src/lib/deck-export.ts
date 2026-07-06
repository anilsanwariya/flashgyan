// Export flashcard decks / MCQ tests to XLSX in the exact schema the
// existing bulk importer accepts. Column names must round-trip through
// parseFcWorkbook / parseMcqWorkbook.
import * as XLSX from "xlsx";
import type { Flashcard } from "@/lib/flashcards.functions";
import type { McqQuestion } from "@/lib/mcq.functions";
import type { McqPracticeQuestion } from "@/lib/mcq-practice.functions";

type Section = { title: string; body: string };

// "Hindi Note" -> "explanation_hindi_note" (reverse of titleCase used by the importer).
function sectionTitleToColumn(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "");
  return `explanation_${slug || "note"}`;
}

function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 80) || "deck";
}

function download(wb: XLSX.WorkBook, filename: string) {
  XLSX.writeFile(wb, filename, { bookType: "xlsx" });
}

function collectSectionColumns(all: Section[][]): string[] {
  const seen = new Set<string>();
  const cols: string[] = [];
  for (const list of all) {
    for (const s of list) {
      const col = sectionTitleToColumn(s.title);
      if (!seen.has(col)) {
        seen.add(col);
        cols.push(col);
      }
    }
  }
  return cols;
}

export function exportFlashcardsToXlsx(deckName: string, cards: Flashcard[]) {
  const sectionCols = collectSectionColumns(cards.map((c) => c.sections));
  const rows = cards.map((c) => {
    const row: Record<string, string | number> = {
      order: c.order_index,
      prompt: c.prompt,
      question: c.question,
      answer: c.answer,
    };
    for (const col of sectionCols) row[col] = "";
    for (const s of c.sections) row[sectionTitleToColumn(s.title)] = s.body;
    return row;
  });
  const header = ["order", "prompt", "question", "answer", ...sectionCols];
  const ws = XLSX.utils.json_to_sheet(rows, { header });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Flashcards");
  download(wb, `${sanitizeFilename(deckName)}.xlsx`);
}

export function exportMcqToXlsx(
  testName: string,
  questions: (McqQuestion | McqPracticeQuestion)[],
) {
  const sectionCols = collectSectionColumns(questions.map((q) => q.explanation_sections));
  const rows = questions.map((q) => {
    const row: Record<string, string | number> = {
      order: q.order_index,
      question: q.question,
      question_ext: q.question_ext ?? "",
      option_1: q.option_1,
      option_2: q.option_2,
      option_3: q.option_3,
      option_4: q.option_4,
      answer: q.answer,
    };
    for (const col of sectionCols) row[col] = "";
    for (const s of q.explanation_sections) row[sectionTitleToColumn(s.title)] = s.body;
    return row;
  });
  const header = [
    "order",
    "question",
    "question_ext",
    "option_1",
    "option_2",
    "option_3",
    "option_4",
    "answer",
    ...sectionCols,
  ];
  const ws = XLSX.utils.json_to_sheet(rows, { header });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "MCQs");
  download(wb, `${sanitizeFilename(testName)}.xlsx`);
}
