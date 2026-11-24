# Decisions

Why things are the way they are. Architecture decisions are presented to the owner first
(options, trade-offs, recommendation) and recorded here once the owner has chosen.
Newest first.

## 2026-11-24: Hosting

- **Context:** Klassdeck needs a public HTTPS URL so Claude.ai and ChatGPT connectors can reach
  `/mcp`, an EU database, and costs close to zero because the product is free. It is a Next.js
  16.4 app with Better Auth and Postgres.
- **Options:**
  1. Vercel (app) + Neon (database): Next.js runs natively with no code changes; Neon free sleeps
     after 5 minutes idle and wakes on its own. Vercel's free plan is for non-commercial use.
  2. Cloudflare Workers (app, via the OpenNext adapter) + Supabase (database): one global edge
     platform and a familiar Supabase dashboard. Costs and changes: the Workers free plan allows
     10 ms CPU per request and Better Auth's password hashing falls back to pure-JS scrypt there,
     so Workers Paid (~$5/month) is likely needed; Supabase Free pauses projects after a week of
     low activity (school holidays), so Supabase Pro (~$25/month) avoids downtime; the database
     connection should go through Hyperdrive, the CIMD client-metadata fetch needs a Workers
     transport, and the in-memory rate limiter must move to shared storage.
  3. Cloudflare only as DNS/CDN in front of option 1.
- **Recommended:** 1 (optionally with 3).
- **Chosen by the owner:** 2, Cloudflare Workers + Supabase, with:
  - Supabase Free for development and the pilot; move to Pro before real students rely on it.
  - Workers free plan first: measure sign-up/login CPU; if it exceeds the limit, switch to
    Workers Paid or a lighter hashing setup (to be decided then).
  - The OpenNext adapter (not vinext).
  - Prepare everything in the repo now (adapter, wrangler config, Workers changes, local Workers
    preview); the owner creates the accounts and does the first deploy.
- **Consequences:** Add the OpenNext adapter (`@opennextjs/cloudflare` 1.20.x supports
  Next.js ≥16.4.5) and a `wrangler` config; adapt the database connection, CIMD transport and
  rate limiting for Workers; local `npm run dev` stays on embedded Postgres. Revisit if CPU
  limits or adapter gaps block features. Sources: Cloudflare Workers limits, Supabase project
  pausing docs, Neon pricing (all checked 2026-11-24); `npm view @opennextjs/cloudflare`.

## 2026-11-24: Local development database

- **Context:** Developers need Postgres locally without installing it or running Docker. The first
  attempt, PGlite (Postgres compiled to WASM, in-process), corrupted its data folder when the
  Next.js dev server opened it twice. Its socket server runs every connection in a single
  session, so a transaction on one connection stalled the others until they timed out.
- **Options:**
  1. PGlite in-process: no setup; but single-opener, fragile under Next.js dev.
  2. PGlite socket server: one process owns the files; but no real concurrency, transactions stall.
  3. `embedded-postgres` (real Postgres 17 binaries from npm, started by `npm run dev`): real
     behaviour, same engine as production; ~100 MB of platform binaries, a postinstall step that
     must be approved.
  4. Docker Postgres: standard; but requires Docker on every machine.
  5. A hosted dev database (Neon branch): no local binaries; needs an account and network.
- **Recommended:** 3. It matches production and needs no extra installs.
- **Chosen by the owner:** not yet confirmed (implemented during M1).
- **Consequences:** `npm run dev` runs `scripts/dev.mjs`. Setting `DATABASE_URL` and using
  `npm run dev:next` bypasses it. Revisit if the binaries cause trouble on macOS/Linux.

## 2026-11-24: MCP client registration

- **Context:** The 2026-07-28 MCP spec identifies clients with Client ID Metadata Documents (CIMD)
  and deprecates Dynamic Client Registration (DCR). AI apps released before that still use DCR.
- **Options:**
  1. CIMD only: closest to the current spec; older clients can't connect.
  2. CIMD plus open (unauthenticated) DCR: every current client can connect; anyone can register
     a client record, which grants nothing until a user signs in and approves consent.
- **Recommended:** 2 for now, then revisit once the major AI apps use CIMD.
- **Chosen by the owner:** not yet confirmed (implemented during M1).
- **Consequences:** Spam client registrations are possible; add rate limiting or cleanup before
  production. Source: Better Auth `mcp` plugin docs and `@better-auth/mcp` 1.7.28 types (2026-11-24).

## 2026-11-24: Auth and MCP stack

- **Context:** Remote MCP connectors require an OAuth 2.1 authorization server with discovery
  metadata, PKCE and audience-bound tokens, plus user accounts for the website.
- **Options:**
  1. Better Auth with the `mcp()` and `cimd()` plugins: accounts and the OAuth server in one
     library and one database; plugin versions must stay in lockstep.
  2. Auth.js for accounts plus a separate OAuth server: more pieces to integrate.
  3. A hosted identity provider (Auth0, WorkOS, Clerk): least code; paid tiers, data outside our
     database, vendor dependency for a free product.
- **Recommended:** 1.
- **Chosen by the owner:** not yet confirmed. The owner approved Better Auth as part of the
  architecture plan; the `mcp()` and `cimd()` plugin choice was made during M1.
- **Consequences:** All Better Auth packages are pinned to the same exact version. The MCP server
  uses SDK v2 (`@modelcontextprotocol/server`), which serves both 2026 and 2025-era clients.
