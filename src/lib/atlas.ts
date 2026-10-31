// The Rajasthan atlas: the editor's places, facts, thematic layers and
// district overviews. Pure: shared by the server, the admin panel and the
// students' atlas pages.
import type { Bi } from "@/lib/current-affairs";

export type AtlasLang = "en" | "hi";
export type AtlasStatus = "verified" | "to_check" | "hidden";
export const pickBi = (b: Bi | undefined | null, lang: AtlasLang) =>
  !b ? "" : lang === "hi" ? b.hi || b.en : b.en || b.hi;

// ---------- Subjects ----------

export const ATLAS_SUBJECTS: { key: string; name: Bi }[] = [
  { key: "geo", name: { en: "Geography", hi: "भूगोल" } },
  { key: "his", name: { en: "History", hi: "इतिहास" } },
  { key: "art", name: { en: "Art & culture", hi: "कला एवं संस्कृति" } },
  { key: "pol", name: { en: "Polity & administration", hi: "राजव्यवस्था एवं प्रशासन" } },
  { key: "eco", name: { en: "Economy", hi: "अर्थव्यवस्था" } },
];

// ---------- Place categories ----------

export type AtlasCat = { key: string; name: Bi; group: string; color: string; icon: string };
export const ATLAS_GROUPS: { key: string; name: Bi; color: string }[] = [
  {
    key: "culture",
    name: { en: "Tourism & culture", hi: "पर्यटन एवं संस्कृति" },
    color: "#b4235a",
  },
  { key: "relief", name: { en: "Relief", hi: "उच्चावच" }, color: "#8a5a2b" },
  { key: "water", name: { en: "Water", hi: "जल" }, color: "#1d6fb8" },
  { key: "climate", name: { en: "Climate", hi: "जलवायु" }, color: "#0e7490" },
  { key: "minerals", name: { en: "Minerals", hi: "खनिज" }, color: "#475569" },
  { key: "energy", name: { en: "Energy", hi: "ऊर्जा" }, color: "#c2410c" },
  { key: "wildlife", name: { en: "Wildlife & forests", hi: "वन्यजीव एवं वन" }, color: "#15803d" },
  { key: "agri", name: { en: "Agriculture", hi: "कृषि" }, color: "#65a30d" },
  { key: "livestock", name: { en: "Livestock", hi: "पशुधन" }, color: "#a16207" },
  { key: "industry", name: { en: "Industry", hi: "उद्योग" }, color: "#7c3aed" },
  { key: "people", name: { en: "People", hi: "जनसंख्या एवं जनजाति" }, color: "#be185d" },
  { key: "history", name: { en: "History", hi: "इतिहास" }, color: "#9a3412" },
  { key: "arts", name: { en: "Folk arts & crafts", hi: "लोक कला एवं शिल्प" }, color: "#db2777" },
  { key: "polity", name: { en: "Polity", hi: "राजव्यवस्था" }, color: "#1e40af" },
  { key: "other", name: { en: "Other", hi: "अन्य" }, color: "#64748b" },
];
const c = (key: string, en: string, hi: string, group: string, icon: string): AtlasCat => ({
  key,
  name: { en, hi },
  group,
  color: ATLAS_GROUPS.find((g) => g.key === group)!.color,
  icon,
});
export const ATLAS_CATS: AtlasCat[] = [
  c("fort", "Fort / palace", "दुर्ग / महल", "culture", "🏰"),
  c("temple", "Temple / shrine / dargah", "मंदिर / तीर्थ / दरगाह", "culture", "🛕"),
  c("fair", "Fair / festival", "मेला / उत्सव", "culture", "🎪"),
  c("heritage", "Heritage & tourist site", "विरासत एवं पर्यटन स्थल", "culture", "🏛️"),
  c("archaeo", "Archaeological / civilisation site", "पुरातात्विक / सभ्यता स्थल", "culture", "🏺"),
  c("ropeway", "Ropeway", "रोपवे", "culture", "🚡"),
  c("peak", "Peak / hill", "चोटी / पहाड़ी", "relief", "⛰️"),
  c("pass", "Pass (ghat / naal)", "दर्रा (घाट / नाल)", "relief", "⛕"),
  c("plateau", "Plateau", "पठार", "relief", "🟫"),
  c(
    "desert",
    "Desert feature (dune, hamada, rann, oasis)",
    "मरुस्थलीय स्वरूप (धोरे, हमादा, रण, नखलिस्तान)",
    "relief",
    "🏜️",
  ),
  c("geo", "Geo-heritage / fossil site", "भू-विरासत / जीवाश्म स्थल", "relief", "🪨"),
  c("rsrc", "River source / confluence / falls", "नदी उद्गम / संगम / जलप्रपात", "water", "💧"),
  c("dam", "Dam / barrage / project", "बाँध / बैराज / परियोजना", "water", "🌊"),
  c(
    "rlink",
    "River-link project (PKC-ERCP / Ram Jal Setu)",
    "नदी जोड़ परियोजना (PKC-ERCP / राम जल सेतु)",
    "water",
    "🔗",
  ),
  c("canal", "Canal point", "नहर स्थल", "water", "〰️"),
  c("saltlake", "Salt lake", "खारे पानी की झील", "water", "🧂"),
  c("lake", "Freshwater lake / talab", "मीठे पानी की झील / तालाब", "water", "🏞️"),
  c("ramsar", "Ramsar wetland", "रामसर आर्द्रभूमि", "water", "🦩"),
  c(
    "harvest",
    "Water harvesting (baori, johad, kund)",
    "जल संग्रहण (बावड़ी, जोहड़, कुंड)",
    "water",
    "🪣",
  ),
  c("climate", "Climate record / weather spot", "जलवायु रिकॉर्ड / मौसम स्थल", "climate", "🌡️"),
  c("metal", "Metallic & critical mineral", "धात्विक एवं महत्वपूर्ण खनिज", "minerals", "⚒️"),
  c(
    "stone",
    "Building stone / marble / limestone",
    "इमारती पत्थर / संगमरमर / चूना पत्थर",
    "minerals",
    "🧱",
  ),
  c("nonmetal", "Industrial / non-metallic mineral", "औद्योगिक / अधात्विक खनिज", "minerals", "💎"),
  c(
    "fuel",
    "Oil / gas / lignite / coal / uranium",
    "तेल / गैस / लिग्नाइट / कोयला / यूरेनियम",
    "minerals",
    "🛢️",
  ),
  c("thermal", "Thermal / gas power plant", "तापीय / गैस विद्युत गृह", "energy", "🏭"),
  c("solar", "Solar park / plant", "सौर पार्क / संयंत्र", "energy", "☀️"),
  c("wind", "Wind farm", "पवन ऊर्जा फार्म", "energy", "🌬️"),
  c("hydro", "Hydro power", "जल विद्युत", "energy", "⚡"),
  c("nuclear", "Nuclear power", "परमाणु ऊर्जा", "energy", "☢️"),
  c("bio", "Biomass / biodiesel / refinery", "बायोमास / बायोडीजल / रिफाइनरी", "energy", "🌱"),
  c("tiger", "Tiger reserve / national park", "बाघ परियोजना / राष्ट्रीय उद्यान", "wildlife", "🐅"),
  c("sanct", "Wildlife sanctuary", "वन्यजीव अभयारण्य", "wildlife", "🦌"),
  c(
    "cr",
    "Conservation / community reserve",
    "संरक्षण / सामुदायिक आरक्षित क्षेत्र",
    "wildlife",
    "🌳",
  ),
  c("closed", "Closed area", "आखेट निषिद्ध क्षेत्र", "wildlife", "🚫"),
  c(
    "zoo",
    "Zoo / biological / nature park",
    "चिड़ियाघर / जैविक / प्रकृति उद्यान",
    "wildlife",
    "🦒",
  ),
  c("forest", "Forest / tree / grass site", "वन / वृक्ष / घास स्थल", "wildlife", "🌲"),
  c("mascot", "District wildlife mascot", "जिले का वन्यजीव शुभंकर", "wildlife", "🦚"),
  c("agri", "Agri research / farm / KVK", "कृषि अनुसंधान / फार्म / KVK", "agri", "🔬"),
  c("mandi", "Mandi / food park / agro centre", "मंडी / फूड पार्क / कृषि केंद्र", "agri", "🧺"),
  c("crop", "Crop leader (district)", "फसल उत्पादन में अग्रणी (जिला)", "agri", "🌾"),
  c("breed", "Livestock breed home", "पशु नस्ल का मूल स्थान", "livestock", "🐄"),
  c("lsc", "Livestock centre / dairy", "पशुधन केंद्र / डेयरी", "livestock", "🥛"),
  c("cattlefair", "Cattle fair", "पशु मेला", "livestock", "🐪"),
  c(
    "industry",
    "Industry / industrial park / SEZ",
    "उद्योग / औद्योगिक पार्क / SEZ",
    "industry",
    "🏗️",
  ),
  c("tribe", "Tribe homeland", "जनजाति क्षेत्र", "people", "🪶"),
  c("census", "Census record", "जनगणना रिकॉर्ड", "people", "📊"),
  c("battle", "Battle / historic event", "युद्ध / ऐतिहासिक घटना", "history", "⚔️"),
  c("saint", "Saint / sect seat", "संत / सम्प्रदाय पीठ", "culture", "🙏"),
  c("dynasty", "Dynasty / kingdom seat", "राजवंश / रियासत की राजधानी", "history", "👑"),
  c("folkdeity", "Folk deity shrine", "लोक देवता / देवी का स्थान", "culture", "🪔"),
  c("dance", "Folk dance home", "लोक नृत्य का क्षेत्र", "arts", "💃"),
  c("painting", "Painting school (qalam)", "चित्रकला शैली", "arts", "🎨"),
  c("craft", "Craft / handicraft centre", "हस्तशिल्प केंद्र", "arts", "🧵"),
  c("music", "Folk music / instrument home", "लोक संगीत / वाद्य", "arts", "🪕"),
  c(
    "seat",
    "Constituency (Lok Sabha / Assembly)",
    "निर्वाचन क्षेत्र (लोकसभा / विधानसभा)",
    "polity",
    "🗳️",
  ),
  c(
    "institute",
    "Institute / university / museum",
    "संस्थान / विश्वविद्यालय / संग्रहालय",
    "other",
    "🎓",
  ),
  c("town", "Town / place in the notes", "नगर / स्थान", "other", "📍"),
  c("region", "Historical region", "ऐतिहासिक क्षेत्र", "other", "🗺️"),
  c("border", "Border / location point", "सीमा / स्थिति बिंदु", "other", "🧭"),
];
export const ATLAS_CAT_KEYS = ATLAS_CATS.map((x) => x.key);
export const atlasCat = (key: string): AtlasCat =>
  ATLAS_CATS.find((x) => x.key === key) ?? ATLAS_CATS.find((x) => x.key === "town")!;

// ---------- Fact kinds ----------

export const FACT_KINDS: { key: string; bit: number; name: Bi }[] = [
  { key: "correction", bit: 1, name: { en: "✔ Correction", hi: "✔ सुधार" } },
  { key: "trap", bit: 2, name: { en: "⚠ Trap", hi: "⚠ सावधान" } },
  { key: "mnemonic", bit: 4, name: { en: "🧠 Mnemonic", hi: "🧠 याद रखो" } },
  { key: "why", bit: 8, name: { en: "💡 Why", hi: "💡 समझो" } },
  { key: "pyq", bit: 16, name: { en: "📝 PYQ", hi: "📝 पिछले वर्ष का प्रश्न" } },
  { key: "answer", bit: 32, name: { en: "Model answer", hi: "आदर्श उत्तर" } },
  { key: "mcq", bit: 64, name: { en: "MCQ", hi: "बहुविकल्पी प्रश्न" } },
  { key: "revision", bit: 128, name: { en: "Revision card", hi: "रिवीजन कार्ड" } },
  { key: "anchor", bit: 512, name: { en: "🧭 Anchor", hi: "🧭 मुख्य बिंदु" } },
];
export const factKinds = (flags: number) => FACT_KINDS.filter((k) => flags & k.bit);

// ---------- Districts ----------

// The master map's names → the map's (the 41 districts of 2023).
export const DISTRICT_ALIASES: Record<string, string> = {
  Ganganagar: "Sri Ganganagar",
  "Shri Ganganagar": "Sri Ganganagar",
  Chittaurgarh: "Chittorgarh",
  Jhunjhunun: "Jhunjhunu",
  Dhaulpur: "Dholpur",
  Salumber: "Salumbar",
};
export const districtName = (n: string) => DISTRICT_ALIASES[n.trim()] ?? n.trim();

export const DIVISIONS: { key: string; name: Bi }[] = [
  { key: "Jaipur", name: { en: "Jaipur", hi: "जयपुर" } },
  { key: "Jodhpur", name: { en: "Jodhpur", hi: "जोधपुर" } },
  { key: "Ajmer", name: { en: "Ajmer", hi: "अजमेर" } },
  { key: "Bikaner", name: { en: "Bikaner", hi: "बीकानेर" } },
  { key: "Udaipur", name: { en: "Udaipur", hi: "उदयपुर" } },
  { key: "Kota", name: { en: "Kota", hi: "कोटा" } },
  { key: "Bharatpur", name: { en: "Bharatpur", hi: "भरतपुर" } },
];

export const AGRO_ZONES: { key: string; name: Bi; color: string }[] = [
  {
    key: "IA",
    name: { en: "IA Arid Western Plain", hi: "IA शुष्क पश्चिमी मैदान" },
    color: "#d99a2b",
  },
  {
    key: "IB",
    name: { en: "IB Irrigated North-Western Plain", hi: "IB सिंचित उत्तर-पश्चिमी मैदान" },
    color: "#2f7fbf",
  },
  {
    key: "IC",
    name: { en: "IC Hyper-Arid Partially Irrigated Zone", hi: "IC अति शुष्क आंशिक सिंचित क्षेत्र" },
    color: "#b0701a",
  },
  {
    key: "IIA",
    name: {
      en: "IIA Transitional Plain of Inland Drainage",
      hi: "IIA आंतरिक जलप्रवाह का अंतर्वर्ती मैदान",
    },
    color: "#c0392b",
  },
  {
    key: "IIB",
    name: { en: "IIB Transitional Plain of Luni Basin", hi: "IIB लूनी बेसिन का अंतर्वर्ती मैदान" },
    color: "#8e44ad",
  },
  {
    key: "IIIA",
    name: { en: "IIIA Semi-Arid Eastern Plain", hi: "IIIA अर्द्ध शुष्क पूर्वी मैदान" },
    color: "#d4488a",
  },
  {
    key: "IIIB",
    name: { en: "IIIB Flood-Prone Eastern Plain", hi: "IIIB बाढ़ संभावित पूर्वी मैदान" },
    color: "#2e7d32",
  },
  {
    key: "IVA",
    name: {
      en: "IVA Sub-Humid Southern Plain & Aravalli Hills",
      hi: "IVA उप-आर्द्र दक्षिणी मैदान एवं अरावली पहाड़ियाँ",
    },
    color: "#0f7a70",
  },
  {
    key: "IVB",
    name: { en: "IVB Humid Southern Plain", hi: "IVB आर्द्र दक्षिणी मैदान" },
    color: "#1b5e20",
  },
  {
    key: "V",
    name: { en: "V Humid South-Eastern Plain", hi: "V आर्द्र दक्षिण-पूर्वी मैदान" },
    color: "#4a4a9a",
  },
];

export type DistrictMeta = {
  division?: string;
  zone?: string;
  neighbours?: string[];
  hq?: [number, number];
  tehsils?: number;
};

// ---------- Rows ----------

export type AtlasPlace = {
  id: string;
  key: string;
  name_en: string;
  name_hi: string;
  label_en: string;
  label_hi: string;
  cat: string;
  lat: number;
  lon: number;
  district: string;
  tehsil: string;
  refs: [string, string][];
  note_en: string;
  note_hi: string;
  status: AtlasStatus;
  source: string;
  edited: boolean;
  in_file: boolean;
  // When it happened or was built (years; BCE negative), and a fair's months
  // (1–12); absent before their migration.
  era_from?: number | null;
  era_to?: number | null;
  months?: number[];
};

export type AtlasFact = {
  id: string;
  key: string;
  subject: string;
  chapter_key: string;
  chapter: string;
  heading: string;
  text_en: string;
  text_hi: string;
  table_head: string;
  flags: number;
  entities: string[];
  position: number;
  status: AtlasStatus;
  note: string;
  hi_ai: boolean;
  source: string;
  edited: boolean;
  in_file: boolean;
};

// The notes' markers, kept out of the students' view: "[verify]", "⟪…⟫".
export const cleanFactText = (t: string) =>
  t
    .replace(/\[verify[^\]]*\]/gi, "")
    .replace(/[⟪⟫]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

// ---------- Layers ----------

export type LonLat = [number, number];
export type AtlasFeature = {
  kind: "area" | "line" | "label" | "district";
  name: Bi;
  color: string;
  // area: rings; line: one line; label/district: a point (district: the
  // district's own outline is drawn, by name).
  rings?: LonLat[][];
  line?: LonLat[];
  at?: LonLat;
  district?: string;
  dash?: string;
  width?: number;
  // An arrow at the line's end (winds).
  arrow?: boolean;
};
export type AtlasLayer = {
  key: string;
  name_en: string;
  name_hi: string;
  grp: string;
  note: string;
  approx: boolean;
  items: AtlasFeature[];
  position: number;
  status: AtlasStatus;
};
export const LAYER_GROUPS: { key: string; name: Bi }[] = [
  { key: "admin", name: { en: "Administration", hi: "प्रशासन" } },
  { key: "physical", name: { en: "Physical", hi: "भौतिक" } },
  { key: "climate", name: { en: "Climate", hi: "जलवायु" } },
  { key: "soil", name: { en: "Soils & forests", hi: "मृदा एवं वन" } },
  { key: "water", name: { en: "Water", hi: "जल" } },
  { key: "economy", name: { en: "Agriculture & resources", hi: "कृषि एवं संसाधन" } },
];

// The legend: each name and colour once.
export function layerLegend(
  l: Pick<AtlasLayer, "items">,
): { name: Bi; color: string; kind: string }[] {
  const seen = new Set<string>();
  const out: { name: Bi; color: string; kind: string }[] = [];
  for (const f of l.items) {
    const k = `${f.name.en}|${f.color}`;
    if (!f.name.en && !f.name.hi) continue;
    if (seen.has(k) || f.kind === "label") continue;
    seen.add(k);
    out.push({ name: f.name, color: f.color, kind: f.kind });
  }
  return out;
}

// A layer drawn into an SVG: areas filled, lines stroked, names placed.
// `project` maps longitude/latitude to the map's x/y; `k` keeps strokes
// the same size however close the view is; `districts` gives a district's
// outline for district-coloured layers.
export function layerSvg(
  layer: Pick<AtlasLayer, "items">,
  project: (lon: number, lat: number) => [number, number],
  k: number,
  lang: AtlasLang,
  districts?: (name: string) => LonLat[][] | null,
  opts: { opacity?: number; labels?: boolean } = {},
): string {
  const op = opts.opacity ?? 0.45;
  const d = (ring: LonLat[]) =>
    "M" +
    ring
      .map(([lon, lat]) => project(lon, lat))
      .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
      .join("L");
  const esc = (s: string) =>
    s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);
  let areas = "";
  let lines = "";
  let labels = "";
  const label = (at: LonLat, text: string, color: string, size = 12) => {
    if (!text || opts.labels === false) return "";
    const [x, y] = project(at[0], at[1]);
    return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" style="font-size:${(size * k).toFixed(2)}px;fill:${color};paint-order:stroke;stroke:#fffdf6;stroke-width:${(3 * k).toFixed(2)}px;font-weight:600">${esc(text)}</text>`;
  };
  for (const f of layer.items) {
    const name = pickBi(f.name, lang);
    if (f.kind === "area" && f.rings?.length) {
      areas += `<path d="${f.rings.map(d).join("Z")}Z" fill="${f.color}" fill-opacity="${op}" stroke="${f.color}" stroke-width="${(0.8 * k).toFixed(2)}" fill-rule="evenodd"/>`;
      if (f.at) labels += label(f.at, name, "#1f2430", 11);
    } else if (f.kind === "district" && f.district && districts) {
      const rings = districts(f.district);
      if (rings?.length)
        areas += `<path d="${rings.map(d).join("Z")}Z" fill="${f.color}" fill-opacity="${op}" stroke="#ffffff" stroke-width="${(0.6 * k).toFixed(2)}"/>`;
    } else if (f.kind === "line" && f.line && f.line.length > 1) {
      const w = (f.width ?? 2) * k;
      lines += `<path d="${d(f.line)}" fill="none" stroke="${f.color}" stroke-width="${w.toFixed(2)}" stroke-linecap="round" stroke-linejoin="round"${
        f.dash
          ? ` stroke-dasharray="${f.dash
              .split(/\s+/)
              .map((n) => (Number(n) * k).toFixed(2))
              .join(" ")}"`
          : ""
      }/>`;
      if (f.arrow) {
        const [x1, y1] = project(...f.line[f.line.length - 2]);
        const [x2, y2] = project(...f.line[f.line.length - 1]);
        const a = Math.atan2(y2 - y1, x2 - x1);
        const s = 9 * k;
        const p = (da: number) =>
          `${(x2 - s * Math.cos(a + da)).toFixed(1)},${(y2 - s * Math.sin(a + da)).toFixed(1)}`;
        lines += `<path d="M${p(0.45)}L${x2.toFixed(1)},${y2.toFixed(1)}L${p(-0.45)}" fill="none" stroke="${f.color}" stroke-width="${w.toFixed(2)}"/>`;
      }
      if (f.at) labels += label(f.at, name, f.color, 11);
    } else if (f.kind === "label" && f.at) {
      labels += label(f.at, name, f.color, 12);
    }
  }
  return areas + lines + labels;
}

// ---------- District overview ----------

// A block of a district's overview page.
export type OverviewBlock =
  | { type: "chips"; title: Bi; items: Bi[]; hot?: number[] }
  | { type: "big"; title: Bi; value: Bi; text: Bi }
  | { type: "text"; title: Bi; text: Bi }
  | { type: "list"; title: Bi; items: Bi[] }
  | { type: "table"; title: Bi; cols: Bi[]; rows: Bi[][] }
  | { type: "callout"; kind: "trick" | "remember" | "note"; text: Bi }
  | { type: "timeline"; title: Bi; eras: { title: Bi; items: { when: string; text: Bi }[] }[] }
  | { type: "borders"; title: Bi; intl: Bi; items: { name: Bi; dir: Bi }[] };
export const BLOCK_TYPES: { type: OverviewBlock["type"]; name: string }[] = [
  { type: "big", name: "Key fact" },
  { type: "chips", name: "Chips" },
  { type: "text", name: "Paragraph" },
  { type: "list", name: "List" },
  { type: "table", name: "Table" },
  { type: "callout", name: "Trick / remember / note" },
  { type: "timeline", name: "Timeline" },
  { type: "borders", name: "Borders" },
];

export type OverviewSection = { id: string; title: Bi; lede: Bi; blocks: OverviewBlock[] };
export type DistrictOverview = {
  name: Bi;
  tagline: Bi;
  badges: Bi[];
  sections: OverviewSection[];
  revision: { q: Bi; a: Bi }[];
  // Points to check before relying on them (shown to students as a note).
  notes: Bi[];
  source: string;
};
export const EMPTY_OVERVIEW: DistrictOverview = {
  name: { en: "", hi: "" },
  tagline: { en: "", hi: "" },
  badges: [],
  sections: [],
  revision: [],
  notes: [],
  source: "",
};

// The standard sections, in the order of the overview pages.
export const OVERVIEW_SECTIONS: { id: string; title: Bi }[] = [
  { id: "intro", title: { en: "Introduction", hi: "सामान्य परिचय" } },
  { id: "geography", title: { en: "Geography", hi: "भूगोल" } },
  {
    id: "agriculture",
    title: { en: "Agriculture, livestock & research", hi: "कृषि, पशुधन व अनुसंधान" },
  },
  { id: "wildlife", title: { en: "Wildlife", hi: "वन्यजीव" } },
  {
    id: "industry",
    title: { en: "Industry, energy & infrastructure", hi: "उद्योग, ऊर्जा व अवसंरचना" },
  },
  { id: "forts", title: { en: "Forts, palaces & havelis", hi: "दुर्ग, महल व हवेलियाँ" } },
  { id: "art", title: { en: "Art, music & folk theatre", hi: "कला, संगीत व लोकनाट्य" } },
  { id: "temples", title: { en: "Temples & places of faith", hi: "मंदिर व आस्था स्थल" } },
  { id: "saints", title: { en: "Folk saints & sects", hi: "लोक संत व सम्प्रदाय" } },
  { id: "history", title: { en: "History: timeline", hi: "इतिहास — समय रेखा" } },
  {
    id: "institutes",
    title: { en: "Education & cultural institutes", hi: "शिक्षा व सांस्कृतिक संस्थान" },
  },
  { id: "firsts", title: { en: "Largest, first, only", hi: "सबसे बड़ा, प्रथम, एकमात्र" } },
  { id: "nicknames", title: { en: "Nicknames", hi: "उपनाम तालिका" } },
];

const s = (v: unknown, max = 2000) =>
  typeof v === "string"
    ? v
        .replace(/[ \t]+/g, " ")
        .trim()
        .slice(0, max)
    : "";
export const biOf = (v: unknown, max = 2000): Bi => {
  if (typeof v === "string") return { en: "", hi: s(v, max) };
  const o = (v ?? {}) as Record<string, unknown>;
  return { en: s(o.en, max), hi: s(o.hi, max) };
};
const arr = (v: unknown) => (Array.isArray(v) ? v : []);
const filled = (b: Bi) => !!(b.en || b.hi);

function blockOf(v: unknown): OverviewBlock | null {
  const o = (v ?? {}) as Record<string, unknown>;
  const title = biOf(o.title, 200);
  switch (o.type) {
    case "chips": {
      const items = arr(o.items)
        .map((x) => biOf(x, 200))
        .filter(filled)
        .slice(0, 40);
      const hot = arr(o.hot)
        .map(Number)
        .filter((n) => Number.isInteger(n) && n >= 0 && n < items.length);
      return items.length ? { type: "chips", title, items, ...(hot.length ? { hot } : {}) } : null;
    }
    case "big": {
      const value = biOf(o.value, 120);
      return filled(value) || filled(biOf(o.text))
        ? { type: "big", title, value, text: biOf(o.text, 1200) }
        : null;
    }
    case "text": {
      const text = biOf(o.text, 3000);
      return filled(text) ? { type: "text", title, text } : null;
    }
    case "list": {
      const items = arr(o.items)
        .map((x) => biOf(x, 600))
        .filter(filled)
        .slice(0, 60);
      return items.length ? { type: "list", title, items } : null;
    }
    case "table": {
      const cols = arr(o.cols)
        .map((x) => biOf(x, 120))
        .slice(0, 8);
      const rows = arr(o.rows)
        .map((r) =>
          arr(r)
            .map((x) => biOf(x, 600))
            .slice(0, Math.max(cols.length, 1)),
        )
        .filter((r) => r.some(filled))
        .slice(0, 80);
      return rows.length ? { type: "table", title, cols, rows } : null;
    }
    case "callout": {
      const text = biOf(o.text, 1200);
      const kind = o.kind === "remember" || o.kind === "note" ? o.kind : "trick";
      return filled(text) ? { type: "callout", kind, text } : null;
    }
    case "timeline": {
      const eras = arr(o.eras)
        .map((e) => {
          const r = (e ?? {}) as Record<string, unknown>;
          const items = arr(r.items)
            .map((x) => {
              const i = (x ?? {}) as Record<string, unknown>;
              return { when: s(i.when, 40), text: biOf(i.text, 600) };
            })
            .filter((i) => i.when || filled(i.text))
            .slice(0, 80);
          return { title: biOf(r.title, 120), items };
        })
        .filter((e) => e.items.length)
        .slice(0, 8);
      return eras.length ? { type: "timeline", title, eras } : null;
    }
    case "borders": {
      const items = arr(o.items)
        .map((x) => {
          const i = (x ?? {}) as Record<string, unknown>;
          return { name: biOf(i.name, 80), dir: biOf(i.dir, 40) };
        })
        .filter((i) => filled(i.name))
        .slice(0, 12);
      return items.length ? { type: "borders", title, intl: biOf(o.intl, 80), items } : null;
    }
  }
  return null;
}

// An overview as the AI wrote it or the editor saved it, cleaned.
export function normalizeOverview(v: unknown): DistrictOverview {
  const o = (v ?? {}) as Record<string, unknown>;
  const sections = arr(o.sections)
    .map((x, i): OverviewSection => {
      const r = (x ?? {}) as Record<string, unknown>;
      const id =
        s(r.id, 40)
          .replace(/[^a-z0-9-]/gi, "")
          .toLowerCase() || `s${i + 1}`;
      return {
        id,
        title: biOf(r.title, 120),
        lede: biOf(r.lede, 400),
        blocks: arr(r.blocks)
          .map(blockOf)
          .filter((b): b is OverviewBlock => !!b)
          .slice(0, 40),
      };
    })
    .filter((x) => filled(x.title) || x.blocks.length)
    .slice(0, 24);
  return {
    name: biOf(o.name, 80),
    tagline: biOf(o.tagline, 200),
    badges: arr(o.badges)
      .map((x) => biOf(x, 60))
      .filter(filled)
      .slice(0, 8),
    sections,
    revision: arr(o.revision)
      .map((x) => {
        const r = (x ?? {}) as Record<string, unknown>;
        return { q: biOf(r.q, 300), a: biOf(r.a, 400) };
      })
      .filter((r) => filled(r.q) && filled(r.a))
      .slice(0, 60),
    notes: arr(o.notes)
      .map((x) => biOf(x, 800))
      .filter(filled)
      .slice(0, 20),
    source: s(o.source, 300),
  };
}

// All the text of an overview, one language (for search, the knowledge base
// and the fact check).
export function overviewText(ov: DistrictOverview, lang: AtlasLang): string {
  const p = (b: Bi) => pickBi(b, lang);
  const out: string[] = [`# ${p(ov.name)}`, p(ov.tagline), ov.badges.map(p).join(" · ")];
  for (const sec of ov.sections) {
    out.push(`\n## ${p(sec.title)}`, p(sec.lede));
    for (const b of sec.blocks) {
      if (b.type === "callout") out.push(p(b.text));
      else out.push(`### ${p(b.title)}`);
      if (b.type === "chips" || b.type === "list")
        out.push(b.items.map((i) => `- ${p(i)}`).join("\n"));
      if (b.type === "big") out.push(`${p(b.value)} — ${p(b.text)}`);
      if (b.type === "text") out.push(p(b.text));
      if (b.type === "table")
        out.push(
          [b.cols.map(p).join(" | "), ...b.rows.map((r) => r.map(p).join(" | "))].join("\n"),
        );
      if (b.type === "timeline")
        for (const e of b.eras)
          out.push(`${p(e.title)}:\n` + e.items.map((i) => `- ${i.when}: ${p(i.text)}`).join("\n"));
      if (b.type === "borders")
        out.push(
          [p(b.intl), ...b.items.map((i) => `${p(i.name)} (${p(i.dir)})`)]
            .filter(Boolean)
            .join(", "),
        );
    }
  }
  if (ov.revision.length)
    out.push("\n## Revision", ...ov.revision.map((r) => `- ${p(r.q)} → ${p(r.a)}`));
  return out.filter(Boolean).join("\n");
}

// Text with **bold** marked up (escaped).
export function boldHtml(t: string): string {
  return t
    .replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!)
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
}

// Point in a district: ray casting over its rings.
export function inRings(rings: LonLat[][], lon: number, lat: number): boolean {
  let hit = false;
  for (const ring of rings)
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) hit = !hit;
    }
  return hit;
}

// ---------- Time: eras and months ----------

export const ERAS: { key: string; name: Bi; from: number; to: number }[] = [
  { key: "ancient", name: { en: "Ancient", hi: "प्राचीन" }, from: -3000, to: 600 },
  { key: "early", name: { en: "Early medieval", hi: "पूर्व मध्यकाल" }, from: 600, to: 1200 },
  { key: "medieval", name: { en: "Medieval", hi: "मध्यकाल" }, from: 1200, to: 1707 },
  {
    key: "colonial",
    name: { en: "Late Mughal & British", hi: "उत्तर मुगल व ब्रिटिश काल" },
    from: 1707,
    to: 1947,
  },
  {
    key: "modern",
    name: { en: "Since independence", hi: "स्वतंत्रता के बाद" },
    from: 1947,
    to: 2100,
  },
];
export const MONTHS: Bi[] = [
  { en: "Jan", hi: "जन" },
  { en: "Feb", hi: "फ़र" },
  { en: "Mar", hi: "मार्च" },
  { en: "Apr", hi: "अप्रै" },
  { en: "May", hi: "मई" },
  { en: "Jun", hi: "जून" },
  { en: "Jul", hi: "जुल" },
  { en: "Aug", hi: "अग" },
  { en: "Sep", hi: "सित" },
  { en: "Oct", hi: "अक्टू" },
  { en: "Nov", hi: "नव" },
  { en: "Dec", hi: "दिस" },
];
// "1576", "1303–1568", "c. 300 BCE".
export function eraLabel(from?: number | null, to?: number | null, lang: AtlasLang = "en"): string {
  const y = (n: number) =>
    n < 0 ? `${-n} ${lang === "hi" ? "ई.पू." : "BCE"}` : `${n}${lang === "hi" ? " ई." : ""}`;
  if (from == null && to == null) return "";
  if (from == null || to == null || from === to) return y((from ?? to)!);
  return `${y(from)}–${y(to)}`;
}
export const monthsLabel = (months: number[] | undefined, lang: AtlasLang) =>
  (months ?? []).map((m) => pickBi(MONTHS[m - 1], lang)).join(", ");
// Whether a place's time falls in [from, to] (a place without one: no).
export const inEra = (
  p: { era_from?: number | null; era_to?: number | null },
  from: number,
  to: number,
) =>
  p.era_from != null || p.era_to != null
    ? (p.era_from ?? p.era_to!) <= to && (p.era_to ?? p.era_from!) >= from
    : false;

// ---------- Theme pages ----------

export type AtlasTheme = {
  key: string;
  name: Bi;
  blurb: Bi;
  cats: string[];
  // How its list is ordered: in time, by month, or by district.
  order: "time" | "month" | "district";
};
export const ATLAS_THEMES: AtlasTheme[] = [
  {
    key: "forts",
    name: { en: "Forts & palaces", hi: "दुर्ग एवं महल" },
    blurb: {
      en: "Rajasthan's forts and palaces, district by district.",
      hi: "राजस्थान के दुर्ग एवं महल, जिलेवार।",
    },
    cats: ["fort"],
    order: "district",
  },
  {
    key: "battles",
    name: { en: "Battles & events", hi: "युद्ध एवं घटनाएँ" },
    blurb: {
      en: "Battles and turning points, in order of time.",
      hi: "युद्ध एवं ऐतिहासिक मोड़, समय के क्रम में।",
    },
    cats: ["battle"],
    order: "time",
  },
  {
    key: "dynasties",
    name: { en: "Dynasties & kingdoms", hi: "राजवंश एवं रियासतें" },
    blurb: {
      en: "The seats of Rajasthan's dynasties and kingdoms.",
      hi: "राजस्थान के राजवंशों एवं रियासतों की राजधानियाँ।",
    },
    cats: ["dynasty", "region"],
    order: "time",
  },
  {
    key: "faith",
    name: { en: "Saints, folk deities & shrines", hi: "संत, लोक देवता एवं तीर्थ" },
    blurb: {
      en: "Saints and sects, folk deities, temples and dargahs.",
      hi: "संत एवं सम्प्रदाय, लोक देवता, मंदिर एवं दरगाह।",
    },
    cats: ["saint", "folkdeity", "temple"],
    order: "district",
  },
  {
    key: "fairs",
    name: { en: "Fairs & festivals by month", hi: "मेले एवं उत्सव, माहवार" },
    blurb: {
      en: "Fairs, festivals and cattle fairs through the year.",
      hi: "वर्ष भर के मेले, उत्सव एवं पशु मेले।",
    },
    cats: ["fair", "cattlefair"],
    order: "month",
  },
  {
    key: "arts",
    name: {
      en: "Folk dances, music, painting & crafts",
      hi: "लोक नृत्य, संगीत, चित्रकला एवं शिल्प",
    },
    blurb: {
      en: "Where each dance, painting school and craft comes from.",
      hi: "हर नृत्य, चित्र शैली एवं शिल्प कहाँ का है।",
    },
    cats: ["dance", "music", "painting", "craft"],
    order: "district",
  },
  {
    key: "heritage",
    name: { en: "Heritage & archaeology", hi: "विरासत एवं पुरातत्व" },
    blurb: {
      en: "Heritage sites and the ancient civilisation sites.",
      hi: "विरासत स्थल एवं प्राचीन सभ्यता स्थल।",
    },
    cats: ["heritage", "archaeo"],
    order: "time",
  },
  {
    key: "wildlife",
    name: { en: "Wildlife & wetlands", hi: "वन्यजीव एवं आर्द्रभूमि" },
    blurb: {
      en: "Tiger reserves, sanctuaries, conservation reserves and Ramsar sites.",
      hi: "बाघ परियोजनाएँ, अभयारण्य, संरक्षण क्षेत्र एवं रामसर स्थल।",
    },
    cats: ["tiger", "sanct", "cr", "ramsar"],
    order: "district",
  },
  {
    key: "water",
    name: { en: "Lakes, dams & canals", hi: "झीलें, बाँध एवं नहरें" },
    blurb: { en: "Lakes, dams, projects and canals.", hi: "झीलें, बाँध, परियोजनाएँ एवं नहरें।" },
    cats: ["lake", "saltlake", "dam", "canal", "rlink"],
    order: "district",
  },
  {
    key: "minerals",
    name: { en: "Minerals & energy", hi: "खनिज एवं ऊर्जा" },
    blurb: { en: "Mines, power plants and parks.", hi: "खानें, बिजलीघर एवं पार्क।" },
    cats: ["metal", "nonmetal", "stone", "fuel", "thermal", "solar", "wind", "hydro", "nuclear"],
    order: "district",
  },
  {
    key: "seats",
    name: { en: "Constituencies", hi: "निर्वाचन क्षेत्र" },
    blurb: {
      en: "Lok Sabha and Assembly constituencies.",
      hi: "लोकसभा एवं विधानसभा निर्वाचन क्षेत्र।",
    },
    cats: ["seat"],
    order: "district",
  },
];
export const atlasTheme = (key: string) => ATLAS_THEMES.find((t) => t.key === key) ?? null;

// ---------- Crowded dots ----------

// Dots closer than `dist` (map units) drawn as one group: the heaviest dot
// (most facts) starts a group, the others near it join (greedy, stable).
export function clusterDots<T extends { key: string; x: number; y: number; w: number }>(
  dots: T[],
  dist: number,
): { x: number; y: number; members: T[] }[] {
  const order = [...dots].sort((a, b) => b.w - a.w || a.key.localeCompare(b.key));
  const groups: { x: number; y: number; members: T[] }[] = [];
  for (const d of order) {
    const g = groups.find((c) => Math.hypot(c.x - d.x, c.y - d.y) < dist);
    if (g) g.members.push(d);
    else groups.push({ x: d.x, y: d.y, members: [d] });
  }
  return groups;
}

// A shared atlas page's link preview (the picture made by
// /api/atlas/preview).
export function atlasShareMeta(o: {
  title: string;
  description: string;
  image: string;
  url: string;
}) {
  return [
    { property: "og:title", content: o.title },
    { property: "og:description", content: o.description },
    { property: "og:image", content: o.image },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { property: "og:url", content: o.url },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: o.title },
    { name: "twitter:description", content: o.description },
    { name: "twitter:image", content: o.image },
  ];
}

// A place page's path (its key's ":" kept readable).
export const placePath = (key: string) =>
  `/atlas/place/${encodeURIComponent(key).replace(/%3A/gi, ":")}`;

// ---------- Names in a text (SAATHI answers, news stories) ----------

// A name as matched: its words, without brackets ("Kumbhalgarh fort
// (UNESCO)" → "kumbhalgarh fort").
export const mentionKey = (name: string) =>
  name
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

// The entries a text names (each counted once, most-named first). English
// names match whole words of 5 letters or more (so "Pali" in "Palighat"
// or short words don't); Hindi names whole words of 3 letters or more.
export function findMentions<T extends { names: string[] }>(
  text: string,
  entries: T[],
  minLetters = 5,
): T[] {
  const hay = ` ${mentionKey(text)} `;
  const count = (k: string) => hay.split(` ${k} `).length - 1;
  const found: { e: T; keys: string[]; n: number }[] = [];
  for (const e of entries) {
    const keys = e.names
      .map(mentionKey)
      .filter((k) =>
        k
          ? /[\u0900-\u097F]/.test(k)
            ? k.length >= 3
            : k.replace(/\s/g, "").length >= minLetters
          : false,
      );
    const n = keys.reduce((s, k) => s + count(k), 0);
    if (n) found.push({ e, keys, n });
  }
  // A name found only inside a longer one found ("Pushkar" in "Pushkar
  // fair") is that one, not itself.
  const all = found.flatMap((f) => f.keys.filter((k) => count(k)).map((k) => ({ k, f })));
  const out = found
    .map((f) => {
      let n = f.n;
      for (const k of f.keys)
        for (const o of all)
          if (o.f !== f && o.k !== k && ` ${o.k} `.includes(` ${k} `)) n -= count(o.k);
      return { e: f.e, n };
    })
    .filter((x) => x.n > 0);
  return out.sort((a, b) => b.n - a.n).map((x) => x.e);
}

// ---------- Sources ----------

// The notes' source codes ("[PW]" in a fact, "… CC PW UPD" after a
// heading); the editor names them (Quality tab).
export const SOURCE_CODES = ["PW", "CC", "RGN", "UPD", "SBA", "RajRAS", "DFC"];
export type SourceNames = Record<string, { name: Bi; url?: string }>;
const codeRe = (codes: string[]) =>
  codes
    .slice()
    .sort((a, b) => b.length - a.length)
    .map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");

// A fact's text without its source tags, and the codes it cites
// ("[PW]", "[PW cites]", "[SBA list]").
export function splitSources(text: string, codes: string[] = SOURCE_CODES) {
  const sources: string[] = [];
  const re = new RegExp(`\\s*\\[(${codeRe(codes)})(?:\\s[^\\]]{0,20})?\\]`, "g");
  const clean = text.replace(re, (_, c: string) => {
    if (!sources.includes(c)) sources.push(c);
    return "";
  });
  return { text: clean.replace(/\s+([.,;:])/g, "$1").trim(), sources };
}

// A heading without the source codes after it ("… — new facts CC PW UPD").
export function headingSources(heading: string, codes: string[] = SOURCE_CODES) {
  const m = new RegExp(`((?:\\s+(?:${codeRe(codes)}))+)\\s*$`).exec(heading);
  if (!m) return { heading, sources: [] as string[] };
  return {
    heading: heading.slice(0, m.index).trim(),
    sources: [...new Set(m[1].trim().split(/\s+/))],
  };
}
