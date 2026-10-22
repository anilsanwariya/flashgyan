// Custom magazines: a theme over a date range, with sections and
// subsections the AI decides, filled from the daily stories. Pure helpers
// (types, prompts, parsers), shared by the server, the admin page and tests.
import { hindiGuide, type GlossaryEntry } from "../../supabase/functions/_shared/ca-hindi.ts";
import type { Bi } from "@/lib/current-affairs";
import type { IssueDesign } from "@/lib/ca-covers";

export type MagSub = { id: string; en: string; hi: string };
export type MagSection = MagSub & { subs: MagSub[] };

export type CustomMag = {
  id: string;
  title_en: string;
  title_hi: string;
  theme: string;
  date_from: string;
  date_to: string;
  status: "growing" | "final";
  sections: MagSection[];
  design: IssueDesign | null;
  pdf_url_en: string | null;
  pdf_url_hi: string | null;
  pdf_at: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
  finalized_at: string | null;
};

// Stories judged in one AI call.
export const SORT_BATCH = 30;
export const MAX_SECTIONS = 12;
export const MAX_SUBS = 12;
// The catch-all section for stories that fit the theme but no section.
export const OTHER_SECTION: MagSection = {
  id: "other",
  en: "Other news",
  hi: "अन्य समाचार",
  subs: [],
};

type ChatMessage = { role: "system" | "user"; content: string };

const clean = (v: unknown, max = 60) =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";

// A short id from a name ("Space Technology" → "space-technology").
export function slugId(name: string, taken: Set<string>): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 30) || "s";
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  taken.add(id);
  return id;
}

const jsonOf = (raw: string): unknown => {
  const text = raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  const start = text.search(/[[{]/);
  if (start < 0) return null;
  try {
    return JSON.parse(text.slice(start));
  } catch {
    return null;
  }
};

// ---------- Planning the sections ----------

export function planMessages(opts: {
  title: string;
  theme: string;
  headlines: string[];
  glossary?: GlossaryEntry[];
}): ChatMessage[] {
  return [
    {
      role: "system",
      content: `You plan a special current affairs magazine for Rajasthan competitive exam aspirants (RPSC and RSSB exams, with depth for RAS). From its theme and a sample of the period's headlines, decide its sections and subsections, the way exam magazines divide such a theme: Science & Technology into Space, Defence, Biotechnology and Health, IT and AI, Energy and Environment…; a sports magazine by sport (Cricket, Tennis, Athletics…) with subsections for the series, leagues or tournaments that recur; a Rajasthan magazine into Schemes, Economy, Infrastructure, Culture….
RULES: 3 to ${MAX_SECTIONS} sections, ordered most exam-important first. A subsection only where the headlines show several stories on one recurring topic (a sport's tournaments, a space programme's missions, a scheme's phases); 0 to ${MAX_SUBS} per section. Names are short (at most 4 words), in English and in natural standard Hindi as used in RPSC exams.${hindiGuide(opts.glossary)}
Reply with JSON only: {"sections": [{"en": "...", "hi": "...", "subs": [{"en": "...", "hi": "..."}]}]}`,
    },
    {
      role: "user",
      content: `Magazine: ${opts.title}\nTheme: ${opts.theme}\n\nSample headlines:\n${opts.headlines
        .slice(0, 200)
        .map((h) => `- ${h}`)
        .join("\n")}`,
    },
  ];
}

// The sections from the AI's reply, with ids; null when it can't be read.
export function parsePlan(raw: string): MagSection[] | null {
  const o = jsonOf(raw) as { sections?: unknown } | null;
  if (!o || !Array.isArray(o.sections)) return null;
  const taken = new Set<string>([OTHER_SECTION.id]);
  const out: MagSection[] = [];
  for (const s of o.sections.slice(0, MAX_SECTIONS) as Record<string, unknown>[]) {
    const en = clean(s?.en);
    if (!en) continue;
    const id = slugId(en, taken);
    const subTaken = new Set<string>();
    const subs = (Array.isArray(s.subs) ? (s.subs as Record<string, unknown>[]) : [])
      .slice(0, MAX_SUBS)
      .map((x) => ({ en: clean(x?.en), hi: clean(x?.hi) }))
      .filter((x) => x.en)
      .map((x) => ({ id: `${id}/${slugId(x.en, subTaken)}`, en: x.en, hi: x.hi || x.en }));
    out.push({ id, en, hi: clean(s.hi) || en, subs });
  }
  return out.length ? out : null;
}

// ---------- Sorting stories ----------

export type SortStory = { headline: string; facts: string[]; date: string };

const sectionList = (sections: MagSection[]) =>
  [...sections, OTHER_SECTION]
    .map(
      (s) =>
        `${s.id}: ${s.en}${s.subs.length ? `\n${s.subs.map((x) => `  ${x.id}: ${x.en}`).join("\n")}` : ""}`,
    )
    .join("\n");

export function sortMessages(opts: {
  title: string;
  theme: string;
  sections: MagSection[];
  stories: SortStory[];
  glossary?: GlossaryEntry[];
}): ChatMessage[] {
  return [
    {
      role: "system",
      content: `You fill a special current affairs magazine for Rajasthan competitive exam aspirants. For each numbered story decide whether it belongs to the magazine's theme, and if it does, its section and subsection.
RULES: A story belongs only if its main subject is within the theme (a general news story that merely mentions the theme does not). Use the section ids given; "other" only for a story that fits the theme but none of the sections. "sub" is one of that section's subsection ids, or null when none fits. When a story fits a section but starts a topic likely to recur there (a new sport's tournament, a new mission or programme) and no subsection fits, give "new_sub" with a short English and Hindi name (at most 4 words) instead; stories on the same new topic get the same name. Leave stories that don't belong out of the reply.${hindiGuide(opts.glossary)}
Reply with JSON only: {"stories": [{"n": 1, "section": "id", "sub": "id" or null, "new_sub": {"en": "...", "hi": "..."} or null}]}`,
    },
    {
      role: "user",
      content: `Magazine: ${opts.title}\nTheme: ${opts.theme}\n\nSections and subsections:\n${sectionList(opts.sections)}\n\nStories:\n${opts.stories
        .map(
          (s, i) =>
            `${i + 1}. [${s.date}] ${s.headline}${s.facts.length ? `\n   ${s.facts.slice(0, 3).join(" · ").slice(0, 300)}` : ""}`,
        )
        .join("\n")}`,
    },
  ];
}

export type Placement = { index: number; section: string; sub: string | null };

// Where each fitting story goes (0-based story numbers), and the sections
// with any new subsections added (the same new name in a section is one).
export function parseSort(
  raw: string,
  count: number,
  sections: MagSection[],
): { placed: Placement[]; sections: MagSection[] } | null {
  const o = jsonOf(raw) as { stories?: unknown } | null;
  if (!o || !Array.isArray(o.stories)) return null;
  const next: MagSection[] = sections.map((s) => ({ ...s, subs: [...s.subs] }));
  const placed: Placement[] = [];
  const used = new Set<number>();
  for (const r of o.stories as Record<string, unknown>[]) {
    const index = Number(r?.n) - 1;
    if (!Number.isInteger(index) || index < 0 || index >= count || used.has(index)) continue;
    let sec = next.find((s) => s.id === r.section);
    if (!sec) {
      if (r.section !== OTHER_SECTION.id && r.section !== undefined) {
        // An unknown id: the section whose name it is, else other.
        sec = next.find((s) => s.en.toLowerCase() === String(r.section).toLowerCase());
      }
      if (!sec) {
        sec = next.find((s) => s.id === OTHER_SECTION.id);
        if (!sec) {
          sec = { ...OTHER_SECTION, subs: [] };
          next.push(sec);
        }
      }
    }
    let sub: string | null = sec.subs.some((x) => x.id === r.sub) ? String(r.sub) : null;
    const fresh = r.new_sub as Record<string, unknown> | null | undefined;
    if (!sub && fresh && clean(fresh.en) && sec.subs.length < MAX_SUBS) {
      const en = clean(fresh.en);
      const same = sec.subs.find((x) => x.en.toLowerCase() === en.toLowerCase());
      if (same) sub = same.id;
      else {
        const taken = new Set(sec.subs.map((x) => x.id.split("/").pop()!));
        const made = { id: `${sec.id}/${slugId(en, taken)}`, en, hi: clean(fresh.hi) || en };
        sec.subs.push(made);
        sub = made.id;
      }
    }
    used.add(index);
    placed.push({ index, section: sec.id, sub });
  }
  return { placed, sections: next };
}

// ---------- Reading the stored sections ----------

export function normalizeSections(v: unknown): MagSection[] {
  if (!Array.isArray(v)) return [];
  return (v as Record<string, unknown>[])
    .filter((s) => s && typeof s.id === "string" && typeof s.en === "string")
    .map((s) => ({
      id: String(s.id),
      en: String(s.en),
      hi: typeof s.hi === "string" && s.hi ? s.hi : String(s.en),
      subs: (Array.isArray(s.subs) ? (s.subs as Record<string, unknown>[]) : [])
        .filter((x) => x && typeof x.id === "string" && typeof x.en === "string")
        .map((x) => ({
          id: String(x.id),
          en: String(x.en),
          hi: typeof x.hi === "string" && x.hi ? x.hi : String(x.en),
        })),
    }));
}

export const biName = (s: { en: string; hi: string }): Bi => ({ en: s.en, hi: s.hi || s.en });

// The magazine's period for its cover ("April – September 2026",
// "1 – 31 July 2026").
export function magPeriod(from: string, to: string, lang: "en" | "hi"): string {
  const months =
    lang === "hi"
      ? [
          "जनवरी",
          "फ़रवरी",
          "मार्च",
          "अप्रैल",
          "मई",
          "जून",
          "जुलाई",
          "अगस्त",
          "सितंबर",
          "अक्टूबर",
          "नवंबर",
          "दिसंबर",
        ]
      : [
          "January",
          "February",
          "March",
          "April",
          "May",
          "June",
          "July",
          "August",
          "September",
          "October",
          "November",
          "December",
        ];
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const lastDay = new Date(Date.UTC(ty, tm, 0)).getUTCDate();
  const wholeMonths = fd === 1 && td === lastDay;
  if (wholeMonths) {
    if (fy === ty && fm === tm) return `${months[fm - 1]} ${fy}`;
    return fy === ty
      ? `${months[fm - 1]} – ${months[tm - 1]} ${ty}`
      : `${months[fm - 1]} ${fy} – ${months[tm - 1]} ${ty}`;
  }
  if (fy === ty && fm === tm) return `${fd} – ${td} ${months[tm - 1]} ${ty}`;
  return `${fd} ${months[fm - 1]}${fy === ty ? "" : ` ${fy}`} – ${td} ${months[tm - 1]} ${ty}`;
}
