// Map drills, the daily challenge and districts then and now. Pure.
//
// Drills: put the districts a river flows through in order (the editor's
// checked lists), tap every district on a border, sort places north to
// south. The daily challenge: the same five questions for everyone on a
// day, with a streak kept on the device. Then and now: a tehsil's district
// in the 33-district map (2008–2023), the 50-district map (Aug 2023 – Dec
// 2024) and today's 41.
import type { Bi } from "@/lib/current-affairs";
import { quizRound, type QuizQ } from "@/lib/atlas-practice";
import type { DistrictMeta } from "@/lib/atlas";

// ---------- Borders (from the notes' "Inter-state borders" and the
// international border) ----------

export const BORDERS: { key: string; name: Bi; districts: string[] }[] = [
  {
    key: "pakistan",
    name: { en: "Pakistan", hi: "पाकिस्तान" },
    districts: ["Sri Ganganagar", "Bikaner", "Phalodi", "Jaisalmer", "Barmer"],
  },
  {
    key: "punjab",
    name: { en: "Punjab", hi: "पंजाब" },
    districts: ["Sri Ganganagar", "Hanumangarh"],
  },
  {
    key: "haryana",
    name: { en: "Haryana", hi: "हरियाणा" },
    districts: [
      "Hanumangarh",
      "Churu",
      "Jhunjhunu",
      "Sikar",
      "Kotputli-Behror",
      "Khairthal-Tijara",
      "Alwar",
      "Deeg",
    ],
  },
  {
    key: "up",
    name: { en: "Uttar Pradesh", hi: "उत्तर प्रदेश" },
    districts: ["Deeg", "Bharatpur", "Dholpur"],
  },
  {
    key: "mp",
    name: { en: "Madhya Pradesh", hi: "मध्य प्रदेश" },
    districts: [
      "Dholpur",
      "Karauli",
      "Sawai Madhopur",
      "Kota",
      "Baran",
      "Jhalawar",
      "Chittorgarh",
      "Bhilwara",
      "Pratapgarh",
      "Banswara",
    ],
  },
  {
    key: "gujarat",
    name: { en: "Gujarat", hi: "गुजरात" },
    districts: ["Barmer", "Jalore", "Sirohi", "Udaipur", "Dungarpur", "Banswara"],
  },
];
export type Borders = Record<string, string[]>;
export const DEFAULT_BORDERS: Borders = Object.fromEntries(
  BORDERS.map((b) => [b.key, b.districts]),
);

// The districts tapped against the right ones.
export function checkSet(chosen: string[], right: string[]) {
  const c = new Set(chosen);
  const r = new Set(right);
  return {
    ok: [...c].filter((d) => r.has(d)),
    wrong: [...c].filter((d) => !r.has(d)),
    missed: [...r].filter((d) => !c.has(d)),
    all: c.size === r.size && [...c].every((d) => r.has(d)),
  };
}

// ---------- Rivers ----------

export type RiverPath = { key: string; name: Bi; districts: string[]; checked: boolean };

// A first draft of a river's districts from the river map (its longest
// line, from the source; `at` finds the district of a point): districts
// it only brushes (fewer than three of its points, as where it forms a
// boundary) are left out. The editor checks it against the notes before
// students see it.
export function riverDraft(
  lines: [number, number][][],
  at: (lon: number, lat: number) => string | null,
): string[] {
  const line = lines.slice().sort((a, b) => b.length - a.length)[0] ?? [];
  const runs: { d: string; n: number }[] = [];
  for (const [x, y] of line) {
    const d = at(x, y);
    if (!d) continue;
    if (runs.length && runs[runs.length - 1].d === d) runs[runs.length - 1].n++;
    else runs.push({ d, n: 1 });
  }
  const total = new Map<string, number>();
  for (const r of runs) total.set(r.d, (total.get(r.d) ?? 0) + r.n);
  const out: string[] = [];
  for (const r of runs) if ((total.get(r.d) ?? 0) >= 3 && !out.includes(r.d)) out.push(r.d);
  return out;
}

// How many districts were put in the right place.
export const orderScore = (given: string[], right: string[]) =>
  given.filter((d, i) => right[i] === d).length;

// ---------- North to south ----------

export type NsPlace = { key: string; en: string; hi: string; lat: number; lon: number };

// Four places at least a quarter of a degree apart (north to south), so
// the order is clear; null when there aren't enough.
export function northSouth(places: NsPlace[], rnd: () => number, n = 4): NsPlace[] | null {
  for (let tries = 0; tries < 40; tries++) {
    const pick: NsPlace[] = [];
    const pool = places.slice();
    while (pick.length < n && pool.length) {
      const p = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
      if (pick.every((q) => Math.abs(q.lat - p.lat) >= 0.25 && q.en !== p.en)) pick.push(p);
    }
    if (pick.length === n) return pick;
  }
  return null;
}
export const byNorth = (ps: NsPlace[]) => ps.slice().sort((a, b) => b.lat - a.lat);

// ---------- The daily challenge ----------

// A random sequence from a text (the date), the same everywhere.
export function seeded(text: string): () => number {
  let h = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

export const DAILY_SIZE = 5;
// The day's five questions (India's date).
export function dailyRound(
  day: string,
  districts: { en: string; meta: DistrictMeta }[],
  places: Parameters<typeof quizRound>[2],
): QuizQ[] {
  const sorted = places.slice().sort((a, b) => a.key.localeCompare(b.key));
  return quizRound("mix", districts, sorted, seeded(`atlas-daily:${day}`), DAILY_SIZE);
}
export const indiaDay = (d: Date) =>
  new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);

export type Streak = { last: string; streak: number; best: number; days: Record<string, string> };
export const EMPTY_STREAK: Streak = { last: "", streak: 0, best: 0, days: {} };
const prevDay = (day: string) =>
  new Date(Date.parse(`${day}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

// The streak after today's challenge ("✓✗…" for each question). A day
// played twice counts once.
export function afterDaily(s: Streak, day: string, marks: string): Streak {
  if (s.days[day]) return s;
  const streak = s.last === prevDay(day) ? s.streak + 1 : 1;
  const days = Object.fromEntries(
    Object.entries({ ...s.days, [day]: marks })
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 60),
  );
  return { last: day, streak, best: Math.max(s.best, streak), days };
}
// The streak as it stands today (broken when yesterday was missed).
export const currentStreak = (s: Streak, today: string) =>
  s.last === today || s.last === prevDay(today) ? s.streak : 0;

export function shareText(day: string, marks: string, streak: number, url: string, hi: boolean) {
  const right = [...marks].filter((m) => m === "1").length;
  const squares = [...marks].map((m) => (m === "1" ? "🟩" : "🟥")).join("");
  return hi
    ? `राजस्थान एटलस · दैनिक चुनौती ${day}\n${squares} ${right}/${marks.length}${streak > 1 ? ` · 🔥 ${streak} दिन` : ""}\n${url}`
    : `Rajasthan Atlas · Daily challenge ${day}\n${squares} ${right}/${marks.length}${streak > 1 ? ` · 🔥 ${streak} days` : ""}\n${url}`;
}

// ---------- Districts then and now ----------

export const NEW_2023 = [
  "Balotra",
  "Beawar",
  "Deeg",
  "Didwana-Kuchaman",
  "Khairthal-Tijara",
  "Kotputli-Behror",
  "Phalodi",
  "Salumbar",
];
// The districts each 2023 district was made from (the notes' "1.3
// Districts: 26 → 33 → 50 → 41").
export const PARENTS_2023: Record<string, string[]> = {
  Balotra: ["Barmer"],
  Beawar: ["Ajmer", "Pali", "Rajsamand", "Bhilwara"],
  Deeg: ["Bharatpur"],
  "Didwana-Kuchaman": ["Nagaur"],
  "Khairthal-Tijara": ["Alwar"],
  "Kotputli-Behror": ["Jaipur", "Alwar"],
  Phalodi: ["Jodhpur", "Jaisalmer"],
  Salumbar: ["Udaipur"],
};
// Made on 7 Aug 2023 and cancelled in Dec 2024.
export const CANCELLED_2024 = [
  "Anupgarh",
  "Dudu",
  "Gangapur City",
  "Jaipur Rural",
  "Jodhpur Rural",
  "Kekri",
  "Neem Ka Thana",
  "Sanchore",
  "Shahpura",
];
// The three maps' districts, from today's 41.
export const districtMaps = (d41: string[]) => ({
  d41,
  d33: d41.filter((d) => !NEW_2023.includes(d)),
  d50: [...d41, ...CANCELLED_2024],
});

// A tehsil (or town) and its district in each map.
export type TehsilRow = { tehsil: Bi; d33: string; d50: string; d41: string; note?: string };

const norm = (s: string) => s.toLowerCase().replace(/[^a-zऀ-ॿ]/g, "");
// A district name as written ("Jaipur (Rural)", "Neem-ka-Thana") → the
// list's spelling; "" when not in the list.
export function districtIn(list: string[], name: string): string {
  const n = norm(name);
  return list.find((d) => norm(d) === n) ?? "";
}

// Rows from a pasted table: "tehsil, 33-map district, 50-map district,
// today's district" (comma, tab or "|" between; a Hindi name after "/"),
// with the problems found.
export function parseTehsils(
  text: string,
  d41: string[],
): { rows: TehsilRow[]; problems: string[] } {
  const m = districtMaps(d41);
  const rows: TehsilRow[] = [];
  const problems: string[] = [];
  text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .forEach((line, i) => {
      const cells = line.split(/\t|\||,/).map((c) => c.trim());
      if (i === 0 && /tehsil|तहसील/i.test(cells[0]) && /33|50|41/.test(line)) return; // a header
      if (cells.length < 4) {
        problems.push(`Line ${i + 1}: needs 4 columns`);
        return;
      }
      const [name, a, b, c] = cells;
      const [en, hi = ""] = name.split("/").map((s) => s.trim());
      const row = {
        tehsil: { en, hi },
        d33: districtIn(m.d33, a),
        d50: districtIn(m.d50, b),
        d41: districtIn(m.d41, c),
        note: cells[4] || undefined,
      };
      const bad = [
        !row.d33 && `"${a}" is not one of the 33 districts`,
        !row.d50 && `"${b}" is not one of the 50 districts`,
        !row.d41 && `"${c}" is not one of the 41 districts`,
      ].filter(Boolean);
      if (!en) bad.push("no tehsil name");
      if (bad.length) problems.push(`Line ${i + 1} (${en || "?"}): ${bad.join("; ")}`);
      else rows.push(row);
    });
  return { rows, problems };
}

// Rows found for a search (English or Hindi, any part of the name).
export function findTehsil(rows: TehsilRow[], q: string): TehsilRow[] {
  const n = norm(q);
  if (n.length < 2) return [];
  return rows
    .filter((r) => norm(r.tehsil.en).includes(n) || (r.tehsil.hi && norm(r.tehsil.hi).includes(n)))
    .sort(
      (a, b) => Number(!norm(a.tehsil.en).startsWith(n)) - Number(!norm(b.tehsil.en).startsWith(n)),
    )
    .slice(0, 12);
}
