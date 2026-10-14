// Telegram helpers shared by the bot (Deno edge function) and the admin server
// functions (Node). Keep this file free of runtime-specific imports.

export function tgEsc(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Converts light Markdown (**bold**, *italic*, `code`, - bullets, # headings,
// [text](https://link)) into Telegram-safe HTML.
export function mdToTelegramHtml(md: string): string {
  // Links are swapped out first so underscores and asterisks in URLs survive.
  const links: string[] = [];
  const withTokens = md.replace(
    /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (_m, text: string, url: string) => {
      links.push(`<a href="${tgEsc(url).replace(/"/g, "&quot;")}">${tgEsc(text)}</a>`);
      return `\uE000${links.length - 1}\uE000`;
    },
  );
  const lines = tgEsc(withTokens.replace(/\r/g, ""))
    .split("\n")
    .map((line) => {
      let l = line.replace(/^\s*#{1,6}\s+(.+)$/, "**$1**");
      l = l.replace(/^(\s*)[-*•]\s+/, "$1• ");
      return l;
    });
  let s = lines.join("\n").replace(/\n{3,}/g, "\n\n");
  s = s.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  s = s.replace(/\*\*([^*\n]+?)\*\*/g, "<b>$1</b>");
  s = s.replace(/__([^_\n]+?)__/g, "<b>$1</b>");
  s = s.replace(/(^|[^*\w])\*([^*\n]+?)\*(?!\w)/g, "$1<i>$2</i>");
  s = s.replace(/(^|[^_\w])_([^_\n]+?)_(?!\w)/g, "$1<i>$2</i>");
  s = s.replace(/\*\*/g, "").trim();
  return s.replace(/\uE000(\d+)\uE000/g, (_m, i: string) => links[Number(i)] ?? "");
}

// Trims to a length on a line boundary so tags are never cut mid-way.
export function clipHtml(html: string, max: number): string {
  if (html.length <= max) return html;
  const cut = html.slice(0, max);
  const nl = cut.lastIndexOf("\n");
  return (nl > max * 0.5 ? cut.slice(0, nl) : cut.replace(/<[^>]*$/, "")) + "\n…";
}

export type BotButton = {
  text: string;
  url: string;
  // Opens the URL inside Telegram as a Mini App (private chats only).
  webApp?: boolean;
};

export type BotMessage = {
  text: string;
  mediaUrl?: string | null;
  mediaType?: "photo" | "document" | null;
  buttons?: BotButton[];
};

export function inlineKeyboard(buttons: BotButton[] | undefined, privateChat = true) {
  const rows = (buttons ?? [])
    .filter((b) => b.text?.trim() && /^https?:\/\//.test(b.url ?? ""))
    .map((b) => [
      b.webApp && privateChat
        ? { text: b.text.trim(), web_app: { url: b.url } }
        : { text: b.text.trim(), url: b.url },
    ]);
  return rows.length ? { inline_keyboard: rows } : undefined;
}

export type SendResult = {
  ok: boolean;
  // The user blocked the bot or deleted their account.
  blocked: boolean;
  error?: string;
};

const CAPTION_LIMIT = 1024;
const TEXT_LIMIT = 4096;

async function callTelegram(token: string, method: string, body: unknown) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    description?: string;
    error_code?: number;
    parameters?: { retry_after?: number };
  };
  return { status: res.status, json };
}

// Sends one admin-authored message (text, or photo/document with caption, plus
// URL buttons). Waits and retries once if Telegram asks to slow down.
export async function sendBotMessage(
  token: string,
  chatId: number | string,
  msg: BotMessage,
  privateChat = true,
): Promise<SendResult> {
  const html = mdToTelegramHtml(msg.text ?? "");
  const reply_markup = inlineKeyboard(msg.buttons, privateChat);
  let method = "sendMessage";
  let body: Record<string, unknown>;
  if (msg.mediaUrl && msg.mediaType) {
    method = msg.mediaType === "photo" ? "sendPhoto" : "sendDocument";
    body = {
      chat_id: chatId,
      [msg.mediaType]: msg.mediaUrl,
      caption: html ? clipHtml(html, CAPTION_LIMIT) : undefined,
      parse_mode: "HTML",
      reply_markup,
    };
  } else {
    body = {
      chat_id: chatId,
      text: clipHtml(html || "…", TEXT_LIMIT),
      parse_mode: "HTML",
      disable_web_page_preview: false,
      reply_markup,
    };
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    const { status, json } = await callTelegram(token, method, body);
    if (json.ok) return { ok: true, blocked: false };
    if (status === 429 && attempt === 0) {
      const wait = Math.min(30, json.parameters?.retry_after ?? 1);
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    const description = json.description ?? `HTTP ${status}`;
    const blocked =
      status === 403 ||
      /blocked by the user|user is deactivated|chat not found|bot was kicked/i.test(description);
    // Bad markup: fall back to plain text once rather than failing the send.
    if (status === 400 && /can't parse entities/i.test(description) && attempt === 0) {
      if ("text" in body) body.text = clipHtml(tgEsc(msg.text ?? ""), TEXT_LIMIT);
      if ("caption" in body) body.caption = clipHtml(tgEsc(msg.text ?? ""), CAPTION_LIMIT);
      continue;
    }
    return { ok: false, blocked, error: description };
  }
  return { ok: false, blocked: false, error: "Telegram rate limit" };
}

// Telegram limits bots to about 30 messages a second overall.
export const BROADCAST_DELAY_MS = 40;

// Editable bot texts and switches (admin panel → bot_settings), with defaults
// matching the bot's original behaviour.
export type BotTexts = {
  welcome_text: string;
  flashcards_button: string;
  mcq_button: string;
  fallback_text: string;
  free_text_to_saathi: boolean;
};

export const BOT_DEFAULT_TEXTS: BotTexts = {
  welcome_text: "📚 **Welcome to FlashGyan!**\nWhat would you like to practice today?",
  flashcards_button: "🃏 Flashcards",
  mcq_button: "📝 MCQ Quiz",
  fallback_text: "Send /study to begin, or /ask <question> to ask SAATHI.",
  free_text_to_saathi: false,
};
