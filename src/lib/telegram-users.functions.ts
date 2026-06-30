import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type TelegramUserRow = {
  id: string;
  telegram_id: number;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  photo_url: string | null;
  language_code: string | null;
  created_at: string;
};

export const listTelegramUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TelegramUserRow[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roles) throw new Error("Forbidden");

    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select(
        "id, telegram_id, first_name, last_name, username, photo_url, language_code, created_at",
      )
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as TelegramUserRow[];
  });
