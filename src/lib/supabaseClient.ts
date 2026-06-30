import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const INVALID_SUPABASE_URL_MESSAGE =
  "Supabase URL is invalid. Use the project root URL, for example https://xxxx.supabase.co";

if (process.env.NODE_ENV === "development") {
  console.debug("Supabase configured:", Boolean(supabaseUrl && supabaseAnonKey));
  console.debug("Supabase URL:", supabaseUrl);
}

export const supabaseConfigError = getSupabaseConfigError(supabaseUrl, supabaseAnonKey);

export const supabase =
  supabaseUrl && supabaseAnonKey && !supabaseConfigError
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

function getSupabaseConfigError(url: string | undefined, anonKey: string | undefined) {
  if (!url || !anonKey) return "Supabase is not configured.";
  if (!isValidSupabaseRootUrl(url)) return INVALID_SUPABASE_URL_MESSAGE;
  return null;
}

function isValidSupabaseRootUrl(value: string) {
  try {
    const parsed = new URL(value);
    const normalizedPath = parsed.pathname.replace(/\/+$/, "");
    const lowerValue = value.toLowerCase();
    if (lowerValue.includes("/rest/v1") || lowerValue.includes("/auth/v1")) return false;
    if (parsed.hostname === "supabase.com" && normalizedPath.includes("/dashboard")) return false;
    return normalizedPath === "" && !parsed.search && !parsed.hash;
  } catch {
    return false;
  }
}
