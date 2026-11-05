// Shared machine credential for scheduled jobs (/api/ca/tick and the bot's
// ?task=broadcast). Stored in bot_settings (service-role only) and created on
// first use; pg_cron sends it in the x-cron-secret header.
const KEY = "cron_secret";

export async function getCronSecret(): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as any;
  const { data } = await admin.from("bot_settings").select("value").eq("key", KEY).maybeSingle();
  const existing = (data as { value?: unknown } | null)?.value;
  if (typeof existing === "string" && existing.length >= 32) return existing;
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const secret = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  const { error } = await admin
    .from("bot_settings")
    .upsert({ key: KEY, value: secret }, { onConflict: "key", ignoreDuplicates: true });
  if (error) throw new Error("Couldn't save the scheduler secret");
  // Re-read so concurrent first calls agree on one value.
  const again = await admin.from("bot_settings").select("value").eq("key", KEY).maybeSingle();
  const v = (again.data as { value?: unknown } | null)?.value;
  return typeof v === "string" ? v : secret;
}

export async function verifyCronSecret(request: Request): Promise<boolean> {
  const got = request.headers.get("x-cron-secret");
  if (!got) return false;
  const expected = await getCronSecret();
  if (got.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
