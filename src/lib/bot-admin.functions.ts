// Admin server functions for managing the Telegram bot: commands and the
// command menu, automatic replies, bot texts, profile, menu button, webhook,
// broadcasts and stats. Every handler is admin-gated via user_roles.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  BOT_DEFAULT_TEXTS,
  sendBotMessage,
  type BotButton,
  type BotTexts,
} from "../../supabase/functions/_shared/telegram.ts";

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Forbidden");
  return supabaseAdmin;
}

function botToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  return token;
}

async function telegram<T = unknown>(
  method: string,
  body: Record<string, unknown> = {},
): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${botToken()}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    result?: T;
    description?: string;
  };
  if (!json.ok) throw new Error(`Telegram ${method}: ${json.description ?? res.status}`);
  return json.result as T;
}

// The bot's own tables are newer than the generated types.
const t = (name: string) => name as never;

const buttonSchema = z.object({
  text: z.string().trim().min(1).max(64),
  url: z.string().trim().url().max(512),
  webApp: z.boolean().optional(),
});

const messageSchema = {
  response_text: z.string().max(4000).default(""),
  media_url: z.string().trim().url().max(1000).nullish(),
  media_type: z.enum(["photo", "document"]).nullish(),
  buttons: z.array(buttonSchema).max(8).default([]),
};

// ---------- Texts and switches ----------

export type BotSettingsView = BotTexts & { admin_chat_ids: string; has_webhook_secret: boolean };

export const getBotSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BotSettingsView> => {
    const admin = await assertAdmin(context.userId);
    const { data, error } = await admin.from(t("bot_settings")).select("key, value");
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as { key: string; value: unknown }[];
    const get = (k: string) => rows.find((r) => r.key === k)?.value;
    const texts = { ...BOT_DEFAULT_TEXTS };
    for (const key of Object.keys(texts) as (keyof BotTexts)[]) {
      const v = get(key);
      if (v !== undefined && v !== null) (texts as Record<string, unknown>)[key] = v;
    }
    return {
      ...texts,
      admin_chat_ids: String(get("admin_chat_ids") ?? ""),
      has_webhook_secret: Boolean(get("webhook_secret")),
    };
  });

export const saveBotSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        welcome_text: z.string().trim().min(1).max(3000),
        flashcards_button: z.string().trim().min(1).max(64),
        mcq_button: z.string().trim().min(1).max(64),
        fallback_text: z.string().trim().min(1).max(3000),
        free_text_to_saathi: z.boolean(),
        admin_chat_ids: z
          .string()
          .trim()
          .max(500)
          .regex(/^[-\d,\s]*$/, "Chat ids are numbers separated by commas"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const admin = await assertAdmin(context.userId);
    const rows = Object.entries(data).map(([key, value]) => ({
      key,
      value,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await admin.from(t("bot_settings")).upsert(rows as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Commands ----------

export type BotCommandRow = {
  id: string;
  command: string;
  description_en: string;
  description_hi: string;
  action: "builtin" | "message";
  builtin: "study" | "flashcards" | "mcq" | "ask" | "answer" | "daily" | "help" | null;
  response_text: string;
  media_url: string | null;
  media_type: "photo" | "document" | null;
  buttons: BotButton[];
  show_in_menu: boolean;
  scope: "private" | "all";
  enabled: boolean;
  sort_order: number;
};

export const listBotCommands = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BotCommandRow[]> => {
    const admin = await assertAdmin(context.userId);
    const { data, error } = await admin
      .from(t("bot_commands"))
      .select("*")
      .order("sort_order")
      .order("command");
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as BotCommandRow[];
  });

export const saveBotCommand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().nullish(),
        command: z
          .string()
          .trim()
          .toLowerCase()
          .transform((c) => c.replace(/^\//, ""))
          .pipe(z.string().regex(/^[a-z0-9_]{1,32}$/, "Use 1–32 letters, numbers or _")),
        description_en: z.string().trim().max(256).default(""),
        description_hi: z.string().trim().max(256).default(""),
        action: z.enum(["builtin", "message"]),
        builtin: z.enum(["study", "flashcards", "mcq", "ask", "answer", "daily", "help"]).nullish(),
        ...messageSchema,
        show_in_menu: z.boolean(),
        scope: z.enum(["private", "all"]),
        enabled: z.boolean(),
        sort_order: z.number().int().min(0).max(10000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const admin = await assertAdmin(context.userId);
    if (data.action === "builtin" && !data.builtin) throw new Error("Pick which feature to run");
    if (data.action === "message" && !data.response_text.trim() && !data.media_url) {
      throw new Error("Add a reply text or a photo/PDF");
    }
    if (data.media_url && !data.media_type)
      throw new Error("Choose whether the file is a photo or PDF");
    if (data.command === "start" && !data.enabled) throw new Error("/start can't be turned off");
    if (data.id) {
      const { data: existing } = await admin
        .from(t("bot_commands"))
        .select("command")
        .eq("id", data.id)
        .maybeSingle();
      const before = (existing as { command?: string } | null)?.command;
      if (before === "start" && data.command !== "start")
        throw new Error("/start can't be renamed");
    }
    const row = {
      command: data.command,
      description_en: data.description_en,
      description_hi: data.description_hi,
      action: data.action,
      builtin: data.action === "builtin" ? data.builtin : null,
      response_text: data.response_text,
      media_url: data.media_url || null,
      media_type: data.media_url ? data.media_type : null,
      buttons: data.buttons,
      show_in_menu: data.show_in_menu,
      scope: data.scope,
      enabled: data.enabled,
      sort_order: data.sort_order,
      updated_at: new Date().toISOString(),
    };
    const q = data.id
      ? admin
          .from(t("bot_commands"))
          .update(row as never)
          .eq("id", data.id)
      : admin.from(t("bot_commands")).insert(row as never);
    const { error } = await q;
    if (error) {
      if (error.code === "23505") throw new Error(`/${data.command} already exists`);
      throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteBotCommand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await assertAdmin(context.userId);
    const { data: row } = await admin
      .from(t("bot_commands"))
      .select("command")
      .eq("id", data.id)
      .maybeSingle();
    if ((row as { command?: string } | null)?.command === "start")
      throw new Error("/start can't be deleted");
    const { error } = await admin.from(t("bot_commands")).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Publishes the "/" command menu users see: English and Hindi descriptions, for
// private chats and (commands marked for groups) group chats.
export const syncBotCommandMenu = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await assertAdmin(context.userId);
    const { data, error } = await admin.from(t("bot_commands")).select("*").order("sort_order");
    if (error) throw new Error(error.message);
    const rows = ((data ?? []) as unknown as BotCommandRow[]).filter(
      (c) => c.enabled && c.show_in_menu,
    );
    const menu = (list: BotCommandRow[], hindi: boolean) =>
      list.slice(0, 100).map((c) => ({
        command: c.command,
        description: ((hindi && c.description_hi) || c.description_en || `/${c.command}`).slice(
          0,
          256,
        ),
      }));
    const groups = rows.filter((c) => c.scope === "all");
    for (const hindi of [false, true]) {
      const language_code = hindi ? "hi" : undefined;
      await telegram("setMyCommands", {
        commands: menu(rows, hindi),
        scope: { type: "all_private_chats" },
        language_code,
      });
      await telegram("setMyCommands", {
        commands: menu(groups, hindi),
        scope: { type: "all_group_chats" },
        language_code,
      });
    }
    return { private: rows.length, groups: groups.length };
  });

// ---------- Automatic replies ----------

export type BotAutoReplyRow = {
  id: string;
  keywords: string[];
  match_type: "contains" | "exact";
  response_text: string;
  media_url: string | null;
  media_type: "photo" | "document" | null;
  buttons: BotButton[];
  enabled: boolean;
  priority: number;
  hits: number;
};

export const listBotAutoReplies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BotAutoReplyRow[]> => {
    const admin = await assertAdmin(context.userId);
    const { data, error } = await admin.from(t("bot_auto_replies")).select("*").order("priority");
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as BotAutoReplyRow[];
  });

export const saveBotAutoReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().nullish(),
        keywords: z.array(z.string().trim().min(1).max(100)).min(1).max(30),
        match_type: z.enum(["contains", "exact"]),
        ...messageSchema,
        enabled: z.boolean(),
        priority: z.number().int().min(0).max(10000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const admin = await assertAdmin(context.userId);
    if (!data.response_text.trim() && !data.media_url)
      throw new Error("Add a reply text or a photo/PDF");
    if (data.media_url && !data.media_type)
      throw new Error("Choose whether the file is a photo or PDF");
    const row = {
      keywords: data.keywords.map((k) => k.toLowerCase()),
      match_type: data.match_type,
      response_text: data.response_text,
      media_url: data.media_url || null,
      media_type: data.media_url ? data.media_type : null,
      buttons: data.buttons,
      enabled: data.enabled,
      priority: data.priority,
      updated_at: new Date().toISOString(),
    };
    const q = data.id
      ? admin
          .from(t("bot_auto_replies"))
          .update(row as never)
          .eq("id", data.id)
      : admin.from(t("bot_auto_replies")).insert(row as never);
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteBotAutoReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await assertAdmin(context.userId);
    const { error } = await admin.from(t("bot_auto_replies")).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Profile and menu button ----------

export type BotProfile = {
  username: string;
  name_en: string;
  name_hi: string;
  description_en: string;
  description_hi: string;
  short_en: string;
  short_hi: string;
  menu_button: { type: "commands" | "web_app" | "default"; text?: string; url?: string };
};

export const getBotProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BotProfile> => {
    await assertAdmin(context.userId);
    const [me, nameEn, nameHi, descEn, descHi, shortEn, shortHi, menu] = await Promise.all([
      telegram<{ username: string }>("getMe"),
      telegram<{ name: string }>("getMyName"),
      telegram<{ name: string }>("getMyName", { language_code: "hi" }),
      telegram<{ description: string }>("getMyDescription"),
      telegram<{ description: string }>("getMyDescription", { language_code: "hi" }),
      telegram<{ short_description: string }>("getMyShortDescription"),
      telegram<{ short_description: string }>("getMyShortDescription", { language_code: "hi" }),
      telegram<{ type: string; text?: string; web_app?: { url: string } }>("getChatMenuButton"),
    ]);
    return {
      username: me.username,
      name_en: nameEn.name,
      name_hi: nameHi.name,
      description_en: descEn.description,
      description_hi: descHi.description,
      short_en: shortEn.short_description,
      short_hi: shortHi.short_description,
      menu_button: {
        type: (menu.type as BotProfile["menu_button"]["type"]) ?? "default",
        text: menu.text,
        url: menu.web_app?.url,
      },
    };
  });

export const saveBotProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        name_en: z.string().trim().max(64),
        name_hi: z.string().trim().max(64),
        description_en: z.string().trim().max(512),
        description_hi: z.string().trim().max(512),
        short_en: z.string().trim().max(120),
        short_hi: z.string().trim().max(120),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    // Empty Hindi values clear the Hindi override, so Hindi users see English.
    await telegram("setMyName", { name: data.name_en });
    await telegram("setMyName", { name: data.name_hi, language_code: "hi" });
    await telegram("setMyDescription", { description: data.description_en });
    await telegram("setMyDescription", { description: data.description_hi, language_code: "hi" });
    await telegram("setMyShortDescription", { short_description: data.short_en });
    await telegram("setMyShortDescription", {
      short_description: data.short_hi,
      language_code: "hi",
    });
    return { ok: true };
  });

export const saveBotMenuButton = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        type: z.enum(["commands", "web_app"]),
        text: z.string().trim().max(64).default(""),
        url: z.string().trim().max(512).default(""),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (data.type === "web_app") {
      if (!data.text) throw new Error("Add the button text");
      if (!/^https:\/\//.test(data.url)) throw new Error("Mini App links must start with https://");
    }
    await telegram("setChatMenuButton", {
      menu_button:
        data.type === "web_app"
          ? { type: "web_app", text: data.text, web_app: { url: data.url } }
          : { type: "commands" },
    });
    return { ok: true };
  });

// ---------- Webhook ----------

function webhookUrl(): string {
  const base = process.env.SUPABASE_URL;
  if (!base) throw new Error("SUPABASE_URL is not configured");
  return `${base.replace(/\/$/, "")}/functions/v1/telegram-demo-bot`;
}

export type WebhookStatus = {
  url: string;
  expected_url: string;
  pending_update_count: number;
  last_error_date: string | null;
  last_error_message: string | null;
  has_secret: boolean;
  allowed_updates: string[];
};

export const getWebhookStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WebhookStatus> => {
    const admin = await assertAdmin(context.userId);
    const info = await telegram<{
      url: string;
      pending_update_count: number;
      last_error_date?: number;
      last_error_message?: string;
      allowed_updates?: string[];
    }>("getWebhookInfo");
    const { data } = await admin
      .from(t("bot_settings"))
      .select("value")
      .eq("key", "webhook_secret")
      .maybeSingle();
    return {
      url: info.url,
      expected_url: webhookUrl(),
      pending_update_count: info.pending_update_count,
      last_error_date: info.last_error_date
        ? new Date(info.last_error_date * 1000).toISOString()
        : null,
      last_error_message: info.last_error_message ?? null,
      has_secret: Boolean((data as { value?: unknown } | null)?.value),
      allowed_updates: info.allowed_updates ?? [],
    };
  });

// Points Telegram at the bot with a fresh secret token. The secret is saved only
// after Telegram accepts it; the bot then rejects requests without it.
export const setupWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await assertAdmin(context.userId);
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const secret = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    await telegram("setWebhook", {
      url: webhookUrl(),
      secret_token: secret,
      allowed_updates: ["message", "callback_query", "poll_answer", "my_chat_member"],
    });
    const { error } = await admin.from(t("bot_settings")).upsert({
      key: "webhook_secret",
      value: secret,
      updated_at: new Date().toISOString(),
    } as never);
    if (error) {
      // Undo: without the stored secret the bot would reject every update.
      await telegram("setWebhook", {
        url: webhookUrl(),
        allowed_updates: ["message", "callback_query", "poll_answer", "my_chat_member"],
      });
      throw new Error(error.message);
    }
    return { ok: true };
  });

// ---------- Broadcasts ----------

const segmentSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("all") }),
  z.object({ type: z.literal("active"), days: z.number().int().min(1).max(365) }),
  z.object({ type: z.literal("language"), language: z.enum(["hi", "en"]) }),
  z.object({ type: z.literal("subject"), subject: z.string().trim().min(1).max(200) }),
]);
export type BroadcastSegment = z.infer<typeof segmentSchema>;

export type BroadcastRow = {
  id: string;
  text: string;
  media_url: string | null;
  media_type: "photo" | "document" | null;
  buttons: BotButton[];
  segment: BroadcastSegment;
  status: "scheduled" | "sending" | "done" | "cancelled";
  scheduled_at: string;
  started_at: string | null;
  finished_at: string | null;
  total: number;
  sent: number;
  failed: number;
  blocked: number;
  created_at: string;
};

export const listBroadcasts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BroadcastRow[]> => {
    const admin = await assertAdmin(context.userId);
    const { data, error } = await admin
      .from(t("bot_broadcasts"))
      .select("*")
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as BroadcastRow[];
  });

export const countBroadcastAudience = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => segmentSchema.parse(d))
  .handler(async ({ data, context }) => {
    const admin = await assertAdmin(context.userId);
    const { data: count, error } = await admin.rpc(
      "bot_segment_count" as never,
      { segment: data } as never,
    );
    if (error) throw new Error(error.message);
    return Number(count ?? 0);
  });

export const listBotSubjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<string[]> => {
    const admin = await assertAdmin(context.userId);
    const [fc, mcq] = await Promise.all([
      admin.from("bot_flashcards").select("subject"),
      admin.from("bot_mcq_tests").select("subject"),
    ]);
    const set = new Set<string>();
    for (const r of [...(fc.data ?? []), ...(mcq.data ?? [])]) if (r.subject) set.add(r.subject);
    return [...set].sort();
  });

const broadcastMessage = z.object({
  text: z.string().max(4000).default(""),
  media_url: z.string().trim().url().max(1000).nullish(),
  media_type: z.enum(["photo", "document"]).nullish(),
  buttons: z.array(buttonSchema).max(8).default([]),
});

function checkMessage(m: z.infer<typeof broadcastMessage>) {
  if (!m.text.trim() && !m.media_url) throw new Error("Write a message or add a photo/PDF");
  if (m.media_url && !m.media_type) throw new Error("Choose whether the file is a photo or PDF");
  if (m.media_url && m.text.length > 1024) {
    throw new Error("With a photo or PDF the message can be at most 1024 characters");
  }
}

// Wakes the bot to send due broadcasts now instead of waiting for its schedule.
async function triggerBroadcastSending() {
  try {
    await fetch(`${webhookUrl()}?task=broadcast`, { method: "POST" });
  } catch (e) {
    console.error("broadcast trigger:", e);
  }
}

export const createBroadcast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    broadcastMessage
      .extend({
        segment: segmentSchema,
        // ISO time to send at; omitted means now.
        scheduled_at: z.string().datetime({ offset: true }).nullish(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const admin = await assertAdmin(context.userId);
    checkMessage(data);
    const at = data.scheduled_at ? new Date(data.scheduled_at) : new Date();
    const { data: row, error } = await admin
      .from(t("bot_broadcasts"))
      .insert({
        text: data.text,
        media_url: data.media_url || null,
        media_type: data.media_url ? data.media_type : null,
        buttons: data.buttons,
        segment: data.segment,
        status: "scheduled",
        scheduled_at: at.toISOString(),
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    if (at.getTime() <= Date.now() + 5_000) await triggerBroadcastSending();
    return { id: (row as { id: string }).id };
  });

export const cancelBroadcast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await assertAdmin(context.userId);
    const { error } = await admin
      .from(t("bot_broadcasts"))
      .update({ status: "cancelled", finished_at: new Date().toISOString() } as never)
      .eq("id", data.id)
      .in("status", ["scheduled", "sending"]);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Nudges sending along (the admin page calls this while a broadcast is running).
export const resumeBroadcasts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    await triggerBroadcastSending();
    return { ok: true };
  });

// Sends the message only to the admin chat ids saved in Messages, for checking
// how it looks before broadcasting.
export const sendTestBroadcast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => broadcastMessage.parse(d))
  .handler(async ({ data, context }) => {
    const admin = await assertAdmin(context.userId);
    checkMessage(data);
    const { data: setting } = await admin
      .from(t("bot_settings"))
      .select("value")
      .eq("key", "admin_chat_ids")
      .maybeSingle();
    const ids = String((setting as { value?: unknown } | null)?.value ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => /^-?\d+$/.test(s));
    if (ids.length === 0) {
      throw new Error("Add your Telegram chat id under Messages → Test chat ids first");
    }
    const results = await Promise.all(
      ids.map((id) =>
        sendBotMessage(botToken(), id, {
          text: data.text,
          mediaUrl: data.media_url,
          mediaType: data.media_type,
          buttons: data.buttons,
        }),
      ),
    );
    const failed = results.filter((r) => !r.ok);
    if (failed.length) throw new Error(failed[0].error ?? "Telegram rejected the message");
    return { sent: results.length };
  });

// ---------- Media ----------

const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // Telegram's limit for photos sent by URL
const MAX_DOC_BYTES = 20 * 1024 * 1024; // and for other files

export const uploadBotMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        filename: z.string().trim().min(1).max(200),
        contentType: z.string().trim().min(1).max(100),
        base64: z.string().min(1),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const admin = await assertAdmin(context.userId);
    const bytes = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
    const isPhoto = /^image\/(jpeg|png|webp|gif)$/.test(data.contentType);
    const isPdf = data.contentType === "application/pdf";
    if (!isPhoto && !isPdf) throw new Error("Upload a JPG, PNG, WebP or GIF image, or a PDF");
    if (bytes.length > (isPhoto ? MAX_PHOTO_BYTES : MAX_DOC_BYTES)) {
      throw new Error(isPhoto ? "Images can be at most 5 MB" : "PDFs can be at most 20 MB");
    }
    const ext = (data.filename.split(".").pop() || (isPdf ? "pdf" : "jpg")).toLowerCase();
    const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`;
    const { error } = await admin.storage
      .from("bot-media")
      .upload(path, bytes, { contentType: data.contentType, upsert: false });
    if (error) throw new Error(error.message);
    const { data: pub } = admin.storage.from("bot-media").getPublicUrl(path);
    return {
      url: pub.publicUrl,
      mediaType: (isPhoto ? "photo" : "document") as "photo" | "document",
    };
  });

// ---------- Users ----------

export type BotUserView = {
  chat_id: number;
  username: string | null;
  first_name: string | null;
  language_code: string | null;
  blocked: boolean;
  last_active: string;
  created_at: string;
};

export const listBotUsersPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        search: z.string().trim().max(100).default(""),
        limit: z.number().int().min(1).max(500).default(100),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ rows: BotUserView[]; total: number }> => {
    const admin = await assertAdmin(context.userId);
    let q = admin
      .from("bot_users")
      .select(
        "chat_id, username, first_name, language_code, blocked, last_active, created_at" as never,
        {
          count: "exact",
        },
      )
      .order("last_active", { ascending: false })
      .limit(data.limit);
    if (data.search) {
      const term = data.search.replace(/[%,()]/g, "");
      q = /^-?\d+$/.test(term)
        ? q.eq("chat_id", Number(term))
        : q.or(`username.ilike.%${term}%,first_name.ilike.%${term}%`);
    }
    const { data: rows, error, count } = await q;
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as unknown as BotUserView[], total: count ?? 0 };
  });

// ---------- Stats ----------

export type BotStats = {
  users_total: number;
  users_blocked: number;
  users_active_7d: number;
  new_users: number;
  saathi_questions: number;
  daily: { day: string; active: number; events: number }[];
  top: { kind: string; name: string; count: number }[];
};

export const getBotStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ days: z.number().int().min(1).max(365) }).parse(d))
  .handler(async ({ data, context }): Promise<BotStats> => {
    const admin = await assertAdmin(context.userId);
    const { data: stats, error } = await admin.rpc(
      "bot_stats" as never,
      { days: data.days } as never,
    );
    if (error) throw new Error(error.message);
    return stats as unknown as BotStats;
  });
