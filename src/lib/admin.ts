import type { User } from "@supabase/supabase-js";

export const ADMIN_EMAILS = ["hateuum00100@gmail.com"];

// Prototype-only client-side guard. Real production admin tools should also be
// enforced server-side or through Supabase RLS / backend authorization.
export function isAdminUser(user: Pick<User, "email"> | null): boolean {
  return Boolean(user?.email && ADMIN_EMAILS.includes(user.email.toLowerCase()));
}
