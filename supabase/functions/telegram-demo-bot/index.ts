// Telegram lead-generation bot: preview flashcards + MCQ quiz per subject.
// Public webhook - no JWT verification (Telegram calls it directly).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const TELEGRAM_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_URL = "https://play.google.com/store/apps/details?id=com.flashgyan";

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

// callback_data <= 64 bytes. Map subject -> short hash.
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

// ---------- Flashcards ----------
async function listFlashcardSubjects(): Promise<string[]> {
  const { data, error } = await supabase.from("flashcards").select("subject");
  if (error) throw error;
  return [...new Set((data ?? []).map((r: any) => r.subject).filter(Boolean))].sort();
}

async function resolveFlashcardSubject(code: string): Promise<string | null> {
  const subs = await listFlashcardSubjects();
  for (const s of subs) if ((await sha8(s)) === code) return s;
  return null;
}

async function randomCardBySubject(subject: string) {
  const { data, error } = await supabase
    .from("flashcards")
    .select("id, prompt, question, answer, sections")
    .eq("subject", subject);
  if (error) throw error;
  if (!data?.length) return null;
  return data[Math.floor(Math.random() * data.length)];
}

async function cardById(id: string) {
  const { data, error } = await supabase
    .from("flashcards")
    .select("id, prompt, question, answer, sections")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

function explanationFrom(sections: any): string {
  if (!Array.isArray(sections) || !sections.length) return "—";
  return sections
    .map((s: any) => (s?.title ? `*${s.title}*\n${s.body ?? ""}` : (s?.body ?? "")))
    .filter(Boolean)
    .join("\n\n");
}

function esc(s: string) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ---------- MCQ ----------
async function listMcqSubjects(): Promise<string[]> {
  const { data, error } = await supabase.from("mcq_practice_tests").select("subject");
  if (error) throw error;
  return [...new Set((data ?? []).map((r: any) => r.subject).filter(Boolean))].sort();
}

async function resolveMcqSubject(code: string): Promise<string | null> {
  const subs = await listMcqSubjects();
  for (const s of subs) if ((await sha8(s)) === code) return s;
  return null;
}

async function randomMcqBySubject(subject: string) {
  const { data: tests, error: tErr } = await supabase.from("mcq_practice_tests").select("id").eq("subject", subject);
  if (tErr) throw tErr;
  const ids = (tests ?? []).map((t: any) => t.id);
  if (!ids.length) return null;
  const { data, error } = await supabase
    .from("mcq_practice_questions")
    .select("id, question, option_1, option_2, option_3, option_4, answer, explanation_sections")
    .in("test_id", ids);
  if (error) throw error;
  if (!data?.length) return null;
  return data[Math.floor(Math.random() * data.length)];
}

// ---------- Menus ----------
async function sendMainMenu(chat_id: number) {
  await tg("sendMessage", {
    chat_id,
    text: "📚 <b>Welcome to FlashGyan!</b>\nWhat would you like to practice today?",
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [
          { text: "🃏 Flashcards", callback_data: "menu_flashcards" },
          { text: "📝 MCQ Quiz", callback_data: "menu_mcqs" },
        ],
      ],
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
    reply_markup: { inline_keyboard: rows.length ? rows : [[{ text: "No subjects yet", callback_data: "noop" }]] },
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
    reply_markup: { inline_keyboard: rows.length ? rows : [[{ text: "No subjects yet", callback_data: "noop" }]] },
  });
}

// ---------- Flashcard flow ----------
async function editQuestion(chat_id: number, message_id: number, count: number, subjCode: string, subject: string) {
  const card = await randomCardBySubject(subject);
  if (!card) {
    await tg("editMessageText", { chat_id, message_id, text: `No cards found for ${esc(subject)}.` });
    return;
  }
  await tg("editMessageText", {
    chat_id,
    message_id,
    text: `📝 <b>Question ${count}/10:</b>${card.prompt ? `\n\n<i>${esc(card.prompt)}</i>` : ""}\n\n${esc(card.question)}`,
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
    `📝 <b>Question ${count}/10:</b>${card.prompt ? `\n<i>${esc(card.prompt)}</i>` : ""}\n${esc(card.question)}\n\n` +
    `💡 <b>Answer:</b>\n${esc(card.answer)}\n\n` +
    `📖 <b>Explanation:</b>\n${esc(expl)}`;

  const reply_markup =
    count < 10
      ? { inline_keyboard: [[{ text: "➡️ Next Card", callback_data: `next_${count + 1}_${subjCode}` }]] }
      : {
          inline_keyboard: [
            [{ text: "➡️ Continue Study", callback_data: `next_${count + 1}_${subjCode}` }],
            [{ text: "📱 Download FlashGyan App to continue!", url: APP_URL }],
          ],
        };

  await tg("editMessageText", { chat_id, message_id, text, parse_mode: "HTML", reply_markup });
}

// ---------- MCQ flow ----------
async function sendMcqPoll(chat_id: number, count: number, subjCode: string, subject: string) {
  const q = await randomMcqBySubject(subject);
  if (!q) {
    await tg("sendMessage", { chat_id, text: `No MCQs found for ${subject}.` });
    return;
  }
  const options = [q.option_1, q.option_2, q.option_3, q.option_4].map((o: string) => truncate(o, 100));
  const answerIdx = Math.max(0, Math.min(3, (q.answer ?? 1) - 1));
  const explText = explanationFrom(q.explanation_sections).replace(/\*/g, "");

  const reply_markup =
    count < 10
      ? { inline_keyboard: [[{ text: "➡️ Next Question", callback_data: `nextmcq_${count + 1}_${subjCode}` }]] }
      : {
          inline_keyboard: [
            [{ text: "➡️ Continue Study", callback_data: `nextmcq_${count + 1}_${subjCode}` }],
            [{ text: "📱 Download FlashGyan App for more!", url: APP_URL }],
          ],
        };

  await tg("sendPoll", {
    chat_id,
    question: truncate(`${count}/10: ${q.question}`, 300),
    options,
    type: "quiz",
    correct_option_id: answerIdx,
    explanation: truncate(explText, 200),
    is_anonymous: false,
    reply_markup,
  });
}

// ---------- Webhook ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");
  if (req.method !== "POST") return new Response("ok");
  let update: any;
  try {
    update = await req.json();
  } catch {
    return new Response("bad json", { status: 400 });
  }

  try {
    if (update.message?.text) {
      const text: string = update.message.text.trim();
      const chat_id = update.message.chat.id;
      if (text.startsWith("/start") || text.startsWith("/study")) {
        await sendMainMenu(chat_id);
      } else {
        await tg("sendMessage", { chat_id, text: "Send /study to begin." });
      }
    } else if (update.callback_query) {
      const cq = update.callback_query;
      const chat_id = cq.message.chat.id;
      const message_id = cq.message.message_id;
      const data: string = cq.data ?? "";
      await tg("answerCallbackQuery", { callback_query_id: cq.id });

      if (data === "menu_flashcards") {
        await editFlashcardSubjects(chat_id, message_id);
      } else if (data === "menu_mcqs") {
        await editMcqSubjects(chat_id, message_id);
      } else if (data.startsWith("subj_")) {
        const code = data.slice(5);
        const subject = await resolveFlashcardSubject(code);
        if (!subject) {
          await tg("editMessageText", { chat_id, message_id, text: "Subject unavailable." });
        } else {
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
          await sendMcqPoll(chat_id, 1, code, subject);
        }
      } else if (data.startsWith("nextmcq_")) {
        const rest = data.slice(8);
        const us = rest.indexOf("_");
        const count = parseInt(rest.slice(0, us), 10) || 1;
        const subjCode = rest.slice(us + 1);
        const subject = await resolveMcqSubject(subjCode);
        if (!subject) {
          await tg("sendMessage", { chat_id, text: "Subject unavailable." });
        } else {
          await sendMcqPoll(chat_id, count, subjCode, subject);
        }
      }
    }
  } catch (e) {
    console.error("handler error", e);
  }
  return new Response("ok");
});
