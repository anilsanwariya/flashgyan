// Exam weights: which exams the magazine prepares students for and how much
// each matters. Saved papers are grouped by exam ("RAS Pre 2023" and "RAS
// Pre 2021" are one exam); each exam's current affairs questions per section,
// weighted by the editor's choice, make the exam profile that story picking,
// the practice set and the coverage meter use. Pure helpers, shared by the
// server, the admin pages and tests.
import { CATEGORIES } from "@/lib/current-affairs";

export const WEIGHTS = [
  { id: 0, label: "Skip" },
  { id: 1, label: "Low" },
  { id: 2, label: "Medium" },
  { id: 3, label: "High" },
] as const;
export type Weight = 0 | 1 | 2 | 3;
// An exam the editor hasn't weighed counts as low.
export const DEFAULT_WEIGHT: Weight = 1;

export const weightLabel = (w: number) =>
  WEIGHTS.find((x) => x.id === w)?.label ?? WEIGHTS[DEFAULT_WEIGHT].label;

// "RAS Pre 2023 (Shift 1)" → "RAS Pre": the exam without its year, shift or
// paper number.
export function examFamily(name: string): string {
  return (
    name
      .replace(/\([^)]*\)/g, " ")
      .replace(/\b(19|20)\d{2}(\s*[-–/]\s*\d{2,4})?\b/g, " ")
      .replace(/\b(shift|paper|set|series)\s*[-:]?\s*[\dA-Za-z]{1,3}\b/gi, " ")
      .replace(/[\s,.:–-]+$/g, "")
      .replace(/\s+/g, " ")
      .trim() || name.trim()
  );
}

export type ExamFamily = {
  family: string;
  weight: Weight;
  papers: number;
  // Current affairs questions, and those per section.
  questions: number;
  sections: Record<string, number>;
};
export type ExamProfile = {
  at: string;
  families: ExamFamily[];
  // Each section's share (%) of the weighted current affairs questions.
  shares: Record<string, number>;
  // The editor has weighed at least one exam.
  set: boolean;
};

export const weightOf = (weights: Record<string, number> | undefined, family: string): Weight => {
  const w = weights?.[family];
  return w === 0 || w === 1 || w === 2 || w === 3 ? w : DEFAULT_WEIGHT;
};

// Each exam's section mix counts by its weight (an exam with many papers
// doesn't outweigh one with few: each exam's own shares are used).
export function weightedShares(families: ExamFamily[]): Record<string, number> {
  const sum: Record<string, number> = {};
  let total = 0;
  for (const f of families) {
    if (!f.weight || !f.questions) continue;
    const sorted = Object.values(f.sections).reduce((a, b) => a + b, 0);
    if (!sorted) continue;
    for (const [s, n] of Object.entries(f.sections)) {
      sum[s] = (sum[s] ?? 0) + (f.weight * n) / sorted;
    }
    total += f.weight;
  }
  const out: Record<string, number> = {};
  for (const [s, v] of Object.entries(sum)) out[s] = Math.round((v / total) * 1000) / 10;
  return out;
}

// For the coverage meter: the weighted shares as question counts, out of the
// questions of the exams that count.
export function weightedAsked(families: ExamFamily[]): Record<string, number> {
  const shares = weightedShares(families);
  const n = families
    .filter((f) => f.weight)
    .reduce((a, f) => a + Object.values(f.sections).reduce((x, y) => x + y, 0), 0);
  const out: Record<string, number> = {};
  for (const [s, p] of Object.entries(shares)) out[s] = Math.round((p / 100) * n * 10) / 10;
  return out;
}

const sectionName = (id: string) => CATEGORIES.find((c) => c.id === id)?.en ?? id;

// The lines added to how stories are picked and questions set; "" until the
// editor has weighed the exams.
export function focusText(p: ExamProfile | null): string {
  if (!p?.set) return "";
  const exams = p.families
    .filter((f) => f.weight)
    .sort((a, b) => b.weight - a.weight || b.papers - a.papers)
    .map((f) => `${f.family} (${weightLabel(f.weight).toLowerCase()})`);
  if (!exams.length) return "";
  const top = Object.entries(p.shares)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([s, v]) => `${sectionName(s)} ${Math.round(v)}%`);
  return `The magazine prepares students for these exams, by weight: ${exams.join(", ")}.${
    top.length
      ? ` In their papers, current affairs questions come most from: ${top.join(", ")}; news of those sections deserves more importance.`
      : ""
  }`;
}
