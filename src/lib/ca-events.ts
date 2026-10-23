// Events that run over several days: the Olympics, a COP summit, Khelo India
// games, an international exhibition. Reading a source, the AI names the
// event a story belongs to; the day's stories of one event become one
// roundup, and when the event concludes its complete summary prints in the
// monthly magazine of the month it ended (in place of its daily stories).
// Pure helpers, shared by the server, the admin panel and tests.
import { hindiGuide, type GlossaryEntry } from "../../supabase/functions/_shared/ca-hindi.ts";
import type { CaContent, CaFact } from "@/lib/current-affairs";

export const EVENT_KINDS = [
  { id: "sports", label: "Sports" },
  { id: "summit", label: "Summit" },
  { id: "conference", label: "Conference" },
  { id: "exhibition", label: "Fair or exhibition" },
  { id: "election", label: "Election" },
  { id: "other", label: "Other" },
] as const;
export type EventKind = (typeof EVENT_KINDS)[number]["id"];
export const isEventKind = (v: unknown): v is EventKind => EVENT_KINDS.some((k) => k.id === v);

export type CaEvent = {
  id: string;
  name: string;
  name_hi: string;
  kind: EventKind;
  place: string;
  starts_on: string | null;
  ends_on: string | null;
  status: "running" | "concluded";
  // The complete summary, once written (the same shape as a story's text).
  summary: CaContent | null;
  created_at: string;
  updated_at: string;
};

// What the extraction prompt asks for, and what it gives back.
export type RawEvent = { name: string; kind: EventKind; ended: boolean };

export const EVENT_FIELD = `"event": when the story is part of an event that runs over several days (a sports games or championship, a summit, conference or COP, an international fair or exhibition, an election), {"name": the event's full official English name with its year and place as commonly written (e.g. "Paris Olympics 2024", "COP29 Baku 2024", "Khelo India Youth Games 2025", "ICC Champions Trophy 2025"), "kind": one of "sports", "summit", "conference", "exhibition", "election", "other", "ended": true only if the story reports that the whole event has concluded (closing ceremony, final day, the final match decided)}; otherwise null. Every result, medal, record or team news of a multi-sport games (Olympics, Paralympics, Asian Games, Para Asian Games, Commonwealth Games, National Games, Khelo India Games…) or a tournament is part of that event, even when the story is about one player. A one-day event, a scheme or a policy is not an event`;

export function parseRawEvent(v: unknown): RawEvent | null {
  const o = (v ?? null) as Record<string, unknown> | null;
  if (!o || typeof o !== "object") return null;
  const name = typeof o.name === "string" ? o.name.replace(/\s+/g, " ").trim().slice(0, 120) : "";
  if (name.length < 3) return null;
  return { name, kind: isEventKind(o.kind) ? o.kind : "other", ended: o.ended === true };
}

// Names compared without case, punctuation or spacing ("COP-29, Baku" and
// "cop29 baku" are one event).
export const eventNameKey = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

// The month (first day) an event's complete summary prints in: the month it
// ended.
export const summaryMonth = (e: Pick<CaEvent, "status" | "ends_on">) =>
  e.status === "concluded" && e.ends_on ? `${e.ends_on.slice(0, 7)}-01` : null;

const monthOf = (date: string) => `${date.slice(0, 7)}-01`;

// The monthly magazine's "Events of the month": an event that concluded this
// month with its summary written prints the summary in place of its daily
// stories; any other event with stories this month has them grouped under
// its name, noting when it continues next month.
export type EventBlock<T> = {
  event: CaEvent;
  mode: "summary" | "stories";
  items: T[];
  continues: boolean;
};

export function monthlyEvents<T extends { event_id?: string | null; issue_date: string }>(
  items: T[],
  events: CaEvent[],
  month: string,
): { blocks: EventBlock<T>[]; rest: T[] } {
  const byId = new Map(events.map((e) => [e.id, e]));
  const linked = new Map<string, T[]>();
  for (const it of items) {
    if (it.event_id && byId.has(it.event_id))
      linked.set(it.event_id, [...(linked.get(it.event_id) ?? []), it]);
  }
  const blocks: EventBlock<T>[] = [];
  for (const e of events) {
    const own = linked.get(e.id) ?? [];
    const endsHere = summaryMonth(e) === month;
    if (endsHere && e.summary) {
      blocks.push({ event: e, mode: "summary", items: own, continues: false });
    } else if (own.length) {
      const endedBy = e.status === "concluded" && e.ends_on && monthOf(e.ends_on) <= month;
      blocks.push({ event: e, mode: "stories", items: own, continues: !endedBy });
    }
  }
  // Summaries first, then by the event's first story.
  const first = (b: EventBlock<T>) =>
    b.items.map((i) => i.issue_date).sort()[0] ?? b.event.ends_on ?? "";
  blocks.sort(
    (a, b) =>
      Number(b.mode === "summary") - Number(a.mode === "summary") ||
      first(a).localeCompare(first(b)),
  );
  const inBlocks = new Set(blocks.flatMap((b) => b.items));
  return { blocks, rest: items.filter((it) => !inBlocks.has(it)) };
}

// Events that concluded in the month but have no summary yet.
export const summariesMissing = (events: CaEvent[], month: string) =>
  events.filter((e) => summaryMonth(e) === month && !e.summary);

type ChatMessage = { role: "system" | "user"; content: string };

// The story of the day for one event, as a roundup: the writing prompt gets
// this note.
export function roundupNote(eventName: string, kind?: string | null): string {
  const base = `\nTHIS IS THE DAY'S ROUNDUP OF "${eventName}": the facts may be several separate results or developments of the same event (different players' medals, different matches, different decisions). The headline names the event and the day's main highlights; each fact stays its own point (never merge two results into one); the summary links them as the day's progress of the event.`;
  if (kind !== "sports") return base;
  // A games' day for India: its medals as a table students can revise from.
  return `${base}
For this sports event: the headline gives India's medals of the day (e.g. "Para Asian Games 2026: India wins 3 gold, 2 silver on Day 4"); each medal is one point written as "Player (state) – sport, event – medal", gold first, with Rajasthan's players marked "(Rajasthan)"; then India's medal tally so far and rank if the facts give them, and any record. When a visual is asked for, make it a table of the day's medals with the columns Player, State, Sport / event, Medal.`;
}

export const EVENT_POINTS_MAX = 14;

// The complete summary of a concluded event, from all its daily stories.
export function eventSummaryMessages(opts: {
  event: Pick<CaEvent, "name" | "kind" | "place" | "starts_on" | "ends_on">;
  stories: { date: string; headline: string; facts: CaFact[] }[];
  glossary?: GlossaryEntry[];
  summaryWords?: number;
}): ChatMessage[] {
  const words = Math.round((opts.summaryWords ?? 70) * 1.6);
  const stories = opts.stories
    .slice(0, 40)
    .map(
      (s) =>
        `${s.date} · ${s.headline}\n${s.facts
          .slice(0, 10)
          .map((f) => `  - ${f.text}`)
          .join("\n")}`,
    )
    .join("\n");
  return [
    {
      role: "system",
      content: `You write a bilingual (Hindi and English) monthly current affairs magazine for Rajasthan competitive exam aspirants (RPSC and RSSB exams, with depth for RAS Mains). An event that ran over several days has concluded; write ONE complete summary article of the whole event from its daily stories, the way exam magazines present a concluded Olympics, summit or championship.
RULES: Use only the facts in the daily stories (dates, places, names, numbers exactly as given). Later facts replace earlier ones (a final medal tally replaces a running one). Never add a result, number or name that is not in them.
CONTENT, as the facts allow, most exam-worthy first: when and where it was held and who organised or hosted it; participation; the final outcome (winners, final standings or medal tally, main declarations or decisions); India's performance and every Indian medal or role; Rajasthan's players or role; records, firsts and milestones; mascot, theme or slogan; the next edition's host.
"summary": 4-6 connected sentences, about ${words} words. "points": up to ${EVENT_POINTS_MAX} short points (at most 18 words each), each starting with the key term, name or number. "why": the RAS syllabus label ('GS Paper <number> · <subject> · <topic in at most 6 words>'). "mcq": one RAS Prelims-style question on the event's exact details (host, winner, ordinal, count, mascot), four options of the same kind, decidable from the facts. "mains": a Mains question only for a summit, conference or a sports achievement of India or Rajasthan, else null.${hindiGuide(opts.glossary)}
Reply with JSON only:
{"headline": {"en": "...", "hi": "..."}, "summary": {"en": "...", "hi": "..."}, "points": [{"en": "...", "hi": "..."}], "why": {"en": "...", "hi": "..."}, "keywords": [], "statics": [], "mcq": {"question": {"en": "...", "hi": "..."}, "options": [{"en": "...", "hi": "..."} x4], "answer": index 0-3, "explanation": {"en": "...", "hi": "..."}} or null, "mains": {"en": "...", "hi": "..."} or null}`,
    },
    {
      role: "user",
      content: `Event: ${opts.event.name} (${opts.event.kind}${opts.event.place ? `, ${opts.event.place}` : ""})${opts.event.starts_on ? `\nFirst news: ${opts.event.starts_on}` : ""}${opts.event.ends_on ? `\nConcluded: ${opts.event.ends_on}` : ""}\n\nDaily stories, oldest first:\n${stories}`,
    },
  ];
}
