// Medal tally of a sports event (Olympics, Asian Games, National Games,
// Khelo India…): India's medals as a list students revise from (player,
// state, sport and event, medal), with Rajasthan's marked, India's tally and
// rank as the stories report it, and the top of the medal table when given.
// Made from the event's stories only; printed under the event in the
// monthly. Shared by the server, the admin page and the renderer.
import type { Bi } from "@/lib/current-affairs";
import { hindiGuide, type GlossaryEntry } from "../../supabase/functions/_shared/ca-hindi.ts";

type ChatMessage = { role: "system" | "user"; content: string };

export const MEDALS = ["gold", "silver", "bronze"] as const;
export type MedalKind = (typeof MEDALS)[number];

export type Medal = {
  // The player or team.
  who: Bi;
  state: Bi;
  // Sport and event ("Shooting, 10m air rifle women").
  what: Bi;
  medal: MedalKind;
};
export type MedalCount = { gold: number; silver: number; bronze: number };
export type MedalTally = {
  made_at: string;
  medals: Medal[];
  // India's tally and rank as the latest story gives them.
  reported: (MedalCount & { rank: number | null }) | null;
  // The top of the final (or latest) medal table, when the stories give it.
  table: (MedalCount & { country: Bi })[];
};

export const MEDALS_MAX = 120;
export const TABLE_MAX = 10;

const str = (v: unknown, max = 200) =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
const bi = (v: unknown, max = 200): Bi => {
  const o = (v ?? {}) as Record<string, unknown>;
  const en = str(typeof v === "string" ? v : o.en, max);
  const hi = str(o.hi, max);
  return { en: en || hi, hi: hi || en };
};
const count = (v: unknown) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 0 && n < 10_000 ? n : 0;
};
const medalOf = (v: unknown): MedalKind | null => {
  const s = str(v, 20).toLowerCase();
  return MEDALS.find((m) => s.startsWith(m)) ?? null;
};

export const isRajasthan = (m: Pick<Medal, "state">) =>
  /rajasthan|राजस्थान/i.test(`${m.state.en} ${m.state.hi}`);

export function countMedals(medals: Pick<Medal, "medal">[]): MedalCount & { total: number } {
  const out = { gold: 0, silver: 0, bronze: 0, total: 0 };
  for (const m of medals) {
    out[m.medal]++;
    out.total++;
  }
  return out;
}

// Gold first, then silver and bronze; Rajasthan's first within each.
export function sortMedals(medals: Medal[]): Medal[] {
  return medals
    .map((m, i) => ({ m, i }))
    .sort(
      (a, b) =>
        MEDALS.indexOf(a.m.medal) - MEDALS.indexOf(b.m.medal) ||
        Number(isRajasthan(b.m)) - Number(isRajasthan(a.m)) ||
        a.i - b.i,
    )
    .map((x) => x.m);
}

export function medalsMessages(o: {
  event: { name: string; place?: string };
  stories: { date: string; headline: string; facts: string[] }[];
  glossary?: GlossaryEntry[];
}): ChatMessage[] {
  return [
    {
      role: "system",
      content: `You make the medal tally of a sports event for a current affairs magazine for Rajasthan competitive exams, from the event's daily stories only (never your own knowledge; never add a medal, player, count or rank they don't give).
"medals": every medal won by India (each player or team once per medal, even when several stories repeat it): "who" (player or team), "state" (the player's Indian state when the stories say it, else ""), "what" (sport and event, e.g. "Shooting, 10m air rifle women"), "medal" ("gold", "silver" or "bronze").
"reported": India's total tally and rank as the latest story states them ({"gold", "silver", "bronze", "rank"}; rank null when not given), or null when no story states a tally.
"table": the top countries of the latest medal table the stories give (at most ${TABLE_MAX}, in order: {"country", "gold", "silver", "bronze"}), or [] when none is given.
Names and words in English and in Hindi.${hindiGuide(o.glossary)}
Reply with JSON only: {"medals": [{"who": {"en": "...", "hi": "..."}, "state": {"en": "...", "hi": "..."}, "what": {"en": "...", "hi": "..."}, "medal": "gold"}], "reported": {...} or null, "table": [{"country": {"en": "...", "hi": "..."}, "gold": 0, "silver": 0, "bronze": 0}]}`,
    },
    {
      role: "user",
      content: `Event: ${o.event.name}${o.event.place ? ` (${o.event.place})` : ""}\n\nDaily stories, oldest first:\n${o.stories
        .map(
          (s) =>
            `${s.date} · ${s.headline}\n${s.facts
              .slice(0, 16)
              .map((f) => `  - ${f}`)
              .join("\n")}`,
        )
        .join("\n")}`,
    },
  ];
}

// A tally from the AI's reply or an edit: bad rows dropped, a medal listed
// twice kept once.
export function normalizeMedals(v: unknown, madeAt?: string): MedalTally | null {
  const o = (v ?? null) as Record<string, unknown> | null;
  if (!o || typeof o !== "object" || !Array.isArray(o.medals)) return null;
  const seen = new Set<string>();
  const medals: Medal[] = [];
  for (const x of o.medals.slice(0, MEDALS_MAX * 2)) {
    const r = (x ?? {}) as Record<string, unknown>;
    const medal = medalOf(r.medal);
    const who = bi(r.who);
    if (!medal || !who.en) continue;
    const m: Medal = { who, state: bi(r.state, 80), what: bi(r.what), medal };
    const key = `${m.who.en}|${m.what.en}|${m.medal}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    medals.push(m);
    if (medals.length >= MEDALS_MAX) break;
  }
  const rep = (o.reported ?? null) as Record<string, unknown> | null;
  const reported =
    rep && typeof rep === "object"
      ? {
          gold: count(rep.gold),
          silver: count(rep.silver),
          bronze: count(rep.bronze),
          rank: rep.rank == null || rep.rank === "" ? null : count(rep.rank) || null,
        }
      : null;
  const table = (Array.isArray(o.table) ? o.table : [])
    .map((x) => {
      const r = (x ?? {}) as Record<string, unknown>;
      return {
        country: bi(r.country, 80),
        gold: count(r.gold),
        silver: count(r.silver),
        bronze: count(r.bronze),
      };
    })
    .filter((r) => r.country.en)
    .slice(0, TABLE_MAX);
  return {
    made_at: str(o.made_at, 40) || madeAt || new Date().toISOString(),
    medals,
    reported: reported && reported.gold + reported.silver + reported.bronze ? reported : null,
    table,
  };
}

export function parseMedals(raw: string, madeAt: string): MedalTally | null {
  const body = raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  try {
    return normalizeMedals(
      JSON.parse(body.slice(body.indexOf("{"), body.lastIndexOf("}") + 1)),
      madeAt,
    );
  } catch {
    return null;
  }
}

// India's tally as printed: the reported one, else counted from the list.
export function indiaTally(t: MedalTally): MedalCount & { total: number; rank: number | null } {
  const c = t.reported ?? countMedals(t.medals);
  return {
    gold: c.gold,
    silver: c.silver,
    bronze: c.bronze,
    total: c.gold + c.silver + c.bronze,
    rank: t.reported?.rank ?? null,
  };
}
