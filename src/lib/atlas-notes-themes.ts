// Theme pages made from a subject's notes (not from the map's categories):
// folk deities and their fairs, the forts' sakas and jauhars, the fairs and
// festivals month by month, and the painting schools. Each is worked out
// from the notes' headings and tables, so a corrected file corrects the page.
import type { AtlasLang } from "@/lib/atlas";

type Bi = { en: string; hi: string };

// The facts these pages read (PublicFact's fields).
export type ThemeFact = {
  id: string;
  heading: string;
  headingHi: string;
  head: string;
  headHi: string;
  text: Bi;
  places: string[];
};

export type NotesThemeKey = "folk-deities" | "sakas" | "fair-calendar" | "painting";

export const NOTES_THEMES: {
  key: NotesThemeKey;
  name: Bi;
  blurb: Bi;
  // The notes chapters it reads, by title (an ilike pattern).
  chapters: string[];
}[] = [
  {
    key: "folk-deities",
    name: { en: "Folk deities & their fairs", hi: "लोक देवता एवं उनके मेले" },
    blurb: {
      en: "Each folk deity and goddess: when they lived, their temples and when their fairs are held.",
      hi: "हर लोक देवता एवं लोक देवी: काल, मंदिर एवं मेले कब लगते हैं।",
    },
    chapters: ["%folk deities%"],
  },
  {
    key: "sakas",
    name: { en: "Forts: sakas & jauhars", hi: "दुर्ग: साके एवं जौहर" },
    blurb: {
      en: "Every saka in Rajasthan's forts, in order: the year, the attacker and who fought.",
      hi: "राजस्थान के दुर्गों के सभी साके क्रम से: वर्ष, आक्रमणकारी एवं कौन लड़ा।",
    },
    chapters: ["%forts%"],
  },
  {
    key: "fair-calendar",
    name: { en: "Fair & festival calendar", hi: "मेला एवं त्योहार पंचांग" },
    blurb: {
      en: "Rajasthan's fairs and festivals, month by month of the Hindu calendar.",
      hi: "राजस्थान के मेले एवं त्योहार, हिंदू पंचांग के माहवार।",
    },
    chapters: ["%fairs%", "%festivals%"],
  },
  {
    key: "painting",
    name: { en: "Painting schools on the map", hi: "चित्र शैलियाँ मानचित्र पर" },
    blurb: {
      en: "The four schools of Rajasthani painting and their styles, where each comes from.",
      hi: "राजस्थानी चित्रकला की चार शैलियाँ एवं उपशैलियाँ, कौन कहाँ की।",
    },
    chapters: ["%painting%"],
  },
];
export const notesThemeOf = (key: string) => NOTES_THEMES.find((t) => t.key === key) ?? null;

// ---------- Shared bits ----------

const parts = (f: ThemeFact) => f.heading.split(" › ");
const hiParts = (f: ThemeFact) => (f.headingHi || "").split(" › ");
// A heading level in both languages (the Hindi when known).
const level = (f: ThemeFact, i: number): Bi => ({
  en: parts(f)[i] ?? "",
  hi: hiParts(f)[i] || parts(f)[i] || "",
});
const cells = (f: ThemeFact): Bi[] => {
  const en = f.text.en.split(" · ");
  const hi = f.text.hi.split(" · ");
  return en.map((c, i) => ({ en: c.trim(), hi: (hi.length === en.length ? hi[i] : c).trim() }));
};
const isPlaces = (s: string) => /^(places|स्थान)$/i.test(s);
const isRevision = (s: string) => /^revision questions/i.test(s);

// ---------- Folk deities ----------

export type DeityCard = {
  name: Bi;
  // "1073–1103 AD", from the heading.
  dates: string;
  kind: "deity" | "goddess";
  intro: Bi | null;
  // Lines about its fairs (dates, places).
  fairs: Bi[];
  // Its temples and fairs table: place and what's there.
  sites: { place: Bi; about: Bi; places: string[] }[];
  places: string[];
  facts: number;
  // Where its full notes are (the heading, for the atlas's search).
  heading: string;
};

const FAIR = /fair|mela|मेल|मेला|मेले|navami|dashami|purnima|ekadashi|नवमी|दशमी|पूर्णिमा|एकादशी/i;

// A place's name as the notes' tables write it: "Kharnal / Khadnal (Nagaur)"
// → "kharnal", "khadnal".
export const nameKeys = (s: string) =>
  s
    .replace(/\([^)]*\)/g, " ")
    .split(/\s*\/\s*|,/)
    .map((x) =>
      x
        .toLowerCase()
        .replace(/\b(temple|fort|village|dham|mandir|fair|mela|cattle|festival|utsav|ji)\b/g, " ")
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim(),
    )
    .filter((x) => x.length >= 3);

// The notes' place blocks ("Places › Kolu") and the place each is linked to.
function notesPlaces(facts: ThemeFact[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const f of facts) {
    const p = parts(f);
    if (!isPlaces(p[0]) || !p[1] || !f.places.length) continue;
    for (const k of nameKeys(p[1])) if (!m.has(k)) m.set(k, f.places[0]);
  }
  return m;
}

// A deity's table of its temples and fairs (not of poets or books).
const SITES = /temple|fair|place|dham|shrine|peeth|mela|मंदिर|मेल|स्थान|धाम/i;

export function folkDeities(facts: ThemeFact[]): DeityCard[] {
  const out = new Map<string, DeityCard>();
  const blocks = notesPlaces(facts);
  for (const f of facts) {
    const p = parts(f);
    const kind = /^folk deities/i.test(p[0])
      ? "deity"
      : /^shakti worship/i.test(p[0])
        ? "goddess"
        : null;
    if (!kind || !p[1]) continue;
    // General headings and tables of many goddesses aren't one deity.
    if (
      /^(who the folk deities are|shakti worship|four shakti peethas|other goddesses)/i.test(p[1])
    )
      continue;
    const name = level(f, 1);
    const dates = /\(([^)]*\d[^)]*)\)/.exec(name.en)?.[1] ?? "";
    const strip = (s: string) => s.replace(/\s*\([^)]*\d[^)]*\)\s*/, " ").trim();
    let c = out.get(p[1]);
    if (!c)
      out.set(
        p[1],
        (c = {
          name: { en: strip(name.en), hi: strip(name.hi) },
          dates,
          kind,
          intro: null,
          fairs: [],
          sites: [],
          places: [],
          facts: 0,
          heading: `${p[0]} › ${p[1]}`,
        }),
      );
    c.facts++;
    for (const k of f.places) if (!c.places.includes(k)) c.places.push(k);
    if (f.head) {
      const cs = cells(f);
      if (cs.length >= 2 && (SITES.test(p[2] ?? "") || SITES.test(f.head.split(" · ")[0]))) {
        const linked = [
          ...f.places,
          ...nameKeys(cs[0].en)
            .map((k) => blocks.get(k))
            .filter((k): k is string => !!k),
        ].filter((k, i, a) => a.indexOf(k) === i);
        for (const k of linked) if (!c.places.includes(k)) c.places.push(k);
        c.sites.push({
          place: cs[0],
          about: {
            en: cs
              .slice(1)
              .map((x) => x.en)
              .join(" · "),
            hi: cs
              .slice(1)
              .map((x) => x.hi)
              .join(" · "),
          },
          places: linked,
        });
      }
      continue;
    }
    if (!c.intro && p.length === 2 && !/^trick/i.test(f.text.en)) c.intro = f.text;
    if ((FAIR.test(f.text.en) || /fair/i.test(p[2] ?? "")) && c.fairs.length < 4)
      c.fairs.push(f.text);
  }
  // A deity with no table: its own place block ("Karni Mata temple, Deshnok").
  for (const c of out.values())
    if (!c.places.length) {
      const k = nameKeys(c.name.en)
        .map((n) => blocks.get(n))
        .find(Boolean);
      if (k) c.places.push(k);
    }
  return [...out.values()];
}

// ---------- Sakas and jauhars ----------

export type SakaRow = { label: Bi; year: string; attacker: Bi; who: Bi; from: number | null };
export type SakaFort = { fort: Bi; place: string | null; sakas: SakaRow[]; tips: Bi[] };

const firstYear = (s: string) => {
  const m = /\b(1[0-9]{3})\b/.exec(s);
  return m ? Number(m[1]) : null;
};

export function sakas(facts: ThemeFact[]): { forts: SakaFort[]; tips: Bi[] } {
  const forts = new Map<string, SakaFort>();
  const tips: Bi[] = [];
  // The forts' own place blocks ("Places › Chittorgarh fort"), for their dots.
  const placeOf = (fort: string) => {
    const n = fort.toLowerCase();
    const f = facts.find(
      (x) => isPlaces(parts(x)[0]) && parts(x)[1]?.toLowerCase().startsWith(n) && x.places.length,
    );
    return f?.places[0] ?? null;
  };
  for (const f of facts) {
    const p = parts(f);
    if (!/sakas? and jauhars?/i.test(p[0])) continue;
    if (!f.head) {
      tips.push(f.text);
      continue;
    }
    const cs = cells(f);
    if (cs.length < 3) continue;
    const name = cs[0].en.replace(/\s*\(.*$/, "").trim();
    const nameHi = cs[0].hi.replace(/\s*\(.*$/, "").trim();
    let g = forts.get(name);
    if (!g)
      forts.set(
        name,
        (g = { fort: { en: name, hi: nameHi }, place: placeOf(name), sakas: [], tips: [] }),
      );
    const label = {
      en: /\(([^)]*)\)/.exec(cs[0].en)?.[1] ?? "",
      hi: /\(([^)]*)\)/.exec(cs[0].hi)?.[1] ?? "",
    };
    g.sakas.push({
      label,
      year: cs[1].en === "—" ? "" : cs[1].en,
      attacker: cs[2],
      who: cs[3] ?? { en: "", hi: "" },
      from: firstYear(cs[1].en),
    });
  }
  // Each fort's own trick line ("Trick: three Chittor sakas…").
  for (const f of facts) {
    const p = parts(f);
    if (!isPlaces(p[0]) || f.head || !/^trick/i.test(f.text.en)) continue;
    for (const g of forts.values())
      if (p[1]?.toLowerCase().startsWith(g.fort.en.toLowerCase())) g.tips.push(f.text);
  }
  const list = [...forts.values()].sort(
    (a, b) => (a.sakas[0]?.from ?? 9999) - (b.sakas[0]?.from ?? 9999),
  );
  return { forts: list, tips };
}

// ---------- Fairs and festivals by month ----------

export const HINDU_MONTHS: { key: string; name: Bi; around: Bi }[] = [
  {
    key: "chai",
    name: { en: "Chaitra", hi: "चैत्र" },
    around: { en: "Mar–Apr", hi: "मार्च–अप्रैल" },
  },
  {
    key: "vais",
    name: { en: "Vaishakh", hi: "वैशाख" },
    around: { en: "Apr–May", hi: "अप्रैल–मई" },
  },
  { key: "jyes", name: { en: "Jyeshtha", hi: "ज्येष्ठ" }, around: { en: "May–Jun", hi: "मई–जून" } },
  { key: "asha", name: { en: "Ashadh", hi: "आषाढ़" }, around: { en: "Jun–Jul", hi: "जून–जुलाई" } },
  {
    key: "shra",
    name: { en: "Shravan", hi: "श्रावण" },
    around: { en: "Jul–Aug", hi: "जुलाई–अगस्त" },
  },
  {
    key: "bhad",
    name: { en: "Bhadrapada", hi: "भाद्रपद" },
    around: { en: "Aug–Sep", hi: "अगस्त–सितंबर" },
  },
  {
    key: "ashw",
    name: { en: "Ashwin", hi: "आश्विन" },
    around: { en: "Sep–Oct", hi: "सितंबर–अक्टूबर" },
  },
  {
    key: "kart",
    name: { en: "Kartik", hi: "कार्तिक" },
    around: { en: "Oct–Nov", hi: "अक्टूबर–नवंबर" },
  },
  {
    key: "marg",
    name: { en: "Margashirsha", hi: "मार्गशीर्ष" },
    around: { en: "Nov–Dec", hi: "नवंबर–दिसंबर" },
  },
  { key: "paus", name: { en: "Paush", hi: "पौष" }, around: { en: "Dec–Jan", hi: "दिसंबर–जनवरी" } },
  { key: "magh", name: { en: "Magh", hi: "माघ" }, around: { en: "Jan–Feb", hi: "जनवरी–फरवरी" } },
  {
    key: "phal",
    name: { en: "Phalgun", hi: "फाल्गुन" },
    around: { en: "Feb–Mar", hi: "फरवरी–मार्च" },
  },
];
// "Vaishakha", "Shravana", "Phalguna" → the month's index; -1 when not a month.
export const hinduMonth = (name: string) => {
  const k = name
    .toLowerCase()
    .replace(/[^a-z]/g, "")
    .replace(/^sawan/, "shra")
    .replace(/^asoj/, "ashw")
    .replace(/^agrahayan/, "marg")
    .slice(0, 4);
  return HINDU_MONTHS.findIndex((m) => m.key === k);
};
// The Hindu month about now (it changes around the full moon mid-month).
export const hinduMonthNow = (d = new Date()) => {
  const m = d.getMonth() - 2 - (d.getDate() < 15 ? 1 : 0);
  return ((m % 12) + 12) % 12;
};

export type CalendarEntry = { name: Bi; place: Bi | null; when: Bi; places: string[] };
export type CalendarMonth = { fairs: CalendarEntry[]; festivals: CalendarEntry[] };

// `known`: the atlas's places by name (nameKeys), for fairs the notes'
// tables don't link.
export function fairCalendar(
  fairs: ThemeFact[],
  festivals: ThemeFact[],
  known: Map<string, string> = new Map(),
): CalendarMonth[] {
  const months: CalendarMonth[] = HINDU_MONTHS.map(() => ({ fairs: [], festivals: [] }));
  const blocks = notesPlaces(fairs);
  const find = (...names: string[]) => {
    for (const n of names)
      for (const k of nameKeys(n)) {
        const hit = blocks.get(k) ?? known.get(k);
        if (hit) return [hit];
      }
    return [];
  };
  for (const f of fairs) {
    const p = parts(f);
    if (!/month by month/i.test(p[0]) || !f.head || p.length !== 2) continue;
    const i = hinduMonth(p[1]);
    const cs = cells(f);
    if (i < 0 || cs.length < 2) continue;
    months[i].fairs.push({
      name: cs[0],
      place: cs.length >= 3 ? cs[1] : null,
      when: cs[cs.length >= 3 ? 2 : 1] ?? { en: "", hi: "" },
      places: f.places.length ? f.places : find(cs[0].en, cs.length >= 3 ? cs[1].en : ""),
    });
  }
  for (const f of festivals) {
    const p = parts(f);
    if (!/by month/i.test(p[0]) || !f.head || p.length !== 2) continue;
    const i = hinduMonth(p[1]);
    const cs = cells(f);
    if (i < 0 || cs.length < 2) continue;
    months[i].festivals.push({ name: cs[1], place: null, when: cs[0], places: f.places });
  }
  return months;
}

// ---------- Painting schools ----------

export type PaintingStyle = {
  name: Bi;
  // Its town on the map and its district (worked out on the server).
  place?: string | null;
  districts?: string[];
  // The towns it is named after ("Nagaur and Jaisalmer styles" → both).
  towns: string[];
  points: Bi[];
  facts: number;
};
export type PaintingSchool = { name: Bi; styles: PaintingStyle[] };

export function paintingSchools(facts: ThemeFact[]): PaintingSchool[] {
  const schools = new Map<string, PaintingSchool>();
  for (const f of facts) {
    const p = parts(f);
    if (!/school$/i.test(p[0]) || isPlaces(p[0]) || isRevision(p[0])) continue;
    let s = schools.get(p[0]);
    if (!s) schools.set(p[0], (s = { name: level(f, 0), styles: [] }));
    if (!p[1] || !/style/i.test(p[1])) continue;
    let st = s.styles.find((x) => x.name.en === p[1]);
    if (!st) {
      const towns = p[1]
        .replace(/\b(sub-)?styles?\b/gi, "")
        .split(/\s+and\s+|,/)
        .map((x) => x.trim())
        .filter(Boolean);
      s.styles.push((st = { name: level(f, 1), towns, points: [], facts: 0 }));
    }
    st.facts++;
    if (!f.head && st.points.length < 3 && !/^trick/i.test(f.text.en)) st.points.push(f.text);
  }
  return [...schools.values()].filter((s) => s.styles.length);
}

// The colours of the four schools on the map.
export const SCHOOL_COLOURS = ["#f4c7a1", "#c9dcf5", "#cfe8c4", "#ecc8e4", "#f5e6a6"];

export const bi = (x: Bi, lang: AtlasLang) => (lang === "hi" ? x.hi || x.en : x.en);
