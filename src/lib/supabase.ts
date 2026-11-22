import { createClient } from "@supabase/supabase-js";

/** Public (publishable) key only. Row level security and SECURITY DEFINER functions guard the data. */
export const getSupabase = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. See .env.example.");
  return createClient(url, key, { auth: { persistSession: false } });
};
