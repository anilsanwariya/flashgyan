// The current affairs exam blueprint: which kinds of news RAS asks about, and
// for each kind, the only facts worth keeping. The AI tags every fact with one
// of these slots; anything that fits no slot (quotes, ceremony details, vague
// claims) is thrown away before the story is written.
//
// Checked against RPSC papers:
// - RAS Prelims 2024 (held 2 Feb 2025): about 55 of 150 questions were current
//   affairs or recent data, about 24 of them about Rajasthan.
// - Sub-Inspector Re-Exam 2021 GK & GS (held 20 Sep 2026): about 42 of 100,
//   about 20 about Rajasthan.
// - Sub-Inspector 2025 GK & GS, both shifts (held 5 and 6 Apr 2026): about 42
//   and 33 of 100, with 23 and 18 about Rajasthan.
// Also compared with two coaching institutes' September 2026 monthlies: about
// 266 stories (73 on Rajasthan) in one; in the other's 80-question summary, 29
// asked where or which district, 23 who, and 30 were about Rajasthan. They add
// places in the news, numbered conferences, a Rajasthan angle on national
// stories, helplines, capacities, index scope and awardees' home districts.
// The newest questions were from 7-8 weeks before each exam, Economic Survey,
// Rajasthan Economic Review and Budget figures gave 5-8 questions a paper and
// stayed in use for over a year, and small Rajasthan items (a school prize, a
// village panchayat, a state team's captain) were asked often. What they asked
// most: where something is (district, place, host), exact numbers, slabs and
// targets with their years, ordinals, policy validity dates, who built, funded,
// inaugurated or chaired something, edition and "first" facts, ranks,
// eligibility and benefit amounts, full forms, and partners of MoUs and contracts.

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
    label: "Government scheme, mission, programme, campaign or project (central or Rajasthan)",
    maxFacts: 7,
    slots: [
      slot("name", "official name and phase"),
      slot("fullform", "full form of its acronym"),
      slot("by", "ministry, department or state that runs it, and the implementing agency"),
      slot("funded", "funding or assisting agency (JICA, World Bank, ADB, KfW…)"),
      slot("launched", "launch date or place"),
      slot("period", "campaign or drive period, start and end dates"),
      slot("aim", "objective"),
      slot("who", "who is eligible or benefits, with the criteria"),
      slot("helpline", "helpline number, app or portal"),
      slot("reach", "coverage: households, districts, sanctuaries…", true),
      slot("money", "subsidy, loan, pension, outlay or benefit amount (per category)", true),
      slot("target", "a numeric target with its year", true),
      slot("districts", "districts it covers first or assigns things to (pilot districts…)", true),
      slot("impact", "results so far, with numbers", true),
      slot("rajasthan", "Rajasthan's figures or role in a national scheme", true),
      slot("feature", "a key feature", true),
    ],
  },
  {
    id: "policy",
    label: "State or national policy (mineral, MSME, GCC, AI, aerospace and defence…)",
    maxFacts: 6,
    slots: [
      slot("name", "name and year of the policy"),
      slot("by", "government or department"),
      slot("date", "date announced or notified"),
      slot("valid", "in force until"),
      slot("target", "a numeric target with its year", true),
      slot("districts", "cities or districts it names (hubs, zones)", true),
      slot("feature", "a key provision, incentive or slab with its figures", true),
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
      slot("provision", "a key provision, section with its number, or ruling", true),
      slot("article", "constitutional article or section involved"),
      slot("applies", "who or where it applies to"),
      slot("rajasthan", "Rajasthan's figures or role", true),
      slot("last", "previous occurrence, or how many times before"),
    ],
  },
  {
    id: "budget",
    label: "Union or Rajasthan Budget and its announcements",
    maxFacts: 10,
    slots: [
      slot("name", "budget, year, presented by and date"),
      slot("total", "size of the budget"),
      slot("value", "a fiscal figure (deficit, debt, revenue source)", true),
      slot("announce", "an announcement with its number, place or rate change from X to Y", true),
      slot("money", "an allocation", true),
      slot("target", "a numeric target with its year", true),
      slot("districts", "what it gives particular districts", true),
    ],
  },
  {
    id: "index",
    label: "Index, ranking, report, survey or departmental report (forest, monsoon…)",
    maxFacts: 6,
    slots: [
      slot("name", "name of the index or report"),
      slot("by", "who publishes it"),
      slot("edition", "edition or year"),
      slot("scope", "countries and indicators covered, and how often it is released"),
      slot("theme", "title or theme of this edition"),
      slot("india", "India's rank, score or category, out of how many"),
      slot("rajasthan", "Rajasthan's rank, score or category, overall or in a sub-index", true),
      slot("top", "top or bottom country or state", true),
      slot("districts", "highest or lowest districts with their figure", true),
      slot("record", "highest, lowest or record with its year"),
      slot("first", "first of its kind (e.g. first district-level estimates)"),
      slot("compare", "comparison with neighbours or the last edition", true),
    ],
  },
  {
    id: "economy",
    label:
      "Economic data: Economic Survey, Rajasthan Economic Review and statistics, banking, trade, poverty",
    maxFacts: 8,
    slots: [
      slot("indicator", "what is measured or decided"),
      slot("value", "the figure", true),
      slot("change", "change from the previous year"),
      slot("compare", "limit or benchmark it is compared with (FRBM limit…)", true),
      slot(
        "rank",
        "India's rank or share in the world, or Rajasthan's in India (one per item)",
        true,
      ),
      slot("top", "largest or smallest item, product, project or sector", true),
      slot("districts", "district-wise figure or rank, highest or lowest district", true),
      slot("rajasthan", "Rajasthan's figures in a national release", true),
      slot("by", "released or decided by (Economic Survey, Economic Review, RBI, World Bank…)"),
      slot("period", "year or period it covers"),
    ],
  },
  {
    id: "infrastructure",
    label:
      "Industrial area, park, zone, plant, barrage, centre of excellence, model village or other facility",
    maxFacts: 6,
    slots: [
      slot("name", "name of the facility"),
      slot("where", "district or place"),
      slot("sites", "each named site with its district or state", true),
      slot("river", "river it is built on"),
      slot("capacity", "capacity (MW, storage, length)"),
      slot("by", "developed or run by (RIICO, ICAR…)"),
      slot("aim", "purpose, crop or product it is for"),
      slot("money", "cost or investment", true),
      slot("total", "how many exist, as on a date"),
      slot("first", "first, largest or record"),
    ],
  },
  {
    id: "institution",
    label:
      "New institution, app, portal, platform or body (launched, renamed or replacing another), its motto or status (Navratna, Miniratna…)",
    maxFacts: 5,
    slots: [
      slot("name", "name"),
      slot("fullform", "full form of its acronym"),
      slot("by", "launched or set up by"),
      slot("replaces", "what it replaces or was renamed from"),
      slot("aim", "what it does"),
      slot("sites", "each named location with its district or state", true),
      slot("total", "how many exist, as on a date"),
      slot("date", "launch date"),
    ],
  },
  {
    id: "appointment",
    label:
      "Appointment to an important constitutional, statutory, national or Rajasthan state post (Chief Justice, judge, Governor, CEC, CAG, a commission's chair or member, RBI, SEBI, ISRO, armed forces chiefs, Chief Secretary, DGP…), Chief Minister, Indian-origin person appointed abroad, or government brand ambassador (state or district); a routine transfer or posting is least likely to be asked (importance 1)",
    maxFacts: 4,
    slots: [
      slot("person", "who was appointed"),
      slot("post", "post and organisation"),
      slot(
        "nth",
        "number in the series (13th Chief Minister, third Chief Information Commissioner)",
        true,
      ),
      slot("date", "date of taking office"),
      slot("predecessor", "whom they replace"),
      slot("earlier", "their previous post"),
      slot("term", "term or tenure"),
      slot("org", "the organisation's headquarters or founding year"),
    ],
  },
  {
    id: "election",
    label: "Election, by-election or electoral roll revision: results and data",
    maxFacts: 4,
    slots: [
      slot("where", "state or constituencies"),
      slot("result", "winner or result"),
      slot("seats", "seats or posts won by each party or candidate", true),
      slot("turnout", "turnout figure or record (highest, lowest, women vs men)", true),
      slot("voting", "home voting, service voters or other voting figures", true),
      slot("date", "date"),
    ],
  },
  {
    id: "award",
    label:
      "Award or honour outside sports (Bharat Ratna, Padma lists, Nobel, Booker, Jnanpith, gallantry awards, major film, music and literature awards); a sports award is sports",
    maxFacts: 6,
    slots: [
      slot("award", "name of the award and edition"),
      slot("winner", "recipient and their country, state or home district", true),
      slot("citation", "a winner's specific work, art form or category", true),
      slot("for", "work or field it is given for"),
      slot("by", "who gives it"),
      slot("who", "who is eligible, with the criteria"),
      slot("since", "year instituted and by whom"),
      slot("where", "festival or event where it was presented"),
      slot("prize", "prize money or what it includes"),
    ],
  },
  {
    id: "culture",
    label: "Festival, fair, exhibition, film or documentary, literature or art event",
    maxFacts: 5,
    slots: [
      slot("event", "event and edition"),
      slot("where", "where"),
      slot("date", "dates"),
      slot("by", "organised, made or produced by"),
      slot("featured", "artists, works or performers featured", true),
      slot("theme", "theme"),
    ],
  },
  {
    id: "sports",
    label:
      "Sports news of any kind, even about one player: result, medal, record, team selection or captain, championship, host, medal tally, sports body, tournament or sports award (Khel Ratna, Arjuna, Dronacharya…); an olympiad result",
    maxFacts: 6,
    slots: [
      slot("event", "event and edition"),
      slot("host", "host city, state or country"),
      slot("winner", "winner with their country or state, sport, event or medal won", true),
      slot("opponent", "team or player beaten in the final or medal match", true),
      slot("captain", "captain or notable member of India's or Rajasthan's team", true),
      slot("tally", "medal tally of India or Rajasthan", true),
      slot("scale", "number of sports, disciplines or teams"),
      slot("date", "dates"),
      slot("mascot", "mascot or theme"),
      slot("record", "record or first"),
    ],
  },
  {
    id: "international",
    label:
      "Summit, dialogue, talks, agreement, visit, international dispute, foreign election or international organisation",
    maxFacts: 5,
    slots: [
      slot("event", "summit, meeting, agreement or election and edition"),
      slot("fullform", "full form of an acronym in the event's name or theme"),
      slot("where", "host city or country"),
      slot("date", "date"),
      slot("nth", "how many times hosted, chaired or visited (fourth visit)", true),
      slot("last", "when it was last hosted or chaired"),
      slot("parties", "countries or organisations involved"),
      slot("chair", "who chaired, led or represented a country (envoy), or who was elected"),
      slot("leader", "head of state or government of a country in the news"),
      slot("theme", "theme or motto"),
      slot("outcome", "a decision or outcome", true),
    ],
  },
  {
    id: "defence",
    label: "Defence exercise, mission, weapon system, technology transfer or contract",
    maxFacts: 5,
    slots: [
      slot("name", "name of the exercise, system or mission"),
      slot("by", "developed by (DRDO…) or organised by"),
      slot("parties", "countries or forces involved"),
      slot("asset", "ship, aircraft or unit deployed and where it set out from", true),
      slot("where", "where it takes place"),
      slot("kind", "what kind it is and what it does"),
      slot("duration", "duration in days or months"),
      slot("scale", "ports, countries or units covered"),
      slot("contract", "contract or technology-transfer partners", true),
      slot("first", "edition, first or record"),
    ],
  },
  {
    id: "science",
    label: "Space launch, science, technology, new crop variety, agriculture research or health",
    maxFacts: 6,
    slots: [
      slot("name", "mission, satellite, discovery, technology, breed or disease"),
      slot("kind", "category (communication, navigation or earth-observation satellite…)"),
      slot("by", "agency or institution that built, developed or runs it"),
      slot("partner", "collaborating institution or company", true),
      slot("where", "location, with altitude or other notable figure, or regions it suits"),
      slot("inaugurated", "who inaugurated or launched it"),
      slot("aim", "purpose"),
      slot("date", "launch or announcement date"),
      slot("nth", "number in a series (18th GSLV flight, 102nd launch from Sriharikota)", true),
      slot("detail", "a key technical detail (vehicle, orbit, breed, material…)", true),
      slot("rajasthan", "Rajasthan's role or figures", true),
      slot("total", "how many exist or were launched, as on a date"),
      slot("first", "first, largest, highest or record"),
    ],
  },
  {
    id: "environment",
    label:
      "Environment, wildlife, breeding centre, protected or conservation area, district mascots, or GI tag",
    maxFacts: 6,
    slots: [
      slot("name", "species, site, product or phenomenon"),
      slot("where", "state, district or region"),
      slot("sites", "each named site or mascot with its district or state", true),
      slot("status", "status or recognition (IUCN, Ramsar, GI, tiger reserve…)"),
      slot("rank", "number in the series (54th tiger reserve) or size rank", true),
      slot("size", "area or size"),
      slot(
        "total",
        "new total in India or Rajasthan, as on a date (Ramsar sites, biosphere reserves)",
      ),
      slot("feature", "a notable feature", true),
      slot("by", "who declared or found it"),
    ],
  },
  {
    id: "agreement",
    label: "MoU or contract between government bodies, companies or foundations",
    maxFacts: 5,
    slots: [
      slot("parties", "who signed it"),
      slot("aim", "purpose"),
      slot("role", "a party's role (e.g. technical support unit)", true),
      slot("figure", "quantity or number supplied or covered", true),
      slot("date", "date signed"),
      slot("money", "value", true),
    ],
  },
  {
    id: "book",
    label: "Book released or authored",
    maxFacts: 3,
    slots: [
      slot("book", "title"),
      slot("author", "author(s)"),
      slot("released", "released by and date"),
      slot("theme", "subject"),
    ],
  },
  {
    id: "conference",
    label: "National or state conference, forum, summit or meeting with an edition, venue or theme",
    maxFacts: 5,
    slots: [
      slot("event", "conference and edition"),
      slot("where", "venue"),
      slot("date", "dates"),
      slot("by", "organised by"),
      slot("chair", "who chaired or co-chaired it"),
      slot("inaugurated", "who inaugurated it"),
      slot("theme", "theme"),
      slot("since", "held since"),
      slot("parties", "participants (countries, states, count)"),
      slot("outcome", "a decision or outcome", true),
    ],
  },
  {
    id: "place",
    label: "Place in the news (town, lake, mountain pass, region, island…)",
    maxFacts: 3,
    slots: [
      slot("name", "the place"),
      slot("where", "state, country or region it is in"),
      slot("why", "why it is in the news"),
      slot("feature", "a notable feature", true),
    ],
  },
  {
    id: "day",
    label: "Important day, week or anniversary",
    maxFacts: 4,
    slots: [
      slot("day", "name of the day"),
      slot("date", "date"),
      slot("theme", "this year's theme, slogan or hashtag"),
      slot("host", "host country or city of the global celebration"),
      slot("since", "who started it and when"),
    ],
  },
  {
    id: "person",
    label:
      "Person in news outside sports: a notable achievement, first or record, or the death of an eminent person (a player's result or selection is sports)",
    maxFacts: 4,
    slots: [
      slot("person", "who"),
      slot("known", "what they are known for", true),
      slot("feat", "first, record or selection (e.g. captain of India's team)", true),
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
      slot("nth", "number in a series", true),
      slot("last", "previous occurrence, or how many times before"),
      slot("total", "new total or count after the decision (e.g. 11 classical languages)"),
      slot("figure", "a key number", true),
      slot("rajasthan", "Rajasthan's figures or role", true),
    ],
  },
];

// Editorials are read for Mains: the issue, its static anchor, the evidence
// and the way forward. Not a news story type, so news never uses it.
export const EDITORIAL_TYPE: StoryType = {
  id: "editorial",
  label: "Newspaper editorial",
  maxFacts: 8,
  slots: [
    slot("issue", "the issue and the news that prompted it"),
    slot("context", "the constitutional article, act, institution, scheme or report involved"),
    slot("data", "a figure, date or finding it cites", true),
    slot("argument", "a main argument, cause or consequence", true),
    slot("challenge", "a problem or challenge it identifies", true),
    slot("suggestion", "a measure or way forward it suggests", true),
    slot("rajasthan", "Rajasthan's figures or role", true),
  ],
};

// Editorials worth a Mains aspirant's time, and those that are not.
export const EDITORIAL_TOPICS =
  "governance and public policy, the Constitution, judgments and institutions, the economy and budgets, agriculture, environment and climate, science and technology, India's foreign relations and international affairs, social issues (education, health, women, children, tribes) and Rajasthan";
export const EDITORIAL_SKIP =
  "party politics and election campaigning, personal columns, letters to the editor, film, sports and book reviews, obituaries, and foreign countries' domestic politics with no bearing on India";

export const SKIP_STORIES = [
  "crime, accidents and disasters reported only as casualty counts",
  "political statements, allegations, protests and party politics (but keep election results and data, and international disputes with the countries and heads of government involved)",
  "routine domestic meetings, reviews, inspections, visits and foundation stones of small local works (but keep talks between countries and the envoys leading them, and numbered conferences and forums with their edition, venue and organiser)",
  "transfers and postings below the head of a department or state body",
  "plans, demands or proposals with no decision yet",
  "daily weather updates and forecasts (but keep IMD or state monsoon reports and rainfall or temperature records with years and figures)",
  "film and TV gossip and celebrities' personal news (but keep major film, music and literature awards with category winners, beauty pageant titles, art exhibitions, literature festivals and government brand ambassadors)",
  "local civic complaints, markets and stock tips, horoscopes (but keep new apps, portals and model initiatives of Rajasthan city bodies and villages)",
];

export const DROP_FACTS = [
  "who said or praised something, and any quotes",
  "chief guests and attendees of routine ceremonies (but keep who inaugurated or chaired a national or international event, institution or summit)",
  "venue or time of a press conference or routine ceremony (but keep the festival or event at which an award is presented, e.g. Jaipur Literature Festival)",
  "procedural steps (proposal sent, meeting held, file approved by)",
  "vague benefits (will boost growth, is a significant step, will help people)",
  "anything not about the story itself",
];

// Long documents hold many exam stories; one story each keeps them from being
// squeezed into a single item.
export const LONG_DOCUMENTS = `A Budget, Economic Survey, Economic Review, year-end review or departmental report holds many stories: write one story per topic or scheme (a scheme's facts in a "scheme" story, figures in an "economy" story, announcements in a "budget" story), and keep exact figures, dates, ordinals and complete lists of pairs.`;

export const IMPORTANCE_GUIDE = `RPSC asks a lot about Rajasthan, including small items (a school prize, a village panchayat, a state team's captain), so Rajasthan news with a name, place or number is never 1.
3 = very likely: Rajasthan government schemes, policies (their targets, slabs and validity), Budget announcements with their places, Economic Survey and Rajasthan Economic Review figures, Rajasthan departments' reports with district figures (forest, monsoon, agriculture), Rajasthan people's and institutions' firsts, records, awards and India-team selections, new industrial areas, parks and centres of excellence with their districts, conservation reserves and protected areas, state appointments and brand ambassadors, by-election data and Rajasthan's medals; national flagship schemes, new laws and rules (and any news on the Rajasthan Public Examination (Measures for Prevention of Unfair Means in Recruitment) Act, 2022, which the RAS Prelims syllabus names), constitutional bodies' decisions and Supreme Court judgments; indices and reports giving India's or Rajasthan's rank; Nobel, Bharat Ratna, Padma and national awards; heads of national bodies, Chief Ministers and Governors of any state; DRDO, ISRO and science firsts ("India's first", "world's highest") and launches with their ordinals; India's summits, dialogues and agreements; new tiger reserves, Ramsar sites, biosphere reserves and GI tags.
2 = possible: any other Rajasthan news with a name, place or number (apps, portals, model villages, city bodies' initiatives, MoUs signed by state departments, exhibitions and festivals with featured artists); other central schemes, reports, apps and decisions; Navratna, Miniratna and Maharatna status; foreign elections, international summits, disputes and peace talks with the envoys leading them; major international film, music and literature awards (Oscars, Grammy, Booker, Critics Choice); Khelo India, National Games, national championships and national events held by government bodies or the armed forces, world and junior world titles, any international title won by an Indian, tournaments hosted in India even with a foreign winner, olympiads and major tournaments' awards; defence exercises, missions and contracts; books released by top dignitaries; beauty pageant titles; Indian-origin people appointed abroad; disease outbreaks by state; important days.
1 = unlikely: minor tournaments abroad with no Indian or Rajasthan winner, routine appointments below the head of a body, follow-ups with nothing new (but totals "as on" a date from year-end reviews and reports are new).`;

// The blueprint as prompt text.
export function blueprintText(): string {
  const types = STORY_TYPES.map(
    (t) =>
      `- ${t.id} (${t.label}; max ${t.maxFacts}): ${t.slots
        .map((s) => `${s.id}${s.many ? "+" : ""}: ${s.label}`)
        .join(" | ")}`,
  ).join("\n");
  return `STORY TYPES and the only facts worth keeping for each, as "slot: what it holds" (a slot marked + may hold several facts; use the slot id without the +):
${types}
${LONG_DOCUMENTS}
SKIP these stories entirely: ${SKIP_STORIES.join("; ")}.
NEVER keep these as facts: ${DROP_FACTS.join("; ")}.
IMPORTANCE: ${IMPORTANCE_GUIDE}`;
}

// The editorial checklist as prompt text.
export function editorialBlueprintText(): string {
  const t = EDITORIAL_TYPE;
  return `Keep editorials on ${EDITORIAL_TOPICS}. Skip ${EDITORIAL_SKIP}.
Each editorial is one item of type "${t.id}" (max ${t.maxFacts} facts), with facts in these slots (a slot marked + may hold several facts; use the slot id without the +): ${t.slots
    .map((s) => `${s.id}${s.many ? "+" : ""}: ${s.label}`)
    .join(" | ")}.
Importance: 3 for an issue RPSC asks often (a Rajasthan issue, a new law, judgment, scheme or policy, a constitutional institution, India's relations with a major power or neighbour), 2 for other exam topics.`;
}

// Slots that may hold several facts in some story type.
export const REPEATABLE_SLOTS = new Set(
  [...STORY_TYPES, EDITORIAL_TYPE].flatMap((t) => t.slots.filter((s) => s.many).map((s) => s.id)),
);

const TYPES_BY_ID = new Map([...STORY_TYPES, EDITORIAL_TYPE].map((t) => [t.id, t]));
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
    // "reach+" in the prompt marks a repeatable slot; the AI may copy the +.
    const s = slots.get(norm(f.slot).replace(/\+$/, ""));
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

// ---------- Fact cards ----------

type Bi = { en: string; hi: string };
const bi = (en: string, hi: string): Bi => ({ en, hi });

// Story types that print their key points as a fact card (each point beside
// what its fact is), with the labels of their slots.
export const CARD_LABELS: Record<string, Record<string, Bi>> = {
  scheme: {
    name: bi("Name", "नाम"),
    fullform: bi("Full form", "पूर्ण रूप"),
    by: bi("Run by", "संचालक"),
    funded: bi("Funded by", "वित्तपोषक"),
    launched: bi("Launched", "शुभारंभ"),
    period: bi("Period", "अवधि"),
    aim: bi("Aim", "उद्देश्य"),
    who: bi("Beneficiaries", "लाभार्थी"),
    helpline: bi("Helpline / portal", "हेल्पलाइन / पोर्टल"),
    reach: bi("Coverage", "कवरेज"),
    money: bi("Funds / benefit", "राशि / लाभ"),
    target: bi("Target", "लक्ष्य"),
    districts: bi("Districts", "ज़िले"),
    impact: bi("Progress", "प्रगति"),
    rajasthan: bi("Rajasthan", "राजस्थान"),
    feature: bi("Feature", "विशेषता"),
  },
  policy: {
    name: bi("Policy", "नीति"),
    by: bi("Issued by", "जारीकर्ता"),
    date: bi("Announced", "घोषणा"),
    valid: bi("Valid till", "वैधता"),
    target: bi("Target", "लक्ष्य"),
    districts: bi("Hubs / districts", "केंद्र / ज़िले"),
    feature: bi("Provision", "प्रावधान"),
  },
  law: {
    name: bi("Law", "क़ानून"),
    by: bi("Passed by", "पारित"),
    date: bi("Date", "तिथि"),
    provision: bi("Provision", "प्रावधान"),
    article: bi("Article", "अनुच्छेद"),
    applies: bi("Applies to", "लागू"),
    rajasthan: bi("Rajasthan", "राजस्थान"),
    last: bi("Earlier", "पूर्व में"),
  },
  person: {
    person: bi("Who", "कौन"),
    known: bi("Known for", "पहचान"),
    feat: bi("Achievement", "उपलब्धि"),
    from: bi("From", "मूल निवास"),
  },
  appointment: {
    person: bi("Who", "कौन"),
    post: bi("Post", "पद"),
    nth: bi("Number", "क्रम"),
    date: bi("Took office", "पदभार"),
  },
  place: {
    name: bi("Place", "स्थान"),
    where: bi("Where", "कहाँ"),
    why: bi("In news for", "चर्चा में क्यों"),
    feature: bi("Feature", "विशेषता"),
  },
};

// The parts of the "Schemes, Policies & Reports" section, in print order.
export const SCHEME_GROUPS = [
  { id: "raj", title: bi("Rajasthan schemes", "राजस्थान की योजनाएँ") },
  { id: "central", title: bi("Central schemes", "केंद्र की योजनाएँ") },
  { id: "policy", title: bi("Policies", "नीतियाँ") },
  { id: "reports", title: bi("Reports & indices", "रिपोर्टें एवं सूचकांक") },
] as const;
export type SchemeGroup = (typeof SCHEME_GROUPS)[number]["id"];

// Which part a story of the section goes in: by its type, or (an older story
// without one) by the slots its facts fill.
export function schemeGroup(item: {
  story_type?: string | null;
  rajasthan: boolean;
  facts: { slot?: string }[];
}): SchemeGroup {
  const type = item.story_type;
  const slots = new Set(item.facts.map((f) => f.slot).filter(Boolean));
  const has = (...ids: string[]) => ids.some((id) => slots.has(id));
  if (type === "index" || (!type && has("india", "top", "edition", "scope"))) return "reports";
  if (
    type === "policy" ||
    type === "law" ||
    type === "budget" ||
    (!type && has("provision", "valid", "article"))
  )
    return "policy";
  return item.rajasthan ? "raj" : "central";
}
