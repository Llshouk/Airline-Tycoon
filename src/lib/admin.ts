import type { User } from "@supabase/supabase-js";

// Admin accounts come from the environment, never from source control:
// NEXT_PUBLIC_ADMIN_EMAILS="first@example.com,second@example.com"
export const ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? "")
  .split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);

// Prototype-only client-side guard. Real production admin tools should also be
// enforced server-side or through Supabase RLS / backend authorization.
export function isAdminUser(user: Pick<User, "email"> | null): boolean {
  return Boolean(user?.email && ADMIN_EMAILS.includes(user.email.toLowerCase()));
}
