import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { createAuthOptions } from "./auth-options";

const authOptions = createAuthOptions();

export const auth = betterAuth({
  ...authOptions,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  // nextCookies must be last so it can set cookies from server actions.
  plugins: [...authOptions.plugins, nextCookies()],
});

export type SessionUser = { id: string; name: string; email: string };

/** The signed-in user, or null. */
export async function getUser(): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const { id, name, email } = session.user;
  return { id, name, email };
}

/** The signed-in user; redirects to /login otherwise. */
export async function requireUser(next?: string): Promise<SessionUser> {
  const user = await getUser();
  if (!user) redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  return user;
}
