// The current affairs exam blueprint: which kinds of news RAS asks about, and
// for each kind, the only facts worth keeping. The AI tags every fact with one
// of these slots; anything that fits no slot (quotes, ceremony details, vague
// claims) is thrown away before the story is written.

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
    label: "Government scheme, mission or programme (central or Rajasthan)",
    maxFacts: 6,
    slots: [
      slot("name", "official name"),
      slot("by", "ministry, department or state that runs it"),
      slot("launched", "launch date or place"),
      slot("aim", "objective"),
      slot("who", "beneficiaries or coverage"),
      slot("money", "outlay, budget or benefit amount"),
      slot("feature", "a key feature", true),
    ],
  },
  {
    id: "law",
    label: "Bill, act, policy, rule, ordinance or court judgment",
    maxFacts: 6,
    slots: [
      slot("name", "name of the law, policy or case"),
      slot("by", "ministry, house, court or bench"),
      slot("date", "date passed, notified or decided"),
      slot("provision", "a key provision or ruling", true),
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
      slot("india", "India's rank or score"),
      slot("rajasthan", "Rajasthan's rank or score"),
      slot("top", "top or bottom country or state", true),
    ],
  },
  {
    id: "appointment",
    label: "Appointment to a constitutional, statutory or national post",
    maxFacts: 4,
    slots: [
      slot("person", "who was appointed"),
      slot("post", "post and organisation"),
      slot("predecessor", "whom they replace"),
      slot("term", "term or tenure"),
      slot("org", "the organisation's headquarters or founding year"),
    ],
  },
  {
    id: "award",
    label: "Award or honour",
    maxFacts: 4,
    slots: [
      slot("award", "name of the award and edition"),
      slot("winner", "recipient", true),
      slot("for", "work or field it is given for"),
      slot("by", "who gives it"),
      slot("prize", "prize money or what it includes"),
    ],
  },
  {
    id: "sports",
    label: "Major sports result or record",
    maxFacts: 4,
    slots: [
      slot("event", "event and edition"),
      slot("winner", "winner or medal won", true),
      slot("venue", "host city or country"),
      slot("record", "record or first"),
    ],
  },
  {
    id: "international",
    label: "Summit, agreement, visit or international organisation",
    maxFacts: 5,
    slots: [
      slot("event", "summit, meeting or agreement and edition"),
      slot("where", "host city or country"),
      slot("parties", "countries or organisations involved"),
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
      slot("parties", "countries or forces involved"),
      slot("where", "where it takes place"),
      slot("kind", "what kind it is (naval, missile range, etc.)"),
      slot("first", "first, record or edition"),
    ],
  },
  {
    id: "science",
    label: "Space, science, technology or health",
    maxFacts: 5,
    slots: [
      slot("name", "mission, discovery, technology or disease"),
      slot("by", "agency or institution"),
      slot("aim", "purpose"),
      slot("date", "launch or announcement date"),
      slot("detail", "a key technical detail (vehicle, orbit, vaccine…)", true),
      slot("first", "first or record"),
    ],
  },
  {
    id: "economy",
    label: "Economic data, budget, banking or trade",
    maxFacts: 4,
    slots: [
      slot("indicator", "what is measured or decided"),
      slot("value", "the figure", true),
      slot("change", "change from before"),
      slot("by", "released or decided by"),
      slot("period", "period it covers"),
    ],
  },
  {
    id: "environment",
    label: "Environment, wildlife, protected area or GI tag",
    maxFacts: 4,
    slots: [
      slot("name", "species, site, product or phenomenon"),
      slot("where", "state, district or region"),
      slot("status", "status or recognition (IUCN, Ramsar, GI, tiger reserve…)"),
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
      slot("figure", "a key number", true),
    ],
  },
];

export const SKIP_STORIES = [
  "crime, accidents and disasters reported only as casualty counts",
  "political statements, allegations, protests and party politics",
  "routine meetings, reviews, inspections, visits and foundation stones of small local works",
  "transfers and postings below the head of a department or state body",
  "plans, demands or proposals with no decision yet",
  "local civic problems, weather updates, markets and stock tips, entertainment, celebrities, horoscopes",
];

export const DROP_FACTS = [
  "who said, praised, chaired, attended or inaugurated something, and any quotes",
  "ceremony details: chief guests, venue of a press conference, time of an event",
  "procedural steps (proposal sent, meeting held, file approved by)",
  "vague benefits (will boost growth, is a significant step, will help people)",
  "anything not about the story itself",
];

export const IMPORTANCE_GUIDE = `3 = very likely in the RAS exam: Rajasthan government schemes, policies, budgets, firsts and records; national flagship schemes, new laws and Supreme Court or constitutional judgments; indices and reports giving India's or Rajasthan's rank; Bharat Ratna, Padma, Nobel and major national awards; heads of constitutional and national bodies; ISRO and major defence firsts; India's major summits and agreements; GI tags, Ramsar sites and tiger reserves.
2 = possible: other central schemes and reports, decisions of international organisations, major sports results (Olympics, World Cups, Asian and Commonwealth Games, world titles), important days, environment and science news.
1 = unlikely: minor tournaments, routine appointments, minor international news, follow-ups with nothing new.`;

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
export function startsIncluded(importance: number, includedSoFar: number, limit: number): boolean {
  if (importance >= 3) return true;
  if (importance <= 1) return false;
  return includedSoFar < limit;
}
