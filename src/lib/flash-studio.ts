// Flashcard studio: deck templates, topics and their cards, as the admin
// proofreads them and the app's uploader takes them. A topic is finalised
// once: its cards are shuffled, split into chunks and numbered 1, 2, 3…
// across the chunks (chunk 1 gets 1–100, chunk 2 101–200…). After that a
// card's number and chunk never change and no number is used twice, so a
// chunk downloaded again replaces the same cards in the app. Pure: shared by
// the server, the admin panel and tests.

// An explanation column: its title (the part after "explanation_") and what
// it should hold (for the AI and whoever proofreads).
export type FlashColumn = { id: string; title: string; hint: string };
export type WordKey = "" | "front" | "back";
export type FlashExample = { front: string; back: string; ex: Record<string, string> };

export type FlashTemplate = {
  id: string;
  key: string;
  name: string;
  prompt: string;
  columns: FlashColumn[];
  word_key: WordKey;
  // Finished cards in the house style (keyed by column title).
  examples: FlashExample[];
  sort: number;
};

export type FlashBook = { code: string; name: string; color: string };
// A chunk's numbers, and when it was last downloaded (to show what changed
// since, so only those chunks go back to the app).
export type FlashChunk = { n: number; from: number; to: number; downloaded?: string | null };

export type FlashTopic = {
  id: string;
  name: string;
  template_id: string | null;
  prompt: string;
  columns: FlashColumn[];
  word_key: WordKey;
  books: FlashBook[];
  chunks: FlashChunk[];
  locked_at: string | null;
  created_at: string;
  updated_at: string;
};

// Where a card came from: the book, its place there (row or example number,
// and page), and the heading and rule it sat under.
export type FlashSource = {
  book: string;
  pos?: number | null;
  page?: number | null;
  heading?: string;
  rule?: string;
  // The book's note for this example (a meaning, "also correct: …").
  note?: string;
  // The book (flash_sources row) the AI read it from.
  src?: string;
};

// Another book's version of a card (kept when cards are merged).
export type FlashVariant = {
  book: string;
  front: string;
  back: string;
  ex: Record<string, string>;
  source: FlashSource | null;
};

export type FlashCard = {
  id: string;
  topic_id: string;
  pos: number;
  // Null: the topic's prompt.
  prompt: string | null;
  front: string;
  back: string;
  back_hint: string;
  is_revealed: boolean;
  // Null: the topic's.
  word_key: WordKey | null;
  // Explanations by column id.
  ex: Record<string, string>;
  // Columns the AI wrote from its own knowledge, not the books.
  own: string[];
  sources: FlashSource[];
  // The other books' versions of a card made from several books.
  variants: FlashVariant[];
  // The AI check's finding, or the editor's own note.
  note: string;
  error: boolean;
  error_type: string;
  verified: boolean;
  removed: boolean;
  chunk: number | null;
  card_order: number | null;
  app_id: string | null;
  created_at: string;
  updated_at: string;
};

export const BOOK_COLORS = [
  "#D9D2E9",
  "#D9EAD3",
  "#CFE2F3",
  "#EAD1DC",
  "#C9DAF8",
  "#FFF2CC",
  "#FCE5CD",
  "#D0E0E3",
];

export const ERROR_TYPES = [
  "Spelling",
  "Wrong answer",
  "Explanation",
  "Wrong rule / type",
  "Formatting",
  "Check in book",
  "Other",
];

const cols = (...list: [string, string][]): FlashColumn[] =>
  list.map(([title, hint], i) => ({ id: `c${i + 1}`, title, hint }));

const SANDHI_RULE = "the rule in short form, e.g. 'आ + ऊ = ओ' or 'त्/द् + ल = त्/द् ➝ ल्'";
const SANDHI_WHY = "one or two sentences: when this change happens";
const SANDHI_EXC = "other words that break or follow the rule, one per line, each starting '◆ '";

// The deck types, as the finished sheets have them.
export const DEFAULT_TEMPLATES: Omit<FlashTemplate, "id">[] = [
  {
    key: "sandhi-swar",
    name: "00-1 संधि (स्वर)",
    prompt: "संधि करें -",
    columns: cols(
      ["प्रकार", "the kind of संधि, e.g. 'गुण स्वर संधि'"],
      ["नियम", SANDHI_RULE],
      ["व्याख्या", SANDHI_WHY],
    ),
    word_key: "",
    examples: [
      {
        front: "महा + ऊर्जा",
        back: "महोर्जा",
        ex: {
          प्रकार: "गुण स्वर संधि",
          नियम: "आ + ऊ = ओ",
          व्याख्या:
            "यदि 'अ' या 'आ' के बाद 'इ' या 'ई', 'उ' या 'ऊ', 'ऋ' आएँ तो दोनों मिलकर क्रमशः 'ए', 'ओ' और 'अर्' हो जाते हैं।",
        },
      },
    ],
    sort: 1,
  },
  {
    key: "sandhi-vyanjan",
    name: "00-2 संधि (व्यंजन)",
    prompt: "संधि करें -",
    columns: cols(
      ["प्रकार", "'व्यंजन संधि'"],
      ["नियम", SANDHI_RULE],
      ["व्याख्या", SANDHI_WHY],
      ["अपवाद", SANDHI_EXC],
    ),
    word_key: "",
    examples: [
      {
        front: "अहम् + कार",
        back: "अहंकार",
        ex: {
          प्रकार: "व्यंजन संधि",
          नियम: "म् + प, फ, ब, भ, म→म्",
          व्याख्या:
            "म् के साथ ‘क’ से ‘म’ तक के किसी भी वर्ण के मेल पर 'म्' के स्थान पर मिलने वाले वर्ण का अन्तिम नासिक वर्ण या उस नासिक वर्ण के स्थान पर अनुस्वार (ं) बन जाएगा।",
          अपवाद: "◆ सम् + कृत = संस्कृत\n◆ सम् + कृति = संस्कृति\n◆ सम् + कार = संस्कार",
        },
      },
    ],
    sort: 2,
  },
  {
    key: "sandhi-visarg",
    name: "00-3 संधि (विसर्ग)",
    prompt: "संधि करें -",
    columns: cols(
      ["प्रकार", "'विसर्ग संधि'"],
      ["नियम", SANDHI_RULE],
      ["व्याख्या", SANDHI_WHY],
      ["अपवाद", SANDHI_EXC],
    ),
    word_key: "",
    examples: [
      {
        front: "निः + धन",
        back: "निर्धन",
        ex: {
          प्रकार: "विसर्ग संधि",
          नियम: "(:) → र्",
          व्याख्या:
            "यदि विसर्ग के बाद ‘अ’/'आ' के अतिरिक्त कोई अन्य स्वर अथवा किसी वर्ग का तृतीय, चतुर्थ या पंचम वर्ण हो या 'य' 'र' 'ल' 'व' 'ह' हो तो विसर्ग के स्थान में 'र्' हो जाता है।",
          अपवाद: "◆ पुनः + अवलोकन = पुनरवलोकन\n◆ पुनः + ईक्षण = पुनरीक्षण",
        },
      },
    ],
    sort: 3,
  },
  {
    key: "samas",
    name: "01 समास",
    prompt: "समास विग्रह करें -",
    columns: cols(
      ["समास", "the kind of समास, e.g. 'तत्पुरुष समास'"],
      ["व्याख्या", "what marks this समास, as points (i), (ii)…"],
      ["उपभेद", "the sub-kind, e.g. 'अधिकरण तत्पुरुष समास'"],
      ["विभक्ति-चिह्न", "the case marks dropped, e.g. ''में', 'पर' चिह्नों का लोप'"],
      ["अपवाद", "exceptions, if any"],
    ),
    word_key: "",
    examples: [
      {
        front: "जीवदया",
        back: "जीवों पर दया",
        ex: {
          समास: "तत्पुरुष समास",
          व्याख्या:
            "(i) तत्पुरुष समास में पहला पद गौण व दूसरा पद (पर पद) प्रधान होता है।\n(ii) इसका विग्रह करने पर कर्ता व सम्बोधन की विभक्तियों के अतिरिक्त किसी भी कारक की विभक्ति प्रयुक्त होती है।",
          उपभेद: "अधिकरण तत्पुरुष समास",
          "विभक्ति-चिह्न": "'में', 'पर' चिह्नों का लोप",
        },
      },
    ],
    sort: 4,
  },
  {
    key: "upsarg",
    name: "02 उपसर्ग",
    prompt: "उपसर्ग के योग से शब्द बनायें -",
    columns: cols(
      ["अर्थ", "the उपसर्ग's meaning"],
      ["प्रकार", "'संस्कृत के उपसर्ग', 'हिंदी के उपसर्ग' or 'विदेशी उपसर्ग'"],
      ["व्याख्या", "a sentence about this kind of उपसर्ग"],
    ),
    word_key: "",
    examples: [
      {
        front: "पुरा",
        back: "पुरातन, पुरातत्त्व, पुरापथ, पुराण, पुरावशेष",
        ex: {
          अर्थ: "प्राचीन",
          प्रकार: "संस्कृत के उपसर्ग",
          व्याख्या: "संस्कृत के सभी उपसर्ग तत्सम शब्दों के साथ हिंदी में प्रयुक्त होते हैं।",
        },
      },
    ],
    sort: 5,
  },
  {
    key: "upsarg-split",
    name: "02 उपसर्ग (पृथक करें)",
    prompt: "दिए गए शब्द में से उपसर्ग तथा मूल शब्द पृथक करें -",
    columns: cols(
      ["अर्थ", "the उपसर्ग's meaning"],
      ["प्रकार", "'संस्कृत के उपसर्ग', 'हिंदी के उपसर्ग' or 'विदेशी उपसर्ग'"],
      ["व्याख्या", "a sentence about this kind of उपसर्ग"],
    ),
    word_key: "",
    examples: [
      {
        front: "उपसंहार",
        back: "उप + संहार",
        ex: {
          अर्थ: "निकट, सहायक, गौण",
          प्रकार: "संस्कृत के उपसर्ग",
          व्याख्या: "संस्कृत के सभी उपसर्ग तत्सम शब्दों के साथ हिंदी में प्रयुक्त होते हैं।",
        },
      },
    ],
    sort: 6,
  },
  {
    key: "pratyay",
    name: "03 प्रत्यय",
    prompt: "प्रत्यय के योग से शब्द बनायें -",
    columns: cols(
      ["स्रोत", "'हिंदी प्रत्यय', 'संस्कृत प्रत्यय' or 'विदेशी प्रत्यय'"],
      ["भेद", "'कृत् प्रत्यय' or 'तद्धित प्रत्यय'"],
      ["परिभाषा", "the definition of that भेद"],
      ["प्रभेद", "the sub-kind, e.g. 'ऊनतावाचक तद्धित प्रत्यय'"],
      ["प्रभेद-परिभाषा", "the definition of that sub-kind"],
      ["शब्द-निर्माण", "how the words are formed, when it needs saying"],
    ),
    word_key: "",
    examples: [
      {
        front: "ई",
        back: "प्याली, नाली, बाली",
        ex: {
          स्रोत: "हिंदी प्रत्यय",
          भेद: "तद्धित प्रत्यय",
          परिभाषा:
            "वे प्रत्यय जो क्रिया पदों के अतिरिक्त संज्ञा, सर्वनाम, विशेषण आदि शब्दों के साथ लगकर नए शब्द का निर्माण करते हैं उन्हें तद्धित प्रत्यय कहते हैं।",
          प्रभेद: "ऊनतावाचक तद्धित प्रत्यय",
          "प्रभेद-परिभाषा":
            "संज्ञा, सर्वनाम या विशेषण के साथ प्रयुक्त होकर ये उनके लघुता सूचक शब्दों का निर्माण करते हैं।",
        },
      },
    ],
    sort: 7,
  },
  {
    key: "pratyay-split",
    name: "03 प्रत्यय (पृथक करें)",
    prompt: "दिए गए शब्द में से प्रत्यय तथा मूल शब्द पृथक करें -",
    columns: cols(
      ["स्रोत", "'हिंदी प्रत्यय', 'संस्कृत प्रत्यय' or 'विदेशी प्रत्यय'"],
      ["भेद", "'कृत् प्रत्यय' or 'तद्धित प्रत्यय'"],
      ["परिभाषा", "the definition of that भेद"],
      ["प्रभेद", "the sub-kind"],
      ["प्रभेद-परिभाषा", "the definition of that sub-kind"],
    ),
    word_key: "",
    examples: [
      {
        front: "चतुराई",
        back: "चतुर + आई",
        ex: { स्रोत: "हिंदी प्रत्यय", भेद: "तद्धित प्रत्यय", प्रभेद: "भाववाचक तद्धित प्रत्यय" },
      },
    ],
    sort: 8,
  },
  {
    key: "shabd-shuddhi",
    name: "04 शब्द शुद्धि",
    prompt: "निम्नलिखित शब्द का शुद्ध रूप बतायें - ",
    columns: cols(
      ["अशुद्धि", "the kind of mistake, e.g. 'सन्धि सम्बन्धी'"],
      ["व्याख्या", "why it is wrong and the rule"],
    ),
    word_key: "",
    examples: [
      {
        front: "संक्षिप्तिकरण",
        back: "संक्षिप्तीकरण",
        ex: {
          अशुद्धि: "संयुक्ताक्षरों व व्यंजन द्वित्व का अशुद्ध प्रयोग",
          व्याख्या:
            "दो व्यंजनों के बीच स्वर का अभाव संयुक्ताक्षर बनाता है। सही द्वित्व या संयुक्ताक्षर का प्रयोग न करने से वर्तनी अशुद्ध हो जाती है।",
        },
      },
    ],
    sort: 9,
  },
  {
    key: "vakya-shuddhi",
    name: "05 वाक्य शुद्धि",
    prompt: "वाक्य का शुद्ध रूप बतायें - ",
    columns: cols(
      ["अशुद्धि", "the kind of mistake, e.g. 'लिंग के प्रयोग सम्बन्धी अशुद्धि'"],
      ["व्याख्या", "why it is wrong and the rule"],
    ),
    word_key: "",
    examples: [
      {
        front: "सीता बहुत मेहनत करता है।",
        back: "सीता बहुत मेहनत करती है।",
        ex: {
          अशुद्धि: "लिंग के प्रयोग सम्बन्धी अशुद्धि",
          व्याख्या:
            "वाक्य में प्रयुक्त शब्दानुरूप लिंग का प्रयोग करने पर ही वाक्य रचना शुद्ध हो पाती है।",
        },
      },
    ],
    sort: 10,
  },
  {
    key: "paryayvachi",
    name: "06 पर्यायवाची",
    prompt: "पर्यायवाची बतायें - ",
    columns: cols(["अर्थ", "the word's meaning, when it has more than one"]),
    word_key: "",
    examples: [{ front: "पृथ्वी", back: "भू, भूमि, अवनि, अचला, धरा, मही, इला, मेदिनी", ex: {} }],
    sort: 11,
  },
  {
    key: "vilom",
    name: "07 विलोम",
    prompt: "विलोम शब्द बतायें - ",
    columns: cols(
      ["व्याख्या", "how the opposite is formed"],
      ["प्रयुक्त-उपसर्ग", "the उपसर्ग used, if any"],
    ),
    word_key: "",
    examples: [
      {
        front: "मान",
        back: "अपमान",
        ex: {
          व्याख्या: "यह उपसर्ग लगाकर विलोम बनाने वाले शब्द का उदाहरण है।",
          "प्रयुक्त-उपसर्ग": "'अप' उपसर्ग लगाने से",
        },
      },
    ],
    sort: 12,
  },
  {
    key: "samanarthi-antar",
    name: "08 समानार्थी शब्दों में अंतर",
    prompt: "समानार्थी शब्दों में अंतर स्पष्ट करें - ",
    columns: cols(["वाक्य-प्रयोग", "a sentence for each word, one per line, each starting '◆ '"]),
    word_key: "",
    examples: [
      {
        front: "अभिभाषण\nव्याख्यान",
        back: "‣ अभिभाषण - लिखित भाषण\n‣ व्याख्यान - मौखिक भाषण",
        ex: {
          "वाक्य-प्रयोग":
            "◆ अभिभाषण - राष्ट्रपति ने संसद के दोनों सदनों में अपना अभिभाषण दिया।\n◆ व्याख्यान - स्वामी जी ने अध्यात्म पर एक बहुत ही सुंदर व्याख्यान दिया।",
        },
      },
    ],
    sort: 13,
  },
  {
    key: "shabd-yugm",
    name: "09 शब्द-युग्म",
    prompt: "शब्द-युग्म का वाक्य प्रयोग द्वारा अर्थगत अंतर स्पष्ट करें -",
    columns: cols(["वाक्य-प्रयोग", "a sentence for each word, one per line, each starting '◆ '"]),
    word_key: "",
    examples: [
      {
        front: "परिधान\nप्रधान",
        back: "‣ परिधान - वस्त्र\n‣ प्रधान - मुख्य",
        ex: {
          "वाक्य-प्रयोग":
            "◆ परिधान - उसने उत्सव के लिए सुंदर परिधान पहना।\n◆ प्रधान - वह समिति का प्रधान चुना गया।",
        },
      },
    ],
    sort: 14,
  },
  {
    key: "vakyansh",
    name: "10 वाक्यांश के लिए एक शब्द",
    prompt: "वाक्यांश के लिए सार्थक शब्द बतायें - ",
    columns: cols(["व्याख्या", "how the word is made or used, when it helps"]),
    word_key: "",
    examples: [{ front: "जो अपने काम में होशियार हो", back: "कार्यकुशल", ex: {} }],
    sort: 15,
  },
  {
    key: "muhavare",
    name: "11 मुहावरे",
    prompt: "निम्नलिखित मुहावरे का अर्थ बतायें - ",
    columns: cols(["वाक्य-प्रयोग", "one everyday sentence using the मुहावरा"]),
    word_key: "",
    examples: [
      {
        front: "जिन्दा मक्खी निगलना",
        back: "‣ स्पष्ट दिखता हुआ अन्याय सहन करना",
        ex: {
          "वाक्य-प्रयोग":
            "रमेश जानता था कि उसका बॉस उसे बेवजह डाँट रहा है, फिर भी वह जिन्दा मक्खी निगलता रहा।",
        },
      },
    ],
    sort: 16,
  },
  {
    key: "lokokti",
    name: "12 लोकोक्तियाँ",
    prompt: "निम्नलिखित लोकोक्ति का अर्थ बतायें - ",
    columns: cols(["वाक्य-प्रयोग", "one everyday sentence using the लोकोक्ति"]),
    word_key: "",
    examples: [
      {
        front: "अन्धा क्या चाहे दो आँखें",
        back: "‣ बिना प्रयास वांछित वस्तु का मिल जाना।",
        ex: {
          "वाक्य-प्रयोग":
            "मैं कई महीनों से नौकरी की तलाश में था और आज मुझे घर बैठे ही एक अच्छी कंपनी से बुलावा आ गया, अन्धा क्या चाहे दो आँखें।",
        },
      },
    ],
    sort: 17,
  },
  {
    key: "paribhashik",
    name: "13 पारिभाषिक शब्दावली",
    prompt: "निम्नलिखित अंग्रेजी पारिभाषिक शब्द का समानार्थक हिंदी शब्द बतायें -",
    columns: cols(
      ["Pronunciation", "IPA, e.g. '/prɪˈlɪmɪneri/'"],
      ["उच्चारण", "the English word written in Devanagari"],
      ["Sentence-Usage", "one English sentence using the word"],
      ["वाक्य-प्रयोग", "the same sentence in Hindi, using the Hindi word"],
    ),
    word_key: "",
    examples: [
      {
        front: "Preliminary",
        back: "प्रारंभिक",
        ex: {
          Pronunciation: "/prɪˈlɪmɪneri/",
          उच्चारण: "प्रिलिमिनरी",
          "Sentence-Usage": "A preliminary enquiry will be held before the formal inquiry.",
          "वाक्य-प्रयोग": "औपचारिक जाँच से पहले प्रारंभिक जाँच होगी।",
        },
      },
    ],
    sort: 18,
  },
];

// ---------- Cleaning what the database or the editor holds ----------

const text = (v: unknown, max = 20000) =>
  typeof v === "string" ? v.slice(0, max) : typeof v === "number" ? String(v) : "";
const oneLine = (v: unknown, max: number) => text(v, max).replace(/\s+/g, " ").trim();

export const wordKeyOf = (v: unknown): WordKey => {
  const s = String(v ?? "")
    .trim()
    .toLowerCase();
  return s === "front" || s === "back" ? s : "";
};

export function normalizeColumns(v: unknown): FlashColumn[] {
  const seen = new Set<string>();
  const out: FlashColumn[] = [];
  for (const x of Array.isArray(v) ? v : []) {
    const o = (x ?? {}) as Record<string, unknown>;
    const title = oneLine(o.title, 80);
    if (!title) continue;
    let id = oneLine(o.id, 20) || "c1";
    while (seen.has(id)) id = `c${seen.size + out.length + 1}`;
    seen.add(id);
    out.push({ id, title, hint: oneLine(o.hint, 300) });
  }
  return out.slice(0, 30);
}

// A column id not yet used.
export function newColumnId(columns: FlashColumn[]): string {
  let n = columns.length + 1;
  while (columns.some((c) => c.id === `c${n}`)) n++;
  return `c${n}`;
}

export function normalizeBooks(v: unknown): FlashBook[] {
  const out: FlashBook[] = [];
  for (const x of Array.isArray(v) ? v : []) {
    const o = (x ?? {}) as Record<string, unknown>;
    const code = oneLine(o.code, 30);
    if (!code || out.some((b) => b.code === code)) continue;
    const color = /^#[0-9a-f]{6}$/i.test(String(o.color)) ? String(o.color) : "";
    out.push({
      code,
      name: oneLine(o.name, 200),
      color: color || BOOK_COLORS[out.length % BOOK_COLORS.length],
    });
  }
  return out;
}

export function normalizeChunks(v: unknown): FlashChunk[] {
  return (Array.isArray(v) ? v : [])
    .map((x) => {
      const o = (x ?? {}) as Record<string, unknown>;
      const downloaded = typeof o.downloaded === "string" && o.downloaded ? o.downloaded : null;
      return { n: Number(o.n), from: Number(o.from), to: Number(o.to), downloaded };
    })
    .filter((c) => [c.n, c.from, c.to].every((n) => Number.isInteger(n) && n > 0))
    .sort((a, b) => a.n - b.n);
}

export function normalizeExamples(v: unknown): FlashExample[] {
  return (Array.isArray(v) ? v : []).slice(0, 10).map((x) => {
    const o = (x ?? {}) as Record<string, unknown>;
    const ex: Record<string, string> = {};
    for (const [k, val] of Object.entries((o.ex ?? {}) as Record<string, unknown>))
      if (typeof val === "string") ex[k.slice(0, 80)] = val.slice(0, 4000);
    return { front: text(o.front, 4000), back: text(o.back, 4000), ex };
  });
}

export function normalizeSources(v: unknown): FlashSource[] {
  const num = (n: unknown) =>
    Number.isFinite(Number(n)) && n !== null && n !== "" ? Number(n) : null;
  return (Array.isArray(v) ? v : []).slice(0, 20).map((x) => {
    const o = (x ?? {}) as Record<string, unknown>;
    return {
      book: oneLine(o.book, 30),
      pos: num(o.pos),
      page: num(o.page),
      heading: oneLine(o.heading, 300),
      rule: oneLine(o.rule, 300),
      ...(oneLine(o.note, 500) ? { note: oneLine(o.note, 500) } : {}),
      ...(oneLine(o.src, 40) ? { src: oneLine(o.src, 40) } : {}),
    };
  });
}

// A book being read into a topic.
export type FlashSourceRow = {
  id: string;
  topic_id: string;
  book: string;
  name: string;
  kind: "word" | "pdf" | "text" | "sheet";
  total: number;
  done: number;
  // The parts (or pages) read, 1-based.
  parts: number[];
  cards: number;
  todos: { where: string; text: string }[];
  error: string | null;
  // A sheet's rows; and, for any source, its cards deleted and merged into
  // other books' cards since.
  rows: number;
  deleted: number;
  merged: number;
  created_at: string;
};

export function normalizeVariants(v: unknown): FlashVariant[] {
  return (Array.isArray(v) ? v : []).slice(0, 30).map((x) => {
    const o = (x ?? {}) as Record<string, unknown>;
    return {
      book: oneLine(o.book, 30),
      front: text(o.front),
      back: text(o.back),
      ex: normalizeEx(o.ex),
      source: o.source ? (normalizeSources([o.source])[0] ?? null) : null,
    };
  });
}

export const normalizeEx = (v: unknown): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries((v ?? {}) as Record<string, unknown>))
    if (typeof val === "string" && val) out[k.slice(0, 20)] = val.slice(0, 20000);
  return out;
};

// ---------- Reading a sheet ----------

// What a row of a sheet holds: the upload columns, and the working columns
// (sn, Book, book_order, error, error_type, sheet, sheet_order) when there.
export type SheetCard = {
  front: string;
  back: string;
  back_hint: string;
  is_revealed: boolean;
  word_key: WordKey;
  prompt: string;
  ex: Record<string, string>; // by column title
  book: string;
  book_order: number | null;
  error: boolean;
  error_type: string;
  sheet: number | null;
  sheet_order: number | null;
  order: number | null;
  app_id: string;
};

export type ParsedSheet = {
  cards: SheetCard[];
  // Explanation column titles, in the sheet's order.
  columns: string[];
  // The prompt most cards have.
  prompt: string;
  // The sheet had the upload columns (a header row with "front").
  header: boolean;
  // Chunk numbers and orders on every card (a topic already chunked).
  numbered: boolean;
  problems: string[];
};

const cell = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(v);
  return String(v);
};
const int = (v: unknown): number | null => {
  const s = cell(v).trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && Math.abs(n - Math.round(n)) < 1e-9 ? Math.round(n) : null;
};
const truthy = (v: unknown) => {
  const s = cell(v).trim().toLowerCase();
  return !!s && s !== "0" && s !== "false" && s !== "no";
};

// Rows as the spreadsheet library gives them (header row first, or none):
// the finished upload format, the merged working sheet, or a book's own
// sheet without a header (number | word | answer | book).
export function parseSheet(rows: unknown[][]): ParsedSheet {
  const problems: string[] = [];
  const at = rows.findIndex((r) => (r ?? []).some((c) => cell(c).trim().toLowerCase() === "front"));
  const cards: SheetCard[] = [];
  const blank = (): SheetCard => ({
    front: "",
    back: "",
    back_hint: "",
    is_revealed: false,
    word_key: "",
    prompt: "",
    ex: {},
    book: "",
    book_order: null,
    error: false,
    error_type: "",
    sheet: null,
    sheet_order: null,
    order: null,
    app_id: "",
  });
  let columns: string[] = [];
  if (at >= 0) {
    const head = (rows[at] ?? []).map((c) => cell(c).trim());
    const find = (...names: string[]) =>
      head.findIndex((h) => names.includes(h.toLowerCase().replace(/[\s_-]/g, "")));
    const ix = {
      book: find("book"),
      bookOrder: find("bookorder"),
      error: find("error"),
      errorType: find("errortype"),
      sheet: find("sheet"),
      sheetOrder: find("sheetorder"),
      id: find("id"),
      order: find("order"),
      prompt: find("prompt"),
      front: find("front"),
      back: find("back"),
      hint: find("backhint"),
      revealed: find("isrevealed"),
      wordKey: find("wordkey"),
    };
    const exCols = head
      .map((h, i) => ({ i, title: h.replace(/^explanation_/i, "").trim() }))
      .filter((c, k) => /^explanation_/i.test(head[c.i]) && c.title && k >= 0);
    columns = [...new Set(exCols.map((c) => c.title))];
    for (const r of rows.slice(at + 1)) {
      const get = (i: number) => (i >= 0 ? cell((r ?? [])[i]) : "");
      const c = blank();
      c.front = get(ix.front);
      c.back = get(ix.back);
      if (!c.front.trim() && !c.back.trim()) continue;
      c.prompt = get(ix.prompt);
      c.back_hint = get(ix.hint);
      c.is_revealed = truthy(get(ix.revealed));
      c.word_key = wordKeyOf(get(ix.wordKey));
      for (const e of exCols) {
        const v = get(e.i);
        if (v.trim()) c.ex[e.title] = v;
      }
      c.book = get(ix.book).trim();
      c.book_order = int(get(ix.bookOrder));
      c.error = truthy(get(ix.error));
      c.error_type = get(ix.errorType).trim();
      c.sheet = int(get(ix.sheet));
      c.sheet_order = int(get(ix.sheetOrder));
      c.order = int(get(ix.order));
      c.app_id = get(ix.id).trim();
      cards.push(c);
    }
  } else {
    // A book's sheet: number | word | answer | book (the book column only
    // when it is a short code).
    for (const r of rows) {
      const vals = (r ?? []).map(cell);
      const filled = vals.map((v, i) => ({ v, i })).filter((x) => x.v.trim());
      if (filled.length < 2) continue;
      const c = blank();
      let parts = filled;
      if (int(parts[0].v) !== null && parts.length >= 3) {
        c.book_order = int(parts[0].v);
        parts = parts.slice(1);
      }
      const last = parts[parts.length - 1].v.trim();
      if (parts.length >= 3 && /^[A-Za-z][A-Za-z0-9 .-]{0,15}$/.test(last)) {
        c.book = last;
        parts = parts.slice(0, -1);
      }
      c.front = parts[0].v;
      c.back = parts
        .slice(1)
        .map((p) => p.v)
        .join("\n");
      cards.push(c);
    }
    if (cards.length) problems.push("No header row: read as number | word | answer | book.");
  }
  // A sheet of the editor's own (order, prompt, front, back, explanation_…):
  // its cards in its order, which is also their place in the sheet.
  if (at >= 0 && cards.some((c) => c.order !== null) && cards.every((c) => c.sheet === null)) {
    cards.sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));
    for (const c of cards) if (c.book_order === null) c.book_order = c.order;
  }
  const counts = new Map<string, number>();
  for (const c of cards) if (c.prompt.trim()) counts.set(c.prompt, (counts.get(c.prompt) ?? 0) + 1);
  const prompt = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  const numbered =
    cards.length > 0 && cards.every((c) => c.sheet !== null && c.order !== null && c.order > 0);
  if (numbered) {
    const orders = cards.map((c) => c.order!);
    if (new Set(orders).size !== orders.length) problems.push("Some cards share an order number.");
  }
  return { cards, columns, prompt, header: at >= 0, numbered, problems };
}

// ---------- Matching words across books ----------

// The same word however a book spells it: without spaces, nukta, chandrabindu
// (as anusvara), half-nasals before a consonant (as anusvara) and ZWJ/ZWNJ.
export function wordKey(s: string): string {
  return s
    .normalize("NFC")
    .toLowerCase()
    .replace(/[‌‍\s'"‘’“”.,;:!?()[\]{}‣◆•–—-]/g, "")
    .replace(/़/g, "")
    .replace(/ँ/g, "ं")
    .replace(/[ङञणनम]्(?=[क-ह])/g, "ं");
}

// ---------- Finalising: shuffle, chunk, number ----------

// Sizes that split `n` cards into chunks of about `target` each.
export function suggestSizes(n: number, target = 100): number[] {
  if (n <= 0) return [];
  const k = Math.max(1, Math.round(n / target));
  const base = Math.floor(n / k);
  return Array.from({ length: k }, (_, i) => base + (i < n % k ? 1 : 0));
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffled<T>(list: T[], seed: number): T[] {
  const out = [...list];
  const rnd = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export type Numbering = { id: string; chunk: number; card_order: number };

// The cards not yet numbered, shuffled and split into chunks of the given
// sizes, numbered on from the topic's last number and chunk.
export function planNumbers(
  ids: string[],
  sizes: number[],
  seed: number,
  after: { order: number; chunk: number },
): { numbers: Numbering[]; chunks: FlashChunk[] } {
  const total = sizes.reduce((a, b) => a + b, 0);
  if (sizes.some((s) => !Number.isInteger(s) || s < 1))
    throw new Error("Each chunk needs at least one card");
  if (total !== ids.length)
    throw new Error(`The chunks hold ${total} cards but there are ${ids.length} to number`);
  const order = shuffled(ids, seed);
  const numbers: Numbering[] = [];
  const chunks: FlashChunk[] = [];
  let next = after.order + 1;
  let k = 0;
  sizes.forEach((size, i) => {
    const chunk = after.chunk + i + 1;
    chunks.push({ n: chunk, from: next, to: next + size - 1 });
    for (let j = 0; j < size; j++) numbers.push({ id: order[k++], chunk, card_order: next++ });
  });
  return { numbers, chunks };
}

// The last number and chunk a topic has used (numbers are never reused).
export function lastNumbers(
  topic: Pick<FlashTopic, "chunks">,
  cards: Pick<FlashCard, "card_order" | "chunk">[],
) {
  let order = 0;
  let chunk = 0;
  for (const c of topic.chunks) {
    order = Math.max(order, c.to);
    chunk = Math.max(chunk, c.n);
  }
  for (const c of cards) {
    order = Math.max(order, c.card_order ?? 0);
    chunk = Math.max(chunk, c.chunk ?? 0);
  }
  return { order, chunk };
}

// ---------- Downloading ----------

export const UPLOAD_HEAD = [
  "id",
  "order",
  "prompt",
  "front",
  "back",
  "backHint",
  "isRevealed",
  "wordKey",
];
export const WORK_HEAD = [
  "sn",
  "Book",
  "book_order",
  "error",
  "error_type",
  "sheet",
  "sheet_order",
];

type Cell = string | number;

// A chunk's rows as the app's uploader takes them (header first), in number
// order; removed cards left out. `work` adds the proofreading columns first.
export function chunkRows(
  topic: Pick<FlashTopic, "prompt" | "columns" | "word_key" | "chunks">,
  cards: FlashCard[],
  chunk: number | null,
  work = false,
): Cell[][] {
  const head = [
    ...(work ? WORK_HEAD : []),
    ...UPLOAD_HEAD,
    ...topic.columns.map((c) => `explanation_${c.title}`),
  ];
  const list = cards
    .filter((c) => !c.removed && (chunk === null || c.chunk === chunk))
    .sort((a, b) => (a.card_order ?? Infinity) - (b.card_order ?? Infinity) || a.pos - b.pos);
  const firstOf = new Map(topic.chunks.map((c) => [c.n, c.from]));
  return [
    head,
    ...list.map((c) => {
      const src = c.sources[0];
      const sheetOrder =
        c.chunk !== null && c.card_order !== null && firstOf.has(c.chunk)
          ? c.card_order - firstOf.get(c.chunk)! + 1
          : "";
      return [
        ...(work
          ? [
              c.pos + 1,
              src?.book ?? "",
              src?.pos ?? "",
              c.error ? 1 : "",
              c.error_type,
              c.chunk ?? "",
              sheetOrder,
            ]
          : []),
        c.app_id ?? "",
        c.card_order ?? "",
        c.prompt ?? topic.prompt,
        c.front,
        c.back,
        c.back_hint,
        c.is_revealed ? 1 : "",
        c.word_key ?? topic.word_key,
        ...topic.columns.map((col) => c.ex[col.id] ?? ""),
      ];
    }),
  ];
}

export const chunkFileName = (topicName: string, chunk: number | null) =>
  `${
    topicName
      .replace(/[\\/:*?"<>|]+/g, "_")
      .trim()
      .slice(0, 80) || "cards"
  }${chunk === null ? "" : ` - ${chunk}`}`;

// ---------- The app's ids ----------

export type IdMatch = {
  saved: { card: string; app_id: string }[];
  // Numbers the topic doesn't have.
  unknown: number[];
  // Numbers whose front differs from the card's (the wrong file?).
  mismatched: { order: number; front: string; card: string }[];
  // Rows without an id.
  noId: number[];
  // Cards that already had another id.
  changed: number;
};

const sameText = (a: string, b: string) =>
  a.normalize("NFC").replace(/\s+/g, "") === b.normalize("NFC").replace(/\s+/g, "");

// The app's export matched to the topic's cards by number (and checked by
// front), to keep the id the app gave each card.
export function matchAppIds(
  cards: Pick<FlashCard, "id" | "card_order" | "front" | "app_id">[],
  rows: Pick<SheetCard, "order" | "front" | "app_id">[],
): IdMatch {
  const byOrder = new Map(
    cards.filter((c) => c.card_order !== null).map((c) => [c.card_order!, c]),
  );
  const out: IdMatch = { saved: [], unknown: [], mismatched: [], noId: [], changed: 0 };
  for (const r of rows) {
    if (r.order === null) continue;
    const card = byOrder.get(r.order);
    if (!card) out.unknown.push(r.order);
    else if (!sameText(card.front, r.front))
      out.mismatched.push({ order: r.order, front: r.front, card: card.front });
    else if (!r.app_id) out.noId.push(r.order);
    else {
      if (card.app_id && card.app_id !== r.app_id) out.changed++;
      out.saved.push({ card: card.id, app_id: r.app_id });
    }
  }
  return out;
}

// ---------- Alphabetical ranges ----------

// The letter a card's front starts with: its first letter (Latin in
// capitals; Devanagari as written, its vowel sign left off), "#" for none.
export function firstLetter(front: string): string {
  const m = /[A-Za-z\u0905-\u0939\u0958-\u0961]/.exec(front.normalize("NFC"));
  if (!m) return "#";
  return /[a-z]/i.test(m[0]) ? m[0].toUpperCase() : m[0];
}

// Letters in alphabet order: Latin A–Z, then Devanagari (vowels, then
// consonants, as the script orders them), then anything else.
export function compareLetters(a: string, b: string): number {
  const rank = (l: string) => (l === "#" ? 3 : /[A-Z]/.test(l) ? 1 : 2);
  return rank(a) - rank(b) || a.localeCompare(b, rank(a) === 2 ? "hi" : "en");
}

// The letters the cards start with, in order, with how many cards each.
export function lettersOf(cards: Pick<FlashCard, "front">[]): { letter: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const c of cards)
    counts.set(firstLetter(c.front), (counts.get(firstLetter(c.front)) ?? 0) + 1);
  return [...counts]
    .map(([letter, count]) => ({ letter, count }))
    .sort((a, b) => compareLetters(a.letter, b.letter));
}

// Whether a card's front starts within letters `from`–`to`.
export const inLetters = (front: string, from: string, to: string) => {
  const l = firstLetter(front);
  return compareLetters(l, from) >= 0 && compareLetters(l, to) <= 0;
};

// ---------- What changed since a chunk was downloaded ----------

export type ChunkChanges = { changed: FlashCard[]; removed: FlashCard[]; never: boolean };

// For each chunk: its cards edited (or removed) after it was last
// downloaded, or that it was never downloaded.
export function chunkChanges(
  topic: Pick<FlashTopic, "chunks">,
  cards: FlashCard[],
): Map<number, ChunkChanges> {
  const out = new Map<number, ChunkChanges>();
  for (const ch of topic.chunks) {
    const mine = cards.filter((c) => c.chunk === ch.n);
    if (!ch.downloaded) {
      out.set(ch.n, { changed: [], removed: [], never: true });
      continue;
    }
    const at = Date.parse(ch.downloaded);
    const after = mine.filter((c) => Date.parse(c.updated_at) > at);
    out.set(ch.n, {
      changed: after.filter((c) => !c.removed),
      removed: after.filter((c) => c.removed),
      never: false,
    });
  }
  return out;
}
