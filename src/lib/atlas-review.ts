// Keeping the atlas complete (pure): each district's checklist of steps, a
// notes file matched to its district (for importing many at once), and
// the gap report's numbers.
import { ATLAS_GROUPS, DISTRICT_ALIASES, atlasCat } from "@/lib/atlas";

// ---------- The district checklist ----------

export type ChecklistRow = {
  district: string;
  name_hi: string;
  places: number;
  facts: number;
  factsToCheck: number;
  placesAiHindi: number;
  factsAiHindi: number;
  meta: { division: boolean; zone: boolean; neighbours: boolean };
  sections: number;
  // Sections with their text in each language.
  en: number;
  hi: number;
  checked: string | null;
  openChecks: number;
  status: "draft" | "published";
  job: { kind: string; done: number; total: number; error: string | null } | null;
};

export const STEPS = [
  { key: "atlas", name: "Atlas data", hint: "division, zone, neighbours and at least 10 places" },
  { key: "notes", name: "Notes imported", hint: "the overview page has its sections" },
  { key: "both", name: "Hindi and English", hint: "every section in both languages" },
  { key: "checked", name: "Fact-checked", hint: "checked against the atlas and the books" },
  { key: "notes-done", name: "Check notes settled", hint: "no fact-check note left open" },
  { key: "published", name: "Published", hint: "students can read it" },
] as const;
export type StepKey = (typeof STEPS)[number]["key"];

export function districtSteps(r: ChecklistRow): Record<StepKey, boolean> {
  const notes = r.sections > 0;
  return {
    atlas: r.meta.division && r.meta.zone && r.meta.neighbours && r.places >= 10,
    notes,
    both: notes && r.en === r.sections && r.hi === r.sections,
    checked: notes && !!r.checked,
    "notes-done": notes && !!r.checked && r.openChecks === 0,
    published: r.status === "published",
  };
}
export const nextStep = (r: ChecklistRow): StepKey | null => {
  const s = districtSteps(r);
  return STEPS.find((x) => !s[x.key])?.key ?? null;
};

// ---------- A notes file's district ----------

// Hindi when most of its letters are Devanagari.
export function notesLang(text: string): "hi" | "en" {
  const hi = (text.match(/[ऀ-ॿ]/g) ?? []).length;
  const en = (text.match(/[A-Za-z]/g) ?? []).length;
  return hi > en ? "hi" : "en";
}

// The district a notes file is about: its name in the file name and the
// title count most, then how often the opening names it.
export function guessDistrict(
  fileName: string,
  text: string,
  districts: { en: string; hi: string }[],
  // The notes as text (without the page's styles and scripts).
  plain?: string,
): { district: string | null; sure: boolean; scores: { district: string; score: number }[] } {
  const names = new Map<string, string[]>();
  for (const d of districts) names.set(d.en, [d.en, d.hi]);
  for (const [alias, en] of Object.entries(DISTRICT_ALIASES)) names.get(en)?.push(alias);
  const count = (hay: string, n: string) => {
    if (!n) return 0;
    if (/[ऀ-ॿ]/.test(n)) return hay.split(n).length - 1;
    const re = new RegExp(
      `(^|[^A-Za-z])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^A-Za-z]|$)`,
      "gi",
    );
    return (hay.match(re) ?? []).length;
  };
  const file = fileName.replace(/[_-]+/g, " ");
  const title =
    /<title[^>]*>([\s\S]*?)<\/title>/i.exec(text)?.[1] ??
    /^#\s*(.*)$/m.exec(text)?.[1] ??
    text.slice(0, 200);
  const opening = (plain ?? text.replace(/<[^>]+>/g, " ")).slice(0, 4000);
  const scores = [...names]
    .map(([district, ns]) => ({
      district,
      score: ns.reduce(
        (s, n) => s + count(file, n) * 20 + count(title, n) * 10 + Math.min(count(opening, n), 15),
        0,
      ),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  const [a, b] = scores;
  return {
    district: a?.district ?? null,
    // Sure: clearly ahead of the next, and named in the file name or title.
    sure: !!a && a.score >= 10 && (!b || a.score >= b.score * 2),
    scores: scores.slice(0, 5),
  };
}

// ---------- Gaps ----------

// Places per district and group: [district][group] = count.
export function groupMatrix(
  places: { district: string; cat: string }[],
  districts: string[],
): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const d of districts) out[d] = Object.fromEntries(ATLAS_GROUPS.map((g) => [g.key, 0]));
  for (const p of places) {
    const row = out[p.district];
    if (!row) continue;
    const g = atlasCat(p.cat).group;
    row[g] = (row[g] ?? 0) + 1;
  }
  return out;
}

// Districts far below the others: fewer than half the median.
export function thin(counts: Record<string, number>): string[] {
  const v = Object.values(counts).sort((a, b) => a - b);
  if (!v.length) return [];
  const median = v[Math.floor(v.length / 2)];
  return Object.entries(counts)
    .filter(([, n]) => n < median / 2)
    .sort((a, b) => a[1] - b[1])
    .map(([d]) => d);
}

// Whether a section (any JSON with { en, hi } texts) is written in a
// language: nearly every text it has is there in that language.
export function inLanguage(v: unknown, lang: "en" | "hi"): boolean {
  let all = 0;
  let has = 0;
  const walk = (x: unknown) => {
    if (Array.isArray(x)) return x.forEach(walk);
    if (!x || typeof x !== "object") return;
    const o = x as Record<string, unknown>;
    if (typeof o.en === "string" || typeof o.hi === "string") {
      const en = String(o.en ?? "").trim();
      const hi = String(o.hi ?? "").trim();
      if (en || hi) {
        all++;
        if ((lang === "en" ? en : hi) !== "") has++;
      }
      return;
    }
    Object.values(o).forEach(walk);
  };
  walk(v);
  return all > 0 && has / all >= 0.95;
}
