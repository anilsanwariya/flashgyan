import { createServerFn } from "@tanstack/react-start";

export type TelegramProfile = {
  id: string;
  telegram_id: number;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  photo_url: string | null;
  language_code: string | null;
};

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

    const { verifyInitData } = await import("@/lib/telegram-init-data.server");
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
