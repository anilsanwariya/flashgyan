// Manual Override: Hardcoded to bypass environment variable and token errors
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

function createSupabaseClient() {
  // Hardcoded to your specific Supabase project URL
  const SUPABASE_URL = "https://mhcgrpandktbuaqrkhph.supabase.co";

  // PASTE YOUR ACTUAL 'eyJ...' ANON KEY HERE
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1oY2dycGFuZGt0YnVhcXJraHBoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxNDg5MzMsImV4cCI6MjA5ODcyNDkzM30.l2t9PmVUgUgXcuJq5jD92yxQF_RisZ0GgoPS3kYnZmM";

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    const message = "Missing hardcoded Supabase keys. Please check the manual override in client.ts";
    console.error(`[Supabase] ${message}`);
    throw new Error(message);
  }

  return createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      storage: typeof window !== "undefined" ? localStorage : undefined,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

let _supabase: ReturnType<typeof createSupabaseClient> | undefined;

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";
export const supabase = new Proxy({} as ReturnType<typeof createSupabaseClient>, {
  get(_, prop, receiver) {
    if (!_supabase) _supabase = createSupabaseClient();
    return Reflect.get(_supabase, prop, receiver);
  },
});
