// Practice from the Rajasthan atlas: multiple-choice questions made from the
// atlas (a place's district with neighbouring districts as the wrong
// options, a district's division and agro-climatic zone), the notes' own
// question-and-answer pairs (their wrong options written by the AI), and
// flashcards from the notes' revision cards. Pure: the same questions come
// out every time for the same atlas (shuffles are seeded by the question).
import {
  AGRO_ZONES,
  ATLAS_GROUPS,
  ATLAS_SUBJECTS,
  DIVISIONS,
  atlasCat,
  cleanFactText,
  splitSources,
  type DistrictMeta,
} from "@/lib/atlas";
import type { Bi } from "@/lib/current-affairs";

export type AtlasMcq = {
  key: string;
  kind: "place-district" | "district-division" | "district-zone" | "notes";
  set_name: string;
  question: Bi;
  options: Bi[];
  answer: number;
  explanation: Bi;
  source: string;
  pending: boolean;
};

// A random number generator seeded by a string (the same order each time).
export function seeded(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function shuffle<T>(list: T[], rnd: () => number): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// The correct option among three others, in a seeded order.
function options<T>(right: T, wrong: T[], seed: string): { options: T[]; answer: number } {
  const all = shuffle([right, ...wrong.slice(0, 3)], seeded(seed));
  return { options: all, answer: all.indexOf(right) + 1 };
}

export type McqPlace = {
  key: string;
  name_en: string;
  name_hi: string;
  label_en: string;
  label_hi: string;
  cat: string;
};
export type McqDistrict = { en: string; hi: string; meta: DistrictMeta };

// Kinds of place a "which district?" question is no use for.
export const NO_DISTRICT_QUESTION = new Set([
  "town",
  "border",
  "census",
  "climate",
  "region",
  "crop",
  "mascot",
]);

export function placeDistrictMcqs(
  places: (McqPlace & { district: string })[],
  districts: McqDistrict[],
): AtlasMcq[] {
  const byName = new Map(districts.map((d) => [d.en, d]));
  const out: AtlasMcq[] = [];
  for (const p of places) {
    const d = byName.get(p.district);
    if (!d || NO_DISTRICT_QUESTION.has(p.cat)) continue;
    // Wrong options: its neighbours first (the trap), then any others.
    const rnd = seeded(`${p.key}:wrong`);
    const near = shuffle(
      (d.meta.neighbours ?? []).map((n) => byName.get(n)).filter((x): x is McqDistrict => !!x),
      rnd,
    );
    const rest = shuffle(
      districts.filter((x) => x.en !== d.en && !near.includes(x)),
      rnd,
    );
    const wrong = [...near, ...rest].slice(0, 3);
    if (wrong.length < 3) continue;
    const name: Bi = { en: p.label_en || p.name_en, hi: p.label_hi || p.name_hi || p.label_en };
    const cat = atlasCat(p.cat);
    const group = ATLAS_GROUPS.find((g) => g.key === cat.group)!;
    const o = options<Bi>(
      { en: d.en, hi: d.hi },
      wrong.map((w) => ({ en: w.en, hi: w.hi })),
      p.key,
    );
    const division = DIVISIONS.find((x) => x.key === d.meta.division);
    out.push({
      key: `place-district:${p.key}`,
      kind: "place-district",
      set_name: `Atlas · ${group.name.en}: which district? / ${group.name.hi}: कौन-सा जिला?`,
      question: {
        en: `${name.en} (${cat.name.en.toLowerCase()}) is in which district?`,
        hi: `${name.hi} (${cat.name.hi}) किस जिले में है?`,
      },
      ...o,
      explanation: {
        en: `${name.en} is in ${d.en} district${division ? `, ${division.name.en} division` : ""}.`,
        hi: `${name.hi} ${d.hi} जिले${division ? ` (${division.name.hi} संभाग)` : ""} में है।`,
      },
      source: `P:${p.key}`,
      pending: false,
    });
  }
  return out;
}

export function districtMcqs(districts: McqDistrict[]): AtlasMcq[] {
  const out: AtlasMcq[] = [];
  const SET = "Atlas · Districts: division and zone / जिले: संभाग व कृषि जलवायु क्षेत्र";
  for (const d of districts) {
    const div = DIVISIONS.find((x) => x.key === d.meta.division);
    if (div) {
      const wrong = shuffle(
        DIVISIONS.filter((x) => x.key !== div.key),
        seeded(`${d.en}:division`),
      ).map((x) => x.name);
      out.push({
        key: `district-division:${d.en}`,
        kind: "district-division",
        set_name: SET,
        question: {
          en: `${d.en} district is in which division?`,
          hi: `${d.hi} जिला किस संभाग में है?`,
        },
        ...options<Bi>(div.name, wrong, `${d.en}:division`),
        explanation: {
          en: `${d.en} is in ${div.name.en} division.`,
          hi: `${d.hi} ${div.name.hi} संभाग में है।`,
        },
        source: `D:${d.en}`,
        pending: false,
      });
    }
    const zone = AGRO_ZONES.find((z) => z.key === d.meta.zone);
    if (zone) {
      const wrong = shuffle(
        AGRO_ZONES.filter((z) => z.key !== zone.key),
        seeded(`${d.en}:zone`),
      ).map((z) => z.name);
      out.push({
        key: `district-zone:${d.en}`,
        kind: "district-zone",
        set_name: SET,
        question: {
          en: `${d.en} district falls in which agro-climatic zone?`,
          hi: `${d.hi} जिला किस कृषि जलवायु क्षेत्र में आता है?`,
        },
        ...options<Bi>(zone.name, wrong, `${d.en}:zone`),
        explanation: {
          en: `${d.en}: zone ${zone.name.en}.`,
          hi: `${d.hi}: क्षेत्र ${zone.name.hi}।`,
        },
        source: `D:${d.en}`,
        pending: false,
      });
    }
  }
  return out;
}

export type PracticeFact = {
  id: string;
  key: string;
  chapter: string;
  chapter_key: string;
  heading: string;
  text_en: string;
  text_hi: string;
  flags: number;
  position: number;
};
const MCQ = 64;
const REVISION = 128;
// What students see: no notes' markers and no source tags.
const clean = (t: string) => splitSources(cleanFactText(t)).text;

// The notes' self-test questions: an MCQ-marked question and the answer
// fact right after it, or one fact holding both ("Question? Answer").
const asks = (t: string) => /\?\s*$/.test(t.trim());
const inOne = (t: string) => /^(.{8,}?\?)\s+(\S.*)$/s.exec(t.trim());
export function notesPairs(facts: PracticeFact[]): { q: PracticeFact; a: PracticeFact }[] {
  return selfTest(facts).pairs;
}
// Self-test answers whose question is missing from the notes.
export function orphanAnswers(facts: PracticeFact[]): PracticeFact[] {
  return selfTest(facts).orphans;
}
function selfTest(facts: PracticeFact[]) {
  const sorted = [...facts].filter((f) => f.flags & MCQ).sort((a, b) => a.position - b.position);
  const pairs: { q: PracticeFact; a: PracticeFact }[] = [];
  const orphans: PracticeFact[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const q = sorted[i];
    const a = sorted[i + 1];
    const one = inOne(q.text_en);
    if (one) {
      const hi = inOne(q.text_hi);
      pairs.push({
        q: { ...q, text_en: one[1], text_hi: hi?.[1] ?? "" },
        a: { ...q, text_en: one[2], text_hi: hi?.[2] ?? "" },
      });
    } else if (asks(q.text_en)) {
      if (a && a.heading === q.heading && !asks(a.text_en) && !inOne(a.text_en)) {
        pairs.push({ q, a });
        i++;
      }
    } else orphans.push(q);
  }
  return { pairs, orphans };
}

// The notes' questions make one set a subject (a chapter has only a few).
export function notesSet(chapterKey: string): string {
  const s = ATLAS_SUBJECTS.find((x) => x.key === chapterKey.split("-")[0]) ?? ATLAS_SUBJECTS[0];
  return `Atlas · ${s.name.en}: notes self-test / ${s.name.hi}: स्व-परीक्षण`;
}

// A notes question waiting for its wrong options (the AI writes them).
export function notesMcq(q: PracticeFact, a: PracticeFact): AtlasMcq {
  return {
    key: `notes:${q.key}`,
    kind: "notes",
    set_name: notesSet(q.chapter_key),
    question: { en: clean(q.text_en), hi: clean(q.text_hi) },
    options: [{ en: clean(a.text_en), hi: clean(a.text_hi) }],
    answer: 1,
    explanation: { en: clean(a.text_en), hi: clean(a.text_hi) },
    source: `F:${q.chapter_key}:${q.id}`,
    pending: true,
  };
}

export const DISTRACTOR_SYSTEM = `You write the wrong options of multiple-choice questions for Rajasthan GK (RPSC, RSSB exams). Each question comes with an answer taken from a teacher's notes. First check that the answer really answers the question (the notes' self-test lists are sometimes out of step, the answer belonging to another question); if it doesn't, reply for that question with {"n": number, "mismatch": true} only. Otherwise write three wrong options that are plausible to a student (same kind of thing: other districts, other years, other rulers, other numbers close to the right one), clearly wrong, each as long and in the same style as the correct answer, in English and Hindi. Shorten the correct answer to an option (at most 12 words) keeping its key fact; never change it. Hindi is standard exam-book Hindi.
Reply with JSON only: {"items": [{"n": question number, "right": {"en": "...", "hi": "..."}, "wrong": [{"en": "...", "hi": "..."}, {"en": "...", "hi": "..."}, {"en": "...", "hi": "..."}]}]}`;

export type Distractors = { right: Bi; wrong: Bi[] } | { mismatch: true };
export function parseDistractors(raw: string): Map<number, Distractors> {
  const t = raw.replace(/```(?:json)?/g, "");
  const out = new Map<number, Distractors>();
  try {
    const o = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1)) as { items?: unknown[] };
    for (const x of o.items ?? []) {
      const r = x as { n?: number; right?: Bi; wrong?: Bi[]; mismatch?: boolean };
      if (!Number.isInteger(r.n)) continue;
      if (r.mismatch === true) {
        out.set(r.n!, { mismatch: true });
        continue;
      }
      const bi = (b: Bi | undefined): Bi => ({
        en: String(b?.en ?? "")
          .trim()
          .slice(0, 200),
        hi: String(b?.hi ?? "")
          .trim()
          .slice(0, 200),
      });
      const wrong = (Array.isArray(r.wrong) ? r.wrong : []).map(bi).filter((w) => w.en || w.hi);
      if (wrong.length >= 3 && (r.right?.en || r.right?.hi))
        out.set(r.n!, { right: bi(r.right), wrong: wrong.slice(0, 3) });
    }
  } catch {
    // Nothing usable.
  }
  return out;
}

// Flashcards from the notes' revision lines ("Bajra: area Barmer, output
// Alwar" → Bajra / area Barmer…). The notes' questions become cards once
// approved as MCQs (their answers checked).
export type AtlasCard = { key: string; front: Bi; back: Bi; chapter: string; heading: string };
export function revisionCards(facts: PracticeFact[]): AtlasCard[] {
  const out: AtlasCard[] = [];
  // "Topic: answer" or "Topic = answer"; otherwise the chapter on the front.
  const split = (t: string) => {
    const m = /^(.{2,70}?)\s*(?:[:：]|\s=\s)\s*(\S.*)$/s.exec(t);
    return m ? [m[1].trim(), m[2].trim()] : null;
  };
  for (const f of facts) {
    if (!(f.flags & REVISION)) continue;
    const en = split(clean(f.text_en));
    const hi = split(clean(f.text_hi));
    out.push({
      key: `rev:${f.key}`,
      front: en ? { en: en[0], hi: hi?.[0] ?? "" } : { en: `${f.chapter}: revise`, hi: "" },
      back: { en: en?.[1] ?? clean(f.text_en), hi: hi?.[1] ?? clean(f.text_hi) },
      chapter: f.chapter,
      heading: f.heading,
    });
  }
  return out;
}

// An MCQ as MCQ practice stores it (Hindi line, then English).
export const joinBi = (b: Bi) =>
  b.hi && b.en && b.hi !== b.en ? `${b.hi}\n${b.en}` : b.hi || b.en;

// ---------- The students' map quiz ----------

export type QuizMode = "find" | "where" | "name" | "mix";
export type QuizPlace = {
  key: string;
  en: string;
  hi: string;
  cat: string;
  lat: number;
  lon: number;
};
export type QuizQ =
  // Tap this district on the map.
  | { mode: "find"; district: string }
  // Tap the district this place is in.
  | { mode: "where"; place: QuizPlace; district: string }
  // Name the district shown on the map (from four).
  | { mode: "name"; district: string; options: string[] };

// A round of questions (no question twice). `places`: the ones the student
// chose (by kind); districts: with their neighbours (the wrong options).
// `focus`: only these districts are asked about (a student's weak ones).
export function quizRound(
  mode: QuizMode,
  districts: { en: string; meta: DistrictMeta }[],
  places: (QuizPlace & { district: string })[],
  rnd: () => number,
  n = 10,
  focus?: Set<string>,
): QuizQ[] {
  const names = new Set(districts.map((d) => d.en));
  const asked = (d: string) => !focus || focus.has(d);
  const usable = places.filter(
    (p) => names.has(p.district) && asked(p.district) && !NO_DISTRICT_QUESTION.has(p.cat),
  );
  const seen = new Set<string>();
  const pool = {
    find: shuffle(
      districts.filter((d) => asked(d.en)),
      rnd,
    ),
    name: shuffle(
      districts.filter((d) => asked(d.en)),
      rnd,
    ),
    where: shuffle(usable, rnd).filter((p) => {
      const k = p.en.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }),
  };
  const out: QuizQ[] = [];
  const used = new Set<string>();
  for (let i = 0; out.length < n && i < n * 6; i++) {
    const kinds = (["find", "name", "where"] as const).filter(
      (k) => (mode === "mix" || mode === k) && pool[k].length,
    );
    if (!kinds.length) break;
    const kind = kinds[Math.floor(rnd() * kinds.length)];
    if (kind === "where") {
      const p = pool.where.shift()!;
      out.push({ mode: "where", place: p, district: p.district });
      continue;
    }
    const d = pool[kind].shift()!;
    if (used.has(`${kind}:${d.en}`)) continue;
    used.add(`${kind}:${d.en}`);
    if (kind === "find") out.push({ mode: "find", district: d.en });
    else {
      const near = shuffle(
        (d.meta.neighbours ?? []).filter((x) => names.has(x)),
        rnd,
      );
      const rest = shuffle(
        districts.map((x) => x.en).filter((x) => x !== d.en && !near.includes(x)),
        rnd,
      );
      out.push({
        mode: "name",
        district: d.en,
        options: shuffle([d.en, ...[...near, ...rest].slice(0, 3)], rnd),
      });
    }
  }
  return out;
}
