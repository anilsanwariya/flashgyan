// Exam specials: a custom magazine for one coming exam ("Patwari: the last
// 12 months"), its sections in the order that exam's past papers ask them,
// each with stories in proportion to how much the papers ask from it, the
// best for the exam first (scored as Exam Radar scores them). Picked from
// the daily stories with no AI call; the magazine then works like any other
// custom magazine. Pure helpers, shared by the server, the admin page and
// tests.
import { CATEGORIES } from "@/lib/current-affairs";
import type { ExamFamily } from "@/lib/ca-exam-weights";
import { magPeriod, type MagSection } from "@/lib/ca-mags";
import { radarScore, type RadarStory } from "@/lib/ca-radar";

export const SPECIAL_SIZE = 250;
export const SPECIAL_MIN = 30;
export const SPECIAL_MAX = 600;
// Months back, offered in the form.
export const SPECIAL_MONTHS = [6, 12, 18, 24];

// Each section's share (%) of an exam's current affairs questions; {} when
// its papers have none sorted into sections.
export function familyShares(
  f: Pick<ExamFamily, "sections"> | null | undefined,
): Record<string, number> {
  const total = Object.values(f?.sections ?? {}).reduce((a, b) => a + b, 0);
  const out: Record<string, number> = {};
  if (!total) return out;
  for (const [s, n] of Object.entries(f!.sections)) out[s] = Math.round((n / total) * 1000) / 10;
  return out;
}

// The sections: those the papers ask from, most asked first, then the rest
// in the magazine's own order (editorials left out).
export function specialSections(shares: Record<string, number>): MagSection[] {
  const cats = CATEGORIES.filter((c) => c.id !== "editorial");
  const order = new Map(cats.map((c, i) => [c.id as string, i]));
  return [...cats]
    .sort(
      (a, b) => (shares[b.id] ?? 0) - (shares[a.id] ?? 0) || order.get(a.id)! - order.get(b.id)!,
    )
    .map((c) => ({ id: c.id, en: c.en, hi: c.hi, subs: [] }));
}

export type SpecialStory = RadarStory & { issue_date: string };

// The stories to take and their sections: each section up to its share of
// `size` (best scored first); what's left goes to the best of the rest.
// Without shares, simply the best `size`. In section order, by date.
export function pickSpecial<T extends SpecialStory>(
  stories: T[],
  shares: Record<string, number>,
  size: number,
): { story: T; section: string }[] {
  const sections = specialSections(shares);
  const known = new Set(sections.map((s) => s.id));
  const sectionOf = (s: T) => (known.has(s.category) ? s.category : "misc");
  const scored = stories
    .map((s, i) => ({ s, i, score: radarScore(s, shares) }))
    .sort((a, b) => b.score - a.score || a.i - b.i);
  const taken = new Set<number>();
  const hasShares = Object.values(shares).some((v) => v > 0);
  if (hasShares) {
    for (const sec of sections) {
      const quota = Math.round((size * (shares[sec.id] ?? 0)) / 100);
      let n = 0;
      for (const x of scored) {
        if (n >= quota) break;
        if (taken.has(x.i) || sectionOf(x.s) !== sec.id) continue;
        taken.add(x.i);
        n++;
      }
    }
  }
  for (const x of scored) {
    if (taken.size >= size) break;
    taken.add(x.i);
  }
  const rank = new Map(sections.map((s, i) => [s.id, i]));
  return scored
    .filter((x) => taken.has(x.i))
    .map((x) => ({ story: x.s, section: sectionOf(x.s) }))
    .sort(
      (a, b) =>
        rank.get(a.section)! - rank.get(b.section)! ||
        a.story.issue_date.localeCompare(b.story.issue_date),
    );
}

export function specialTitle(exam: string, from: string, to: string): { en: string; hi: string } {
  return {
    en: `${exam} Special · Current Affairs ${magPeriod(from, to, "en")}`,
    hi: `${exam} विशेषांक · करेंट अफेयर्स ${magPeriod(from, to, "hi")}`,
  };
}

// The theme, for the magazine card and for sorting stories added later.
export function specialTheme(exam: string, shares: Record<string, number>): string {
  const top = Object.entries(shares)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([s, v]) => `${CATEGORIES.find((c) => c.id === s)?.en ?? s} ${Math.round(v)}%`);
  return `Current affairs most likely to be asked in ${exam}: important national, Rajasthan and international news, schemes, reports, appointments, awards, sports and science.${
    top.length ? ` Its papers ask most from ${top.join(", ")}.` : ""
  }`;
}

// From `months` back to `today`.
export function monthsBack(today: string, months: number): string {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - months);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
