# Klassdeck

Your AI makes the study material. Klassdeck keeps it, fixes it, schedules it and shares it with your class.

Students and teachers connect their own AI (Claude, ChatGPT, …) to Klassdeck through MCP. Quizzes and flashcards the AI makes are saved to their account, where they can view (and soon edit, practice and share) them. Klassdeck never calls an LLM itself, so it can stay free.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full plan.

## Status: M1, "Save from AI"

- Email and password accounts
- OAuth 2.1 authorization server for MCP clients, with a login and consent screen
- MCP endpoint at `/mcp` with tools `create_set`, `add_questions`, `list_sets` and `get_set`
- Web pages: dashboard (my sets and connect instructions) and a set view

## Run locally

Requires Node.js 20+.

```bash
npm install
cp .env.example .env.local   # then set BETTER_AUTH_SECRET to a random string
npm run dev
```

`npm run dev` starts a local Postgres (data in `.data/postgres`, no Docker needed), applies migrations and runs Next.js on http://localhost:3000.

To use a different Postgres, set `DATABASE_URL` in `.env.local`, run `npm run db:migrate`, then `npm run dev:next`.

### Check the MCP flow

With the dev server running:

```bash
npm run smoke
```

This acts like an AI app. It registers an OAuth client, signs up a test user, approves consent, gets a token, and calls every MCP tool.

### Connect a real AI

Claude.ai and ChatGPT connect to remote MCP servers from their own cloud, so they need a public HTTPS URL. `localhost` won't work. Either deploy (see below) or expose your dev server with a tunnel such as `cloudflared tunnel --url http://localhost:3000`, set `BETTER_AUTH_URL` to the tunnel URL and restart. Then add `<BETTER_AUTH_URL>/mcp` as a custom connector.

Local MCP clients such as Claude Code can use `http://localhost:3000/mcp` directly.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Local Postgres, migrations, then Next.js dev server |
| `npm run dev:next` | Next.js only (bring your own `DATABASE_URL`) |
| `npm run db:generate` | Create a migration after changing `src/db/app-schema.ts` |
| `npm run db:migrate` | Apply migrations |
| `npm run auth:generate` | Regenerate `src/db/auth-schema.ts` after changing auth plugins |
| `npm run smoke` | End-to-end MCP and OAuth check against a running server |
| `npm run typecheck` / `npm run lint` / `npm run build` | The usual |

## Layout

```
src/
  app/            pages, /api/auth, /mcp, /.well-known/* discovery routes
  core/           business logic and the shared question schema (used by web and MCP)
  mcp/            MCP server and tools (thin wrappers around core/)
  db/             Drizzle schema (auth-schema.ts is generated)
  lib/            auth config and clients
scripts/          dev launcher, smoke test
drizzle/          SQL migrations
```
