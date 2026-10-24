// Official source check: a story's scheme, money, date and appointment facts
// compared with official sources (SAATHI's knowledge base, which holds the
// Economic Review and other government books, and PIB, DIPR and other
// government websites). Each fact is marked confirmed, differs (with the
// official value) or not found. Shared by the server and the admin pages.
import type { CaFact } from "@/lib/current-affairs";

type ChatMessage = { role: "system" | "user"; content: string };

export type OfficialStatus = "confirmed" | "differs" | "not_found";

// Kept on the fact; `text` is the fact as it was checked, so an edited fact
// counts as not checked again.
export type OfficialCheck = {
  status: OfficialStatus;
  text: string;
  // What the official source says, when it differs.
  value?: string;
  source?: string;
  url?: string;
  // The editor kept the story's own value after a difference.
  kept?: boolean;
  at: string;
};

// Government websites searched for the facts, official ones first.
export const OFFICIAL_DOMAINS = [
  "pib.gov.in",
  "dipr.rajasthan.gov.in",
  "rajasthan.gov.in",
  "gov.in",
  "nic.in",
  "rbi.org.in",
  "sansad.in",
];

// Facts worth checking: names, amounts, dates, posts and counts.
const OFFICIAL_SLOTS = new Set([
  "name",
  "fullform",
  "by",
  "money",
  "date",
  "launched",
  "period",
  "who",
  "post",
  "person",
  "predecessor",
  "term",
  "target",
  "total",
  "value",
  "figure",
  "reach",
  "districts",
  "helpline",
  "funded",
  "inaugurated",
  "released",
  "valid",
  "scale",
  "capacity",
  "size",
]);
// Most facts checked per story.
export const OFFICIAL_MAX_FACTS = 8;
// Stories checked per step of a day's check.
export const OFFICIAL_DAY_BATCH = 3;

type FactLike = Pick<CaFact, "text"> & { slot?: string; official?: OfficialCheck };

export function checkable(f: FactLike): boolean {
  return !!f.text && ((!!f.slot && OFFICIAL_SLOTS.has(f.slot)) || /\d/.test(f.text));
}

// The facts of a story to check (their places in the list).
export function factsToCheck(facts: FactLike[]): number[] {
  return facts
    .map((f, i) => (checkable(f) ? i : -1))
    .filter((i) => i >= 0)
    .slice(0, OFFICIAL_MAX_FACTS);
}

// The fact's check, unless the fact was edited since.
export function officialOf(f: FactLike): OfficialCheck | null {
  return f.official && f.official.text === f.text ? f.official : null;
}

export type OfficialCounts = {
  confirmed: number;
  differs: number;
  not_found: number;
  unchecked: number;
};

// A difference the editor kept counts as settled (with the confirmed).
export function officialCounts(facts: FactLike[]): OfficialCounts {
  const out: OfficialCounts = { confirmed: 0, differs: 0, not_found: 0, unchecked: 0 };
  for (const i of factsToCheck(facts)) {
    const c = officialOf(facts[i]);
    if (!c) out.unchecked++;
    else if (c.status === "differs" && c.kept) out.confirmed++;
    else out[c.status]++;
  }
  return out;
}

export type OfficialSource = { title: string; url?: string; content: string };

export function officialMessages(o: {
  headline: string;
  facts: string[];
  sources: OfficialSource[];
}): ChatMessage[] {
  return [
    {
      role: "system",
      content: `You check a current affairs story's facts against official sources (government books such as the Economic Review, and government websites such as PIB and DIPR) for a magazine for Rajasthan competitive exams.
For each fact: "confirmed" when a source states the same thing (same name, amount, date, number, post or person; a rounded or differently written form of the same value counts); "differs" when a source clearly states a different value for the same thing (a different amount, date, count, name or post holder) — give the official value in a few words; "not_found" when no source states it. A source about a different scheme, year or edition is not about the same thing. Only the sources given; never your own knowledge.
Reply with JSON only: [{"fact": fact number, "status": "confirmed" | "differs" | "not_found", "value": "the official value, for differs", "source": source number}]`,
    },
    {
      role: "user",
      content: `Story: ${o.headline}
Facts:
${o.facts.map((f, i) => `${i + 1}. ${f}`).join("\n")}

Sources:
${o.sources.map((s, i) => `[${i + 1}] ${s.title}${s.url ? ` (${s.url})` : ""}\n${s.content}`).join("\n\n")}`,
    },
  ];
}

// The AI's reply as a check per fact (by its place in `facts`); a "confirmed"
// or "differs" without a real source (or a "differs" without the value) is
// "not found". Empty when the reply can't be read.
export function parseOfficial(
  raw: string,
  facts: { index: number; text: string }[],
  sources: OfficialSource[],
  at: string,
): Map<number, OfficialCheck> {
  const out = new Map<number, OfficialCheck>();
  const body = raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  let list: unknown;
  try {
    list = JSON.parse(body.slice(body.indexOf("["), body.lastIndexOf("]") + 1));
  } catch {
    return out;
  }
  for (const x of Array.isArray(list) ? list : []) {
    const o = (x ?? {}) as Record<string, unknown>;
    const f = facts[Number(o.fact) - 1];
    if (!f || out.has(f.index)) continue;
    const src = sources[Number(o.source) - 1];
    let status = (["confirmed", "differs", "not_found"] as const).find((s) => s === o.status);
    const value = typeof o.value === "string" ? o.value.trim().slice(0, 300) : "";
    if (!status) continue;
    if (status !== "not_found" && !src) status = "not_found";
    if (status === "differs" && !value) status = "not_found";
    out.set(f.index, {
      status,
      text: f.text,
      ...(status === "differs" ? { value } : {}),
      ...(status !== "not_found" && src
        ? { source: src.title.slice(0, 200), ...(src.url ? { url: src.url } : {}) }
        : {}),
      at,
    });
  }
  // Facts the AI left out: not found.
  for (const f of facts)
    if (!out.has(f.index)) out.set(f.index, { status: "not_found", text: f.text, at });
  return out;
}

export const OFFICIAL_LABEL: Record<OfficialStatus, string> = {
  confirmed: "Confirmed from official source",
  differs: "Differs from official source",
  not_found: "Not found in official sources",
};
