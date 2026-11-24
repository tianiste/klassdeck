// Used only by `npm run auth:generate` to (re)generate src/db/auth-schema.ts.
// The app itself uses src/lib/auth.ts.
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthOptions } from "./src/lib/auth-options";

export const auth = betterAuth({
  ...createAuthOptions(),
  database: drizzleAdapter({} as never, { provider: "pg" }),
});
