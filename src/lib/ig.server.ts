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
import { dailyPostTime, formatDate, istDate } from "@/lib/current-affairs";
import * as CA from "@/lib/current-affairs.server";
import * as FS from "@/lib/flash-studio.server";
import { looseWord } from "@/lib/flash-spell";
import type { WnSense } from "@/lib/flash-wordnet";
import { igCardHtml, type IgCard, type IgDesign, type IgLang } from "@/lib/ig-cards";
import {
  applyFix,
  cardFrom,
  cardTexts,
  channelChatId,
  channelLabel,
  CAPTION_MAX,
  designMessages,
  findSentence,
  igSettingsOf,
  igWordKey,
  isHindiText,
  nextDesign,
  parseCards,
  parseDesign,
  parseIssues,
  parseSuggestions,
  proofMessages,
  suggestMessages,
  writeMessages,
  type CardField,
  type IgArticle,
  type IgCheck,
  type IgSettings,
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
  const raw = await saathiComplete(apiKey(), suggestMessages(lang, shown, count + 3, avoid.words));
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
  const items = [...card.synonyms, ...card.antonyms].filter((x) => !x.includes(" "));
  const found = await look([base, ...items]);
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
    ...(i === 0 && row?.caption ? { caption: row.caption.slice(0, CAPTION_MAX) } : {}),
  }));
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMediaGroup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chat, media }),
  });
  const json = (await res.json().catch(() => ({}) as Record<string, WnSense[]>)) as {
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
    text = `📝 Words in the News, ${formatDate(day, "en")}: ${en} English and ${hi} Hindi words suggested. Pick ${settings.pick_en} + ${settings.pick_hi} for tomorrow's cards.`;
  } else {
    const cards = await cardsOf(day);
    const open = cards.reduce((n, c) => n + c.checks.filter((x) => x.state === "open").length, 0);
    text = `🖼️ Words in the News, ${formatDate(day, "en")}: ${cards.length} cards are written and proofread${open ? ` (${open} notes to look at)` : ""}. Review and approve them before ${settings.post_time} tomorrow.`;
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
        await suggestLang(day, lang, settings);
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
    throw new Error(`Pick ${settings.pick_en} English and ${settings.pick_hi} Hindi words.`);
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
export async function saveIgCard(id: string, card: IgCard): Promise<void> {
  await patchWord(id, { card, image_path: null });
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
  if (state === "accepted" && check.field !== "news")
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
export async function approveIgDay(day: string, caption: string, postNow = false): Promise<void> {
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
  if (caption.length > CAPTION_MAX)
    throw new Error(`The caption is ${caption.length} characters; Telegram allows ${CAPTION_MAX}.`);
  const when = postNow ? new Date() : dailyPostTime(day, settings.post_time);
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
