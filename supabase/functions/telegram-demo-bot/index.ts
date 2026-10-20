// Telegram lead-gen bot: stateful flashcard + MCQ quiz per subject with scoring.
// Reads content EXCLUSIVELY from bot_* tables. Tracks users in bot_users
// and quiz state in bot_sessions. Public webhook (Telegram calls it directly).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { runTelegramAnswerJob } from "../_shared/telegram-answer-job.ts";
import { TRIAGE, editCard, nextIndex, parseBiLines, storyCard, summaryCard, triageOrder, type TriageStory } from "../_shared/ca-triage.ts";
import {
  STYLE_TG,
  afterFix,
  afterKeep,
  orderBreaks,
  partFromCode,
  partName,
  partText,
  styleCard,
  styleDoneCard,
  styleStatus,
  withPart,
  type StyleCheck,
  type StyleContent,
} from "../_shared/ca-style-check.ts";
import { parseSync, syncMessages } from "../_shared/ca-translate.ts";
import { CHECK_PHOTO_MAX_BYTES, checkQuestionInput, pickCheckPhoto, validCheckAnswer, type CheckPhoto } from "../_shared/telegram-check-input.ts";
import {
  SaathiAiError,
  cleanHistory,
  collectSources,
  sourceLabel,
  saathiComplete,
  saathiMessages,
  saathiNoMaterialReply,
  saathiPrepareQuery,
  saathiRetrieve,
  splitNextQuestions,
  stripNoAnswer,
  type SaathiRpc,
  type SaathiTurn,
} from "../_shared/saathi-core.ts";
import {
  DIRECTIVE_LABELS,
  mainsInfo,
  mainsMessages,
  mainsNoMaterialReply,
  saathiMainsPlan,
  type MainsInfo,
} from "../_shared/saathi-mains.ts";
import {
  CHECK_DAILY_LIMIT,
  CHECK_MAX_PHOTOS,
  checkAnswer,
  checkCounterKey,
  checkResultTelegram,
} from "../_shared/saathi-check.ts";
import type { SaathiImage } from "../_shared/saathi-core.ts";
import {
  DAILY_QUIZ_DEFAULT_HOUR,
  DAILY_QUIZ_HOURS,
  DAILY_QUIZ_SIZE,
  hourLabel,
  istNow,
  quizMcqs,
  quizPoll,
  quizResultText,
  streakOnDone,
  streakOnSend,
  type DailyQuizState,
  type QuizLang,
  type QuizMcq,
} from "../_shared/ca-quiz.ts";
import {
  BOT_DEFAULT_TEXTS,
  BROADCAST_DELAY_MS,
  clipHtml,
  mdToTelegramHtml,
  sendBotMessage,
  tgEsc,
  type BotButton,
  type BotMessage,
  type BotTexts,
} from "../_shared/telegram.ts";

const TELEGRAM_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";
const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.flashgyan";
// Tags installs with utm_source=telegram_bot so Play Console can attribute them.
const appUrl = (medium: string) =>
  `${PLAY_STORE_URL}&referrer=${encodeURIComponent(`utm_source=telegram_bot&utm_medium=${medium}&utm_campaign=web_to_app`)}`;
const QUIZ_LIMIT = 5;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const TG = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

async function tg(method: string, body: unknown) {
  const r = await fetch(`${TG}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) console.error(method, r.status, await r.text());
  return r;
}

async function sha8(s: string) {
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf).slice(0, 4))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function truncate(s: string, n: number) {
  const str = String(s ?? "");
  return str.length <= n ? str : str.slice(0, n - 1) + "…";
}

function esc(s: string) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function explanationFrom(sections: any): string {
  if (!Array.isArray(sections) || !sections.length) return "—";
  return sections
    .map((s: any) => (s?.title ? `*${s.title}*\n${s.body ?? ""}` : (s?.body ?? "")))
    .filter(Boolean)
    .join("\n\n");
}

// ---------- Admin-managed settings, commands and auto-replies ----------
// Read from the database (edited in the admin panel) and cached briefly so
// changes apply within a minute without redeploying. If the admin migration
// hasn't been applied, the bot keeps its original built-in behaviour.
const CACHE_MS = 60_000;
let botAdminReady = true;

type BotSettings = BotTexts & { webhook_secret: string | null };

const DEFAULT_SETTINGS: BotSettings = { ...BOT_DEFAULT_TEXTS, webhook_secret: null };

type BotCommand = {
  command: string;
  description_en: string;
  description_hi: string;
  action: "builtin" | "message";
  builtin: "study" | "flashcards" | "mcq" | "ask" | "answer" | "daily" | "check" | "help" | null;
  response_text: string;
  media_url: string | null;
  media_type: "photo" | "document" | null;
  buttons: BotButton[];
  show_in_menu: boolean;
  scope: "private" | "all";
  enabled: boolean;
  sort_order: number;
};

type AutoReply = {
  id: string;
  keywords: string[];
  match_type: "contains" | "exact";
  response_text: string;
  media_url: string | null;
  media_type: "photo" | "document" | null;
  buttons: BotButton[];
  priority: number;
};

const cache: {
  settings?: { at: number; value: BotSettings };
  commands?: { at: number; value: BotCommand[] | null };
  replies?: { at: number; value: AutoReply[] };
} = {};

const isMissingTable = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "42P01" || e.code === "PGRST205" || /does not exist|schema cache/i.test(e.message ?? ""));

async function getSettings(fresh = false): Promise<BotSettings> {
  if (!fresh && cache.settings && Date.now() - cache.settings.at < CACHE_MS) {
    return cache.settings.value;
  }
  const { data, error } = await supabase.from("bot_settings").select("key, value");
  if (error) {
    if (isMissingTable(error)) botAdminReady = false;
    else console.error("bot settings", error.message);
    return cache.settings?.value ?? DEFAULT_SETTINGS;
  }
  const value = { ...DEFAULT_SETTINGS };
  for (const row of (data ?? []) as { key: string; value: unknown }[]) {
    if (row.key in value) (value as Record<string, unknown>)[row.key] = row.value;
  }
  cache.settings = { at: Date.now(), value };
  return value;
}

// Null means the commands table doesn't exist yet (use built-in behaviour).
async function getCommands(): Promise<BotCommand[] | null> {
  if (cache.commands && Date.now() - cache.commands.at < CACHE_MS) return cache.commands.value;
  const { data, error } = await supabase.from("bot_commands").select("*").order("sort_order");
  let value: BotCommand[] | null;
  if (error) {
    if (!isMissingTable(error)) console.error("bot commands", error.message);
    value = isMissingTable(error) ? null : (cache.commands?.value ?? null);
  } else {
    value = (data ?? []) as BotCommand[];
  }
  cache.commands = { at: Date.now(), value };
  return value;
}

async function getAutoReplies(): Promise<AutoReply[]> {
  if (cache.replies && Date.now() - cache.replies.at < CACHE_MS) return cache.replies.value;
  const { data, error } = await supabase
    .from("bot_auto_replies")
    .select("id, keywords, match_type, response_text, media_url, media_type, buttons, priority")
    .eq("enabled", true)
    .order("priority");
  const value = error ? (cache.replies?.value ?? []) : ((data ?? []) as AutoReply[]);
  cache.replies = { at: Date.now(), value };
  return value;
}

const normalizeText = (t: string) => t.toLowerCase().replace(/\s+/g, " ").trim();

function findAutoReply(replies: AutoReply[], text: string): AutoReply | null {
  const t = normalizeText(text);
  for (const r of replies) {
    const hit = r.keywords.some((k) => {
      const kw = normalizeText(k);
      return kw && (r.match_type === "exact" ? t === kw : t.includes(kw));
    });
    if (hit) return r;
  }
  return null;
}

async function logEvent(chat_id: number, kind: string, name: string | null = null) {
  if (!botAdminReady) return;
  const { error } = await supabase.from("bot_events").insert({ chat_id, kind, name });
  if (error && !isMissingTable(error)) console.error("bot event", error.message);
}

function messageFrom(r: {
  response_text: string;
  media_url: string | null;
  media_type: "photo" | "document" | null;
  buttons: BotButton[];
}): BotMessage {
  return {
    text: r.response_text,
    mediaUrl: r.media_url,
    mediaType: r.media_type,
    buttons: Array.isArray(r.buttons) ? r.buttons : [],
  };
}

async function sendHelp(chat_id: number, languageCode: string | undefined, commands: BotCommand[]) {
  const hindi = (languageCode ?? "").startsWith("hi");
  const lines = commands
    .filter((c) => c.enabled && c.show_in_menu)
    .map((c) => `/${c.command} — ${tgEsc((hindi && c.description_hi) || c.description_en || "")}`);
  await tg("sendMessage", {
    chat_id,
    text: lines.length ? `<b>Commands</b>\n\n${lines.join("\n")}` : "No commands yet.",
    parse_mode: "HTML",
  });
}

// ---------- User tracking ----------
async function trackUser(from: any, chat_id: number) {
  if (!from) return;
  try {
    await supabase.from("bot_users").upsert(
      {
        chat_id,
        username: from.username ?? null,
        first_name: from.first_name ?? null,
        last_active: new Date().toISOString(),
        // Any message from the user means they haven't blocked the bot.
        ...(botAdminReady ? { language_code: from.language_code ?? null, blocked: false } : {}),
      },
      { onConflict: "chat_id" },
    );
  } catch (e) {
    console.error("trackUser error", e);
  }
}

// ---------- Flashcards ----------
async function listFlashcardSubjects(): Promise<string[]> {
  const { data, error } = await supabase.from("bot_flashcards").select("subject");
  if (error) throw error;
  return [...new Set((data ?? []).map((r: any) => r.subject).filter(Boolean))].sort();
}
async function resolveFlashcardSubject(code: string) {
  for (const s of await listFlashcardSubjects()) if ((await sha8(s)) === code) return s;
  return null;
}
async function randomCardBySubject(subject: string) {
  const { data, error } = await supabase
    .from("bot_flashcards")
    .select("id, prompt, question, answer, sections")
    .eq("subject", subject);
  if (error) throw error;
  if (!data?.length) return null;
  return data[Math.floor(Math.random() * data.length)];
}
async function cardById(id: string) {
  const { data, error } = await supabase
    .from("bot_flashcards")
    .select("id, prompt, question, answer, sections")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// ---------- MCQ ----------
async function listMcqSubjects(): Promise<string[]> {
  const { data, error } = await supabase.from("bot_mcq_tests").select("subject");
  if (error) throw error;
  return [...new Set((data ?? []).map((r: any) => r.subject).filter(Boolean))].sort();
}
async function resolveMcqSubject(code: string) {
  for (const s of await listMcqSubjects()) if ((await sha8(s)) === code) return s;
  return null;
}
async function randomMcqBySubject(subject: string) {
  const { data: tests, error: tErr } = await supabase.from("bot_mcq_tests").select("id").eq("subject", subject);
  if (tErr) throw tErr;
  const ids = (tests ?? []).map((t: any) => t.id);
  if (!ids.length) return null;
  const { data, error } = await supabase
    .from("bot_mcq_questions")
    .select("id, question, option_1, option_2, option_3, option_4, answer, explanation_sections")
    .in("test_id", ids);
  if (error) throw error;
  if (!data?.length) return null;
  return data[Math.floor(Math.random() * data.length)];
}

// ---------- Menus ----------
async function sendMainMenu(chat_id: number) {
  const settings = await getSettings();
  await tg("sendMessage", {
    chat_id,
    text: mdToTelegramHtml(settings.welcome_text),
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [
          { text: settings.flashcards_button, callback_data: "menu_flashcards" },
          { text: settings.mcq_button, callback_data: "menu_mcqs" },
        ],
        [{ text: "🔥 Daily quiz / दैनिक क्विज़", callback_data: "daily_menu" }],
      ],
    },
  });
}

// Sends the subject pickers as new messages (for /flashcards and /mcq).
async function sendSubjectPicker(chat_id: number, kind: "flashcards" | "mcq") {
  const subs = kind === "flashcards" ? await listFlashcardSubjects() : await listMcqSubjects();
  const prefix = kind === "flashcards" ? "subj_" : "mcqsubj_";
  const rows = await Promise.all(subs.map(async (s) => [{ text: s, callback_data: `${prefix}${await sha8(s)}` }]));
  await tg("sendMessage", {
    chat_id,
    text: kind === "flashcards" ? "🃏 <b>Flashcards</b>\nPick a subject:" : "📝 <b>MCQ Quiz</b>\nPick a subject:",
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: rows.length ? rows : [[{ text: "No subjects yet", callback_data: "noop" }]],
    },
  });
}

async function editFlashcardSubjects(chat_id: number, message_id: number) {
  const subs = await listFlashcardSubjects();
  const rows = await Promise.all(subs.map(async (s) => [{ text: s, callback_data: `subj_${await sha8(s)}` }]));
  await tg("editMessageText", {
    chat_id,
    message_id,
    text: "🃏 <b>Flashcards</b>\nPick a subject:",
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: rows.length ? rows : [[{ text: "No subjects yet", callback_data: "noop" }]],
    },
  });
}

async function editMcqSubjects(chat_id: number, message_id: number) {
  const subs = await listMcqSubjects();
  const rows = await Promise.all(subs.map(async (s) => [{ text: s, callback_data: `mcqsubj_${await sha8(s)}` }]));
  await tg("editMessageText", {
    chat_id,
    message_id,
    text: "📝 <b>MCQ Quiz</b>\nPick a subject:",
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: rows.length ? rows : [[{ text: "No subjects yet", callback_data: "noop" }]],
    },
  });
}

// ---------- Flashcard flow (unchanged loop with 5-card cap) ----------
async function editQuestion(chat_id: number, message_id: number, count: number, subjCode: string, subject: string) {
  const card = await randomCardBySubject(subject);
  if (!card) {
    await tg("editMessageText", { chat_id, message_id, text: `No cards found for ${esc(subject)}.` });
    return;
  }
  await tg("editMessageText", {
    chat_id,
    message_id,
    text: `📝 <b>Question ${count}/${QUIZ_LIMIT}:</b>${card.prompt ? `\n\n<i>${esc(card.prompt)}</i>` : ""}\n\n${esc(card.question)}`,
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [[{ text: "Reveal Answer", callback_data: `rev_${card.id}_${count}_${subjCode}` }]],
    },
  });
}

async function editReveal(chat_id: number, message_id: number, cardId: string, count: number, subjCode: string) {
  const card = await cardById(cardId);
  if (!card) {
    await tg("editMessageText", { chat_id, message_id, text: "Card not found." });
    return;
  }
  const expl = explanationFrom(card.sections);
  const text =
    `📝 <b>Question ${count}/${QUIZ_LIMIT}:</b>${card.prompt ? `\n<i>${esc(card.prompt)}</i>` : ""}\n${esc(card.question)}\n\n` +
    `💡 <b>Answer:</b>\n${esc(card.answer)}\n\n` +
    `📖 <b>Explanation:</b>\n${esc(expl)}`;

  const reply_markup =
    count < QUIZ_LIMIT
      ? { inline_keyboard: [[{ text: "➡️ Next Card", callback_data: `next_${count + 1}_${subjCode}` }]] }
      : {
          inline_keyboard: [
            [{ text: "📱 Download FlashGyan App to continue!", url: appUrl("flashcards_complete") }],
            [{ text: "🔁 Practice Again", callback_data: "menu_flashcards" }],
          ],
        };

  await tg("editMessageText", { chat_id, message_id, text, parse_mode: "HTML", reply_markup });
}

// ---------- MCQ flow with poll_answer + scoring ----------
async function sendMcqPoll(chat_id: number, subjCode: string, subject: string) {
  // Ensure session for this chat (create/reset if not present or new subject)
  const { data: existing } = await supabase
    .from("bot_sessions")
    .select("chat_id, subject, current_count")
    .eq("chat_id", chat_id)
    .maybeSingle();

  let count = 1;
  if (existing && existing.subject === subject && (existing.current_count ?? 0) < QUIZ_LIMIT) {
    count = (existing.current_count ?? 0) + 1;
  } else {
    // reset session
    await supabase.from("bot_sessions").upsert(
      {
        chat_id,
        subject,
        current_count: 0,
        correct_count: 0,
        incorrect_count: 0,
        active_poll_id: null,
        correct_option_id: null,
      },
      { onConflict: "chat_id" },
    );
    count = 1;
  }

  const q = await randomMcqBySubject(subject);
  if (!q) {
    await tg("sendMessage", { chat_id, text: `No MCQs found for ${subject}.` });
    return;
  }
  const options = [q.option_1, q.option_2, q.option_3, q.option_4].map((o: string) => truncate(o, 100));
  const answerIdx = Math.max(0, Math.min(3, (q.answer ?? 1) - 1));
  const explText = explanationFrom(q.explanation_sections).replace(/\*/g, "");

  const r = await tg("sendPoll", {
    chat_id,
    question: truncate(`${count}/${QUIZ_LIMIT}: ${q.question}`, 300),
    options,
    type: "quiz",
    correct_option_id: answerIdx,
    explanation: truncate(explText, 200),
    is_anonymous: false,
  });

  let poll_id: string | null = null;
  try {
    const j = await r.clone().json();
    poll_id = j?.result?.poll?.id ?? null;
  } catch {
    /* noop */
  }

  await supabase
    .from("bot_sessions")
    .update({
      subject,
      current_count: count,
      active_poll_id: poll_id,
      correct_option_id: answerIdx,
    })
    .eq("chat_id", chat_id);
}

async function subjCodeFor(subject: string) {
  return await sha8(subject);
}

async function handlePollAnswer(pa: any) {
  const user = pa?.user;
  const poll_id: string = pa?.poll_id;
  const option_ids: number[] = pa?.option_ids ?? [];
  if (!user?.id || !poll_id) return;
  const chat_id = user.id; // private chat: chat_id == user.id

  await trackUser(user, chat_id);

  const { data: sess } = await supabase.from("bot_sessions").select("*").eq("chat_id", chat_id).maybeSingle();

  if (!sess || sess.active_poll_id !== poll_id) {
    if (option_ids.length) await handleDailyAnswer(chat_id, poll_id, option_ids[0]);
    return;
  }

  const picked = option_ids[0];
  const isCorrect = picked === sess.correct_option_id;
  const correct = (sess.correct_count ?? 0) + (isCorrect ? 1 : 0);
  const incorrect = (sess.incorrect_count ?? 0) + (isCorrect ? 0 : 1);

  await supabase
    .from("bot_sessions")
    .update({
      correct_count: correct,
      incorrect_count: incorrect,
      active_poll_id: null,
    })
    .eq("chat_id", chat_id);

  const finished = (sess.current_count ?? 0) >= QUIZ_LIMIT;

  if (!finished) {
    const code = await subjCodeFor(sess.subject);
    
    // Auto-advance logic: Send correct/incorrect message with NO button
    await tg("sendMessage", {
      chat_id,
      text: isCorrect ? "🎯 <b>Correct!</b>" : "❌ <b>Incorrect.</b>",
      parse_mode: "HTML",
    });

    // Automatically send the next MCQ poll
    await sendMcqPoll(chat_id, code, sess.subject);
    
  } else {
    const score = correct * 1 + incorrect * (-1 / 3);
    const scoreStr = score.toFixed(2);
    const text =
      `${isCorrect ? "🎯 <b>Correct!</b>" : "❌ <b>Incorrect.</b>"}\n\n` +
      `🏁 <b>Quiz Complete — ${esc(sess.subject)}</b>\n\n` +
      `✅ Correct: <b>${correct}</b>\n` +
      `❌ Incorrect: <b>${incorrect}</b>\n` +
      `📊 Final Score: <b>${scoreStr} / ${QUIZ_LIMIT}</b>\n` +
      `<i>(+1 correct, −1/3 incorrect)</i>`;
    await tg("sendMessage", {
      chat_id,
      text,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "📱 Download FlashGyan App", url: appUrl("mcq_complete") }],
          [{ text: "🔁 Practice Again", callback_data: "menu_mcqs" }],
        ],
      },
    });
    await supabase.from("bot_sessions").delete().eq("chat_id", chat_id);
  }
}

// ---------- SAATHI /ask ----------
// Question answering lives in ../_shared/saathi-core.ts, shared with the website.
const saathiRpc: SaathiRpc = (fn, args) => supabase.rpc(fn, args);

// Keeps Telegram's "typing…" indicator on while SAATHI works (it lasts ~5 seconds).
function keepTyping(chat_id: number): () => void {
  const send = () => tg("sendChatAction", { chat_id, action: "typing" }).catch(() => {});
  send();
  const timer = setInterval(send, 4500);
  return () => clearInterval(timer);
}

type CachedAnswer = {
  answer: string;
  sources: { title: string }[];
  followups: string[];
  meta?: { mains?: MainsInfo; general?: boolean } | null;
};

// "/answer 10 question" or "/answer question (10 marks)": marks come first or
// are found in the question.
function parseAnswerArgs(args: string): { marks: number | null; question: string } {
  const m = /^(\d{1,2})\s+([\s\S]+)$/.exec(args);
  const marks = m ? Number(m[1]) : null;
  return m && marks && marks <= 50 ? { marks, question: m[2].trim() } : { marks: null, question: args };
}

function mainsHeader(info: MainsInfo): string {
  const parts = [
    `📝 <b>${info.marks} marks</b> · ~${info.wordLimit} words`,
    tgEsc(DIRECTIVE_LABELS[info.directive]),
  ];
  const lines = [parts.join(" · ")];
  if (info.syllabus) {
    lines.push(`📘 <i>Paper ${tgEsc(info.syllabus.paper)} · ${tgEsc(info.syllabus.unit)}</i>`);
  }
  if (info.pyq) {
    const when = [info.pyq.year ? `RAS ${info.pyq.year}` : "a previous year", info.pyq.paper ? `Paper ${tgEsc(info.pyq.paper)}` : null]
      .filter(Boolean)
      .join(", ");
    lines.push(`🗂 <i>Asked in ${when}</i>`);
  }
  return lines.join("\n") + "\n\n";
}

// mains: write a descriptive exam answer (/answer) instead of a chat answer.
async function handleSaathiAsk(
  chat_id: number,
  user_id: number,
  question: string,
  mains?: { marks: number | null },
  signal?: AbortSignal,
) {
  if (!question) {
    await tg("sendMessage", {
      chat_id,
      text: mains
        ? "Usage: /answer 10 <your question>\n(the number is the marks: 5 or 10)"
        : "Usage: /ask <your question>",
    });
    return;
  }
  if (!LOVABLE_API_KEY) {
    await tg("sendMessage", { chat_id, text: "SAATHI is not configured." });
    return;
  }
  question = question.slice(0, 2000);
  const userKey = String(user_id);
  await logEvent(chat_id, "saathi");
  if (signal?.aborted) return;
  const stopTyping = keepTyping(chat_id);
  signal?.addEventListener("abort", stopTyping, { once: true });

  let answer: string;
  let noAnswer = true;
  // Answered from SAATHI's own knowledge: the books have nothing on it.
  let general = false;
  let sourceTitles: string[] = [];
  let followups: string[] = [];
  let info: MainsInfo | null = null;
  const channel = mains ? `telegram:mains:${mains.marks ?? "auto"}` : "telegram";
  try {
    // Conversational memory: the most recent turns, oldest first.
    const { data: rows } = await supabase
      .from("saathi_chat_history")
      .select("role,content")
      .eq("user_id", userKey)
      .order("created_at", { ascending: false })
      .limit(6);
    const history = cleanHistory(((rows ?? []) as SaathiTurn[]).slice().reverse());

    const query = await saathiPrepareQuery(LOVABLE_API_KEY, history, question);
    const { data: cachedRows } = await supabase.rpc("saathi_cache_get", {
      p_channel: channel,
      p_question: query.standalone,
      p_subjects: [],
    });
    const cached = ((cachedRows ?? []) as CachedAnswer[])[0];

    if (cached) {
      answer = cached.answer;
      noAnswer = false;
      sourceTitles = cached.sources.map(sourceLabel);
      followups = cached.followups ?? [];
      info = cached.meta?.mains ?? null;
      general = !!cached.meta?.general;
    } else if (mains) {
      const plan = await saathiMainsPlan({
        apiKey: LOVABLE_API_KEY,
        rpc: saathiRpc,
        history,
        question,
        subjects: null,
        marks: mains.marks,
        query,
      });
      info = mainsInfo(plan);
      {
        const parsed = stripNoAnswer(
          await saathiComplete(
            LOVABLE_API_KEY,
            mainsMessages({ channel: "telegram", history, question, plan }),
          ),
        );
        noAnswer = !parsed.text.trim();
        general = parsed.noAnswer || plan.matches.length === 0;
        answer = parsed.text.trim() || mainsNoMaterialReply(question);
        if (!noAnswer) {
          info = mainsInfo(plan, answer);
          const sources = general ? [] : collectSources(plan.matches);
          sourceTitles = sources.map(sourceLabel);
          const { error } = await supabase.rpc("saathi_cache_put", {
            p_channel: channel,
            p_question: query.standalone,
            p_subjects: [],
            p_answer: answer,
            p_sources: sources,
            p_followups: [],
            p_english_query: query.english,
            p_meta: { mains: info, ...(general ? { general } : {}) },
          });
          if (error && error.code !== "PGRST202") console.error("cache put error", error.message);
        }
      }
      if (noAnswer || general) {
        const { error } = await supabase.rpc("increment_knowledge_gap", {
          gap_question: query.standalone,
        });
        if (error) console.error("gap rpc error", error.message);
      }
    } else {
      const { matches } = await saathiRetrieve({
        apiKey: LOVABLE_API_KEY,
        rpc: saathiRpc,
        history,
        question,
        subjects: null,
        query,
      });
      {
        const raw = await saathiComplete(
          LOVABLE_API_KEY,
          saathiMessages({ channel: "telegram", history, question, matches }),
        );
        const parsed = stripNoAnswer(raw);
        const split = splitNextQuestions(parsed.text);
        noAnswer = !split.text;
        general = parsed.noAnswer || matches.length === 0;
        answer = split.text || saathiNoMaterialReply(question);
        if (!noAnswer) {
          const sources = general ? [] : collectSources(matches);
          sourceTitles = sources.map(sourceLabel);
          followups = split.next;
          const { error } = await supabase.rpc("saathi_cache_put", {
            p_channel: "telegram",
            p_question: query.standalone,
            p_subjects: [],
            p_answer: answer,
            p_sources: sources,
            p_followups: followups,
            p_english_query: query.english,
            ...(general ? { p_meta: { general } } : {}),
          });
          if (error && error.code !== "PGRST202") console.error("cache put error", error.message);
        }
      }
      if (noAnswer || general) {
        const { error } = await supabase.rpc("increment_knowledge_gap", {
          gap_question: query.standalone,
        });
        if (error) console.error("gap rpc error", error.message);
      }
    }
  } catch (e) {
    // AI or database failures are not knowledge gaps and are not remembered.
    console.error("saathi error", e);
    stopTyping();
    if (signal?.aborted) return;
    const busy = e instanceof SaathiAiError && (e.status === 429 || e.status === 402);
    await tg("sendMessage", {
      chat_id,
      text: busy ? e.message : "SAATHI is having trouble right now. Please try again in a moment.",
    });
    return;
  } finally {
    stopTyping();
    signal?.removeEventListener("abort", stopTyping);
  }
  if (signal?.aborted) return;

  // Only real answers become memory, so follow-ups build on useful context.
  if (!noAnswer) {
    const { error } = await supabase.from("saathi_chat_history").insert([
      { user_id: userKey, role: "user", content: question },
      { user_id: userKey, role: "assistant", content: answer },
    ]);
    if (error) console.error("history insert error", error.message);
  }

  const srcLine = sourceTitles.length
    ? `\n\n📚 <i>Sources: ${sourceTitles.map(tgEsc).join(", ")}</i>`
    : general && !noAnswer
      ? `\n\nℹ️ <i>${/[\u0900-\u097F]/.test(question) ? "यह विषय अभी आपकी पुस्तकों में नहीं है; उत्तर SAATHI के अपने ज्ञान से है।" : "Not in your books yet: answered from SAATHI's own knowledge."}</i>`
      : "";
  const nextLine = followups.length
    ? `\n\n💡 <i>You could also ask:</i>\n${followups.map((q) => `/ask ${tgEsc(q)}`).join("\n")}`
    : "";
  const wordsLine =
    info && !noAnswer && info.words !== undefined
      ? `\n\n✍️ <i>${info.words} words${info.blueprint ? ` · structure learned from ${info.blueprint.samples} model answers` : ""}</i>`
      : "";
  const header = info && !noAnswer ? mainsHeader(info) : "";
  const extras = wordsLine + srcLine + nextLine;
  const body =
    header + clipHtml(mdToTelegramHtml(answer), 3900 - extras.length - header.length) + extras;
  if (signal?.aborted) return;
  const res = await tg("sendMessage", { chat_id, text: body, parse_mode: "HTML" });
  if (!res.ok) {
    // Fallback if Telegram rejects the markup: send safely escaped plain text.
    await tg("sendMessage", {
      chat_id,
      text: header + tgEsc(answer).slice(0, 3900 - extras.length - header.length) + extras,
      parse_mode: "HTML",
    });
  }
}

async function queueMainsAnswer(chat_id: number, user_id: number, args: string) {
  const { marks, question } = parseAnswerArgs(args);
  // Usage and configuration errors remain immediate, without a drafting notice.
  if (!question || !LOVABLE_API_KEY) {
    await handleSaathiAsk(chat_id, user_id, question, { marks });
    return;
  }
  await tg("sendMessage", {
    chat_id,
    text: /[\u0900-\u097F]/.test(question)
      ? "✍️ आपका RAS मुख्य परीक्षा उत्तर तैयार कर रहा हूँ…"
      : "✍️ Drafting your RAS Mains answer…",
  });
  continueInBackground(runTelegramAnswerJob({
    process: (signal) => handleSaathiAsk(chat_id, user_id, question, { marks }, signal),
    onFailure: async (timedOut) => {
      console.error("telegram mains job", timedOut ? "deadline exceeded" : "failed");
      await tg("sendMessage", {
        chat_id,
        text: timedOut
          ? "Your answer is taking too long. Please try /answer again in a moment."
          : "SAATHI couldn't deliver your answer. Please try /answer again in a moment.",
      });
    },
  }));
}

// ---------- Mains answer checking (/check) ----------
// The student sends the question, then the answer typed or as photos of the
// handwritten pages. Marking runs in the background like /answer; a check
// counts towards the daily allowance only when it succeeds.
type CheckSession = {
  chat_id: number;
  step: "question" | "answer";
  question: string | null;
  marks: number | null;
  photos: CheckPhoto[];
  updated_at: string;
};
// A check left half-done for longer than this starts over.
const CHECK_SESSION_MINUTES = 60;
const CHECK_CANCEL = { inline_keyboard: [[{ text: "✖️ Cancel", callback_data: "check_cancel" }]] };

const checkKey = (chat_id: number) => checkCounterKey(`tg:${chat_id}`);

async function checksUsedToday(chat_id: number): Promise<number> {
  const { data } = await supabase.from("saathi_rate_limits").select("hits").eq("key", checkKey(chat_id)).maybeSingle();
  return (data as { hits?: number } | null)?.hits ?? 0;
}

async function getCheckSession(chat_id: number): Promise<CheckSession | null> {
  const { data, error } = await supabase.from("bot_check_sessions").select("*").eq("chat_id", chat_id).maybeSingle();
  if (error && !isMissingTable(error)) console.error("check session", error.message);
  const row = data as CheckSession | null;
  if (!row) return null;
  if (Date.now() - Date.parse(row.updated_at) > CHECK_SESSION_MINUTES * 60_000) {
    await supabase.from("bot_check_sessions").delete().eq("chat_id", chat_id);
    return null;
  }
  return row;
}

async function saveCheckSession(row: Omit<CheckSession, "updated_at">) {
  const { error } = await supabase
    .from("bot_check_sessions")
    .upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: "chat_id" });
  if (error) console.error("check session save", error.message);
  return !error;
}

const askForAnswer = (marks: number | null) =>
  `✍️ Now send your answer${marks ? ` (${marks} marks)` : ""}:\n` +
  `• type it here, or\n• send clear photos of your handwritten pages (up to ${CHECK_MAX_PHOTOS}), then tap ✅ Check.\n\n` +
  `अब अपना उत्तर भेजें: टाइप करें या हस्तलिखित पन्नों की फ़ोटो (अधिकतम ${CHECK_MAX_PHOTOS}) भेजें।`;

async function startCheck(chat_id: number, args: string) {
  if (!Deno.env.get("ANTHROPIC_API_KEY") || !Deno.env.get("GEMINI_API_KEY")) {
    await tg("sendMessage", { chat_id, text: "SAATHI is not configured." });
    return;
  }
  if ((await checksUsedToday(chat_id)) >= CHECK_DAILY_LIMIT) {
    await tg("sendMessage", {
      chat_id,
      text: `You've used today's ${CHECK_DAILY_LIMIT} answer checks. Come back tomorrow!\nआज की ${CHECK_DAILY_LIMIT} जाँच पूरी हो गईं। कल फिर आइए!`,
    });
    return;
  }
  const input = args ? checkQuestionInput(args) : null;
  if (args && !input) {
    await tg("sendMessage", { chat_id, text: "Send a full question (up to 2,000 characters), optionally starting with its marks (1–50)." });
    return;
  }
  const { marks, question } = input ?? { marks: null, question: "" };
  const ok = await saveCheckSession({
    chat_id,
    step: question ? "answer" : "question",
    question: question || null,
    marks,
    photos: [],
  });
  if (!ok) {
    await tg("sendMessage", { chat_id, text: "Answer checking isn't available yet. Please try again later." });
    return;
  }
  await logEvent(chat_id, "check", "start");
  await tg("sendMessage", {
    chat_id,
    text: question
      ? askForAnswer(marks)
      : "📝 Send the question you answered. Put the marks first, e.g.:\n10 राजस्थान में जल संरक्षण की पारंपरिक विधियों की विवेचना कीजिए।\n\n" +
        "वह प्रश्न भेजें जिसका उत्तर आपने लिखा है (शुरू में अंक: 5 या 10)।",
    reply_markup: CHECK_CANCEL,
  });
}

// Text while a check is open: the question, then a typed answer.
async function handleCheckText(session: CheckSession, text: string) {
  const chat_id = session.chat_id;
  if (session.step === "question") {
    const input = checkQuestionInput(text);
    if (!input) {
      await tg("sendMessage", { chat_id, text: "Please send the full question, with marks first if known (e.g. 10 Explain rainwater harvesting).", reply_markup: CHECK_CANCEL });
      return;
    }
    const { marks, question } = input;
    if (!await saveCheckSession({ ...session, step: "answer", question, marks: marks ?? session.marks })) {
      await tg("sendMessage", { chat_id, text: "Couldn't save your question. Please send it again." });
      return;
    }
    await tg("sendMessage", { chat_id, text: askForAnswer(marks ?? session.marks), reply_markup: CHECK_CANCEL });
    return;
  }
  // A stray "ok" shouldn't use up the question; photos may still be on the way.
  if (!validCheckAnswer(text, session.photos?.length ?? 0)) {
    await tg("sendMessage", {
      chat_id,
      text: text.length > 12_000 ? "Please keep your answer under 12,000 characters." : "That's too short to check. Send your full answer, or photos of your pages.\nपूरा उत्तर या पन्नों की फ़ोटो भेजें।",
      reply_markup: CHECK_CANCEL,
    });
    return;
  }
  await runCheck(chat_id, text);
}

async function handleCheckPhoto(message: any) {
  const chat_id: number = message.chat.id;
  if (message.chat.type !== "private") return;
  const session = await getCheckSession(chat_id);
  if (!session) {
    await tg("sendMessage", {
      chat_id,
      text: "To get your handwritten answer checked, send /check first.\nहस्तलिखित उत्तर जँचवाने के लिए पहले /check भेजें।",
    });
    return;
  }
  if (session.step === "question") {
    await tg("sendMessage", { chat_id, text: "Please type the question first, then send the photos of your answer.\nपहले प्रश्न टाइप करें, फिर उत्तर की फ़ोटो भेजें।" });
    return;
  }
  const photo = pickCheckPhoto(message);
  if (!photo) {
    await tg("sendMessage", { chat_id, text: "I can't use this file. Please send a JPG, PNG or WebP image under 4.5 MB." });
    return;
  }
  const { data, error } = await supabase.rpc("bot_check_add_photo", { p_chat_id: chat_id, p_photo: photo, p_max: CHECK_MAX_PHOTOS });
  if (error) {
    console.error("check photo", error.message);
    await tg("sendMessage", { chat_id, text: "Couldn't save this page. Please send the photo again." });
    return;
  }
  const count = data as number | null;
  if (!count) {
    await tg("sendMessage", {
      chat_id,
      text: `You can send up to ${CHECK_MAX_PHOTOS} pages. Tap ✅ Check to check them.`,
      reply_markup: { inline_keyboard: [[{ text: "✅ Check", callback_data: "check_go" }]] },
    });
    return;
  }
  await tg("sendMessage", {
    chat_id,
    text: count < CHECK_MAX_PHOTOS
      ? `📄 Page ${count} received. Send the next page, or tap ✅ Check.\nपेज ${count} मिला। अगला पेज भेजें या ✅ Check दबाएँ।`
      : `📄 Page ${count} received. Tap ✅ Check.\nपेज ${count} मिला। ✅ Check दबाएँ।`,
    reply_markup: { inline_keyboard: [[{ text: "✅ Check", callback_data: "check_go" }, { text: "✖️ Cancel", callback_data: "check_cancel" }]] },
  });
}

async function telegramImage(photo: CheckPhoto, signal: AbortSignal): Promise<SaathiImage> {
  const r = await tg("getFile", { file_id: photo.file_id });
  const path = r.ok ? (await r.json())?.result?.file_path : null;
  if (!path) throw new Error("telegram getFile failed");
  if (signal.aborted) throw new Error("Check cancelled");
  const file = await fetch(`https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${path}`, { signal });
  if (!file.ok) throw new Error(`telegram file ${file.status}`);
  if (Number(file.headers.get("content-length")) > CHECK_PHOTO_MAX_BYTES) throw new Error("Photo is too large");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length > CHECK_PHOTO_MAX_BYTES) throw new Error("Photo is too large");
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { media_type: photo.mime, data: btoa(bin) };
}

// Takes the open check (so a double tap runs it once) and marks it in the background.
async function runCheck(chat_id: number, text: string | null) {
  const openSession = await getCheckSession(chat_id);
  if (!openSession?.question) {
    await tg("sendMessage", { chat_id, text: "This check has expired or is already running. Start a new one with /check." });
    return;
  }
  const photos = openSession.photos ?? [];
  if (!text && !photos.length) {
    await tg("sendMessage", { chat_id, text: askForAnswer(openSession.marks), reply_markup: CHECK_CANCEL });
    return;
  }
  const used = await checksUsedToday(chat_id);
  if (used >= CHECK_DAILY_LIMIT) {
    await tg("sendMessage", { chat_id, text: `You've used today's ${CHECK_DAILY_LIMIT} answer checks. Come back tomorrow!` });
    return;
  }
  // Claim only the version we validated; repeated taps cannot launch a second job.
  const { data, error } = await supabase.from("bot_check_sessions").delete().eq("chat_id", chat_id).eq("updated_at", openSession.updated_at).select();
  if (error) {
    await tg("sendMessage", { chat_id, text: "Couldn't start checking. Please try again." });
    return;
  }
  const session = ((data ?? []) as CheckSession[])[0];
  if (!session?.question) return;
  const hindi = /[ऀ-ॿ]/.test(`${session.question} ${text ?? ""}`);
  await tg("sendMessage", {
    chat_id,
    text: photos.length
      ? hindi
        ? "🧐 आपकी लिखावट पढ़कर उत्तर जाँच रहा हूँ… लगभग एक मिनट लगेगा।"
        : "🧐 Reading your handwriting and checking your answer… this takes about a minute."
      : hindi
        ? "🧐 आपका उत्तर जाँच रहा हूँ…"
        : "🧐 Checking your answer…",
  });
  continueInBackground(runTelegramAnswerJob({
    timeoutMs: 120_000,
    process: (signal) => deliverCheck(chat_id, session, text, used, signal),
    onFailure: async (timedOut) => {
      console.error("telegram check job", timedOut ? "deadline exceeded" : "failed");
      await tg("sendMessage", {
        chat_id,
        text: timedOut
          ? "Checking took too long. It didn't count towards today's checks; please try /check again."
          : "SAATHI couldn't check your answer. It didn't count towards today's checks; please try /check again.",
      });
    },
  }));
}

async function deliverCheck(
  chat_id: number,
  session: CheckSession,
  text: string | null,
  used: number,
  signal: AbortSignal,
) {
  const question = session.question;
  if (!question || signal.aborted) return;
  const stopTyping = keepTyping(chat_id);
  signal.addEventListener("abort", stopTyping, { once: true });
  try {
    const images = await Promise.all((session.photos ?? []).map((photo) => telegramImage(photo, signal)));
    if (signal.aborted) return;
    const outcome = await checkAnswer({
      apiKey: LOVABLE_API_KEY,
      rpc: saathiRpc,
      question,
      marks: session.marks,
      answer: text ?? undefined,
      images,
      signal,
    });
    if (signal.aborted) return;
    if (!outcome.ok) {
      await logEvent(chat_id, "check", outcome.reason);
      const why = {
        unreadable:
          "I couldn't read the photos. Please send clear, well-lit photos of each page (one page per photo, taken from above), then /check again.\nफ़ोटो पढ़ी नहीं जा सकीं। हर पेज की साफ़ फ़ोटो भेजें।",
        too_short: "Your answer is too short to check. Write at least a few sentences, then /check again.\nउत्तर जाँचने के लिए बहुत छोटा है।",
        failed: "SAATHI couldn't check your answer this time. It didn't count; please try /check again.",
      }[outcome.reason];
      await tg("sendMessage", { chat_id, text: why });
      return;
    }
    if (outcome.transcript) {
      const hi = outcome.result.language === "Hindi";
      await tg("sendMessage", {
        chat_id,
        text: `📄 <b>${hi ? "आपके पन्नों से पढ़ा गया उत्तर" : "What I read from your pages"}</b>\n<blockquote expandable>${esc(truncate(outcome.transcript, 3500))}</blockquote>`,
        parse_mode: "HTML",
      });
    }
    if (signal.aborted) return;
    const delivered = await tg("sendMessage", {
      chat_id,
      text: clipHtml(checkResultTelegram(outcome.result, {
        left: Math.max(0, CHECK_DAILY_LIMIT - used - 1),
        transcribed: !!outcome.transcript,
      }), 3900),
      parse_mode: "HTML",
    });
    if (!delivered.ok) throw new Error("Couldn't deliver check feedback");
    await supabase.rpc("saathi_consume_rate_limit", { rl_key: checkKey(chat_id), window_seconds: 172_800, max_hits: CHECK_DAILY_LIMIT });
    await logEvent(chat_id, "check", `${outcome.result.awarded}/${outcome.result.outOf}`);
  } finally {
    stopTyping();
    signal.removeEventListener("abort", stopTyping);
  }
}

// ---------- Current affairs magazine ----------
// Posts approved magazine issues (PDF) to the channel when they are due.
// Runs with every broadcast tick.
// The English issue's PDF, caption and post, and the Hindi issue's (none on
// older bilingual issues, whose one PDF is pdf_path).
type MagazineIssue = {
  id: string;
  kind: "daily" | "monthly";
  period: string;
  pdf_path: string;
  caption: string | null;
  telegram_message_id: number | null;
  pdf_path_hi: string | null;
  caption_hi: string | null;
  telegram_message_id_hi: number | null;
};

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

// The day's MCQs, in the magazine's order.
async function issueMcqs(date: string, max: number): Promise<QuizMcq[]> {
  const { data } = await supabase
    .from("ca_items")
    .select("mcq:content->mcq")
    .eq("issue_date", date)
    .eq("status", "included")
    .order("position");
  return quizMcqs((data ?? []) as { mcq?: QuizMcq | null }[], max);
}

// Sends MCQs as Telegram quiz polls (a long question goes in a message just
// before its poll). Returns each poll's id and correct option, in order.
async function sendQuizPolls(
  chat_id: number | string,
  mcqs: QuizMcq[],
  anonymous: boolean,
  gapMs: number,
  lang?: QuizLang,
): Promise<{ id: string; correct: number }[]> {
  const sent: { id: string; correct: number }[] = [];
  for (let i = 0; i < mcqs.length; i++) {
    const poll = quizPoll(mcqs[i], i + 1, mcqs.length, lang);
    if (poll.intro) {
      await tg("sendMessage", { chat_id, text: poll.intro, parse_mode: "HTML" });
      await pause(gapMs);
    }
    const r = await tg("sendPoll", {
      chat_id,
      question: poll.question,
      options: poll.options,
      type: "quiz",
      correct_option_id: poll.correct,
      explanation: poll.explanation || undefined,
      is_anonymous: anonymous,
    });
    const j = await r.json().catch(() => ({}));
    const id = j?.result?.poll?.id;
    if (!j?.ok || !id) throw new Error(j?.description ?? `sendPoll failed (${r.status})`);
    sent.push({ id: String(id), correct: poll.correct });
    await pause(gapMs);
  }
  return sent;
}

// After the daily PDF: its MCQs as quiz polls on the channel, in the issue's
// language (both languages when one channel has both issues).
async function postChannelQuiz(channel: string, date: string, count: number, lang?: QuizLang) {
  const mcqs = await issueMcqs(date, count);
  if (!mcqs.length) return;
  await tg("sendMessage", {
    chat_id: channel,
    text:
      lang === "hi"
        ? `🧠 <b>आज का क्विज़</b>\nआज के अंक से ${mcqs.length} प्रश्न। उत्तर दें और खुद को जाँचें! 👇`
        : lang === "en"
          ? `🧠 <b>Today's quiz</b>\n${mcqs.length} questions from today's magazine. Answer and check yourself! 👇`
          : `🧠 <b>आज का क्विज़ | Today's quiz</b>\n${mcqs.length} questions from today's magazine. Answer and check yourself! 👇`,
    parse_mode: "HTML",
  });
  await pause(1500);
  // Channels allow about 20 messages a minute.
  await sendQuizPolls(channel, mcqs, true, 3000, lang);
}

// Posts a due issue: the English PDF to the English channel and the Hindi PDF
// to the Hindi channel (one PDF for an older bilingual issue). Each post is
// recorded as it goes, so a retry after a failure only sends what is missing.
async function runMagazineTick() {
  const { data: claimed, error } = await supabase.rpc("ca_claim_due_issue");
  if (error) {
    if (!isMissingTable(error) && error.code !== "PGRST202") console.error("magazine claim", error.message);
    return;
  }
  const issue = ((claimed ?? []) as MagazineIssue[])[0];
  if (!issue) return;
  try {
    const { data: setting } = await supabase
      .from("bot_settings")
      .select("value")
      .eq("key", "ca_magazine")
      .maybeSingle();
    const magazine = (setting?.value ?? {}) as {
      channel?: string;
      channel_hi?: string;
      channel_quiz?: boolean;
      channel_quiz_count?: number;
    };
    const channel = String(magazine.channel ?? "").trim();
    if (!channel) throw new Error("No channel set in Magazine settings");
    const channelHi = String(magazine.channel_hi ?? "").trim() || channel;
    type Edition = {
      lang?: QuizLang;
      path: string;
      caption: string | null;
      channel: string;
      posted: number | null;
      column: "telegram_message_id" | "telegram_message_id_hi";
    };
    const editions: Edition[] = issue.pdf_path_hi
      ? [
          { lang: "en", path: issue.pdf_path, caption: issue.caption, channel, posted: issue.telegram_message_id, column: "telegram_message_id" },
          { lang: "hi", path: issue.pdf_path_hi, caption: issue.caption_hi, channel: channelHi, posted: issue.telegram_message_id_hi, column: "telegram_message_id_hi" },
        ]
      : [{ path: issue.pdf_path, caption: issue.caption, channel, posted: issue.telegram_message_id, column: "telegram_message_id" }];
    const sentNow: Edition[] = [];
    for (const ed of editions) {
      if (ed.posted) continue;
      const { data: file, error: dErr } = await supabase.storage.from("ca-magazines").download(ed.path);
      if (dErr || !file) throw new Error(dErr?.message ?? "PDF not found");
      const form = new FormData();
      form.append("chat_id", ed.channel);
      form.append("document", file, ed.path.split("/").pop() ?? "magazine.pdf");
      if (ed.caption) {
        form.append("caption", ed.caption);
        form.append("parse_mode", "HTML");
      }
      const res = await fetch(`${TG}/sendDocument`, { method: "POST", body: form });
      const json = await res.json().catch(() => ({}));
      if (!json.ok) throw new Error(`${ed.lang === "hi" ? "Hindi issue: " : ed.lang === "en" ? "English issue: " : ""}${json.description ?? `Telegram error ${res.status}`}`);
      await supabase.from("ca_issues").update({ [ed.column]: json.result?.message_id ?? null }).eq("id", issue.id);
      sentNow.push(ed);
    }
    await supabase
      .from("ca_issues")
      .update({ status: "posted", posted_at: new Date().toISOString(), error: null })
      .eq("id", issue.id);
    // The quiz never fails the post: the PDFs are already out. One channel
    // with both issues gets one quiz in both languages.
    if (issue.kind === "daily" && magazine.channel_quiz !== false) {
      const count = Math.min(10, Math.max(1, magazine.channel_quiz_count ?? 5));
      const shared = editions.length === 2 && channelHi === channel;
      const quizzes = shared ? (sentNow.length ? [{ channel, lang: undefined }] : []) : sentNow;
      for (const q of quizzes) {
        try {
          await postChannelQuiz(q.channel, issue.period, count, q.lang);
        } catch (e) {
          console.error("channel quiz", e);
        }
      }
    }
  } catch (e) {
    console.error("magazine post", e);
    await supabase
      .from("ca_issues")
      .update({ status: "failed", error: e instanceof Error ? e.message : String(e) })
      .eq("id", issue.id);
  }
}

// The magazine's admin chat: its test chat in Magazine settings.
async function isMagazineAdmin(chat_id: number): Promise<boolean> {
  const { data: setting } = await supabase
    .from("bot_settings")
    .select("value")
    .eq("key", "ca_magazine")
    .maybeSingle();
  const admin = String((setting?.value as { test_chat_id?: string } | null)?.test_chat_id ?? "").trim();
  return !!admin && admin === String(chat_id);
}

// ---------- Reviewing the day's stories from Telegram (admin only) ----------
// /stories [YYYY-MM-DD], or "Keep or drop stories" under the "draft ready"
// message: one story card at a time with Keep / Drop.
async function dayStories(date: string): Promise<TriageStory[]> {
  const { data } = await supabase
    .from("ca_items")
    .select("id,headline,category,importance,status,position,needs_enrich,content")
    .eq("issue_date", date)
    .order("position")
    .order("created_at");
  return triageOrder((data ?? []) as TriageStory[]);
}

// Stories can't change once the day's issue is scheduled or posted.
async function dayLocked(date: string): Promise<boolean> {
  const { data } = await supabase
    .from("ca_issues")
    .select("status")
    .eq("kind", "daily")
    .eq("period", date)
    .in("status", ["scheduled", "posting", "posted"])
    .maybeSingle();
  return !!data;
}

// The latest day with stories (usually the draft being reviewed).
async function latestStoryDate(): Promise<string> {
  const { data } = await supabase
    .from("ca_items")
    .select("issue_date")
    .order("issue_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { issue_date?: string } | null)?.issue_date ?? "";
}

async function sendStories(chat_id: number, arg: string | undefined) {
  const date = arg && /^\d{4}-\d{2}-\d{2}$/.test(arg) ? arg : await latestStoryDate();
  const rows = date ? await dayStories(date) : [];
  if (!rows.length) {
    await tg("sendMessage", { chat_id, text: `No stories${date ? ` for ${date}` : ""} yet.` });
    return;
  }
  await tg("sendMessage", { chat_id, parse_mode: "HTML", ...storyCard(rows, 0) });
}

// ---- Changing a story's text from its card: the admin replies with it ----
// "Edit text" on a story card (or "Write my own" on a house style note) asks
// for one part; the next message from the admin's chat is its new text.
const editKey = (chat_id: number) => `ca_story_edit:${chat_id}`;
const EDIT_MS = 15 * 60_000;
type PendingEdit = { item_id: string; part: string };
type StoryRow = {
  id: string;
  issue_date: string;
  facts: unknown;
  source_ids: unknown;
  content: StyleContent | null;
  context_sources: unknown;
  syllabus_topic_id: string | null;
  unit: string | null;
};
const lockedText = (date: string) =>
  `The issue for ${date} is already scheduled or posted. Cancel the schedule in the admin panel to change it.`;
const escHtml = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const isPoint = (part: string) => part.startsWith("point ");

async function pendingEdit(chat_id: number): Promise<PendingEdit | null> {
  const { data } = await supabase.from("bot_settings").select("value").eq("key", editKey(chat_id)).maybeSingle();
  const v = (data?.value ?? null) as { item_id?: string; part?: string; at?: string } | null;
  if (!v?.item_id || Date.now() - Date.parse(v.at ?? "") > EDIT_MS) return null;
  return { item_id: v.item_id, part: v.part ?? "headline" };
}

async function loadStory(item_id: string): Promise<StoryRow | null> {
  const { data } = await supabase
    .from("ca_items")
    .select("id,issue_date,facts,source_ids,content,context_sources,syllabus_topic_id,unit")
    .eq("id", item_id)
    .maybeSingle();
  return (data as StoryRow | null) ?? null;
}

// A change to a story's text from Telegram, kept like an edit in the admin
// panel: the story as it was goes into its History (once per editing
// session), and only the latest versions are kept.
const VERSIONS_KEPT = 10;
async function saveStoryContent(item: StoryRow, content: StyleContent): Promise<boolean> {
  const { data: lastVersion } = await supabase
    .from("ca_item_versions")
    .select("reason,created_at")
    .eq("item_id", item.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const v = lastVersion as { reason: string; created_at: string } | null;
  if (item.content && !(v?.reason === "edit" && Date.now() - Date.parse(v.created_at) < 30 * 60_000)) {
    await supabase.from("ca_item_versions").insert({
      item_id: item.id,
      reason: "edit",
      headline: item.content.headline?.en || item.content.headline?.hi || "",
      snapshot: {
        facts: item.facts,
        source_ids: item.source_ids,
        content: item.content,
        context_sources: item.context_sources,
        syllabus_topic_id: item.syllabus_topic_id,
        unit: item.unit,
      },
    });
    const { data: old } = await supabase
      .from("ca_item_versions")
      .select("id")
      .eq("item_id", item.id)
      .order("created_at", { ascending: false })
      .range(VERSIONS_KEPT, VERSIONS_KEPT + 100);
    const ids = ((old ?? []) as { id: string }[]).map((r) => r.id);
    if (ids.length) await supabase.from("ca_item_versions").delete().in("id", ids);
  }
  const { error } = await supabase
    .from("ca_items")
    .update({ content, updated_at: new Date().toISOString() })
    .eq("id", item.id);
  if (error) console.error("ca story edit", error.message);
  return !error;
}

// The other language written to match a line the admin changed (one AI
// request), so Hindi and English stay the same. Unchanged when SAATHI can't;
// the admin panel's Hindi–English check then shows the difference.
async function syncOther(
  content: StyleContent,
  part: string,
  lang: "en" | "hi",
): Promise<{ content: StyleContent; synced: boolean }> {
  const to = lang === "en" ? "hi" : "en";
  const text = partText(content, part, lang);
  if (!text) return { content, synced: false };
  try {
    const headline = content.headline?.en || content.headline?.hi || "";
    const out = parseSync(
      await saathiComplete(LOVABLE_API_KEY, syncMessages(headline, [{ label: partName(part), to, text }])),
      1,
    );
    return out ? { content: withPart(content, part, to, out[0]), synced: true } : { content, synced: false };
  } catch (e) {
    console.error("ca language sync", e instanceof Error ? e.message : e);
    return { content, synced: false };
  }
}

async function askEdit(chat_id: number, item_id: string, part: string) {
  const item = await loadStory(item_id);
  if (!item?.content) {
    await tg("sendMessage", { chat_id, text: "This story isn't written yet." });
    return;
  }
  if (await dayLocked(item.issue_date)) {
    await tg("sendMessage", { chat_id, text: lockedText(item.issue_date) });
    return;
  }
  const now = [partText(item.content, part, "hi"), partText(item.content, part, "en")].filter(Boolean);
  if (isPoint(part) && !now.length) {
    await tg("sendMessage", { chat_id, text: "That point is no longer in the story." });
    return;
  }
  await supabase.from("bot_settings").upsert({
    key: editKey(chat_id),
    value: { item_id, part, at: new Date().toISOString() },
    updated_at: new Date().toISOString(),
  });
  const label = part === "why" ? "“Why it matters” line" : partName(part).toLowerCase();
  const headline = item.content.headline?.hi || item.content.headline?.en || "";
  const shown = now.map((t, i) => (i ? escHtml(t) : `<b>${escHtml(t)}</b>`)).join("\n") || "(empty)";
  await tg("sendMessage", {
    chat_id,
    parse_mode: "HTML",
    text: `${
      part === "headline"
        ? "✏️ Send the new headline for:"
        : `✏️ Send the new ${label} of “${escHtml(headline)}”. Now:`
    }\n${shown}\n\nOne line in Hindi or English (the other is written to match), or one in each. /cancel to stop.`,
    reply_markup: { force_reply: true, input_field_placeholder: `New ${label}` },
  });
}

// The reply with the new text: saved like an edit in the admin panel.
async function saveEdit(chat_id: number, edit: PendingEdit, text: string) {
  const next = parseBiLines(text, edit.part === "headline" ? 200 : 400);
  if (!next) {
    await tg("sendMessage", { chat_id, text: "Send the new text (Hindi and/or English), or /cancel." });
    return;
  }
  await supabase.from("bot_settings").delete().eq("key", editKey(chat_id));
  const item = await loadStory(edit.item_id);
  if (!item?.content) {
    await tg("sendMessage", { chat_id, text: "That story is no longer there." });
    return;
  }
  if (await dayLocked(item.issue_date)) {
    await tg("sendMessage", {
      chat_id,
      text: `The issue for ${item.issue_date} is already scheduled or posted, so the ${partName(edit.part).toLowerCase()} wasn't changed.`,
    });
    return;
  }
  if (isPoint(edit.part) && !partText(item.content, edit.part, "en") && !partText(item.content, edit.part, "hi")) {
    await tg("sendMessage", { chat_id, text: "That point is no longer in the story." });
    return;
  }
  let content = item.content;
  for (const lang of ["en", "hi"] as const) {
    const t = next[lang];
    if (t) content = withPart(content, edit.part, lang, t);
  }
  // One language sent: the other is written to match.
  const only = next.en && !next.hi ? "en" : next.hi && !next.en ? "hi" : null;
  const sync = only ? await syncOther(content, edit.part, only) : null;
  if (sync) content = sync.content;
  if (!(await saveStoryContent(item, content))) {
    await tg("sendMessage", { chat_id, text: "Couldn't save it. Try again in the admin panel." });
    return;
  }
  // Back to the story's card, to carry on (or to the house style notes left,
  // when the text was written instead of a note's fix).
  const [rows, style] = await Promise.all([dayStories(item.issue_date), styleState(item.issue_date)]);
  const at = rows.findIndex((r) => r.id === item.id);
  await tg("sendMessage", {
    chat_id,
    text: `✅ ${partName(edit.part)} saved.${
      only ? (sync?.synced ? ` ${only === "en" ? "Hindi" : "English"} updated to match.` : ` ${only === "en" ? "Hindi" : "English"} not updated: check it in the admin panel.`) : ""
    }`,
    ...(style.open.length
      ? {
          reply_markup: {
            inline_keyboard: [[{ text: `✍️ House style notes left: ${style.open.length}`, callback_data: `${STYLE_TG}s:${item.issue_date}` }]],
          },
        }
      : {}),
  });
  if (at >= 0) await tg("sendMessage", { chat_id, parse_mode: "HTML", ...storyCard(rows, at) });
}

// ---------- House style notes from Telegram (admin only) ----------
// "Fix house style" under the "draft ready" message, or /style [date]: the
// day's open notes from the house style check, one at a time, to put
// SAATHI's fix in or keep the text. Saved like the admin panel does.
async function styleState(date: string) {
  const [{ data: saved }, { data: mag }, rows] = await Promise.all([
    supabase.from("bot_settings").select("value").eq("key", `ca_style_check:${date}`).maybeSingle(),
    supabase.from("bot_settings").select("value").eq("key", "ca_magazine").maybeSingle(),
    dayStories(date),
  ]);
  const check = (saved?.value ?? null) as StyleCheck | null;
  const rules = ((mag?.value as { style_rules?: string[] } | null)?.style_rules ?? []).filter(Boolean);
  const status = styleStatus(check, rows as unknown as { id: string; status: string; content: StyleContent | null }[], rules);
  const open = orderBreaks(status?.open ?? [], rows.map((r) => r.id));
  const headlines = new Map(rows.map((r) => [r.id, r.content?.headline?.en || r.content?.headline?.hi || r.headline]));
  return { check, status, open, headlines };
}

async function showStyle(chat_id: number, message_id: number | null, date: string, what = "s", id = "") {
  let { check, status, open, headlines } = await styleState(date);
  const show = (card: { text: string; reply_markup?: unknown }) =>
    message_id
      ? tg("editMessageText", { chat_id, message_id, parse_mode: "HTML", ...card })
      : tg("sendMessage", { chat_id, parse_mode: "HTML", ...card });
  if (!status || !check) {
    await tg("sendMessage", {
      chat_id,
      text: status
        ? `The stories for ${date} haven't been checked against your house style yet. The evening collection does it, or press Check in the admin panel (Before you schedule).`
        : `No house style rules, or no written stories for ${date}.`,
    });
    return;
  }
  if (!status.checked) {
    await tg("sendMessage", {
      chat_id,
      text: `Your house style rules changed since the stories for ${date} were checked. Check them again in the admin panel (Before you schedule).`,
    });
    return;
  }
  let at = Math.max(0, open.findIndex((b) => b.id === id));
  let handled = false;
  if (what === "a" || what === "k") {
    const b = open.find((x) => x.id === id);
    if (b && (await dayLocked(date))) {
      await tg("sendMessage", { chat_id, text: lockedText(date) });
      return;
    }
    if (b && what === "a") {
      const item = await loadStory(b.item_id);
      if (!item?.content || partText(item.content, b.part, b.lang) !== b.text) {
        await tg("sendMessage", { chat_id, text: "That part of the story changed since the check, so the fix wasn't put in." });
        return;
      }
      // The fix, and the other language written to match it.
      const fixed = (await syncOther(withPart(item.content, b.part, b.lang, b.fix), b.part, b.lang)).content;
      if (!(await saveStoryContent(item, fixed))) {
        await tg("sendMessage", { chat_id, text: "Couldn't save the fix. Try again in the admin panel." });
        return;
      }
      check = afterFix(check, b, item.content, fixed);
    } else if (b) {
      check = afterKeep(check, b);
    }
    if (b) {
      await supabase.from("bot_settings").upsert({
        key: `ca_style_check:${date}`,
        value: check,
        updated_at: new Date().toISOString(),
      });
      // The next note takes this one's place.
      ({ open, headlines } = await styleState(date));
      handled = true;
    }
  } else if (what === "n") {
    at = open.length ? (at + 1) % open.length : 0;
  } else if (what === "p") {
    at = open.length ? (at - 1 + open.length) % open.length : 0;
  }
  if (at >= open.length) at = 0;
  await show(open.length ? styleCard(open, at, date, headlines) : styleDoneCard(date, handled));
}

async function handleStyleTap(chat_id: number, message_id: number, data: string) {
  const [what = "", date = "", id = ""] = data.slice(STYLE_TG.length).split(":");
  if (what === "x") return;
  if (!(await isMagazineAdmin(chat_id))) {
    await tg("sendMessage", { chat_id, text: "Only the magazine's admin chat can fix house style notes." });
    return;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
  await showStyle(chat_id, what === "s" ? null : message_id, date, what, id);
}

async function handleStoryTap(chat_id: number, message_id: number, data: string) {
  const [what = "", arg = ""] = data.slice(TRIAGE.length).split(":");
  if (what === "x") return;
  if (!(await isMagazineAdmin(chat_id))) {
    await tg("sendMessage", { chat_id, text: "Only the magazine's admin chat can review stories." });
    return;
  }
  if (what === "h") {
    const part = partFromCode(data.slice(TRIAGE.length).split(":")[2]);
    if (part) await askEdit(chat_id, arg, part);
    return;
  }
  let date = arg;
  if (!/^[slr]$/.test(what)) {
    const { data: it } = await supabase.from("ca_items").select("issue_date").eq("id", arg).maybeSingle();
    if (!it) {
      await tg("editMessageText", { chat_id, message_id, text: "That story is no longer there. Send /stories to start again." });
      return;
    }
    date = (it as { issue_date: string }).issue_date;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
  if (what === "d" || what === "i") {
    if (await dayLocked(date)) {
      await tg("sendMessage", {
        chat_id,
        text: `The issue for ${date} is already scheduled or posted. Cancel the schedule in the admin panel to change its stories.`,
      });
      return;
    }
    await supabase
      .from("ca_items")
      .update({ status: what === "d" ? "dropped" : "included", updated_at: new Date().toISOString() })
      .eq("id", arg);
  }
  const rows = await dayStories(date);
  if (!rows.length) return;
  const at = nextIndex(what, rows.findIndex((r) => r.id === arg), rows.length);
  // "Edit text": the same message shows the story's parts to choose from.
  const card =
    what === "e" && rows[at]?.content
      ? editCard(rows, at)
      : at >= rows.length
        ? summaryCard(rows, date)
        : storyCard(rows, at);
  if (what === "s") await tg("sendMessage", { chat_id, parse_mode: "HTML", ...card });
  else await tg("editMessageText", { chat_id, message_id, parse_mode: "HTML", ...card });
}

// "Approve & schedule" under the magazine's "draft ready" message. Only the
// magazine's admin chat (its test chat) may approve. The website makes the
// PDF and schedules the issue on its next minute tick, and answers here.
type InlineKeyboard = { inline_keyboard?: { text: string; url?: string; callback_data?: string }[][] };

async function requestIssueApproval(
  chat_id: number,
  message_id: number,
  date: string,
  markup: InlineKeyboard | undefined,
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
  if (!(await isMagazineAdmin(chat_id))) {
    await tg("sendMessage", { chat_id, text: "Only the magazine's admin chat can approve an issue." });
    return;
  }
  const { error } = await supabase.from("bot_settings").upsert({
    key: `ca_approve:${date}`,
    value: { chat_id, at: new Date().toISOString() },
    updated_at: new Date().toISOString(),
  });
  if (error) {
    console.error("ca approve", error.message);
    await tg("sendMessage", { chat_id, text: "Couldn't record the approval. Approve it in the admin panel." });
    return;
  }
  // The button goes, so it can't be tapped twice; the links stay.
  const rows = (markup?.inline_keyboard ?? []).filter(
    (row) => !row.some((b) => b.callback_data?.startsWith("ca_ok:")),
  );
  await tg("editMessageReplyMarkup", { chat_id, message_id, reply_markup: { inline_keyboard: rows } });
  await tg("sendMessage", {
    chat_id,
    text: "⏳ Approving: the PDF is being made. I'll tell you here when the issue is scheduled (usually within two minutes).",
  });
}

// ---------- Daily quiz with a streak ----------
// Students who opt in get the latest issue's MCQs as quiz polls at the hour
// they pick (India time). Finishing every quiz they are sent keeps the streak;
// days without a new issue send nothing and never break it.
type DailyRow = DailyQuizState & {
  chat_id: number;
  enabled: boolean;
  send_hour: number;
  // The language the student picked (none yet: both languages).
  lang: QuizLang | null;
  quiz: {
    issue: string;
    date: string;
    polls: { id: string; correct: number }[];
    answered?: string[];
    correct?: number;
  } | null;
};

async function getDaily(chat_id: number): Promise<DailyRow | null> {
  const { data, error } = await supabase.from("bot_daily_quiz").select("*").eq("chat_id", chat_id).maybeSingle();
  if (error && !isMissingTable(error)) console.error("daily quiz", error.message);
  return (data as DailyRow | null) ?? null;
}

// The newest daily issue already posted to the channel.
async function latestPostedIssue(): Promise<string | null> {
  const { data } = await supabase
    .from("ca_issues")
    .select("period")
    .eq("kind", "daily")
    .eq("status", "posted")
    .order("period", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { period?: string } | null)?.period ?? null;
}

const LANG_NAME: Record<QuizLang, string> = { hi: "हिंदी", en: "English" };

function dailyMenu(row: DailyRow | null) {
  const on = !!row?.enabled;
  const hour = row?.send_hour ?? DAILY_QUIZ_DEFAULT_HOUR;
  const text =
    `🔥 <b>Daily Current Affairs Quiz</b>\n` +
    `${DAILY_QUIZ_SIZE} questions from the latest FlashGyan magazine every day.\n` +
    `रोज़ ${DAILY_QUIZ_SIZE} प्रश्न, नवीनतम FlashGyan पत्रिका से।\n\n` +
    (on
      ? `✅ On · every day at <b>${hourLabel(hour)}</b> (India time)\n`
      : `⏸ Off. Pick a time to start:\n`) +
    `🗣 Language / भाषा: <b>${row?.lang ? LANG_NAME[row.lang] : "not chosen / चुनें"}</b>\n` +
    `🔥 Streak: <b>${row?.streak ?? 0}</b> day${(row?.streak ?? 0) === 1 ? "" : "s"}` +
    (row?.best_streak ? ` · best ${row.best_streak}` : "");
  const hours = DAILY_QUIZ_HOURS.map((h) => ({
    text: `${on && h === hour ? "✓ " : ""}${hourLabel(h)}`,
    callback_data: `daily_on_${h}`,
  }));
  const rows: { text: string; callback_data: string }[][] = [hours.slice(0, 3), hours.slice(3)];
  rows.push(
    (["hi", "en"] as const).map((l) => ({
      text: `${row?.lang === l ? "✓ " : ""}${LANG_NAME[l]}`,
      callback_data: `daily_lang_${l}`,
    })),
  );
  rows.push([{ text: "▶️ Take today's quiz / आज का क्विज़", callback_data: "daily_now" }]);
  if (on) rows.push([{ text: "⏹ Stop daily quiz", callback_data: "daily_off" }]);
  return { text, reply_markup: { inline_keyboard: rows } };
}

async function sendDailyMenu(chat_id: number, message_id?: number) {
  const menu = dailyMenu(await getDaily(chat_id));
  if (message_id)
    await tg("editMessageText", { chat_id, message_id, parse_mode: "HTML", ...menu });
  else await tg("sendMessage", { chat_id, parse_mode: "HTML", ...menu });
}

// Before the first quiz: which language? `then` is what to do after
// ("on<hour>" or "now").
async function askDailyLang(chat_id: number, then: string, message_id?: number) {
  const body = {
    chat_id,
    text: "🗣 Which language should your daily quiz be in?\nआपका दैनिक क्विज़ किस भाषा में हो?",
    reply_markup: {
      inline_keyboard: [
        (["hi", "en"] as const).map((l) => ({ text: LANG_NAME[l], callback_data: `daily_lang_${l}:${then}` })),
      ],
    },
  };
  if (message_id) await tg("editMessageText", { message_id, ...body });
  else await tg("sendMessage", body);
}

async function setDaily(chat_id: number, patch: Partial<DailyRow>) {
  const { error } = await supabase
    .from("bot_daily_quiz")
    .upsert({ chat_id, ...patch, updated_at: new Date().toISOString() }, { onConflict: "chat_id" });
  if (error) throw new Error(error.message);
}

// Sends the latest issue's quiz to one student, once a day. Returns what
// happened, for the student's own "take it now" request.
async function deliverDailyQuiz(
  row: DailyRow,
  issue: string,
  mcqs: QuizMcq[],
): Promise<"sent" | "already" | "no_issue"> {
  if (row.quiz?.issue === issue) return "no_issue";
  const today = istNow().date;
  // Claim today's send first, so two runs never send twice.
  const { data: claimed, error } = await supabase.rpc("bot_daily_quiz_claim", {
    p_chat_id: row.chat_id,
    p_today: today,
  });
  if (error) throw new Error(error.message);
  if (claimed !== true) return "already";
  const streak = streakOnSend(row);
  const lang = row.lang ?? undefined;
  const res = await tg("sendMessage", {
    chat_id: row.chat_id,
    text:
      lang === "hi"
        ? `🧠 <b>दैनिक क्विज़</b> · ${issue} की FlashGyan पत्रिका से ${mcqs.length} प्रश्न\n` +
          `🔥 स्ट्रीक: <b>${streak}</b> · स्ट्रीक जारी रखने के लिए सभी ${mcqs.length} के उत्तर दें`
        : `🧠 <b>Daily quiz</b> · ${mcqs.length} questions from the FlashGyan magazine of ${issue}\n` +
          `🔥 Streak: <b>${streak}</b> · answer all ${mcqs.length} to keep it going` +
          // Students from before languages could be picked: how to pick one.
          (lang ? "" : `\n🗣 Pick Hindi or English for your quiz / भाषा चुनें: /daily`),
    parse_mode: "HTML",
  });
  if (res.status === 403) {
    // Blocked: stop sending to them.
    await supabase.from("bot_users").update({ blocked: true }).eq("chat_id", row.chat_id);
    await setDaily(row.chat_id, { enabled: false });
    return "sent";
  }
  const polls = await sendQuizPolls(row.chat_id, mcqs, false, 60, lang);
  await setDaily(row.chat_id, {
    streak,
    quiz: { issue, date: today, polls, answered: [], correct: 0 },
  });
  return "sent";
}

async function takeDailyNow(chat_id: number) {
  let row = await getDaily(chat_id);
  if (!row) {
    await setDaily(chat_id, { enabled: true, send_hour: DAILY_QUIZ_DEFAULT_HOUR });
    row = await getDaily(chat_id);
  }
  const issue = await latestPostedIssue();
  const mcqs = issue ? await issueMcqs(issue, DAILY_QUIZ_SIZE) : [];
  if (!row || !issue || !mcqs.length) {
    await tg("sendMessage", { chat_id, text: "No quiz is ready yet. It comes with the next magazine issue." });
    return;
  }
  const result = await deliverDailyQuiz(row, issue, mcqs);
  if (result === "no_issue")
    await tg("sendMessage", {
      chat_id,
      text: "You already have the latest issue's quiz above 👆. The next one comes with tomorrow's magazine.",
    });
  else if (result === "already")
    await tg("sendMessage", { chat_id, text: "Today's quiz is already above 👆. See you tomorrow!" });
}

// Sends due quizzes: students whose hour has come and who haven't had one today.
async function runDailyQuizTick() {
  const { date, hour } = istNow();
  const { data, error } = await supabase
    .from("bot_daily_quiz")
    .select("*")
    .eq("enabled", true)
    .lte("send_hour", hour)
    .or(`last_sent_date.is.null,last_sent_date.lt.${date}`)
    .limit(40);
  if (error) {
    if (!isMissingTable(error)) console.error("daily quiz tick", error.message);
    return;
  }
  const rows = (data ?? []) as DailyRow[];
  if (!rows.length) return;
  const issue = await latestPostedIssue();
  if (!issue) return;
  const mcqs = await issueMcqs(issue, DAILY_QUIZ_SIZE);
  if (!mcqs.length) return;
  const started = Date.now();
  for (const row of rows) {
    if (Date.now() - started > TICK_BUDGET_MS) break;
    if (row.quiz?.issue === issue) continue;
    try {
      await deliverDailyQuiz(row, issue, mcqs);
    } catch (e) {
      console.error("daily quiz send", row.chat_id, e);
    }
  }
}

// One answer to a daily quiz poll; after the last one, the score and streak.
async function handleDailyAnswer(chat_id: number, poll_id: string, option: number) {
  const { data, error } = await supabase.rpc("bot_daily_quiz_answer", {
    p_chat_id: chat_id,
    p_poll_id: poll_id,
    p_option: option,
  });
  if (error) {
    if (!isMissingTable(error) && error.code !== "PGRST202") console.error("daily answer", error.message);
    return;
  }
  const row = ((data ?? []) as DailyRow[])[0];
  const quiz = row?.quiz;
  if (!row || !quiz || (quiz.answered?.length ?? 0) < quiz.polls.length) return;
  const done = streakOnDone(row, quiz.date);
  await setDaily(chat_id, done);
  await tg("sendMessage", {
    chat_id,
    text: quizResultText(quiz.correct ?? 0, quiz.polls.length, done.streak, done.best_streak, row.lang ?? undefined),
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [{ text: "📱 Download FlashGyan App", url: appUrl("daily_quiz") }],
        [{ text: "⏰ Quiz time & streak", callback_data: "daily_menu" }],
      ],
    },
  });
}

// ---------- Broadcasts ----------
// Sends due broadcasts in batches. Runs when the admin panel asks for it, on a
// schedule (optional cron), and opportunistically while the bot is in use.
// Each run sends for up to ~20 seconds, saves its place, and hands over to a
// fresh run if recipients remain.
const TICK_BUDGET_MS = 20_000;
const BATCH_SIZE = 50;
let lastTickAt = 0;

type BroadcastRow = {
  id: string;
  text: string;
  media_url: string | null;
  media_type: "photo" | "document" | null;
  buttons: BotButton[];
  segment: Record<string, unknown>;
  cursor: number | null;
  total: number;
  sent: number;
  failed: number;
  blocked: number;
};

const TICK_URL = `${SUPABASE_URL}/functions/v1/telegram-demo-bot?task=broadcast`;

async function runBroadcastTick(): Promise<{ processed: number; more: boolean }> {
  const started = Date.now();
  let processed = 0;
  while (Date.now() - started < TICK_BUDGET_MS) {
    const { data: claimed, error } = await supabase.rpc("bot_claim_broadcast", { lock_seconds: 60 });
    if (error) {
      if (!isMissingTable(error) && error.code !== "PGRST202") console.error("claim", error.message);
      return { processed, more: false };
    }
    const b = ((claimed ?? []) as BroadcastRow[])[0];
    if (!b) return { processed, more: false };

    if (b.cursor === null && b.total === 0) {
      const { data: count } = await supabase.rpc("bot_segment_count", { segment: b.segment });
      b.total = Number(count ?? 0);
      await supabase.from("bot_broadcasts").update({ total: b.total }).eq("id", b.id);
    }

    let finished = false;
    while (Date.now() - started < TICK_BUDGET_MS) {
      const { data: rows } = await supabase.rpc("bot_segment_users", {
        segment: b.segment,
        after_chat_id: b.cursor,
        max_rows: BATCH_SIZE,
      });
      const ids = ((rows ?? []) as { chat_id: number }[]).map((r) => r.chat_id);
      if (ids.length === 0) {
        finished = true;
        break;
      }
      for (const chat_id of ids) {
        const res = await sendBotMessage(TELEGRAM_TOKEN, chat_id, messageFrom({ ...b, response_text: b.text }));
        if (res.ok) b.sent++;
        else if (res.blocked) {
          b.blocked++;
          await supabase.from("bot_users").update({ blocked: true }).eq("chat_id", chat_id);
        } else b.failed++;
        b.cursor = chat_id;
        processed++;
        await new Promise((r) => setTimeout(r, BROADCAST_DELAY_MS));
        if (Date.now() - started >= TICK_BUDGET_MS) break;
      }
      // Save progress after every batch so a crash never resends to anyone.
      await supabase
        .from("bot_broadcasts")
        .update({ cursor: b.cursor, sent: b.sent, failed: b.failed, blocked: b.blocked })
        .eq("id", b.id);
      if (await isCancelled(b.id)) break;
    }

    const cancelled = await isCancelled(b.id);
    await supabase
      .from("bot_broadcasts")
      .update(
        finished || cancelled
          ? { status: cancelled ? "cancelled" : "done", finished_at: new Date().toISOString(), locked_until: null }
          : { locked_until: null },
      )
      .eq("id", b.id);
    if (!finished && !cancelled) {
      // Out of time: let a fresh run continue where this one stopped.
      continueInBackground(fetch(TICK_URL, { method: "POST" }).then(() => undefined));
      return { processed, more: true };
    }
  }
  return { processed, more: false };
}

async function isCancelled(id: string): Promise<boolean> {
  const { data } = await supabase.from("bot_broadcasts").select("status").eq("id", id).maybeSingle();
  return (data as { status?: string } | null)?.status === "cancelled";
}

function continueInBackground(p: Promise<unknown>) {
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(p.catch((e) => console.error("background", e)));
  else p.catch((e) => console.error("background", e));
}

// ---------- Commands ----------
function parseCommand(text: string): { name: string; args: string } | null {
  const m = /^\/([A-Za-z0-9_]{1,32})(?:@\S+)?(?:\s+([\s\S]*))?$/.exec(text);
  return m ? { name: m[1].toLowerCase(), args: (m[2] ?? "").trim() } : null;
}

async function runCommand(
  cmd: BotCommand,
  args: string,
  ctx: { chat_id: number; user_id: number; isGroup: boolean; languageCode?: string; commands: BotCommand[] },
) {
  await logEvent(ctx.chat_id, cmd.command === "start" ? "start" : "command", cmd.command);
  if (cmd.action === "message") {
    await sendBotMessage(TELEGRAM_TOKEN, ctx.chat_id, messageFrom(cmd), !ctx.isGroup);
    return;
  }
  switch (cmd.builtin) {
    case "ask":
      await handleSaathiAsk(ctx.chat_id, ctx.user_id, args);
      return;
    case "answer": {
      await queueMainsAnswer(ctx.chat_id, ctx.user_id, args);
      return;
    }
    case "flashcards":
      await sendSubjectPicker(ctx.chat_id, "flashcards");
      return;
    case "mcq":
      await supabase.from("bot_sessions").delete().eq("chat_id", ctx.chat_id);
      await sendSubjectPicker(ctx.chat_id, "mcq");
      return;
    case "daily":
      await sendDailyMenu(ctx.chat_id);
      return;
    case "check":
      if (!ctx.isGroup) await startCheck(ctx.chat_id, args);
      return;
    case "help":
      await sendHelp(ctx.chat_id, ctx.languageCode, ctx.commands);
      return;
    default:
      await sendMainMenu(ctx.chat_id);
  }
}

// The bot's original fixed behaviour, used until the admin migration is applied.
async function handleTextLegacy(chat_id: number, user_id: number, text: string, isGroup: boolean) {
  const parsed = parseCommand(text);
  if (parsed?.name === "answer" && !isGroup) {
    await queueMainsAnswer(chat_id, user_id, parsed.args);
    return;
  }
  if (text === "/ask" || text.startsWith("/ask ") || text.startsWith("/ask@")) {
    await handleSaathiAsk(chat_id, user_id, text.replace(/^\/ask(@\S+)?\s*/i, "").trim());
    return;
  }
  if (isGroup) return;
  if (!parsed) {
    const session = await getCheckSession(chat_id);
    if (session) return handleCheckText(session, text);
  }
  if (parsed?.name === "daily") await sendDailyMenu(chat_id);
  else if (parsed?.name === "check") await startCheck(chat_id, parsed.args);
  else if (text.startsWith("/start") || text.startsWith("/study")) await sendMainMenu(chat_id);
  else await tg("sendMessage", { chat_id, text: DEFAULT_SETTINGS.fallback_text });
}

async function handleText(message: any) {
  const chat_id: number = message.chat.id;
  const chat_type: string = message.chat.type ?? "private";
  const isGroup = chat_type === "group" || chat_type === "supergroup";
  const user_id: number = message.from?.id ?? chat_id;
  const text: string = message.text.trim();

  if (!isGroup && /^\/cancel(?:@\S+)?$/i.test(text) && (await pendingEdit(chat_id))) {
    await supabase.from("bot_settings").delete().eq("key", editKey(chat_id));
    await tg("sendMessage", { chat_id, text: "Edit cancelled." });
    return;
  }
  if (!isGroup && /^\/cancel(?:@\S+)?$/i.test(text)) {
    await supabase.from("bot_check_sessions").delete().eq("chat_id", chat_id);
    await tg("sendMessage", { chat_id, text: "Answer check cancelled. Start again any time: /check" });
    return;
  }

  // The magazine admin's own command: reviewing the day's stories.
  if (!isGroup && /^\/stories(?:@\S+)?(?:\s|$)/i.test(text) && (await isMagazineAdmin(chat_id))) {
    await sendStories(chat_id, text.split(/\s+/)[1]);
    return;
  }
  // ...and the day's house style notes.
  if (!isGroup && /^\/style(?:@\S+)?(?:\s|$)/i.test(text) && (await isMagazineAdmin(chat_id))) {
    const arg = text.split(/\s+/)[1];
    const date = arg && /^\d{4}-\d{2}-\d{2}$/.test(arg) ? arg : await latestStoryDate();
    if (date) await showStyle(chat_id, null, date);
    else await tg("sendMessage", { chat_id, text: "No stories yet." });
    return;
  }
  // New text for a story, after "Edit text" on its card.
  if (!isGroup && !text.startsWith("/")) {
    const editing = await pendingEdit(chat_id);
    if (editing && (await isMagazineAdmin(chat_id))) {
      await saveEdit(chat_id, editing, text);
      return;
    }
  }

  const commands = await getCommands();
  if (!commands) return handleTextLegacy(chat_id, user_id, text, isGroup);

  const parsed = parseCommand(text);
  if (parsed) {
    const cmd = commands.find((c) => c.command === parsed.name && c.enabled);
    // In groups only commands marked for groups respond, so the bot stays quiet.
    if (cmd && (!isGroup || cmd.scope === "all")) {
      await runCommand(cmd, parsed.args, {
        chat_id,
        user_id,
        isGroup,
        languageCode: message.from?.language_code,
        commands,
      });
      return;
    }
    if (isGroup) return;
    const settings = await getSettings();
    await logEvent(chat_id, "fallback", parsed.name);
    await sendBotMessage(TELEGRAM_TOKEN, chat_id, { text: settings.fallback_text });
    return;
  }

  if (isGroup) return;
  const check = await getCheckSession(chat_id);
  if (check) {
    await handleCheckText(check, text);
    return;
  }
  const reply = findAutoReply(await getAutoReplies(), text);
  if (reply) {
    await logEvent(chat_id, "auto_reply", reply.keywords[0] ?? null);
    await supabase.rpc("bot_auto_reply_hit", { reply_id: reply.id });
    await sendBotMessage(TELEGRAM_TOKEN, chat_id, messageFrom(reply));
    return;
  }
  const settings = await getSettings();
  if (settings.free_text_to_saathi) {
    await handleSaathiAsk(chat_id, user_id, text);
    return;
  }
  await logEvent(chat_id, "fallback", null);
  await sendBotMessage(TELEGRAM_TOKEN, chat_id, { text: settings.fallback_text });
}

// Telegram tells the bot when a user blocks or unblocks it.
async function handleMyChatMember(update: any) {
  const chat_id = update?.chat?.id;
  const status = update?.new_chat_member?.status;
  if (!chat_id || update?.chat?.type !== "private" || !botAdminReady) return;
  const blocked = status === "kicked" || status === "left";
  await supabase.from("bot_users").update({ blocked }).eq("chat_id", chat_id);
}

// Requests from Telegram carry the secret set with setWebhook. Until a secret
// is configured in the admin panel, all requests are accepted as before.
async function verifyTelegramSecret(req: Request): Promise<boolean> {
  const got = req.headers.get("x-telegram-bot-api-secret-token");
  let expected = (await getSettings()).webhook_secret;
  if (expected && got !== expected) expected = (await getSettings(true)).webhook_secret;
  return !expected || got === expected;
}

// ---------- Webhook ----------
Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (url.searchParams.get("task") === "broadcast") {
    // Only sends broadcasts an admin already created and that are due, so it is
    // safe to trigger from cron or the admin panel without credentials. Replies
    // at once; sending continues in the background.
    continueInBackground(runBroadcastTick());
    continueInBackground(runMagazineTick());
    continueInBackground(runDailyQuizTick());
    return Response.json({ started: true });
  }
  if (req.method === "OPTIONS") return new Response("ok");
  if (req.method !== "POST") return new Response("ok");
  // Also loads settings, which tells the bot whether the admin tables exist.
  if (!(await verifyTelegramSecret(req))) return new Response("forbidden", { status: 401 });
  let update: any;
  try {
    update = await req.json();
  } catch {
    return new Response("bad json", { status: 400 });
  }

  // While the bot is in use, also pick up any scheduled broadcasts that are due.
  if (botAdminReady && Date.now() - lastTickAt > 60_000) {
    lastTickAt = Date.now();
    continueInBackground(runBroadcastTick());
    continueInBackground(runMagazineTick());
    continueInBackground(runDailyQuizTick());
  }

  try {
    if (update.my_chat_member) {
      await handleMyChatMember(update.my_chat_member);
    } else if (update.message?.text) {
      await trackUser(update.message.from, update.message.chat.id);
      await handleText(update.message);
    } else if (update.message?.photo || update.message?.document) {
      await trackUser(update.message.from, update.message.chat.id);
      await handleCheckPhoto(update.message);
    } else if (update.callback_query) {
      const cq = update.callback_query;
      const chat_id = cq.message.chat.id;
      const message_id = cq.message.message_id;
      const data: string = cq.data ?? "";
      await trackUser(cq.from, chat_id);
      await tg("answerCallbackQuery", { callback_query_id: cq.id });

      if (data === "check_go") {
        await runCheck(chat_id, null);
      } else if (data === "check_cancel") {
        await supabase.from("bot_check_sessions").delete().eq("chat_id", chat_id);
        await tg("sendMessage", { chat_id, text: "Answer check cancelled. Start again any time: /check" });
      } else if (data.startsWith(TRIAGE)) {
        await handleStoryTap(chat_id, message_id, data);
      } else if (data.startsWith(STYLE_TG)) {
        await handleStyleTap(chat_id, message_id, data);
      } else if (data.startsWith("ca_ok:")) {
        await requestIssueApproval(chat_id, message_id, data.slice("ca_ok:".length), cq.message.reply_markup);
      } else if (data === "daily_menu") {
        await sendDailyMenu(chat_id);
      } else if (data.startsWith("daily_on_")) {
        const h = parseInt(data.slice(9), 10);
        if (DAILY_QUIZ_HOURS.includes(h)) {
          // The language first, the first time.
          if (!(await getDaily(chat_id))?.lang) {
            await askDailyLang(chat_id, `on${h}`, message_id);
          } else {
            await logEvent(chat_id, "daily_quiz", `on ${h}`);
            await setDaily(chat_id, { enabled: true, send_hour: h });
            await sendDailyMenu(chat_id, message_id);
          }
        }
      } else if (data.startsWith("daily_lang_")) {
        const [l, then = ""] = data.slice("daily_lang_".length).split(":");
        if (l === "hi" || l === "en") {
          await logEvent(chat_id, "daily_quiz", `lang ${l}`);
          const h = parseInt(then.slice(2), 10);
          await setDaily(chat_id, {
            lang: l,
            ...(then.startsWith("on") && DAILY_QUIZ_HOURS.includes(h) ? { enabled: true, send_hour: h } : {}),
          });
          if (then === "now") {
            await tg("editMessageText", { chat_id, message_id, text: `🗣 ${LANG_NAME[l]} ✓` });
            await takeDailyNow(chat_id);
          } else {
            await sendDailyMenu(chat_id, message_id);
          }
        }
      } else if (data === "daily_off") {
        await logEvent(chat_id, "daily_quiz", "off");
        await setDaily(chat_id, { enabled: false });
        await sendDailyMenu(chat_id, message_id);
      } else if (data === "daily_now") {
        await logEvent(chat_id, "daily_quiz", "now");
        if (!(await getDaily(chat_id))?.lang) await askDailyLang(chat_id, "now");
        else await takeDailyNow(chat_id);
      } else if (data === "menu_flashcards") {
        await editFlashcardSubjects(chat_id, message_id);
      } else if (data === "menu_mcqs") {
        // reset any prior session and show subjects
        await supabase.from("bot_sessions").delete().eq("chat_id", chat_id);
        await editMcqSubjects(chat_id, message_id);
      } else if (data.startsWith("subj_")) {
        const code = data.slice(5);
        const subject = await resolveFlashcardSubject(code);
        if (!subject) {
          await tg("editMessageText", { chat_id, message_id, text: "Subject unavailable." });
        } else {
          await logEvent(chat_id, "flashcards", subject);
          await editQuestion(chat_id, message_id, 1, code, subject);
        }
      } else if (data.startsWith("rev_")) {
        const rest = data.slice(4);
        const lastUs = rest.lastIndexOf("_");
        const subjCode = rest.slice(lastUs + 1);
        const midAndId = rest.slice(0, lastUs);
        const countUs = midAndId.lastIndexOf("_");
        const cardId = midAndId.slice(0, countUs);
        const count = parseInt(midAndId.slice(countUs + 1), 10) || 1;
        await editReveal(chat_id, message_id, cardId, count, subjCode);
      } else if (data.startsWith("next_")) {
        const rest = data.slice(5);
        const us = rest.indexOf("_");
        const count = parseInt(rest.slice(0, us), 10) || 1;
        const subjCode = rest.slice(us + 1);
        const subject = await resolveFlashcardSubject(subjCode);
        if (!subject) {
          await tg("editMessageText", { chat_id, message_id, text: "Subject unavailable." });
        } else {
          await editQuestion(chat_id, message_id, count, subjCode, subject);
        }
      } else if (data.startsWith("mcqsubj_")) {
        const code = data.slice(8);
        const subject = await resolveMcqSubject(code);
        if (!subject) {
          await tg("sendMessage", { chat_id, text: "Subject unavailable." });
        } else {
          // fresh session on subject choice
          await logEvent(chat_id, "mcq", subject);
          await supabase.from("bot_sessions").delete().eq("chat_id", chat_id);
          await sendMcqPoll(chat_id, code, subject);
        }
      } else if (data.startsWith("nextmcq_")) {
        const code = data.slice(8);
        const subject = await resolveMcqSubject(code);
        if (!subject) {
          await tg("sendMessage", { chat_id, text: "Subject unavailable." });
        } else {
          await sendMcqPoll(chat_id, code, subject);
        }
      }
    } else if (update.poll_answer) {
      await handlePollAnswer(update.poll_answer);
    }
  } catch (e) {
    console.error("handler error", e);
  }
  return new Response("ok");
});