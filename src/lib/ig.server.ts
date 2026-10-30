// Infographics, "Words in the News" (server). After the evening collection
// the AI suggests words from the day's papers (English words from English
// papers, Hindi from Hindi); the editor picks some (the rest stay as a
// reserve); the AI writes their cards and they are proofread (by the AI and
// the dictionaries); the editor reviews and approves them; the cards are
// photographed by the browser rendering service and posted to the channel
// as one album at the set time. Each step is a short unit of work, run by
// the minute tick or by the editor's page, whichever comes first.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { saathiComplete, saathiErrorDetail } from "../../supabase/functions/_shared/saathi-core.ts";
import { formatDate, istDate } from "@/lib/current-affairs";
import * as CA from "@/lib/current-affairs.server";
import * as FS from "@/lib/flash-studio.server";
import { looseWord } from "@/lib/flash-spell";
import type { WnSense } from "@/lib/flash-wordnet";
import {
  igCardHtml,
  igDate,
  type IgCard,
  type IgDesign,
  type IgForm,
  type IgLang,
} from "@/lib/ig-cards";
import { roundupHtml, type IgRoundupWord } from "@/lib/ig-roundup";
import { parseStyleRules, type StyleSuggestion } from "@/lib/ca-style";
import {
  applyFix,
  cardFrom,
  cardTexts,
  channelChatId,
  channelLabel,
  CAPTION_MAX,
  captionHtml,
  captionText,
  designMessages,
  findSentence,
  igSettingsOf,
  igWordKey,
  isHindiText,
  nextDesign,
  parseCards,
  parseDesign,
  parseIssues,
  parsePart,
  parseSuggestions,
  partMessages,
  proofMessages,
  sentencesWith,
  suggestMessages,
  writeMessages,
  type CardField,
  fillWeeklyCaption,
  pickRuleMessages,
  weekOf,
  weeklyDue,
  PICK_MIN_DAYS,
  type IgArticle,
  type IgTaste,
  type PickExample,
  type IgPart,
  type IgCheck,
  type IgSettings,
  igLangsOn,
  formCandidates,
  igPostDefault,
} from "@/lib/ig-words";

const from = (table: string) => supabaseAdmin.from(table as never);
const fail = (e: { message: string } | null) => {
  if (e) throw new Error(e.message);
};
const now = () => new Date().toISOString();
type Row = Record<string, unknown>;
const BUCKET = "ca-magazines";
const SETTINGS_KEY = "ig_settings";
// Before the infographics migration.
const missing = (e: { message: string } | null) =>
  !!e && /ig_days|ig_words|schema cache|does not exist/i.test(e.message);
export const IG_NOT_READY =
  "Infographics need a database update: run the latest migration (ca_infographics) in Lovable or the SQL editor.";

function apiKey(): string {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY is not configured");
  return key;
}

// ---------- Types ----------

export type IgStatus =
  | "suggesting"
  | "picking"
  | "writing"
  | "review"
  | "rendering"
  | "scheduled"
  | "posting"
  | "posted"
  | "failed"
  | "cancelled";

export type IgDay = {
  day: string;
  status: IgStatus;
  suggested: string[];
  design: IgDesign | null;
  design_reason: string;
  caption: string;
  scheduled_for: string | null;
  posted_at: string | null;
  telegram_message_id: number | null;
  error: string | null;
  notified: string[];
  updated_at: string;
};

export type IgWordStatus = "suggested" | "picked" | "reserve" | "dropped" | "posted" | "released";

export type IgWord = {
  id: string;
  day: string;
  for_day: string | null;
  lang: IgLang;
  word: string;
  base: string;
  key: string;
  pos_hint: string;
  sentence: string;
  paper: string;
  why: string;
  own: boolean;
  status: IgWordStatus;
  position: number;
  card: IgCard | null;
  checks: IgCheck[];
  proofed: boolean;
  checked: boolean;
  image_path: string | null;
  image_url: string | null;
  posted_on: string | null;
};

const DAY_COLS =
  "day,status,suggested,design,design_reason,caption,scheduled_for,posted_at,telegram_message_id,error,notified,updated_at";
const WORD_COLS =
  "id,day,for_day,lang,word,base,key,pos_hint,sentence,paper,why,own,status,position,card,checks,proofed,checked,image_path,posted_on";

const publicUrl = (path: string | null) =>
  path ? supabaseAdmin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl : null;
const toWord = (r: Row): IgWord => ({
  ...(r as unknown as IgWord),
  checks: (Array.isArray(r.checks) ? r.checks : []) as IgCheck[],
  card: (r.card ?? null) as IgCard | null,
  image_url: publicUrl((r.image_path as string | null) ?? null),
});

// ---------- Settings ----------

export async function getIgSettings(): Promise<IgSettings> {
  const { data } = await from("bot_settings").select("value").eq("key", SETTINGS_KEY).maybeSingle();
  return igSettingsOf((data as Row | null)?.value);
}

export async function saveIgSettings(patch: Partial<IgSettings>): Promise<IgSettings> {
  const value = igSettingsOf({ ...(await getIgSettings()), ...patch });
  fail(
    (
      await from("bot_settings").upsert({ key: SETTINGS_KEY, value, updated_at: now() } as never, {
        onConflict: "key",
      })
    ).error,
  );
  return value;
}

// ---------- Reading ----------

async function readDay(day: string): Promise<IgDay | null> {
  const { data, error } = await from("ig_days").select(DAY_COLS).eq("day", day).maybeSingle();
  if (missing(error)) throw new Error(IG_NOT_READY);
  fail(error);
  return (data ?? null) as IgDay | null;
}

async function patchDay(day: string, patch: Partial<IgDay> & { locked_until?: string | null }) {
  fail(
    (
      await from("ig_days")
        .update({ ...patch, updated_at: now() } as never)
        .eq("day", day)
    ).error,
  );
}

async function patchWord(id: string, patch: Partial<IgWord>) {
  const { image_url: _u, ...rest } = patch;
  fail(
    (
      await from("ig_words")
        .update({ ...rest, updated_at: now() } as never)
        .eq("id", id)
    ).error,
  );
}

// The day's cards, in order.
async function cardsOf(day: string): Promise<IgWord[]> {
  const { data, error } = await from("ig_words")
    .select(WORD_COLS)
    .eq("for_day", day)
    .in("status", ["picked", "posted"])
    .order("lang", { ascending: true })
    .order("position", { ascending: true });
  fail(error);
  return ((data ?? []) as Row[]).map(toWord);
}

export type IgDayView = {
  day: IgDay | null;
  cards: IgWord[];
  suggestions: IgWord[];
  reserve: IgWord[];
  settings: IgSettings;
  yesterdayDesign: string | null;
};

export async function getIgDay(day: string): Promise<IgDayView> {
  const settings = await getIgSettings();
  const row = await readDay(day);
  const since = new Date(new Date(`${day}T00:00:00Z`).getTime() - 30 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const [cards, sug, res, prev] = await Promise.all([
    cardsOf(day),
    from("ig_words")
      .select(WORD_COLS)
      .eq("day", day)
      .in("status", ["suggested", "reserve"])
      .order("created_at", { ascending: true }),
    from("ig_words")
      .select(WORD_COLS)
      .neq("day", day)
      .gte("day", since)
      .lte("day", day)
      .in("status", ["suggested", "reserve"])
      .order("day", { ascending: false })
      .limit(200),
    from("ig_days").select("design").lt("day", day).order("day", { ascending: false }).limit(1),
  ]);
  fail(sug.error);
  fail(res.error);
  // A reserve word posted since (in another form) is no longer offered.
  const posted = await postedKeys();
  return {
    day: row,
    cards,
    suggestions: ((sug.data ?? []) as Row[]).map(toWord),
    reserve: ((res.data ?? []) as Row[])
      .map(toWord)
      .filter((w) => !posted.has(`${w.lang}:${w.key}`)),
    settings,
    yesterdayDesign: (((prev.data ?? []) as Row[])[0]?.design as string | undefined) ?? null,
  };
}

export async function listIgDays(limit = 30): Promise<IgDay[]> {
  const { data, error } = await from("ig_days")
    .select(DAY_COLS)
    .order("day", { ascending: false })
    .limit(limit);
  if (missing(error)) throw new Error(IG_NOT_READY);
  fail(error);
  return (data ?? []) as IgDay[];
}

// Every word posted (its key, by language): these never come back.
async function postedKeys(): Promise<Set<string>> {
  const out = new Set<string>();
  for (let page = 0; ; page++) {
    const { data, error } = await from("ig_words")
      .select("lang,key")
      .eq("status", "posted")
      .range(page * 1000, page * 1000 + 999);
    fail(error);
    for (const r of (data ?? []) as Row[]) out.add(`${r.lang}:${r.key}`);
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

export type IgHistoryRow = {
  id: string;
  word: string;
  lang: IgLang;
  posted_on: string | null;
  status: string;
};

export async function igHistory(search: string): Promise<IgHistoryRow[]> {
  let q = from("ig_words")
    .select("id,word,lang,posted_on,status")
    .in("status", ["posted", "released"])
    .order("posted_on", { ascending: false })
    .limit(500);
  if (search.trim()) q = q.ilike("word", `%${search.trim().replace(/[%_]/g, "")}%`);
  const { data, error } = await q;
  if (missing(error)) throw new Error(IG_NOT_READY);
  fail(error);
  return (data ?? []) as IgHistoryRow[];
}

// A posted word allowed again (or blocked again).
export async function releaseIgWord(id: string, release: boolean) {
  await patchWord(id, { status: release ? "released" : "posted" });
}

// ---------- The day's articles ----------

const LANG_OF_SITE: Record<string, IgLang | null> = { Hindi: "hi", English: "en", Bilingual: null };

export async function dayArticles(
  day: string,
): Promise<Record<IgLang, (IgArticle & { id: string })[]>> {
  const { data, error } = await from("ca_sources")
    .select("id,source_name,title,content,section")
    .eq("issue_date", day)
    .neq("status", "error");
  fail(error);
  const sources = ((data ?? []) as Row[]).filter((r) => String(r.content ?? "").length > 200);
  const ids = sources.map((s) => String(s.id));
  // The site each article came from says its language.
  const siteOf = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data: arts } = await from("ca_articles")
      .select("source_id,site_id")
      .in("source_id", ids.slice(i, i + 200));
    for (const a of (arts ?? []) as Row[]) siteOf.set(String(a.source_id), String(a.site_id));
  }
  const siteIds = [...new Set(siteOf.values())];
  const langOf = new Map<string, string>();
  if (siteIds.length) {
    const { data: sites } = await from("ca_watch_sites").select("id,language").in("id", siteIds);
    for (const s of (sites ?? []) as Row[]) langOf.set(String(s.id), String(s.language ?? ""));
  }
  const order = ["editorial", "news", "other", "pib", "dipr"];
  const out: Record<IgLang, (IgArticle & { id: string })[]> = { en: [], hi: [] };
  for (const s of sources.sort(
    (a, b) => order.indexOf(String(a.section)) - order.indexOf(String(b.section)),
  )) {
    const content = String(s.content ?? "");
    const site = siteOf.get(String(s.id));
    const lang =
      (site ? LANG_OF_SITE[langOf.get(site) ?? ""] : null) ??
      (isHindiText(content.slice(0, 3000)) ? "hi" : "en");
    out[lang].push({
      id: String(s.id),
      index: 0,
      paper: String(s.source_name ?? ""),
      title: String(s.title ?? ""),
      text: content,
    });
  }
  return out;
}

// What the AI is shown: the first articles, each cut short.
const PROMPT_ARTICLES = 25;
const PROMPT_CHARS = 3500;

// Words the AI must not suggest: posted ones, and those suggested in the
// last 30 days (the reserve).
async function avoidWords(
  lang: IgLang,
  day: string,
): Promise<{ words: string[]; keys: Set<string> }> {
  const since = new Date(new Date(`${day}T00:00:00Z`).getTime() - 30 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const [posted, recent] = await Promise.all([
    from("ig_words")
      .select("word,key")
      .eq("lang", lang)
      .eq("status", "posted")
      .order("posted_on", { ascending: false })
      .limit(2000),
    from("ig_words")
      .select("word,key")
      .eq("lang", lang)
      .gte("day", since)
      .in("status", ["suggested", "reserve", "picked"]),
  ]);
  fail(posted.error);
  fail(recent.error);
  const rows = [...((posted.data ?? []) as Row[]), ...((recent.data ?? []) as Row[])];
  return {
    words: [...new Set(rows.map((r) => String(r.word)))].slice(0, 600),
    keys: new Set(rows.map((r) => String(r.key))),
  };
}

async function suggestLang(day: string, lang: IgLang, settings: IgSettings) {
  const articles = (await dayArticles(day))[lang]
    .slice(0, PROMPT_ARTICLES)
    .map((a, i) => ({ ...a, index: i + 1 }));
  if (!articles.length) return 0;
  const count = lang === "en" ? settings.suggest_en : settings.suggest_hi;
  const avoid = await avoidWords(lang, day);
  const shown = articles.map((a) => ({
    ...a,
    text: a.text
      .replace(/^#.*$/gm, "")
      .replace(/^Source: .*$/gm, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, PROMPT_CHARS),
  }));
  const taste =
    settings.learn_from_picks || settings.pick_rules[lang].length
      ? await tasteOf(lang, settings)
      : undefined;
  const raw = await saathiComplete(
    apiKey(),
    suggestMessages(lang, shown, count + 3, avoid.words, taste),
  );
  const list = parseSuggestions(raw);
  if (!list) throw new Error("The AI's word suggestions could not be read.");
  const keys = new Set(avoid.keys);
  const rows: Row[] = [];
  for (const s of list) {
    const art = articles.find((a) => a.index === s.article);
    if (!art) continue;
    const key = igWordKey(s.base || s.word, lang);
    const key2 = igWordKey(s.word, lang);
    if (!key || keys.has(key) || keys.has(key2)) continue;
    // The word must be in its article; its sentence as the paper wrote it.
    const sentence = findSentence(art.text, s.word, s.sentence);
    if (!sentence) continue;
    keys.add(key);
    keys.add(key2);
    rows.push({
      day,
      lang,
      word: s.word,
      base: s.base,
      key,
      pos_hint: s.pos,
      sentence,
      paper: art.paper,
      source_id: art.id,
      why: s.why,
    });
    if (rows.length >= count) break;
  }
  if (rows.length) fail((await from("ig_words").insert(rows as never)).error);
  return rows.length;
}

// ---------- Writing and proofreading ----------

async function writeLang(day: string, lang: IgLang): Promise<boolean> {
  const todo = (await cardsOf(day)).filter(
    (w) => w.lang === lang && w.status === "picked" && !w.card,
  );
  if (!todo.length) return false;
  const glossary = lang === "hi" ? ((await CA.getMagazineSettings()).glossary ?? []) : [];
  const raw = await saathiComplete(
    apiKey(),
    writeMessages(
      lang,
      todo.map((w, i) => ({
        n: i + 1,
        word: w.base || w.word,
        sentence: w.sentence,
        paper: w.paper,
      })),
      glossary,
    ),
  );
  const cards = parseCards(raw);
  if (!cards) throw new Error("The AI's cards could not be read.");
  for (const [i, w] of todo.entries()) {
    const c = cards.find((x) => x.n === i + 1);
    if (!c) continue;
    await patchWord(w.id, {
      card: cardFrom(lang, c, w.base || w.word, w.sentence, w.paper),
      proofed: false,
      checked: false,
      checks: [],
    });
  }
  return true;
}

const checkId = () => Math.random().toString(36).slice(2, 10);

// Which field of the card holds a word (for a dictionary note).
function fieldWith(card: IgCard, word: string): CardField {
  const has = (s: string) => s.includes(word);
  if (has(card.word)) return "word";
  if (has(card.main)) return "main";
  if (has(card.sub)) return "sub";
  if (has(card.newsHi)) return "newsHi";
  if (card.synonyms.some(has)) return "synonyms";
  if (card.antonyms.some(has)) return "antonyms";
  if ((card.forms ?? []).some((f) => has(f.word))) return "forms";
  if ((card.phrases ?? []).some(has)) return "phrases";
  return "extras";
}

const POS_EN = ["noun", "verb", "adjective", "adverb"];

// The dictionaries' notes on a card: spellings the British list or Hindi
// WordNet has differently, synonyms and antonyms WordNet doesn't give for
// the word, and a part of speech WordNet doesn't know it as.
async function dictionaryChecks(card: IgCard, base: string): Promise<IgCheck[]> {
  const out: IgCheck[] = [];
  const note = (field: CardField, text: string, fix: string, why: string) =>
    out.push({ id: checkId(), source: "dictionary", field, text, fix, why, state: "open" });
  const hints = await FS.spellHintsFor(cardTexts(card)).catch(() => [] as string[]);
  for (const line of hints) {
    const m =
      /^(.+?): (?:WordNet writes|not in WordNet; it has|not in the British spelling list; it has) (.+)$/.exec(
        line,
      );
    if (!m) continue;
    const [w, near] = [m[1], m[2].split(" / ")[0].trim()];
    // Nukta and chandrabindu are house style, not spelling mistakes.
    if (/[ऀ-ॿ]/.test(w) && looseWord(w) === looseWord(near)) continue;
    // The quoted news line is the paper's own text.
    if (card.news.includes(w) && !cardTexts(card).some((t) => t.includes(w))) continue;
    note(fieldWith(card, w), w, near, line);
  }
  const look = (words: string[]) =>
    (card.lang === "en" ? FS.enWordnetSenses(words) : FS.wordnetSenses(words)).catch(
      () => ({}) as Record<string, WnSense[]>,
    );
  const forms = card.lang === "en" ? (card.forms ?? []).filter((f) => f.word.trim()) : [];
  const items = [...card.synonyms, ...card.antonyms, ...forms.map((f) => f.word)].filter(
    (x) => !x.includes(" "),
  );
  const found = await look([base, ...items]);
  // An English word form WordNet doesn't know, or knows only as another
  // part of speech.
  for (const f of forms) {
    if (f.word.includes(" ")) continue;
    const ps = [...new Set((found[f.word] ?? []).map((s) => s.pos))];
    const said = POS_EN.find((p) => f.pos.toLowerCase().startsWith(p));
    if (!ps.length)
      note("forms", f.word, "", `WordNet doesn't have "${f.word}": check that the form exists.`);
    else if (said && !ps.includes(said))
      note(
        "forms",
        f.word,
        `${f.word} (${ps[0]})`,
        `WordNet has "${f.word}" as ${ps.join(" / ")}, not as ${said}.`,
      );
  }
  const senses = found[base] ?? [];
  if (senses.length) {
    // The card's part of speech, else every one WordNet knows the word as.
    const said = POS_EN.find((p) => card.pos.toLowerCase().startsWith(p));
    const known = new Set(senses.map((s) => s.pos));
    if (card.lang === "en" && said && !known.has(said))
      note(
        "pos",
        card.pos,
        "",
        `WordNet has ${base} only as ${[...known].join(" / ")}, not as ${said}.`,
      );
    const want = card.lang === "en" && said && known.has(said) ? new Set([said]) : known;
    // A synonym or antonym WordNet knows only as another part of speech
    // ("Action", a noun, for an adjective) can't stand in for the word.
    const other = (x: string) => {
      const ps = (found[x] ?? []).map((s) => s.pos);
      return ps.length > 0 && !ps.some((p) => want.has(p)) ? [...new Set(ps)].join(" / ") : null;
    };
    for (const [field, list, what] of [
      ["synonyms", card.synonyms, "synonym"],
      ["antonyms", card.antonyms, "antonym"],
    ] as const)
      for (const x of list) {
        const ps = other(x);
        if (ps)
          note(
            field,
            x,
            "",
            `WordNet has "${x}" only as ${ps}, but ${base} is used as ${[...want].join(" / ")}: not a fitting ${what}.`,
          );
      }
    // An "antonym" WordNet gives as a synonym of the word, or a "synonym"
    // it gives as an antonym.
    const fit = senses.filter((s) => want.has(s.pos));
    const low = (xs: string[]) => new Set(xs.map((x) => x.toLowerCase()));
    const wnSyn = low(fit.flatMap((s) => s.synonyms));
    const wnAnt = low(fit.flatMap((s) => s.antonyms));
    for (const x of card.antonyms)
      if (wnSyn.has(x.toLowerCase()) && !wnAnt.has(x.toLowerCase()))
        note("antonyms", x, "", `WordNet gives "${x}" as a synonym of ${base}, not an antonym.`);
    for (const x of card.synonyms)
      if (wnAnt.has(x.toLowerCase()) && !wnSyn.has(x.toLowerCase()))
        note("synonyms", x, "", `WordNet gives "${x}" as an antonym of ${base}, not a synonym.`);
  }
  return out;
}

async function proofLang(day: string, lang: IgLang): Promise<boolean> {
  const todo = (await cardsOf(day)).filter((w) => w.lang === lang && w.card && !w.proofed);
  if (!todo.length) return false;
  const cards = todo.map((w, i) => ({ ...(w.card as IgCard), n: i + 1 }));
  const raw = await saathiComplete(apiKey(), proofMessages(lang, cards));
  const issues = parseIssues(raw);
  if (!issues) throw new Error("The AI's proofreading could not be read.");
  for (const [i, w] of todo.entries()) {
    const card = w.card as IgCard;
    const ai: IgCheck[] = issues
      .filter((x) => x.n === i + 1 && (x.text !== x.fix || !x.fix))
      // The paper's own sentence is quoted as it stands.
      .filter((x) => x.field !== "news" || card.rewritten)
      .map((x) => ({ id: checkId(), source: "ai", ...x, state: "open" as const }));
    const dict = await dictionaryChecks(card, w.base || w.word);
    // Kept: notes the editor already decided on.
    const kept = w.checks.filter((c) => c.state !== "open");
    await patchWord(w.id, { checks: [...kept, ...ai, ...dict], proofed: true });
  }
  return true;
}

async function chooseDesign(day: string, settings: IgSettings) {
  const cards = await cardsOf(day);
  const { data } = await from("ig_days")
    .select("design")
    .lt("day", day)
    .order("day", { ascending: false })
    .limit(1);
  const yesterday = (((data ?? []) as Row[])[0]?.design as string | undefined) ?? null;
  const allowed = settings.designs.filter((d) => d !== yesterday);
  let choice: { design: IgDesign; reason: string } | null = null;
  try {
    choice = parseDesign(
      await saathiComplete(
        apiKey(),
        designMessages(
          cards.map((c) => c.card?.word || c.word),
          settings.designs,
          yesterday,
        ),
      ),
      allowed.length ? allowed : settings.designs,
    );
  } catch (e) {
    console.error("infographic design:", saathiErrorDetail(e));
  }
  const design = choice?.design ?? nextDesign(settings.designs, yesterday);
  await patchDay(day, {
    design,
    design_reason: choice?.reason ?? "Next in turn after yesterday's design.",
  });
}

// ---------- Making the images ----------

async function screenshot(html: string): Promise<Uint8Array> {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!account || !token)
    throw new Error(
      "Card images are not set up: add CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN to the project's secrets.",
    );
  const call = (path: string) =>
    fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/${path}/screenshot`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        html,
        viewport: { width: 1080, height: 1920, deviceScaleFactor: 1 },
        screenshotOptions: { type: "png" },
        gotoOptions: { waitUntil: "networkidle0", timeout: 45_000 },
        waitForSelector: { selector: "body[data-fit]", timeout: 20_000 },
      }),
    });
  let res = await call("browser-rendering");
  if (res.status === 404) res = await call("browser-run");
  for (let attempt = 0; res.status === 429 && attempt < 3; attempt++) {
    const wait = Math.min(
      20,
      Math.max(5, Number(res.headers.get("retry-after")) || 8 * (attempt + 1)),
    );
    await new Promise((r) => setTimeout(r, wait * 1000));
    res = await call("browser-rendering");
  }
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    throw new Error(`Couldn't make the card image (${res.status}): ${detail}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30) || "word";

// Up to `max` of the day's cards made into images; true when all are done.
async function renderSome(
  day: string,
  origin: string,
  settings: IgSettings,
  max = 3,
): Promise<boolean> {
  const row = await readDay(day);
  const cards = await cardsOf(day);
  const todo = cards.filter((c) => !c.image_path);
  for (const c of todo.slice(0, max)) {
    const n = cards.indexOf(c) + 1;
    const html = igCardHtml(c.card as IgCard, {
      design: (row?.design ?? "paper") as IgDesign,
      n,
      total: cards.length,
      date: day,
      channel: channelLabel(settings.channel),
      assetBase: origin,
      watermark: settings.watermark,
    });
    const png = await screenshot(html);
    const path = `infographics/${day}/${String(n).padStart(2, "0")}-${c.lang}-${slug(c.lang === "en" ? c.word : c.key)}-${Date.now()}.png`;
    fail(
      (
        await supabaseAdmin.storage
          .from(BUCKET)
          .upload(path, png, { contentType: "image/png", upsert: true })
      ).error,
    );
    await patchWord(c.id, { image_path: path });
  }
  return todo.length <= max;
}

// ---------- Posting ----------

async function postAlbum(day: string, settings: IgSettings) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set.");
  const chat = channelChatId(settings.channel);
  if (!chat) throw new Error("Add the channel link in Infographics settings.");
  const row = await readDay(day);
  const cards = await cardsOf(day);
  if (cards.some((c) => !c.image_path)) throw new Error("Some cards have no image yet.");
  const media = cards.slice(0, 10).map((c, i) => ({
    type: "photo",
    media: `${publicUrl(c.image_path)}?v=${Date.now()}`,
    ...(i === 0 && row?.caption ? telegramCaption(row.caption) : {}),
  }));
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMediaGroup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chat, media }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    description?: string;
    result?: { message_id: number }[];
  };
  if (!json.ok) throw new Error(`Telegram: ${json.description ?? res.status}`);
  const ids = cards.map((c) => c.id);
  fail(
    (
      await from("ig_words")
        .update({ status: "posted", posted_on: day, updated_at: now() } as never)
        .in("id", ids)
    ).error,
  );
  await patchDay(day, {
    status: "posted",
    posted_at: now(),
    telegram_message_id: json.result?.[0]?.message_id ?? null,
    error: null,
  });
}

// ---------- Telegram notes to the admin ----------

async function notify(day: string, kind: "suggested" | "review", origin: string | undefined) {
  const settings = await getIgSettings();
  const row = await readDay(day);
  if (!settings.notify || !row || row.notified.includes(kind)) return;
  const admin = (await CA.getMagazineSettings()).test_chat_id;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  await patchDay(day, { notified: [...row.notified, kind] });
  if (!admin || !token) return;
  const link = origin ? `${origin}/admin?section=ca.infographics&date=${day}` : "";
  let text = "";
  if (kind === "suggested") {
    const { data } = await from("ig_words").select("lang").eq("day", day).eq("status", "suggested");
    const rows = (data ?? []) as Row[];
    const en = rows.filter((r) => r.lang === "en").length;
    const hi = rows.filter((r) => r.lang === "hi").length;
    const langs = igLangsOn(settings);
    const got = langs.map((l) => `${l === "en" ? en : hi} ${l === "en" ? "English" : "Hindi"}`);
    const want = langs.map((l) =>
      langs.length > 1
        ? String(l === "en" ? settings.pick_en : settings.pick_hi)
        : `${l === "en" ? settings.pick_en : settings.pick_hi} ${l === "en" ? "English" : "Hindi"}`,
    );
    text = `📝 Words in the News, ${formatDate(day, "en")}: ${got.join(" and ")} words suggested. Pick ${want.join(" + ")} for tomorrow's cards.`;
  } else {
    const cards = await cardsOf(day);
    const open = cards.reduce((n, c) => n + c.checks.filter((x) => x.state === "open").length, 0);
    text = `🖼️ Words in the News, ${formatDate(day, "en")}: ${cards.length} cards are written and proofread${open ? ` (${open} notes to look at)` : ""}. Review and approve them: they post at ${settings.post_time} on the day you approve, or at the time you choose.`;
  }
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: admin,
      text,
      ...(link ? { reply_markup: { inline_keyboard: [[{ text: "Open", url: link }]] } } : {}),
    }),
  }).catch(() => undefined);
}

// ---------- Moving a day along ----------

// The day, locked for this worker for two minutes (null: someone else
// has it).
async function claim(day: string): Promise<IgDay | null> {
  const until = new Date(Date.now() + 120_000).toISOString();
  // Free (never locked), or its lock has run out: two plain filters, so
  // the check is part of the update itself.
  for (const free of [
    (q: ReturnType<typeof lockQuery>) => q.is("locked_until", null),
    (q: ReturnType<typeof lockQuery>) => q.lt("locked_until", now()),
  ]) {
    const { data, error } = await free(lockQuery(day, until)).select(DAY_COLS);
    fail(error);
    const row = ((data ?? []) as IgDay[])[0];
    if (row) return row;
  }
  return null;
}

const lockQuery = (day: string, until: string) =>
  from("ig_days")
    .update({ locked_until: until } as never)
    .eq("day", day);

const release = (day: string) => patchDay(day, { locked_until: null });

// One unit of work on a day; returns its status after.
export async function advanceDay(day: string, origin?: string): Promise<IgStatus | null> {
  const row = await claim(day);
  if (!row) return (await readDay(day))?.status ?? null;
  const settings = await getIgSettings();
  try {
    if (row.status === "suggesting") {
      const lang = (["en", "hi"] as IgLang[]).find((l) => !row.suggested.includes(l));
      if (lang) {
        // A language turned off (0 cards or 0 suggestions) is skipped.
        const on =
          igLangsOn(settings).includes(lang) &&
          (lang === "en" ? settings.suggest_en : settings.suggest_hi) > 0;
        if (on) await suggestLang(day, lang, settings);
        await patchDay(day, { suggested: [...row.suggested, lang], error: null });
      } else {
        await patchDay(day, { status: "picking", error: null });
        await notify(day, "suggested", origin);
      }
    } else if (row.status === "writing") {
      const did =
        (await writeLang(day, "en")) ||
        (await writeLang(day, "hi")) ||
        (await proofLang(day, "en")) ||
        (await proofLang(day, "hi"));
      if (!did) {
        if (!row.design) await chooseDesign(day, settings);
        await patchDay(day, { status: "review", error: null });
        await notify(day, "review", origin);
      } else await patchDay(day, { error: null });
    } else if (row.status === "rendering") {
      if (!origin) return row.status;
      if (await renderSome(day, origin, settings))
        await patchDay(day, { status: "scheduled", error: null });
    } else if (row.status === "scheduled") {
      if (row.scheduled_for && new Date(row.scheduled_for).getTime() <= Date.now()) {
        await patchDay(day, { status: "posting" });
        try {
          await postAlbum(day, settings);
        } catch (e) {
          await patchDay(day, {
            status: "failed",
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
    }
  } catch (e) {
    await patchDay(day, { error: saathiErrorDetail(e) });
    throw e;
  } finally {
    await release(day);
  }
  return (await readDay(day))?.status ?? null;
}

// The minute tick: start the day's suggestions once the evening collection
// is done, then move along every day that has work.
export async function igStep(origin?: string): Promise<void> {
  const { error: tableError } = await from("ig_days").select("day").limit(1);
  if (missing(tableError)) return;
  const settings = await getIgSettings();
  if (settings.auto_suggest) {
    const today = istDate();
    const { data: run } = await from("ca_runs")
      .select("issue_date,status,mode")
      .eq("issue_date", today)
      .maybeSingle();
    const r = run as Row | null;
    if (r && r.status === "done" && (r.mode ?? "daily") !== "past" && !(await readDay(today))) {
      await from("ig_days").insert({ day: today } as never);
    }
  }
  const { data, error } = await from("ig_days")
    .select("day,status,scheduled_for")
    .in("status", ["suggesting", "writing", "rendering", "scheduled"])
    .order("day", { ascending: true })
    .limit(5);
  fail(error);
  for (const d of (data ?? []) as Row[]) {
    if (d.status === "scheduled" && new Date(String(d.scheduled_for)).getTime() > Date.now())
      continue;
    try {
      await advanceDay(String(d.day), origin);
    } catch (e) {
      console.error("infographics:", saathiErrorDetail(e));
    }
  }
  // The weekly round-up, when it is due and not yet posted.
  const due = weeklyDue(settings);
  if (due && channelChatId(settings.channel)) {
    const mark = await weekMark(due);
    if (!mark || (mark.status === "failed" && (mark.tries ?? 1) < 3)) {
      try {
        await postIgWeek(due, origin, true);
      } catch (e) {
        console.error("infographics weekly:", saathiErrorDetail(e));
      }
    }
  }
}

// ---------- Round-ups ----------

// The words posted between two days (inclusive), in the order posted.
async function postedWords(fromDay: string, toDay: string): Promise<IgRoundupWord[]> {
  const { data, error } = await from("ig_words")
    .select("lang,card,posted_on,position")
    .in("status", ["posted", "released"])
    .gte("posted_on", fromDay)
    .lte("posted_on", toDay)
    .order("posted_on", { ascending: true })
    .order("lang", { ascending: true })
    .order("position", { ascending: true });
  if (missing(error)) return [];
  fail(error);
  return ((data ?? []) as Row[])
    .filter((r) => r.card)
    .map((r) => ({
      lang: r.lang as IgLang,
      card: r.card as IgCard,
      posted_on: String(r.posted_on),
    }));
}

// The monthly magazine's "Words of the month" (none when the page is off).
export async function monthWords(fromDay: string, toDay: string): Promise<IgRoundupWord[]> {
  const settings = await getIgSettings();
  return settings.monthly_page ? postedWords(fromDay, toDay) : [];
}

type WeekMark = {
  status: "posting" | "posted" | "failed";
  at: string;
  error?: string;
  tries?: number;
  message_id?: number | null;
  path?: string;
};
const weekKey = (to: string) => `ig_week:${to}`;

async function weekMark(to: string): Promise<WeekMark | null> {
  const { data } = await from("bot_settings").select("value").eq("key", weekKey(to)).maybeSingle();
  return ((data as Row | null)?.value ?? null) as WeekMark | null;
}

async function setWeekMark(to: string, value: WeekMark) {
  fail(
    (
      await from("bot_settings").upsert({ key: weekKey(to), value, updated_at: now() } as never, {
        onConflict: "key",
      })
    ).error,
  );
}

export type IgWeek = {
  from: string;
  to: string;
  count: number;
  status: WeekMark["status"] | null;
  at: string | null;
  error: string | null;
  url: string | null;
};

// This week's round-up (still to come) and the last ones, each week ending
// on the round-up's weekday.
export async function listIgWeeks(weeks = 8): Promise<IgWeek[]> {
  const settings = await getIgSettings();
  const today = new Date(`${istDate()}T00:00:00Z`);
  const ahead = (settings.weekly_day - today.getUTCDay() + 7) % 7;
  const out: IgWeek[] = [];
  for (let i = 0; i < weeks; i++) {
    const end = new Date(today.getTime() + (ahead - 7 * i) * 86_400_000).toISOString().slice(0, 10);
    const { from: f, to } = weekOf(end);
    const [count, mark] = await Promise.all([
      postedWords(f, to).then((w) => w.length),
      weekMark(to),
    ]);
    out.push({
      from: f,
      to,
      count,
      status: mark?.status ?? null,
      at: mark?.at ?? null,
      error: mark?.error ?? null,
      url: mark?.path ? publicUrl(mark.path) : null,
    });
  }
  return out;
}

function weekCaption(settings: IgSettings, f: string, to: string, count: number) {
  return fillWeeklyCaption(settings.weekly_caption, {
    from: igDate(f, "long"),
    to: igDate(to, "long"),
    count,
    appLink: settings.weekly_app_link,
    channel: channelLabel(settings.channel) ? `https://${channelLabel(settings.channel)}` : "",
  });
}

// A caption as Telegram takes it: with its links (HTML formatting), or as
// plain text cut to the limit when even its words are too long.
function telegramCaption(caption: string): { caption: string; parse_mode?: "HTML" } {
  return captionText(caption).length <= CAPTION_MAX
    ? { caption: captionHtml(caption), parse_mode: "HTML" }
    : { caption: captionText(caption).slice(0, CAPTION_MAX) };
}

// The week's round-up as a page (for the preview) and its caption.
export async function igWeekPreview(to: string, origin?: string) {
  const settings = await getIgSettings();
  const { from: f } = weekOf(to);
  const words = await postedWords(f, to);
  return {
    html: roundupHtml(words, {
      from: f,
      to,
      assetBase: origin ?? "",
      channel: channelLabel(settings.channel),
    }),
    caption: weekCaption(settings, f, to, words.length),
    count: words.length,
  };
}

// The week's round-up made into a PDF and posted to the channel.
export async function postIgWeek(to: string, origin?: string, auto = false): Promise<void> {
  const settings = await getIgSettings();
  const chat = channelChatId(settings.channel);
  if (!chat) throw new Error("Add the channel link in Infographics settings.");
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set.");
  const { from: f } = weekOf(to);
  const words = await postedWords(f, to);
  const before = await weekMark(to);
  if (!words.length) {
    if (auto)
      await setWeekMark(to, {
        status: "failed",
        at: now(),
        error: "No words were posted this week.",
        tries: 3,
      });
    throw new Error("No words were posted that week.");
  }
  if (auto && before?.status === "posting") return;
  await setWeekMark(to, { status: "posting", at: now(), tries: (before?.tries ?? 0) + 1 });
  try {
    const html = roundupHtml(words, {
      from: f,
      to,
      assetBase: origin ?? "",
      channel: channelLabel(settings.channel),
    });
    const { pdf } = await CA.renderPdf(html, await CA.getMagazineSettings(), "en");
    const path = `infographics/weekly/Words-in-the-News-${f}-to-${to}.pdf`;
    fail(
      (
        await supabaseAdmin.storage
          .from(BUCKET)
          .upload(path, pdf, { contentType: "application/pdf", upsert: true })
      ).error,
    );
    const form = new FormData();
    form.append("chat_id", chat);
    form.append(
      "document",
      new Blob([pdf as BlobPart], { type: "application/pdf" }),
      path.split("/").pop()!,
    );
    const cap = telegramCaption(weekCaption(settings, f, to, words.length));
    form.append("caption", cap.caption);
    if (cap.parse_mode) form.append("parse_mode", cap.parse_mode);
    const res = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
      method: "POST",
      body: form,
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      description?: string;
      result?: { message_id?: number };
    };
    if (!json.ok) throw new Error(`Telegram: ${json.description ?? res.status}`);
    await setWeekMark(to, {
      status: "posted",
      at: now(),
      tries: (before?.tries ?? 0) + 1,
      message_id: json.result?.message_id ?? null,
      path,
    });
  } catch (e) {
    await setWeekMark(to, {
      status: "failed",
      at: now(),
      tries: (before?.tries ?? 0) + 1,
      error: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}

// ---------- Learning from the editor's picks ----------

const PICK_DAYS = 45;

// The words the editor picked (or added) and passed over lately, newest
// first, and on how many days they picked.
async function pickExamples(lang: IgLang): Promise<{
  chosen: PickExample[];
  passed: PickExample[];
  days: number;
}> {
  const since = new Date(Date.now() - PICK_DAYS * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await from("ig_words")
    .select("word,pos_hint,why,own,status,day,for_day")
    .eq("lang", lang)
    .gte("day", since)
    .order("day", { ascending: false })
    .limit(2000);
  if (missing(error)) return { chosen: [], passed: [], days: 0 };
  fail(error);
  const rows = (data ?? []) as Row[];
  const picked = (r: Row) => ["picked", "posted", "released"].includes(String(r.status));
  // A passed-over word is one left out on a day the editor picked from.
  const pickDays = new Set(rows.filter((r) => picked(r) && !r.own).map((r) => String(r.day)));
  const ex = (r: Row): PickExample => ({
    word: String(r.word),
    pos: String(r.pos_hint ?? ""),
    why: r.own ? "" : String(r.why ?? ""),
    own: !!r.own,
  });
  return {
    chosen: rows.filter((r) => picked(r) || (r.own && r.status !== "dropped")).map(ex),
    passed: rows
      .filter(
        (r) =>
          !r.own &&
          ["reserve", "dropped"].includes(String(r.status)) &&
          pickDays.has(String(r.day)),
      )
      .map(ex),
    days: new Set(rows.filter(picked).map((r) => String(r.for_day ?? r.day))).size,
  };
}

// What the AI is told when it suggests words: the editor's rules and the
// words picked and passed over lately.
async function tasteOf(lang: IgLang, settings: IgSettings): Promise<IgTaste> {
  const rules = settings.pick_rules[lang];
  if (!settings.learn_from_picks) return { rules, chosen: [], passed: [] };
  const ex = await pickExamples(lang).catch(() => ({ chosen: [], passed: [], days: 0 }));
  return {
    rules,
    chosen: ex.chosen.slice(0, 25).map((x) => x.word),
    passed: ex.passed.slice(0, 25).map((x) => x.word),
  };
}

export type IgPickStats = Record<
  IgLang,
  { days: number; chosen: number; passed: number; own: number }
>;

export async function igPickStats(): Promise<IgPickStats> {
  const one = async (lang: IgLang) => {
    const ex = await pickExamples(lang);
    return {
      days: ex.days,
      chosen: ex.chosen.filter((x) => !x.own).length,
      passed: ex.passed.length,
      own: ex.chosen.filter((x) => x.own).length,
    };
  };
  return { en: await one("en"), hi: await one("hi") };
}

// Picking rules the AI suggests from the editor's picks (the editor
// chooses which to keep).
export async function suggestIgPickRules(lang: IgLang): Promise<StyleSuggestion[]> {
  const settings = await getIgSettings();
  const ex = await pickExamples(lang);
  if (ex.days < PICK_MIN_DAYS)
    throw new Error(`Pick words on at least ${PICK_MIN_DAYS} days first (so far ${ex.days}).`);
  const raw = await saathiComplete(
    apiKey(),
    pickRuleMessages(
      lang,
      { chosen: ex.chosen.slice(0, 40), passed: ex.passed.slice(0, 40) },
      settings.pick_rules[lang],
    ),
  );
  const out = parseStyleRules(raw, settings.pick_rules[lang]);
  if (!out) throw new Error("The AI's reply could not be read. Try again.");
  return out;
}

// ---------- The editor's actions ----------

// Start (or start again) the day's suggestions.
export async function startIgDay(day: string): Promise<IgDay> {
  const row = await readDay(day);
  if (row && !["picking", "suggesting", "cancelled", "failed"].includes(row.status))
    throw new Error("This day's cards are already being made.");
  if (row) {
    // New suggestions: the unpicked ones of this day are dropped.
    fail(
      (
        await from("ig_words")
          .update({ status: "dropped", updated_at: now() } as never)
          .eq("day", day)
          .eq("status", "suggested")
      ).error,
    );
    await patchDay(day, { status: "suggesting", suggested: [], error: null, notified: [] });
  } else fail((await from("ig_days").insert({ day } as never)).error);
  return (await readDay(day)) as IgDay;
}

// The editor's own word. Refused when it (or a form of it) was posted.
export async function addOwnIgWord(input: {
  day: string;
  lang: IgLang;
  word: string;
  sentence: string;
  paper: string;
}): Promise<IgWord> {
  const key = igWordKey(input.word, input.lang);
  const { data: before } = await from("ig_words")
    .select("word,posted_on")
    .eq("lang", input.lang)
    .eq("key", key)
    .eq("status", "posted")
    .limit(1);
  const was = ((before ?? []) as Row[])[0];
  if (was)
    throw new Error(
      `"${was.word}" was already posted on ${formatDate(String(was.posted_on), "en")}.`,
    );
  const { data, error } = await from("ig_words")
    .insert({
      day: input.day,
      lang: input.lang,
      word: input.word.trim(),
      base: input.word.trim(),
      key,
      sentence: input.sentence.trim(),
      paper: input.paper.trim(),
      own: true,
      why: "Added by the editor",
    } as never)
    .select(WORD_COLS)
    .single();
  fail(error);
  return toWord(data as unknown as Row);
}

// The editor's picks: written in this order; the day's other suggestions
// stay as a reserve.
export async function pickIgWords(day: string, ids: string[]): Promise<void> {
  const row = await readDay(day);
  if (!row || row.status !== "picking")
    throw new Error("The words can be picked once suggestions are ready.");
  const settings = await getIgSettings();
  const { data, error } = await from("ig_words").select(WORD_COLS).in("id", ids);
  fail(error);
  const words = ((data ?? []) as Row[]).map(toWord);
  const en = ids.filter((id) => words.find((w) => w.id === id)?.lang === "en");
  const hi = ids.filter((id) => words.find((w) => w.id === id)?.lang === "hi");
  if (en.length !== settings.pick_en || hi.length !== settings.pick_hi)
    throw new Error(
      `Pick ${igLangsOn(settings)
        .map((l) => (l === "en" ? `${settings.pick_en} English` : `${settings.pick_hi} Hindi`))
        .join(" and ")} words.`,
    );
  const posted = await postedKeys();
  const repeat = words.find((w) => posted.has(`${w.lang}:${w.key}`));
  if (repeat) throw new Error(`"${repeat.word}" was already posted.`);
  for (const [i, id] of [...en, ...hi].entries())
    await patchWord(id, {
      status: "picked",
      for_day: day,
      position: i,
      card: null,
      checks: [],
      proofed: false,
    });
  fail(
    (
      await from("ig_words")
        .update({ status: "reserve", updated_at: now() } as never)
        .eq("day", day)
        .eq("status", "suggested")
    ).error,
  );
  await patchDay(day, { status: "writing", error: null });
}

// A word swapped for another (a suggestion or reserve word): the old one
// goes back to the reserve and the new one is written and proofread.
export async function swapIgWord(day: string, oldId: string, newId: string): Promise<void> {
  const cards = await cardsOf(day);
  const old = cards.find((c) => c.id === oldId);
  if (!old) throw new Error("That card is not in the day's set.");
  const { data } = await from("ig_words").select(WORD_COLS).eq("id", newId).maybeSingle();
  const next = data ? toWord(data as unknown as Row) : null;
  if (!next || !["suggested", "reserve"].includes(next.status))
    throw new Error("That word can't be used.");
  if (next.lang !== old.lang) throw new Error("Swap a word for one of the same language.");
  await patchWord(old.id, { status: "reserve", for_day: null, image_path: null, checked: false });
  await patchWord(next.id, {
    status: "picked",
    for_day: day,
    position: old.position,
    card: null,
    checks: [],
    proofed: false,
    checked: false,
  });
  await patchDay(day, { status: "writing", error: null });
}

// The editor's edit of a card. An edited card needs its tick again.
// An earlier version of a card: kept before the AI writes a part again or
// an old version is restored.
export type IgVersion = { at: string; label: string; card: IgCard };
const MAX_VERSIONS = 15;
const versionsMissing = (e: { message: string } | null) =>
  !!e && /versions|schema cache|does not exist/i.test(e.message);

// The editor's change to a card (it needs its tick again, and a new image).
// With a label, the card as it was is kept as a version first.
export async function saveIgCard(id: string, card: IgCard, label?: string): Promise<void> {
  const { data, error } = await from("ig_words").select("card,checked").eq("id", id).single();
  fail(error);
  const before = (data as unknown as Row).card as IgCard | null;
  if (JSON.stringify(before) === JSON.stringify(card)) return;
  const patch: Partial<IgWord> = { card, image_path: null, checked: false };
  if (label && before) {
    const { data: v, error: ve } = await from("ig_words").select("versions").eq("id", id).single();
    if (!versionsMissing(ve)) {
      fail(ve);
      const list = (((v as Row | null)?.versions ?? []) as IgVersion[]).slice(0, MAX_VERSIONS - 1);
      fail(
        (
          await from("ig_words")
            .update({ versions: [{ at: now(), label, card: before }, ...list] } as never)
            .eq("id", id)
        ).error,
      );
    }
  }
  await patchWord(id, patch);
}

// What the card editor needs beside the card: the article's other lines
// with the word, the paper's own sentence, WordNet's synonyms and
// antonyms of the word, and the card's earlier versions.
export type IgCardAids = {
  sentences: string[];
  original: string;
  wordnet: { synonyms: string[]; antonyms: string[] };
  // What the dictionary says, beside the card: its meanings (the card's
  // part of speech first), every synonym and antonym it gives, and other
  // forms of an English word it knows.
  dictionary: {
    senses: { pos: string; gloss: string }[];
    synonyms: string[];
    antonyms: string[];
    forms: IgForm[];
  };
  versions: IgVersion[];
};

async function articleOf(sourceId: string | null): Promise<string> {
  if (!sourceId) return "";
  const { data } = await from("ca_sources").select("content").eq("id", sourceId).maybeSingle();
  return String((data as Row | null)?.content ?? "");
}

export async function igCardAids(id: string): Promise<IgCardAids> {
  const { data, error } = await from("ig_words")
    .select("word,base,lang,sentence,source_id,card")
    .eq("id", id)
    .single();
  fail(error);
  const w = data as unknown as Row;
  const lang = w.lang as IgLang;
  const base = String(w.base || w.word);
  const article = await articleOf((w.source_id as string | null) ?? null);
  const card = w.card as IgCard | null;
  const sentences = sentencesWith(article, String(w.word)).filter((x) => x !== card?.news);
  const found =
    lang === "en"
      ? await FS.enWordnetSenses([base]).catch(() => ({}) as Record<string, WnSense[]>)
      : await FS.wordnetSenses([base]).catch(() => ({}) as Record<string, WnSense[]>);
  const senses = found[base] ?? [];
  const said = POS_EN.find((p) => (card?.pos ?? "").toLowerCase().startsWith(p));
  // The senses in the card's part of speech (all, if WordNet has none in it).
  const inPos = senses.filter((x) => lang === "en" && said && x.pos === said);
  const fit = inPos.length ? inPos : senses;
  const have = new Set(
    [...(card?.synonyms ?? []), ...(card?.antonyms ?? [])].map((x) => x.toLowerCase()),
  );
  const cap = (x: string) => (lang === "en" ? x[0].toUpperCase() + x.slice(1) : x);
  const pick = (xs: string[]) =>
    [...new Set(xs.map(cap))]
      .filter((x) => !have.has(x.toLowerCase()) && x.toLowerCase() !== base.toLowerCase())
      .slice(0, 10);
  const { data: v, error: ve } = await from("ig_words").select("versions").eq("id", id).single();
  // Other forms: the spellings a form could have that WordNet knows.
  let forms: IgForm[] = [];
  if (lang === "en") {
    const cands = formCandidates(base);
    const known = cands.length
      ? await FS.enWordnetSenses(cands).catch(() => ({}) as Record<string, WnSense[]>)
      : {};
    const onCard = new Set((card?.forms ?? []).map((f) => f.word.toLowerCase()));
    forms = cands
      .filter((c) => known[c]?.length && !onCard.has(c))
      .map((c) => ({ word: c, pos: known[c][0].pos }))
      .filter((f) => !said || f.pos !== said)
      .slice(0, 8);
  }
  const ordered = [...fit, ...senses.filter((x) => !fit.includes(x))];
  return {
    sentences,
    original: String(w.sentence ?? ""),
    wordnet: {
      synonyms: pick(fit.flatMap((x) => x.synonyms)),
      antonyms: pick(fit.flatMap((x) => x.antonyms)),
    },
    dictionary: {
      senses: ordered.slice(0, 4).map((x) => ({ pos: x.pos, gloss: x.gloss })),
      synonyms: [...new Set(fit.flatMap((x) => x.synonyms))],
      antonyms: [...new Set(fit.flatMap((x) => x.antonyms))],
      forms,
    },
    versions: versionsMissing(ve) ? [] : (((v as Row | null)?.versions ?? []) as IgVersion[]),
  };
}

// One part of the card written again by the AI (not saved: the editor
// chooses to use it). The news line comes back as three options.
export async function rewriteIgPart(id: string, part: IgPart, note: string) {
  const { data, error } = await from("ig_words")
    .select("lang,source_id,card")
    .eq("id", id)
    .single();
  fail(error);
  const w = data as unknown as Row;
  const card = w.card as IgCard | null;
  if (!card) throw new Error("The card isn't written yet.");
  const article = (await articleOf((w.source_id as string | null) ?? null))
    .replace(/^Source: .*$/gm, "")
    .replace(/\s+/g, " ")
    .slice(0, 6000);
  const glossary = card.lang === "hi" ? ((await CA.getMagazineSettings()).glossary ?? []) : [];
  const out = parsePart(
    part,
    await saathiComplete(apiKey(), partMessages(part, card, { article, note, glossary })),
  );
  if (!out) throw new Error("The AI's reply could not be read. Try again.");
  return out;
}

// An earlier version back (the card as it is now is kept as a version).
export async function restoreIgVersion(id: string, at: string): Promise<IgCard> {
  const aids = await igCardAids(id);
  const v = aids.versions.find((x) => x.at === at);
  if (!v) throw new Error("That version is gone.");
  await saveIgCard(id, v.card, "Before restoring an earlier version");
  return v.card;
}

// A card moved up or down among the day's cards of its language.
export async function moveIgCard(day: string, id: string, by: -1 | 1): Promise<void> {
  const cards = await cardsOf(day);
  const c = cards.find((x) => x.id === id);
  if (!c) throw new Error("That card is not in the day's set.");
  const same = cards.filter((x) => x.lang === c.lang);
  const at = same.indexOf(c);
  const other = same[at + by];
  if (!other) return;
  const order = [...same];
  [order[at], order[at + by]] = [order[at + by], order[at]];
  for (const [i, x] of order.entries()) await patchWord(x.id, { position: i, image_path: null });
}

export async function setIgCheck(
  id: string,
  checkIdValue: string,
  state: IgCheck["state"],
): Promise<IgWord> {
  const { data, error } = await from("ig_words").select(WORD_COLS).eq("id", id).single();
  fail(error);
  const w = toWord(data as unknown as Row);
  const check = w.checks.find((c) => c.id === checkIdValue);
  if (!check) throw new Error("That note is gone.");
  let card = w.card as IgCard;
  if (state === "accepted" && (check.field !== "news" || card.rewritten))
    card = applyFix(card, check.field, check.text, check.fix);
  const checks = w.checks.map((c) => (c.id === checkIdValue ? { ...c, state } : c));
  await patchWord(id, { card, checks, image_path: null });
  return { ...w, card, checks };
}

export async function setIgChecked(id: string, checked: boolean): Promise<void> {
  await patchWord(id, { checked });
}

// Proofread a card again (after big edits).
export async function recheckIgCard(day: string, id: string): Promise<void> {
  await patchWord(id, { proofed: false, checked: false });
  await patchDay(day, { status: "writing" });
}

export async function setIgDesign(day: string, design: IgDesign): Promise<void> {
  await patchDay(day, { design, design_reason: "Chosen by the editor." });
  fail(
    (
      await from("ig_words")
        .update({ image_path: null, updated_at: now() } as never)
        .eq("for_day", day)
        .eq("status", "picked")
    ).error,
  );
}

// Approved: the cards are made into images and posted at the set time
// (or now).
// Approved: posted now, at the time chosen, or at the posting time today
// (15 minutes from now once that has passed).
export async function approveIgDay(
  day: string,
  caption: string,
  postNow = false,
  at?: string,
): Promise<void> {
  const row = await readDay(day);
  if (!row || !["review", "failed", "cancelled"].includes(row.status))
    throw new Error("Only cards waiting for review can be approved.");
  const cards = await cardsOf(day);
  const settings = await getIgSettings();
  if (!channelChatId(settings.channel))
    throw new Error("Add the channel link in Infographics settings first.");
  if (!cards.length || cards.some((c) => !c.card))
    throw new Error("Some cards aren't written yet.");
  const unticked = cards.filter((c) => !c.checked);
  if (unticked.length)
    throw new Error(`Tick every card as checked first: ${unticked.map((c) => c.word).join(", ")}.`);
  const shown = captionText(caption).length;
  if (shown > CAPTION_MAX)
    throw new Error(`The caption is ${shown} characters; Telegram allows ${CAPTION_MAX}.`);
  let when = postNow ? new Date() : igPostDefault(settings.post_time);
  if (!postNow && at) {
    const t = new Date(at);
    if (!Number.isFinite(t.getTime())) throw new Error("That posting time isn't a time.");
    if (t.getTime() < Date.now() - 2 * 60_000)
      throw new Error("That posting time has passed: choose a later one.");
    if (t.getTime() > Date.now() + 7 * 86_400_000)
      throw new Error("Choose a posting time within the next 7 days.");
    when = t;
  }
  await patchDay(day, {
    status: "rendering",
    caption,
    scheduled_for: when.toISOString(),
    error: null,
  });
}

export async function postIgNow(day: string): Promise<void> {
  const row = await readDay(day);
  if (!row || !["scheduled", "rendering"].includes(row.status))
    throw new Error("Only an approved day can be posted.");
  await patchDay(day, { scheduled_for: now() });
}

// Back to review (before it is posted).
export async function cancelIgDay(day: string): Promise<void> {
  const row = await readDay(day);
  if (!row || !["scheduled", "rendering", "failed"].includes(row.status))
    throw new Error("Only a scheduled day can be taken back.");
  await patchDay(day, { status: "review", scheduled_for: null, error: null });
}
