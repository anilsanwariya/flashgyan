// Telegram lead-gen bot: stateful flashcard + MCQ quiz per subject with scoring.
// Reads content EXCLUSIVELY from bot_* tables. Tracks users in bot_users
// and quiz state in bot_sessions. Public webhook (Telegram calls it directly).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { runTelegramAnswerJob } from "../_shared/telegram-answer-job.ts";
import {
  SaathiAiError,
  cleanHistory,
  collectSources,
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
  builtin: "study" | "flashcards" | "mcq" | "ask" | "answer" | "help" | null;
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

  if (!sess || sess.active_poll_id !== poll_id) return;

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
  meta?: { mains?: MainsInfo } | null;
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
      sourceTitles = cached.sources.map((s) => s.title);
      followups = cached.followups ?? [];
      info = cached.meta?.mains ?? null;
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
      if (plan.matches.length === 0) {
        answer = mainsNoMaterialReply(question);
      } else {
        const parsed = stripNoAnswer(
          await saathiComplete(
            LOVABLE_API_KEY,
            mainsMessages({ channel: "telegram", history, question, plan }),
          ),
        );
        noAnswer = parsed.noAnswer || !parsed.text.trim();
        answer = parsed.text.trim() || mainsNoMaterialReply(question);
        if (!noAnswer) {
          info = mainsInfo(plan, answer);
          const sources = collectSources(plan.matches);
          sourceTitles = sources.map((s) => s.title);
          const { error } = await supabase.rpc("saathi_cache_put", {
            p_channel: channel,
            p_question: query.standalone,
            p_subjects: [],
            p_answer: answer,
            p_sources: sources,
            p_followups: [],
            p_english_query: query.english,
            p_meta: { mains: info },
          });
          if (error && error.code !== "PGRST202") console.error("cache put error", error.message);
        }
      }
      if (noAnswer) {
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
      if (matches.length === 0) {
        answer = saathiNoMaterialReply(question);
      } else {
        const raw = await saathiComplete(
          LOVABLE_API_KEY,
          saathiMessages({ channel: "telegram", history, question, matches }),
        );
        const parsed = stripNoAnswer(raw);
        const split = splitNextQuestions(parsed.text);
        noAnswer = parsed.noAnswer || !split.text;
        answer = split.text || saathiNoMaterialReply(question);
        if (!noAnswer) {
          const sources = collectSources(matches);
          sourceTitles = sources.map((s) => s.title);
          followups = split.next;
          const { error } = await supabase.rpc("saathi_cache_put", {
            p_channel: "telegram",
            p_question: query.standalone,
            p_subjects: [],
            p_answer: answer,
            p_sources: sources,
            p_followups: followups,
            p_english_query: query.english,
          });
          if (error && error.code !== "PGRST202") console.error("cache put error", error.message);
        }
      }
      if (noAnswer) {
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
  if (text.startsWith("/start") || text.startsWith("/study")) await sendMainMenu(chat_id);
  else await tg("sendMessage", { chat_id, text: DEFAULT_SETTINGS.fallback_text });
}

async function handleText(message: any) {
  const chat_id: number = message.chat.id;
  const chat_type: string = message.chat.type ?? "private";
  const isGroup = chat_type === "group" || chat_type === "supergroup";
  const user_id: number = message.from?.id ?? chat_id;
  const text: string = message.text.trim();

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
  }

  try {
    if (update.my_chat_member) {
      await handleMyChatMember(update.my_chat_member);
    } else if (update.message?.text) {
      await trackUser(update.message.from, update.message.chat.id);
      await handleText(update.message);
    } else if (update.callback_query) {
      const cq = update.callback_query;
      const chat_id = cq.message.chat.id;
      const message_id = cq.message.message_id;
      const data: string = cq.data ?? "";
      await trackUser(cq.from, chat_id);
      await tg("answerCallbackQuery", { callback_query_id: cq.id });

      if (data === "menu_flashcards") {
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