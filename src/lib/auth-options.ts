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
 * The header that holds the real client IP, which the rate limiter keys on. Only headers the
 * platform sets itself and a client can't spoof:
 * - Vercel (VERCEL=1): `x-vercel-forwarded-for`, Vercel's copy of the X-Forwarded-For it
 *   overwrites (https://vercel.com/docs/headers/request-headers).
 * - Cloudflare Workers: `cf-connecting-ip`, set and overwritten on every request.
 * Anything else (local dev) has no trusted header; Better Auth only rate-limits in production.
 */
function clientIpHeaders(): string[] {
  return process.env.VERCEL === "1" ? ["x-vercel-forwarded-for"] : ["cf-connecting-ip"];
}

/**
 * Email and password sign-in, on unless EMAIL_PASSWORD_LOGIN is "off". The deployed
 * Worker turns it off (wrangler.jsonc `vars`): password hashing needs ~40 ms of CPU and
 * the Workers free plan allows 10 ms per request, so production is Google-only for now.
 * This disables the endpoints, not just the form.
 */
export function emailPasswordEnabled(): boolean {
  return process.env.EMAIL_PASSWORD_LOGIN !== "off";
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
    // Production runs on Vercel (or Cloudflare Workers); see clientIpHeaders(). Running
    // `next start` behind another proxy is unsupported: add that proxy's trusted, overwritten
    // client-IP header first, or every client shares one rate-limit bucket.
    ipAddress: { ipAddressHeaders: clientIpHeaders() },
  },
  emailAndPassword: {
    enabled: emailPasswordEnabled(),
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
