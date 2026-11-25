import type { BetterAuthOptions } from "better-auth";
import { jwt } from "better-auth/plugins";
import { mcp } from "@better-auth/mcp";
import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "./cimd-transport";

/** Public origin of the app, e.g. http://localhost:3000 or https://klassdeck.com */
export const baseUrl = (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");

/** The MCP endpoint. Access tokens issued to AI clients are bound to this URL. */
export const mcpResource = `${baseUrl}/mcp`;

/**
 * Google sign-in, enabled only when both values are set (production secrets, or
 * .env.local). Without them local dev and the smoke test use email and password only.
 * A function, because on Cloudflare Workers the env is only filled in per request.
 */
export function googleCredentials(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/**
 * Auth configuration shared by the running app (src/lib/auth.ts) and the
 * schema generator (auth.gen.ts). Kept free of the database so the CLI can load it.
 * A function, so every betterAuth() call gets fresh plugin instances (plugins
 * are stateful and must not be registered twice, e.g. across hot reloads).
 */
export const createAuthOptions = () => ({
  baseURL: baseUrl,
  // `/token` belongs to the JWT plugin and would mint session JWTs with the
  // same key as MCP access tokens; MCP clients use /oauth2/token instead.
  disabledPaths: ["/token"],
  // Stored in Postgres so limits hold across Worker isolates (memory is per isolate).
  // Better Auth enables rate limiting in production only.
  rateLimit: { storage: "database" },
  advanced: {
    // Cloudflare sets this header on every request and overwrites any client value.
    // Production runs only on Cloudflare Workers (docs/DEPLOY.md). Running `next start`
    // behind another proxy is unsupported: add that proxy's trusted, overwritten
    // client-IP header here first, or every client shares one rate-limit bucket.
    ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
  // Google sign-in also continues an MCP connect flow: the oauth-provider plugin keeps
  // the signed authorize query in the social sign-in state and resumes authorization
  // when Google's callback creates the session. A Google identity is never linked
  // into an existing account whose email isn't verified (Better Auth's default), so
  // nobody can pre-register a victim's address with a password and take over their
  // Google sign-in.
  socialProviders: (() => {
    const google = googleCredentials();
    return google ? { google: { ...google, prompt: "select_account" as const } } : {};
  })(),
  plugins: [
    jwt({ disableSettingJwtHeader: true }),
    mcp({
      loginPage: "/login",
      consentPage: "/consent",
      resource: mcpResource,
      scopes: ["openid", "profile", "email", "offline_access"],
      refreshTokenReuseInterval: 0,
      // MCP 2026 clients identify themselves with a Client ID Metadata Document
      // (cimd below). Older clients still use dynamic client registration, so
      // we keep that open as a fallback; registration alone grants nothing
      // until a user signs in and approves the consent screen.
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
      clientRegistrationDefaultApplicationType: "infer",
    }),
    cimd({
      fetchClientMetadataResource,
      metadataProfile: "mcp-2026-07-28",
    }),
  ],
}) satisfies BetterAuthOptions;
