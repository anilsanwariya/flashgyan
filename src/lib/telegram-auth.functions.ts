import { createServerFn } from "@tanstack/react-start";
import { createHmac } from "crypto";

export type TelegramProfile = {
  id: string;
  telegram_id: number;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  photo_url: string | null;
  language_code: string | null;
};

function verifyInitData(initData: string, botToken: string): Record<string, string> | null {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");

  const dataCheckString = Array.from(params.entries())
    .map(([k, v]) => [k, v] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const computed = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  if (computed !== hash) return null;

  // Optional freshness check (24h)
  const authDate = Number(params.get("auth_date") ?? 0);
  if (!authDate || Date.now() / 1000 - authDate > 86400) return null;

  return Object.fromEntries(params.entries());
}

export const verifyTelegram = createServerFn({ method: "POST" })
  .inputValidator((data: { initData: string }) => {
    if (!data || typeof data.initData !== "string" || !data.initData) {
      throw new Error("initData required");
    }
    return data;
  })
  .handler(async ({ data }): Promise<TelegramProfile> => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error("TELEGRAM_BOT_TOKEN not configured");

    const verified = verifyInitData(data.initData, token);
    if (!verified) throw new Error("Invalid Telegram signature");

    const userJson = verified.user;
    if (!userJson) throw new Error("Missing user in initData");
    const tgUser = JSON.parse(userJson) as {
      id: number;
      first_name?: string;
      last_name?: string;
      username?: string;
      photo_url?: string;
      language_code?: string;
    };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: upserted, error } = await supabaseAdmin
      .from("profiles")
      .upsert(
        {
          telegram_id: tgUser.id,
          first_name: tgUser.first_name ?? null,
          last_name: tgUser.last_name ?? null,
          username: tgUser.username ?? null,
          photo_url: tgUser.photo_url ?? null,
          language_code: tgUser.language_code ?? null,
        },
        { onConflict: "telegram_id" },
      )
      .select("id, telegram_id, first_name, last_name, username, photo_url, language_code")
      .single();

    if (error || !upserted) throw new Error(error?.message ?? "Failed to upsert profile");
    return upserted as TelegramProfile;
  });
