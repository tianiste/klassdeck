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
    ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
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
