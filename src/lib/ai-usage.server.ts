// Server-only: the AI usage table's rows (ai_usage, filled by every AI
// call through saathi-core).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { AiUsageRow } from "@/lib/ai-usage";

// The rows of the last `days` days (India time); `ready` is false until the
// migration has been run.
export async function getAiUsage(days: number): Promise<{ ready: boolean; rows: AiUsageRow[] }> {
  const since = new Date(Date.now() + 330 * 60_000 - (days - 1) * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const { data, error } = await supabaseAdmin
    .from("ai_usage" as never)
    .select("day,label,model,calls,input_tokens,cache_write_tokens,cache_read_tokens,output_tokens")
    .gte("day", since)
    .order("day", { ascending: false })
    .limit(5000);
  if (error) {
    if (/ai_usage|schema cache|does not exist/i.test(error.message))
      return { ready: false, rows: [] };
    throw new Error(error.message);
  }
  return {
    ready: true,
    rows: ((data ?? []) as unknown as AiUsageRow[]).map((r) => ({
      ...r,
      calls: Number(r.calls),
      input_tokens: Number(r.input_tokens),
      cache_write_tokens: Number(r.cache_write_tokens),
      cache_read_tokens: Number(r.cache_read_tokens),
      output_tokens: Number(r.output_tokens),
    })),
  };
}
