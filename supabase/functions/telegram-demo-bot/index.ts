// Telegram lead-gen bot: stateful flashcard + MCQ quiz per subject with scoring.
// Reads content EXCLUSIVELY from bot_* tables. Tracks users in bot_users
// and quiz state in bot_sessions. Public webhook (Telegram calls it directly).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const TELEGRAM_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";
const APP_URL = "https://play.google.com/store/apps/details?id=com.flashgyan";
const QUIZ_LIMIT = 5;
const EMBED_MODEL = "google/gemini-embedding-001";
const EMBED_DIMS = 1536;
const CHAT_MODEL = "google/gemini-3-flash-preview";
const SAATHI_FALLBACK = "I don't have information on that subject in my current study materials.";
const SAATHI_SYSTEM_PROMPT = `You are SAATHI, an expert study assistant. Answer questions ONLY based on the provided database context. If the answer is not contained in the context, reply exactly with: '${SAATHI_FALLBACK}'

LANGUAGE MATCHING: Detect the language of the user's question and reply in that exact language.
SOURCE CITATIONS: Append (Source: [Title]) using the exact Source Title from context.
RICH FORMATTING: Use Markdown-friendly plain text (bold with *asterisks*, bullets with -).`;
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
            [{ text: "📱 Download FlashGyan App to continue!", url: APP_URL }],
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
          [{ text: "📱 Download FlashGyan App", url: APP_URL }],
          [{ text: "🔁 Practice Again", callback_data: "menu_mcqs" }],
        ],
      },
    });
    await supabase.from("bot_sessions").delete().eq("chat_id", chat_id);
  }
}

// ---------- SAATHI /ask ----------
async function saathiEmbed(text: string): Promise<number[] | null> {
  if (!LOVABLE_API_KEY) return null;
  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": LOVABLE_API_KEY },
      body: JSON.stringify({ model: EMBED_MODEL, input: text, dimensions: EMBED_DIMS }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    return j?.data?.[0]?.embedding ?? null;
  } catch {
    return null;
  }
}

function tgEsc(s: string) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function handleSaathiAsk(chat_id: number, user_id: number, question: string) {
  if (!question) {
    await tg("sendMessage", { chat_id, text: "Usage: /ask <your question>" });
    return;
  }
  if (!LOVABLE_API_KEY) {
    await tg("sendMessage", { chat_id, text: "SAATHI is not configured." });
    return;
  }

  const userKey = String(user_id);

  // Conversational memory (last 6 turns)
  let pastMessages: { role: string; content: string }[] = [];
  const { data: history } = await supabase
    .from("saathi_chat_history")
    .select("role,content")
    .eq("user_id", userKey)
    .order("created_at", { ascending: false })
    .limit(6);
  if (history) pastMessages = (history as any[]).slice().reverse();

  // Subjects
  const { data: subjRows } = await supabase.from("saathi_knowledge").select("subject");
  const subjects = [...new Set((subjRows ?? []).map((r: any) => r.subject).filter(Boolean))];

  let answer = SAATHI_FALLBACK;
  const uniqueSources: { title: string; subject: string }[] = [];

  const queryEmbedding = await saathiEmbed(question);
  if (queryEmbedding && subjects.length) {
    const results = await Promise.all(
      subjects.map((subject: string) =>
        supabase.rpc("match_saathi_hybrid", {
          query_text: question,
          query_embedding: queryEmbedding as any,
          match_count: 6,
          subject_filter: subject,
        }),
      ),
    );
    const merged = results.flatMap((r: any) => (r.data ?? []) as any[]);
    const seen = new Set<string>();
    const matches = merged
      .filter((m: any) => (seen.has(m.id) ? false : (seen.add(m.id), true)))
      .sort((a: any, b: any) => b.similarity - a.similarity)
      .slice(0, 8);

    if (matches.length > 0) {
      const contextBlock = matches
        .map((s: any, i: number) => `[Source ${i + 1}] Title: ${s.source_file}\nSubject: ${s.subject}\nContent:\n${s.content}`)
        .join("\n\n---\n\n");
      const userPrompt = `Context from knowledge base:\n\n${contextBlock}\n\n---\n\nQuestion: ${question}`;
      const aiMessages = [
        { role: "system", content: SAATHI_SYSTEM_PROMPT },
        ...pastMessages,
        { role: "user", content: userPrompt },
      ];
      try {
        const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Lovable-API-Key": LOVABLE_API_KEY },
          body: JSON.stringify({ model: CHAT_MODEL, messages: aiMessages }),
        });
        if (aiRes.ok) {
          const aiJson = await aiRes.json();
          answer = aiJson?.choices?.[0]?.message?.content?.trim() || SAATHI_FALLBACK;
          const seenTitles = new Set<string>();
          for (const s of matches as any[]) {
            if (!seenTitles.has(s.source_file)) {
              seenTitles.add(s.source_file);
              uniqueSources.push({ title: s.source_file, subject: s.subject });
            }
          }
        }
      } catch (e) {
        console.error("saathi ai error", e);
      }
    }
  }

  // Knowledge gap tracking
  if (answer === SAATHI_FALLBACK || uniqueSources.length === 0) {
    try {
      await supabase.rpc("increment_knowledge_gap", { gap_question: question });
    } catch (e) {
      console.error("gap rpc error", e);
    }
  }

  // Save memory
  try {
    await supabase.from("saathi_chat_history").insert([
      { user_id: userKey, role: "user", content: question },
      { user_id: userKey, role: "assistant", content: answer },
    ]);
  } catch (e) {
    console.error("history insert error", e);
  }

  const srcLine = uniqueSources.length
    ? `\n\n📚 <i>Sources: ${uniqueSources.map((s) => tgEsc(s.title)).join(", ")}</i>`
    : "";
  const body = tgEsc(answer).slice(0, 3800) + srcLine;
  await tg("sendMessage", { chat_id, text: body, parse_mode: "HTML" });
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
      const chat_id = update.message.chat.id;
      const chat_type: string = update.message.chat.type ?? "private";
      await trackUser(update.message.from, chat_id);
      const text: string = update.message.text.trim();
      const isGroup = chat_type === "group" || chat_type === "supergroup";

      // /ask handler — works in DMs and groups, with conversational memory
      if (text === "/ask" || text.startsWith("/ask ") || text.startsWith("/ask@")) {
        const question = text.replace(/^\/ask(@\S+)?\s*/i, "").trim();
        const user_id = update.message.from?.id ?? chat_id;
        await handleSaathiAsk(chat_id, user_id, question);
        return new Response("ok");
      }

      // In groups, ignore anything else so the bot doesn't interrupt normal chat.
      if (isGroup) return new Response("ok");

      if (text.startsWith("/start") || text.startsWith("/study")) {
        await sendMainMenu(chat_id);
      } else {
        await tg("sendMessage", { chat_id, text: "Send /study to begin, or /ask <question> to ask SAATHI." });
      }
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