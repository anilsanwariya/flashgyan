// How the magazine writes Hindi and English, shared by every prompt that
// writes either language (the website and the bot): short forms stay in
// Latin letters, hard Hindi terms carry the English once, both languages
// read naturally, official names as the government writes them, and the
// editor's glossary. Also a fixer for short forms SAATHI still spells in
// Devanagari, and the checks the Hindi–English check runs. Pure.

// One glossary entry: the Hindi always used for an English term, or the
// English term kept as it is ("keep").
export type GlossaryEntry = { en: string; hi: string; keep?: boolean };

export const GLOSSARY_MAX = 200;

// Short forms an exam reader meets often, with their spellings in Devanagari
// (all are written in Latin letters in Hindi) and, where there is one, the
// full Hindi name given with the short form the first time.
export const SHORT_FORMS: { short: string; deva: string[]; hi?: string }[] = [
  { short: "SCO", deva: ["एससीओ"], hi: "शंघाई सहयोग संगठन" },
  { short: "BRICS", deva: ["ब्रिक्स"] },
  { short: "G20", deva: ["जी20", "जी-20", "जी 20"] },
  { short: "G7", deva: ["जी7", "जी-7", "जी 7"] },
  { short: "UN", deva: ["यूएन"], hi: "संयुक्त राष्ट्र" },
  { short: "UNSC", deva: ["यूएनएससी"], hi: "संयुक्त राष्ट्र सुरक्षा परिषद" },
  { short: "UNESCO", deva: ["यूनेस्को"] },
  { short: "UNEP", deva: ["यूएनईपी"], hi: "संयुक्त राष्ट्र पर्यावरण कार्यक्रम" },
  { short: "UNFCCC", deva: ["यूएनएफसीसीसी"] },
  { short: "IPCC", deva: ["आईपीसीसी"] },
  { short: "WHO", deva: ["डब्ल्यूएचओ"], hi: "विश्व स्वास्थ्य संगठन" },
  { short: "WTO", deva: ["डब्ल्यूटीओ"], hi: "विश्व व्यापार संगठन" },
  { short: "IMF", deva: ["आईएमएफ"], hi: "अंतरराष्ट्रीय मुद्रा कोष" },
  { short: "WEF", deva: ["डब्ल्यूईएफ"], hi: "विश्व आर्थिक मंच" },
  { short: "ADB", deva: ["एडीबी"], hi: "एशियाई विकास बैंक" },
  { short: "AIIB", deva: ["एआईआईबी"] },
  { short: "NDB", deva: ["एनडीबी"], hi: "न्यू डेवलपमेंट बैंक" },
  { short: "NATO", deva: ["नाटो"] },
  { short: "ASEAN", deva: ["आसियान"] },
  { short: "SAARC", deva: ["सार्क"] },
  { short: "BIMSTEC", deva: ["बिम्सटेक"] },
  { short: "OPEC", deva: ["ओपेक"] },
  { short: "QUAD", deva: ["क्वाड"] },
  { short: "COP", deva: ["कॉप", "सीओपी"] },
  { short: "IUCN", deva: ["आईयूसीएन"] },
  { short: "ISA", deva: ["आईएसए"], hi: "अंतरराष्ट्रीय सौर गठबंधन" },
  { short: "ISRO", deva: ["इसरो"], hi: "भारतीय अंतरिक्ष अनुसंधान संगठन" },
  { short: "DRDO", deva: ["डीआरडीओ"], hi: "रक्षा अनुसंधान एवं विकास संगठन" },
  { short: "NASA", deva: ["नासा"] },
  { short: "RBI", deva: ["आरबीआई"], hi: "भारतीय रिज़र्व बैंक" },
  { short: "SEBI", deva: ["सेबी"], hi: "भारतीय प्रतिभूति और विनिमय बोर्ड" },
  { short: "NABARD", deva: ["नाबार्ड"], hi: "राष्ट्रीय कृषि और ग्रामीण विकास बैंक" },
  { short: "NPCI", deva: ["एनपीसीआई"] },
  { short: "UPI", deva: ["यूपीआई"] },
  { short: "GDP", deva: ["जीडीपी"], hi: "सकल घरेलू उत्पाद" },
  { short: "GST", deva: ["जीएसटी"], hi: "वस्तु एवं सेवा कर" },
  { short: "FDI", deva: ["एफडीआई"], hi: "प्रत्यक्ष विदेशी निवेश" },
  { short: "CPI", deva: ["सीपीआई"], hi: "उपभोक्ता मूल्य सूचकांक" },
  { short: "WPI", deva: ["डब्ल्यूपीआई"], hi: "थोक मूल्य सूचकांक" },
  { short: "MSP", deva: ["एमएसपी"], hi: "न्यूनतम समर्थन मूल्य" },
  { short: "MSME", deva: ["एमएसएमई"], hi: "सूक्ष्म, लघु एवं मध्यम उद्यम" },
  { short: "SEZ", deva: ["एसईजेड"], hi: "विशेष आर्थिक क्षेत्र" },
  { short: "PPP", deva: ["पीपीपी"], hi: "सार्वजनिक-निजी भागीदारी" },
  { short: "CBDC", deva: ["सीबीडीसी"] },
  { short: "GI", deva: ["जीआई"], hi: "भौगोलिक संकेतक" },
  {
    short: "MGNREGA",
    deva: ["मनरेगा"],
    hi: "महात्मा गांधी राष्ट्रीय ग्रामीण रोज़गार गारंटी अधिनियम",
  },
  { short: "CBI", deva: ["सीबीआई"], hi: "केंद्रीय अन्वेषण ब्यूरो" },
  { short: "NIA", deva: ["एनआईए"], hi: "राष्ट्रीय अन्वेषण अभिकरण" },
  { short: "ED", deva: ["ईडी"], hi: "प्रवर्तन निदेशालय" },
  { short: "CAG", deva: ["सीएजी", "कैग"], hi: "नियंत्रक एवं महालेखा परीक्षक" },
  { short: "NGT", deva: ["एनजीटी"], hi: "राष्ट्रीय हरित अधिकरण" },
  { short: "NHAI", deva: ["एनएचएआई"], hi: "भारतीय राष्ट्रीय राजमार्ग प्राधिकरण" },
  { short: "NDRF", deva: ["एनडीआरएफ"], hi: "राष्ट्रीय आपदा मोचन बल" },
  { short: "SDRF", deva: ["एसडीआरएफ"], hi: "राज्य आपदा मोचन बल" },
  { short: "BSF", deva: ["बीएसएफ"], hi: "सीमा सुरक्षा बल" },
  { short: "CRPF", deva: ["सीआरपीएफ"], hi: "केंद्रीय रिज़र्व पुलिस बल" },
  { short: "CISF", deva: ["सीआईएसएफ"] },
  { short: "ITBP", deva: ["आईटीबीपी"] },
  { short: "BRO", deva: ["बीआरओ"], hi: "सीमा सड़क संगठन" },
  { short: "ICMR", deva: ["आईसीएमआर"], hi: "भारतीय आयुर्विज्ञान अनुसंधान परिषद" },
  { short: "ICAR", deva: ["आईसीएआर"], hi: "भारतीय कृषि अनुसंधान परिषद" },
  { short: "CSIR", deva: ["सीएसआईआर"], hi: "वैज्ञानिक तथा औद्योगिक अनुसंधान परिषद" },
  { short: "NCERT", deva: ["एनसीईआरटी"] },
  { short: "NEP", deva: ["एनईपी"], hi: "राष्ट्रीय शिक्षा नीति" },
  { short: "UPSC", deva: ["यूपीएससी"], hi: "संघ लोक सेवा आयोग" },
  { short: "RPSC", deva: ["आरपीएससी"], hi: "राजस्थान लोक सेवा आयोग" },
  { short: "RSSB", deva: ["आरएसएसबी"], hi: "राजस्थान कर्मचारी चयन बोर्ड" },
  { short: "RAS", deva: ["आरएएस"], hi: "राजस्थान प्रशासनिक सेवा" },
  { short: "IAS", deva: ["आईएएस"], hi: "भारतीय प्रशासनिक सेवा" },
  { short: "IPS", deva: ["आईपीएस"], hi: "भारतीय पुलिस सेवा" },
  { short: "IIT", deva: ["आईआईटी"] },
  { short: "IIM", deva: ["आईआईएम"] },
  { short: "AIIMS", deva: ["एम्स"], hi: "अखिल भारतीय आयुर्विज्ञान संस्थान" },
  { short: "RTI", deva: ["आरटीआई"], hi: "सूचना का अधिकार" },
  { short: "EVM", deva: ["ईवीएम"] },
  { short: "NOTA", deva: ["नोटा"] },
  { short: "AI", deva: ["एआई"], hi: "कृत्रिम बुद्धिमत्ता" },
  { short: "GPS", deva: ["जीपीएस"] },
  { short: "LPG", deva: ["एलपीजी"] },
  { short: "CNG", deva: ["सीएनजी"] },
  { short: "DNA", deva: ["डीएनए"] },
  { short: "HIV", deva: ["एचआईवी"] },
  { short: "ICC", deva: ["आईसीसी"] },
  { short: "BCCI", deva: ["बीसीसीआई"] },
  { short: "IPL", deva: ["आईपीएल"] },
  { short: "FIFA", deva: ["फीफा", "फ़ीफ़ा"] },
  { short: "OTT", deva: ["ओटीटी"] },
];

// The rules every prompt that writes Hindi follows, with the editor's
// glossary. One block, so the language is the same everywhere.
export function hindiGuide(glossary: GlossaryEntry[] = []): string {
  const terms = glossary
    .filter((g) => g.en.trim() && (g.keep || g.hi.trim()))
    .slice(0, GLOSSARY_MAX)
    .map((g) => (g.keep ? `- ${g.en}: keep "${g.en}" in English` : `- ${g.en} → ${g.hi}`))
    .join("\n");
  return `
HINDI AND ENGLISH (both are read on their own, by different students):
- Write each language the way a good editor of that language writes it, never word for word: the same facts, numbers and names, but each with its own natural sentence order and structure. Hindi: active voice, short clear sentences, no chains of "के द्वारा … किया गया", no English word order. English: plain exam-style English, no Hindi phrasing. A headline reads like a real newspaper headline in its own language.
- Hindi is standard Hindi as used in Rajasthan competitive exams and RPSC papers (मानक हिंदी), in the spellings of the Central Hindi Directorate, with nukta where the word has it (ज़्यादा, फ़ैसला, ग़रीब, क़ानून), and the terms students meet in RPSC papers and Rajasthan textbooks (संविधान का अनुच्छेद, राज्य सूची, मरुस्थलीकरण).
- Short forms stay in Latin letters in Hindi, never spelled in Devanagari (SCO, not एससीओ; RBI, not आरबीआई; G20, ISRO, GDP). The first time a short form appears in a story, give its full Hindi name with the short form in brackets when it has one ("शंघाई सहयोग संगठन (SCO)", "भारतीय अंतरिक्ष अनुसंधान संगठन (ISRO)"); after that only the short form.
- A technical or uncommon Hindi term gets its English in brackets the first time it appears in a story only ("हरित हाइड्रोजन (Green Hydrogen)", "अधिसूचना (Notification)"); never for everyday words, and never a second time.
- Official names as the government writes them: Rajasthan and central schemes, missions, acts, ministries, courts and bodies by their official Hindi names (मुख्यमंत्री चिरंजीवी स्वास्थ्य बीमा योजना), not a translation of the English name; people and places in their standard Hindi spelling (जयपुर, बाड़मेर), never translated.
- Numbers in digits in both languages, the same number and unit in both (₹500 करोड़ / Rs 500 crore); never convert million or billion into lakh or crore, or the other way. Dates as "14 अक्टूबर 2026" / "14 October 2026".${terms ? `\n- The editor's glossary; always use these:\n${terms}` : ""}`;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// A Devanagari word boundary: not next to another Devanagari letter or sign
// (the danda । and ॥ are punctuation).
const DEVA = "\\u0900-\\u0963\\u0966-\\u097F";
const SPELLED = SHORT_FORMS.flatMap((f) =>
  f.deva.map(
    (d) =>
      [
        new RegExp(`(?<![${DEVA}A-Za-z])${escapeRe(d)}(?![${DEVA}A-Za-z0-9])`, "g"),
        f.short,
      ] as const,
  ),
);

// Short forms spelled in Devanagari, written in Latin letters again.
export function fixShortForms(hi: string): string {
  let out = hi;
  for (const [re, short] of SPELLED) out = out.replace(re, short);
  return out;
}

// The same, for every Hindi string in a story's parts ({en, hi} pairs, a
// visual's texts, "keyword_hi"…).
export function fixShortFormsDeep<T>(value: T): T {
  const walk = (v: unknown, key: string): unknown => {
    if (typeof v === "string") return key === "hi" || key.endsWith("_hi") ? fixShortForms(v) : v;
    if (Array.isArray(v)) return v.map((x) => walk(x, key));
    if (v && typeof v === "object")
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, k)]));
    return v;
  };
  return walk(value, "") as T;
}

// Short forms still spelled in Devanagari in a Hindi line.
export function spelledShortForms(hi: string): string[] {
  return [...new Set(SPELLED.filter(([re]) => new RegExp(re.source).test(hi)).map(([, s]) => s))];
}

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

// What the Hindi–English check flags in one Hindi–English pair, without AI:
// a short form in Devanagari (with the line fixed), a glossary term written
// another way, and a Hindi line much shorter than its English (something
// left out).
export function hindiIssues(
  en: string,
  hi: string,
  glossary: GlossaryEntry[] = [],
): { issue: string; fix: string | null }[] {
  const out: { issue: string; fix: string | null }[] = [];
  const spelled = spelledShortForms(hi);
  if (spelled.length)
    out.push({
      issue: `Short form in Devanagari: write ${spelled.join(", ")} in Latin letters`,
      fix: fixShortForms(hi),
    });
  const enLow = en.toLowerCase();
  const missed = glossary
    .filter((g) => g.en.trim() && (g.keep || g.hi.trim()))
    .filter((g) =>
      new RegExp(`(?<![a-z])${escapeRe(g.en.trim().toLowerCase())}(?![a-z])`).test(enLow),
    )
    .filter((g) => !hi.includes(g.keep ? g.en.trim() : g.hi.trim()))
    .map((g) => `${g.en} → ${g.keep ? g.en : g.hi}`);
  if (missed.length) out.push({ issue: `Glossary: ${missed.join("; ")}`, fix: null });
  const e = words(en);
  if (e >= 10 && words(hi) < e * 0.55)
    out.push({
      issue: "The Hindi is much shorter than the English: check nothing is left out",
      fix: null,
    });
  return out;
}
