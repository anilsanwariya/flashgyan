// Notes books: one per subject section and stage. Each has a cover (one of
// six designs, with its own colours, photos and text, like the magazine's
// covers) and front pages whose text the editor can change: the preamble,
// the edition page, how to use the notes and the sources. The contents,
// syllabus coverage and PYQ analysis are made from the data. Pure helpers,
// shared by the server, the admin panel and tests.
import type { Bi } from "@/lib/current-affairs";
import type { CoverPhoto } from "@/lib/ca-covers";

export type NotesStage = "prelims" | "mains";
export const NOTES_STAGES: { id: NotesStage; name: string }[] = [
  { id: "prelims", name: "Prelims" },
  { id: "mains", name: "Mains" },
];

export const NOTES_DESIGNS = [
  { id: "atlas", name: "State Map", hint: "Title on a light page, the state's outline behind" },
  { id: "band", name: "Colour Band", hint: "A tall colour band down the left" },
  { id: "photo", name: "Full Photo", hint: "Your photo across the cover, the title in white" },
  { id: "framed", name: "Framed Photo", hint: "Your photo in a frame above the title" },
  { id: "split", name: "Split", hint: "Top half in colour, the features below" },
  { id: "minimal", name: "Minimal", hint: "Only type and lines: least ink when printed" },
] as const;
export type NotesDesign = (typeof NOTES_DESIGNS)[number]["id"];

export const NOTES_OUTLINES = [
  { id: "rajasthan", name: "Rajasthan" },
  { id: "india", name: "India" },
  { id: "none", name: "None" },
] as const;
export type NotesOutline = (typeof NOTES_OUTLINES)[number]["id"];

export const MAX_FEATURES = 5;

// A book's cover. Empty text falls back to the defaults (the subject's name,
// "Prelims Notes" and so on).
export type NotesCover = {
  design: NotesDesign;
  color: string;
  color2: string;
  outline: NotesOutline;
  // The full-photo design's background, and how dark it is made (0–80 %).
  bg: CoverPhoto | null;
  bg_dim: number;
  // The framed-photo design's photo.
  photo: CoverPhoto | null;
  title: Bi;
  kicker: Bi;
  label: Bi;
  features: Bi[];
  based_on: Bi;
  edition: Bi;
  updated: Bi;
  // A corner ribbon ("New edition"), shown when set.
  ribbon: Bi;
};

export type NotesSourceGroup = { title: Bi; items: Bi[] };

// The front pages' text.
export type NotesFront = {
  intro: Bi;
  how: { title: Bi; text: Bi }[];
  help: Bi[];
  sign: Bi;
  study: Bi[];
  updates: Bi;
  errors: Bi;
  disclaimer: Bi;
  copyright: Bi;
  sources: NotesSourceGroup[];
  thanks: Bi;
};

export type NotesBook = {
  id: string;
  section: string;
  stage: NotesStage;
  cover: NotesCover;
  front: NotesFront;
  created_at: string;
  updated_at: string;
};

const b = (en: string, hi: string): Bi => ({ en, hi });
const EMPTY = b("", "");

export const DEFAULT_COLORS: Record<NotesStage, { color: string; color2: string }> = {
  prelims: { color: "#6d28d9", color2: "#f59e0b" },
  mains: { color: "#1f2430", color2: "#6d28d9" },
};

export const DEFAULT_TEXT = {
  kicker: b("RAS/RTS and other RPSC & RSSB exams", "RAS/RTS एवं RPSC व RSSB की अन्य परीक्षाएँ"),
  label: {
    prelims: b("Prelims Notes", "प्रारंभिक परीक्षा नोट्स"),
    mains: b("Mains Notes", "मुख्य परीक्षा नोट्स"),
  },
  features: {
    prelims: [
      b("Every line of the official syllabus", "आधिकारिक पाठ्यक्रम की हर पंक्ति"),
      b("Built around previous year questions", "पिछले वर्षों के प्रश्नों पर आधारित"),
      b(
        "Real maps, exam traps, quick revision",
        "वास्तविक मानचित्र, परीक्षा के भ्रम, त्वरित पुनरावृत्ति",
      ),
    ],
    mains: [
      b(
        "Analytical notes in answer-ready structure",
        "उत्तर-लेखन योग्य संरचना में विश्लेषणात्मक नोट्स",
      ),
      b(
        "Keywords, official text and data with sources",
        "मुख्य शब्द, आधिकारिक पाठ और स्रोत सहित आँकड़े",
      ),
      b("Answer plans and practice questions", "उत्तर योजना और अभ्यास प्रश्न"),
    ],
  },
  based_on: b(
    "Based on NCERT, NIOS, IGNOU and RBSE books, official documents and Acts",
    "एनसीईआरटी, एनआईओएस, इग्नू व आरबीएसई की पुस्तकों, आधिकारिक दस्तावेज़ों एवं अधिनियमों पर आधारित",
  ),
};

export function defaultCover(stage: NotesStage, section = ""): NotesCover {
  return {
    design: "atlas",
    ...DEFAULT_COLORS[stage],
    outline: /^Rajasthan/.test(section) ? "rajasthan" : "india",
    bg: null,
    bg_dim: 45,
    photo: null,
    title: EMPTY,
    kicker: EMPTY,
    label: EMPTY,
    features: [],
    based_on: EMPTY,
    edition: EMPTY,
    updated: EMPTY,
    ribbon: EMPTY,
  };
}

export function defaultFront(stage: NotesStage): NotesFront {
  const mains = stage === "mains";
  return {
    intro: b(
      "Rajasthan's exams reward preparation that is complete, accurate and close to the syllabus. Most students study from many books and still miss topics, or learn facts that are out of date. We made these notes so that one book does the whole job, and every line in it can be trusted.",
      "राजस्थान की परीक्षाएँ उसी तैयारी का प्रतिफल देती हैं जो पूर्ण, सटीक और पाठ्यक्रम के अनुरूप हो। अधिकांश विद्यार्थी अनेक पुस्तकों से पढ़ते हैं, फिर भी कुछ विषय छूट जाते हैं या पुराने तथ्य याद हो जाते हैं। ये नोट्स इसलिए बनाए गए हैं कि एक ही पुस्तक पूरा काम करे और इसकी हर पंक्ति पर भरोसा किया जा सके।",
    ),
    how: [
      {
        title: b("Mapped to the official syllabus", "आधिकारिक पाठ्यक्रम से जुड़े"),
        text: b(
          "Every line of the RPSC syllabus is linked to a chapter and topic. The coverage table in the front pages shows where each line is taught, so nothing is left out.",
          "RPSC पाठ्यक्रम की हर पंक्ति किसी अध्याय और विषय से जुड़ी है। प्रारंभिक पृष्ठों की तालिका बताती है कि कौन-सी पंक्ति कहाँ पढ़ाई गई है, ताकि कुछ भी न छूटे।",
        ),
      },
      {
        title: b("Built around previous year questions", "पिछले वर्षों के प्रश्नों पर आधारित"),
        text: b(
          "We filed every question from past papers under the topic it asks about. Each topic shows where it was asked, and topics asked more often get more depth.",
          "हमने पिछले प्रश्नपत्रों का हर प्रश्न उसके विषय के अंतर्गत रखा है। हर विषय पर लिखा है कि वह कहाँ पूछा गया, और अधिक पूछे गए विषयों को अधिक विस्तार दिया गया है।",
        ),
      },
      {
        title: b("Authentic sources", "प्रामाणिक स्रोत"),
        text: b(
          "Definitions are given word for word from NCERT, NIOS, IGNOU and RBSE books and from Acts. Facts are checked against government documents, and every figure carries its year and source.",
          "परिभाषाएँ एनसीईआरटी, एनआईओएस, इग्नू व आरबीएसई की पुस्तकों और अधिनियमों से शब्दशः दी गई हैं। तथ्य सरकारी दस्तावेज़ों से जाँचे गए हैं और हर आँकड़े के साथ उसका वर्ष व स्रोत है।",
        ),
      },
      {
        title: b("Separate Prelims and Mains books", "प्रारंभिक व मुख्य परीक्षा की अलग पुस्तकें"),
        text: b(
          "Prelims needs precise facts; Mains needs analysis and structure. So each has its own book, written for its own exam.",
          "प्रारंभिक परीक्षा में सटीक तथ्य चाहिए, मुख्य परीक्षा में विश्लेषण और संरचना। इसलिए दोनों की अपनी-अपनी पुस्तक है।",
        ),
      },
      {
        title: b("Hindi and English together", "हिंदी और अंग्रेज़ी साथ-साथ"),
        text: b(
          "Both mediums are written side by side from the same material, page for page, so the facts and terms always match.",
          "दोनों माध्यम एक ही सामग्री से साथ-साथ लिखे गए हैं, पृष्ठ-दर-पृष्ठ, ताकि तथ्य और शब्दावली हमेशा मेल खाएँ।",
        ),
      },
      {
        title: b("Real maps", "वास्तविक मानचित्र"),
        text: b(
          "Maps are drawn from real geographic data, with the official boundary of India.",
          "मानचित्र वास्तविक भौगोलिक आँकड़ों से बनाए गए हैं, भारत की आधिकारिक सीमा के साथ।",
        ),
      },
    ],
    help: [
      b(
        "Less time searching, more time revising: one book covers the syllabus.",
        "खोजने में कम समय, दोहराने में अधिक: एक पुस्तक में पूरा पाठ्यक्रम।",
      ),
      b(
        "You know what matters: “Asked” tags show what the examiner likes.",
        "क्या ज़रूरी है, यह पता रहता है: “पूछा गया” टैग बताते हैं कि परीक्षक क्या पूछता है।",
      ),
      mains
        ? b(
            "Better answers: keywords, official text and answer plans are ready to use.",
            "बेहतर उत्तर: मुख्य शब्द, आधिकारिक पाठ और उत्तर योजना तैयार मिलती है।",
          )
        : b(
            "Exam traps and quick revision boxes make the last week easy.",
            "परीक्षा के भ्रम और त्वरित पुनरावृत्ति के बॉक्स अंतिम सप्ताह को आसान बनाते हैं।",
          ),
    ],
    sign: b("— Team FlashGyan", "— टीम FlashGyan"),
    study: mains
      ? [
          b(
            "Read a topic and make your own one-page plan of it.",
            "एक विषय पढ़ें और उसकी अपनी एक पृष्ठ की योजना बनाएँ।",
          ),
          b(
            "Write the practice question in the word limit, then compare with the notes.",
            "अभ्यास प्रश्न शब्द-सीमा में लिखें, फिर नोट्स से मिलाएँ।",
          ),
          b(
            "Learn the keywords, official text and data with their sources.",
            "मुख्य शब्द, आधिकारिक पाठ और आँकड़े उनके स्रोत सहित याद करें।",
          ),
          b(
            "Solve the PYQs of each chapter under time.",
            "हर अध्याय के पिछले प्रश्न समय-सीमा में हल करें।",
          ),
        ]
      : [
          b(
            "Read a chapter once fully; underline what you did not know.",
            "एक अध्याय एक बार पूरा पढ़ें; जो नया लगे उसे रेखांकित करें।",
          ),
          b(
            "Solve the PYQs of the chapter without looking at the answers.",
            "अध्याय के पिछले प्रश्न बिना उत्तर देखे हल करें।",
          ),
          b(
            "Revise with the exam traps and quick revision boxes every week.",
            "हर सप्ताह परीक्षा के भ्रम और त्वरित पुनरावृत्ति से दोहराएँ।",
          ),
          b(
            "Before the exam, read only the boxes and the tables.",
            "परीक्षा से पहले केवल बॉक्स और तालिकाएँ पढ़ें।",
          ),
        ],
    updates: b(
      "In the FlashGyan app and on our Telegram channel. Facts that change after this date are covered in our monthly current affairs magazine.",
      "FlashGyan ऐप और हमारे टेलीग्राम चैनल पर। इस तिथि के बाद बदलने वाले तथ्य हमारी मासिक करेंट अफेयर्स पत्रिका में दिए जाते हैं।",
    ),
    errors: b(
      "We have checked every fact against authentic sources. If you still find a mistake, please tell us in the app: it will be corrected in the next update.",
      "हमने हर तथ्य को प्रामाणिक स्रोतों से जाँचा है। फिर भी कोई त्रुटि मिले तो कृपया ऐप में बताएँ: अगले अद्यतन में उसे सुधारा जाएगा।",
    ),
    disclaimer: b(
      "These notes are prepared independently by FlashGyan for exam preparation. FlashGyan is not connected with RPSC, RSSB or any government body.",
      "ये नोट्स FlashGyan द्वारा परीक्षा की तैयारी के लिए स्वतंत्र रूप से तैयार किए गए हैं। FlashGyan का RPSC, RSSB या किसी सरकारी संस्था से कोई संबंध नहीं है।",
    ),
    copyright: b(
      "© FlashGyan. All rights reserved. Definitions and passages quoted from NCERT, NIOS, IGNOU, board books, Acts and government documents remain the property of their publishers and are reproduced with acknowledgement for education.",
      "© FlashGyan. सर्वाधिकार सुरक्षित। एनसीईआरटी, एनआईओएस, इग्नू, बोर्ड पुस्तकों, अधिनियमों व सरकारी दस्तावेज़ों से उद्धृत परिभाषाएँ और अंश उनके प्रकाशकों की संपत्ति हैं और शिक्षा हेतु आभार सहित दिए गए हैं।",
    ),
    sources: [
      {
        title: b("Books", "पुस्तकें"),
        items: [
          b("NCERT textbooks", "एनसीईआरटी की पाठ्यपुस्तकें"),
          b("NIOS course material", "एनआईओएस पाठ्य सामग्री"),
          b("IGNOU course material", "इग्नू पाठ्य सामग्री"),
          b("RBSE textbooks", "आरबीएसई की पाठ्यपुस्तकें"),
        ],
      },
      {
        title: b("Official documents", "आधिकारिक दस्तावेज़"),
        items: [
          b(
            "Government of Rajasthan: Economic Review, policies and department reports",
            "राजस्थान सरकार: आर्थिक समीक्षा, नीतियाँ एवं विभागीय प्रतिवेदन",
          ),
          b("Census of India 2011", "भारत की जनगणना 2011"),
        ],
      },
      {
        title: b("Acts and the Constitution", "अधिनियम एवं संविधान"),
        items: [
          b(
            "Constitution of India and the Acts quoted in the chapters",
            "भारत का संविधान एवं अध्यायों में उद्धृत अधिनियम",
          ),
        ],
      },
      {
        title: b("Maps", "मानचित्र"),
        items: [
          b(
            "Rivers: Natural Earth (public domain). State and India outlines: DataMeet, CC BY 4.0, following the Survey of India boundary. Maps are not to scale.",
            "नदियाँ: Natural Earth (सार्वजनिक डोमेन)। राज्य एवं भारत की सीमाएँ: DataMeet, CC BY 4.0, भारतीय सर्वेक्षण की सीमा के अनुसार। मानचित्र पैमाने पर नहीं हैं।",
          ),
        ],
      },
    ],
    thanks: b(
      "We thank the authors and publishers of these works. Our own knowledge base, built from these sources, was used to prepare and check the notes.",
      "हम इन कृतियों के लेखकों और प्रकाशकों के आभारी हैं। इन्हीं स्रोतों से बने हमारे ज्ञानकोष का उपयोग नोट्स तैयार करने और जाँचने में किया गया।",
    ),
  };
}

// ---------- Cleaning what the admin panel sends ----------

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const bi = (v: unknown, max = 400): Bi => {
  const o = (v ?? {}) as Record<string, unknown>;
  return { en: str(o.en, max), hi: str(o.hi, max) };
};
const filled = (x: Bi) => !!(x.en || x.hi);
const hex = (v: unknown, d: string) =>
  typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v.trim()) ? v.trim().toLowerCase() : d;
const photo = (v: unknown): CoverPhoto | null => {
  const o = (v ?? {}) as Record<string, unknown>;
  const url = str(o.url, 1000);
  if (!/^https:\/\/[^\s"'<>]+$/.test(url)) return null;
  return {
    url,
    ...(typeof o.path === "string" ? { path: str(o.path, 300) } : {}),
    ...(o.credit ? { credit: str(o.credit, 120) } : {}),
  };
};
const one = <T extends string>(v: unknown, list: readonly { id: T }[], d: T): T =>
  list.some((x) => x.id === v) ? (v as T) : d;

export function normalizeCover(v: unknown, stage: NotesStage, section = ""): NotesCover {
  const d = defaultCover(stage, section);
  const o = (v ?? {}) as Record<string, unknown>;
  return {
    design: one(o.design, NOTES_DESIGNS, d.design),
    color: hex(o.color, d.color),
    color2: hex(o.color2, d.color2),
    outline: one(o.outline, NOTES_OUTLINES, d.outline),
    bg: photo(o.bg),
    bg_dim: Math.min(80, Math.max(0, Math.round(Number(o.bg_dim ?? d.bg_dim)) || 0)),
    photo: photo(o.photo),
    title: bi(o.title, 80),
    kicker: bi(o.kicker, 120),
    label: bi(o.label, 60),
    features: (Array.isArray(o.features) ? o.features : [])
      .map((x) => bi(x, 120))
      .filter(filled)
      .slice(0, MAX_FEATURES),
    based_on: bi(o.based_on, 200),
    edition: bi(o.edition, 40),
    updated: bi(o.updated, 60),
    ribbon: bi(o.ribbon, 30),
  };
}

// Text left empty takes the default; lists keep what the editor made (even
// empty), once set.
export function normalizeFront(v: unknown, stage: NotesStage): NotesFront {
  const d = defaultFront(stage);
  const o = (v ?? {}) as Record<string, unknown>;
  const text = (k: keyof NotesFront, max = 2000): Bi => {
    const x = bi(o[k], max);
    const def = d[k] as Bi;
    return { en: x.en || def.en, hi: x.hi || def.hi };
  };
  const list = (k: "help" | "study", max = 300): Bi[] =>
    Array.isArray(o[k])
      ? (o[k] as unknown[])
          .map((x) => bi(x, max))
          .filter(filled)
          .slice(0, 12)
      : d[k];
  return {
    intro: text("intro"),
    how: Array.isArray(o.how)
      ? (o.how as unknown[])
          .map((x) => {
            const r = (x ?? {}) as Record<string, unknown>;
            return { title: bi(r.title, 120), text: bi(r.text, 600) };
          })
          .filter((x) => filled(x.title) || filled(x.text))
          .slice(0, 12)
      : d.how,
    help: list("help"),
    sign: text("sign", 120),
    study: list("study"),
    updates: text("updates", 600),
    errors: text("errors", 600),
    disclaimer: text("disclaimer", 600),
    copyright: text("copyright", 800),
    sources: Array.isArray(o.sources)
      ? (o.sources as unknown[])
          .map((x) => {
            const r = (x ?? {}) as Record<string, unknown>;
            return {
              title: bi(r.title, 120),
              items: (Array.isArray(r.items) ? r.items : [])
                .map((i) => bi(i, 400))
                .filter(filled)
                .slice(0, 40),
            };
          })
          .filter((g) => filled(g.title) || g.items.length)
          .slice(0, 12)
      : d.sources,
    thanks: text("thanks", 600),
  };
}

// The cover's text, with the defaults filled in.
export function coverText(c: NotesCover, stage: NotesStage, subject: Bi, edition: Bi) {
  const or = (x: Bi, d: Bi): Bi => ({ en: x.en || d.en, hi: x.hi || d.hi });
  return {
    title: or(c.title, subject),
    kicker: or(c.kicker, DEFAULT_TEXT.kicker),
    label: or(c.label, DEFAULT_TEXT.label[stage]),
    features: c.features.length ? c.features : DEFAULT_TEXT.features[stage],
    based_on: or(c.based_on, DEFAULT_TEXT.based_on),
    edition: or(c.edition, edition),
    updated: c.updated,
    ribbon: c.ribbon,
  };
}

// ---------- What the front pages are made from ----------

export type BookChapter = { n: number; name: Bi; topics: Bi[] };
export type BookCoverageLine = { exam: string; text: Bi; chapters: number[] };
export type BookPyq = {
  papers: number;
  years: [number, number] | null;
  byChapter: { n: number; count: number }[];
  top: { name: Bi; count: number }[];
};
export type BookData = {
  chapters: BookChapter[];
  coverage: BookCoverageLine[];
  pyq: BookPyq;
};

// Questions per chapter, most first, and the most asked topics (a topic's
// count includes its subtopics).
export function pyqAnalysis(
  topics: {
    id: string;
    parent_id: string | null;
    level: string;
    name_en: string;
    name_hi: string;
  }[],
  chapterOf: Map<string, number>,
  questions: { topic_id: string; paper_id: string; year: number | null }[],
): BookPyq {
  const byChapter = new Map<number, number>();
  const topicOf = new Map<string, string>();
  const byId = new Map(topics.map((t) => [t.id, t]));
  for (const t of topics) {
    // The topic-level ancestor (or the chapter itself).
    let x = t;
    while (x.level === "subtopic" && x.parent_id && byId.get(x.parent_id))
      x = byId.get(x.parent_id)!;
    topicOf.set(t.id, x.id);
  }
  const byTopic = new Map<string, number>();
  const papers = new Set<string>();
  const years: number[] = [];
  for (const q of questions) {
    const ch = chapterOf.get(q.topic_id);
    if (!ch) continue;
    byChapter.set(ch, (byChapter.get(ch) ?? 0) + 1);
    const tp = topicOf.get(q.topic_id);
    if (tp && byId.get(tp)?.level !== "chapter") byTopic.set(tp, (byTopic.get(tp) ?? 0) + 1);
    papers.add(q.paper_id);
    if (q.year) years.push(q.year);
  }
  return {
    papers: papers.size,
    years: years.length ? [Math.min(...years), Math.max(...years)] : null,
    byChapter: [...byChapter.entries()]
      .map(([n, count]) => ({ n, count }))
      .sort((a, b) => b.count - a.count || a.n - b.n),
    top: [...byTopic.entries()]
      .map(([id, count]) => ({ name: b(byId.get(id)!.name_en, byId.get(id)!.name_hi), count }))
      .sort((a, b) => b.count - a.count || a.name.en.localeCompare(b.name.en))
      .slice(0, 8),
  };
}
