// The current affairs exam blueprint: which kinds of news RAS asks about, and
// for each kind, the only facts worth keeping. The AI tags every fact with one
// of these slots; anything that fits no slot (quotes, ceremony details, vague
// claims) is thrown away before the story is written.
//
// Checked against RAS Prelims 2024 (held 2 Feb 2025): about 55 of the 150
// questions were current affairs or recent data, and about 24 of those were
// about Rajasthan. What they asked most: where something is (district, place,
// host), numbers and targets with their years, policy validity dates, who
// built, funded, inaugurated or chaired something, edition and "first" facts,
// ranks, and eligibility.

export type FactSlot = {
  id: string;
  label: string;
  // The slot can hold more than one fact (e.g. several key provisions).
  many?: boolean;
};

export type StoryType = {
  id: string;
  label: string;
  slots: FactSlot[];
  // Most facts a story of this type keeps.
  maxFacts: number;
};

const slot = (id: string, label: string, many = false): FactSlot => ({ id, label, many });

export const STORY_TYPES: StoryType[] = [
  {
    id: "scheme",
    label: "Government scheme, mission, programme or project (central or Rajasthan)",
    maxFacts: 6,
    slots: [
      slot("name", "official name and phase"),
      slot("by", "ministry, department or state that runs it"),
      slot("funded", "funding or assisting agency (JICA, World Bank, ADB…)"),
      slot("launched", "launch date or place"),
      slot("aim", "objective"),
      slot("who", "who is eligible or benefits, with the criteria"),
      slot("reach", "coverage: households, districts, sanctuaries…", true),
      slot("money", "subsidy, loan, outlay or benefit amount", true),
      slot("feature", "a key feature", true),
    ],
  },
  {
    id: "policy",
    label: "State or national policy (mineral, MSME, M-Sand, industrial…)",
    maxFacts: 6,
    slots: [
      slot("name", "name and year of the policy"),
      slot("by", "government or department"),
      slot("date", "date announced or notified"),
      slot("valid", "in force until"),
      slot("target", "a numeric target with its year", true),
      slot("feature", "a key provision or incentive", true),
    ],
  },
  {
    id: "law",
    label: "Bill, act, rule, ordinance, constitutional body's decision or court judgment",
    maxFacts: 6,
    slots: [
      slot("name", "name of the law, rule or case"),
      slot("by", "ministry, house, court or bench"),
      slot("date", "date passed, notified or decided"),
      slot("provision", "a key provision, term of reference or ruling", true),
      slot("article", "constitutional article or section involved"),
      slot("applies", "who or where it applies to"),
    ],
  },
  {
    id: "index",
    label: "Index, ranking, report or survey",
    maxFacts: 5,
    slots: [
      slot("name", "name of the index or report"),
      slot("by", "who publishes it"),
      slot("edition", "edition or year"),
      slot("india", "India's rank or score, out of how many"),
      slot("rajasthan", "Rajasthan's rank or score"),
      slot("top", "top or bottom country or state", true),
      slot("compare", "comparison with neighbours or the last edition", true),
    ],
  },
  {
    id: "economy",
    label: "Economic data, budget, Economic Review figures, banking or trade",
    maxFacts: 5,
    slots: [
      slot("indicator", "what is measured or decided"),
      slot("value", "the figure", true),
      slot("change", "change from the previous year"),
      slot("compare", "limit or benchmark it is compared with (FRBM limit…)", true),
      slot("rank", "state's rank or share in India"),
      slot("by", "released or decided by"),
      slot("period", "year or period it covers"),
    ],
  },
  {
    id: "infrastructure",
    label:
      "Industrial area, park, zone, plant, centre of excellence, model village or other facility",
    maxFacts: 5,
    slots: [
      slot("name", "name of the facility"),
      slot("where", "district or place"),
      slot("by", "developed or run by (RIICO, ICAR…)"),
      slot("aim", "purpose, crop or product it is for"),
      slot("money", "cost or investment", true),
      slot("first", "first, largest or record"),
    ],
  },
  {
    id: "institution",
    label: "New institution, app, portal or body (launched, renamed or replacing another)",
    maxFacts: 4,
    slots: [
      slot("name", "name"),
      slot("by", "launched or set up by"),
      slot("replaces", "what it replaces or was renamed from"),
      slot("aim", "what it does"),
      slot("date", "launch date"),
    ],
  },
  {
    id: "appointment",
    label: "Appointment to a constitutional, statutory, national or Rajasthan state post",
    maxFacts: 4,
    slots: [
      slot("person", "who was appointed"),
      slot("post", "post and organisation"),
      slot("date", "date of taking office"),
      slot("predecessor", "whom they replace"),
      slot("term", "term or tenure"),
      slot("org", "the organisation's headquarters or founding year"),
    ],
  },
  {
    id: "election",
    label: "Election or by-election: results and turnout data",
    maxFacts: 4,
    slots: [
      slot("where", "state or constituencies"),
      slot("result", "winner or result"),
      slot("turnout", "turnout figure or record (highest, lowest, women vs men)", true),
      slot("voting", "home voting, service voters or other voting figures", true),
      slot("date", "date"),
    ],
  },
  {
    id: "award",
    label: "Award or honour",
    maxFacts: 4,
    slots: [
      slot("award", "name of the award and edition"),
      slot("winner", "recipient and their country or state", true),
      slot("for", "work or field it is given for"),
      slot("by", "who gives it"),
      slot("prize", "prize money or what it includes"),
    ],
  },
  {
    id: "sports",
    label: "Sports result, championship, host or medal tally",
    maxFacts: 4,
    slots: [
      slot("event", "event and edition"),
      slot("host", "host city, state or country"),
      slot("winner", "winner, their sport or medal won", true),
      slot("tally", "medal tally of India or Rajasthan", true),
      slot("scale", "number of sports, disciplines or teams"),
      slot("record", "record or first"),
    ],
  },
  {
    id: "international",
    label: "Summit, dialogue, agreement, visit, foreign election or international organisation",
    maxFacts: 5,
    slots: [
      slot("event", "summit, meeting, agreement or election and edition"),
      slot("where", "host city or country"),
      slot("date", "date"),
      slot("parties", "countries or organisations involved"),
      slot("chair", "who chaired, co-chaired or led it, or who was elected"),
      slot("theme", "theme or motto"),
      slot("outcome", "a decision or outcome", true),
    ],
  },
  {
    id: "defence",
    label: "Defence exercise, weapon system or security",
    maxFacts: 4,
    slots: [
      slot("name", "name of the exercise, system or mission"),
      slot("by", "developed by (DRDO…) or organised by"),
      slot("parties", "countries or forces involved"),
      slot("where", "where it takes place"),
      slot("kind", "what kind it is and what it does"),
      slot("first", "edition, first or record"),
    ],
  },
  {
    id: "science",
    label: "Space, science, technology, agriculture research or health",
    maxFacts: 6,
    slots: [
      slot("name", "mission, discovery, technology, breed or disease"),
      slot("by", "agency or institution that built or runs it"),
      slot("where", "location, with altitude or other notable figure"),
      slot("inaugurated", "who inaugurated or launched it"),
      slot("aim", "purpose"),
      slot("date", "launch or announcement date"),
      slot("detail", "a key technical detail (vehicle, breed, material…)", true),
      slot("first", "first, largest, highest or record"),
    ],
  },
  {
    id: "environment",
    label: "Environment, wildlife, protected or conservation area, or GI tag",
    maxFacts: 5,
    slots: [
      slot("name", "species, site, product or phenomenon"),
      slot("where", "state, district or region"),
      slot("status", "status or recognition (IUCN, Ramsar, GI, tiger reserve…)"),
      slot("rank", "number in the series (54th tiger reserve) or size rank"),
      slot("size", "area or size"),
      slot("feature", "a notable feature", true),
      slot("by", "who declared or found it"),
    ],
  },
  {
    id: "day",
    label: "Important day, week or anniversary",
    maxFacts: 3,
    slots: [
      slot("day", "name of the day"),
      slot("date", "date"),
      slot("theme", "this year's theme"),
      slot("since", "who started it and when"),
    ],
  },
  {
    id: "person",
    label: "Person in news or obituary",
    maxFacts: 3,
    slots: [
      slot("person", "who"),
      slot("known", "what they are known for", true),
      slot("from", "home state or district"),
    ],
  },
  {
    id: "other",
    label: "Any other exam-relevant decision or event",
    maxFacts: 4,
    slots: [
      slot("what", "what was decided or happened"),
      slot("who", "who decided or did it"),
      slot("where", "where"),
      slot("when", "when"),
      slot("total", "new total or count after the decision (e.g. 11 classical languages)"),
      slot("figure", "a key number", true),
    ],
  },
];

export const SKIP_STORIES = [
  "crime, accidents and disasters reported only as casualty counts",
  "political statements, allegations, protests and party politics (but keep election results and turnout data)",
  "routine meetings, reviews, inspections, visits and foundation stones of small local works",
  "transfers and postings below the head of a department or state body",
  "plans, demands or proposals with no decision yet",
  "local civic complaints, weather updates, markets and stock tips, entertainment, celebrities, horoscopes (but keep new apps, portals and model initiatives of Rajasthan city bodies and villages)",
];

export const DROP_FACTS = [
  "who said or praised something, and any quotes",
  "chief guests and attendees of routine ceremonies (but keep who inaugurated or chaired a national or international event, institution or summit)",
  "venue or time of a press conference or ceremony",
  "procedural steps (proposal sent, meeting held, file approved by)",
  "vague benefits (will boost growth, is a significant step, will help people)",
  "anything not about the story itself",
];

export const IMPORTANCE_GUIDE = `RPSC asks a lot about Rajasthan, including small items, so Rajasthan news with a name, place or number is never 1.
3 = very likely: Rajasthan government schemes, policies (their targets and validity), budget and Economic Review figures, new industrial areas, parks and centres of excellence with their districts, conservation reserves and protected areas, state appointments, by-election data and Rajasthan's medals; national flagship schemes, new laws, constitutional bodies' decisions and Supreme Court judgments; indices and reports giving India's or Rajasthan's rank; Nobel, Bharat Ratna, Padma and national awards; heads of national bodies; DRDO, ISRO and science firsts ("India's first", "world's highest"); India's summits, dialogues and agreements; new tiger reserves, Ramsar sites and GI tags.
2 = possible: any other Rajasthan news with a name, place or number (apps, portals, model villages, city bodies' initiatives); other central schemes, reports, apps and decisions; foreign elections and international summits; Khelo India, National Games, national championships and world titles; defence exercises; important days.
1 = unlikely: minor tournaments with no Indian or Rajasthan winner, routine appointments below the head of a body, follow-ups with nothing new.`;

// The blueprint as prompt text.
export function blueprintText(): string {
  const types = STORY_TYPES.map(
    (t) =>
      `- "${t.id}" (${t.label}, at most ${t.maxFacts} facts): ${t.slots
        .map((s) => `"${s.id}" = ${s.label}${s.many ? " (may repeat)" : ""}`)
        .join("; ")}`,
  ).join("\n");
  return `STORY TYPES and the only facts worth keeping for each (fact slots):
${types}
SKIP these stories entirely: ${SKIP_STORIES.join("; ")}.
NEVER keep these as facts: ${DROP_FACTS.join("; ")}.
IMPORTANCE: ${IMPORTANCE_GUIDE}`;
}

// Slots that may hold several facts in some story type.
export const REPEATABLE_SLOTS = new Set(
  STORY_TYPES.flatMap((t) => t.slots.filter((s) => s.many).map((s) => s.id)),
);

const TYPES_BY_ID = new Map(STORY_TYPES.map((t) => [t.id, t]));
const norm = (v: unknown) =>
  String(v ?? "")
    .trim()
    .toLowerCase();

export function storyType(id: unknown): StoryType {
  return TYPES_BY_ID.get(norm(id)) ?? TYPES_BY_ID.get("other")!;
}

// Keeps only facts in a slot of the story's type: one fact per slot unless the
// slot may repeat, at most the type's limit, in the order given.
export function keepSlotted<F extends { slot?: string }>(type: StoryType, facts: F[]): F[] {
  const slots = new Map(type.slots.map((s) => [s.id, s]));
  const used = new Set<string>();
  const out: F[] = [];
  for (const f of facts) {
    const s = slots.get(norm(f.slot));
    if (!s || (!s.many && used.has(s.id))) continue;
    used.add(s.id);
    out.push({ ...f, slot: s.id });
    if (out.length >= type.maxFacts) break;
  }
  return out;
}

// Stories a day the magazine keeps unless the admin sets another number.
export const DEFAULT_DAILY_STORIES = 15;

// Whether a new story goes into the issue or arrives already dropped (the
// admin can bring it back). Must-know stories always go in.
export function startsIncluded(
  importance: number,
  includedSoFar: number,
  limit: number,
  rajasthan = false,
): boolean {
  if (importance >= 3) return true;
  if (importance <= 1) return false;
  // Rajasthan stories may go past the limit, up to twice it, so one big
  // Rajasthan upload can't flood the day.
  return includedSoFar < (rajasthan ? limit * 2 : limit);
}
