# Deploying Klassdeck

Klassdeck runs on **Vercel** (Next.js functions in `fra1`, Frankfurt) with its Postgres database on
**Neon** (`klassdeck`, `aws-eu-central-1`). Local development doesn't need any of this:
`npm run dev` keeps using the embedded Postgres in `./.data`.

The Cloudflare Workers setup further down ("Cloudflare Workers (previous host)") still works but hit
the free plan's 10 ms CPU limit; see `docs/decisions.md`.

Commands below are for PowerShell on Windows, run from the project folder.

## Vercel

The database tables already exist on Neon (see "2. Create the tables" below to run new migrations).

1. Sign in and link the project (opens a browser once):

   ```powershell
   npx vercel login
   ```

   ```powershell
   npx vercel link
   ```

2. Set the environment variables for Production. Each command asks for the value:
   - `DATABASE_URL`: Neon's **pooled** connection string (`neon connection-string --pooled`). The
     app runs on short-lived serverless instances, so it goes through Neon's connection pooler.
   - `BETTER_AUTH_URL`: the site's address, e.g. `https://klassdeck.vercel.app` (no trailing slash).
   - `BETTER_AUTH_SECRET`: a new random value (`openssl rand -base64 32`).
   - `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`: the same Google OAuth client as before.

   ```powershell
   npx vercel env add DATABASE_URL production
   ```

   Leave `EMAIL_PASSWORD_LOGIN` unset: on Vercel email and password sign-in works (the CPU limit
   that forced Google-only on Workers doesn't apply).

3. In Google Cloud Console, add `<BETTER_AUTH_URL>/api/auth/callback/google` to the OAuth client's
   authorized redirect URIs.

4. Deploy:

   ```powershell
   npx vercel deploy --prod
   ```

5. Check it: open `<BETTER_AUTH_URL>/login`, run
   `node scripts/smoke-mcp.mjs <BETTER_AUTH_URL>` (a full pass, since email sign-up works), and
   add `<BETTER_AUTH_URL>/mcp` as a custom connector in Claude.ai.

`vercel.json` pins the functions to `fra1`. Client IPs for rate limiting come from
`x-vercel-forwarded-for` (see `src/lib/auth-options.ts`).

# Cloudflare Workers (previous host)

Klassdeck can also run as a Cloudflare Worker (through the OpenNext adapter) with Neon reached
through Cloudflare Hyperdrive.

## What you need

- A Cloudflare account (the Workers free plan works to start, but read "CPU limit" below).
- A Neon project in an EU region (`klassdeck`, `aws-eu-central-1`, Free plan).
- Node 20+ and `npm install` done.

## 1. Database (Neon)

1. Get the **direct** (non-pooled) connection string. The project is already linked in this
   folder (`.neon`), so:

   ```powershell
   neon connection-string
   ```

   Or in the Neon console: project `klassdeck` → **Connect**, with "Connection pooling" off.
   The host must not contain `-pooler`: Hyperdrive does its own pooling and should not sit
   behind Neon's pooler. It looks like
   `postgresql://<user>:<password>@ep-xxxx.eu-central-1.aws.neon.tech/neondb?sslmode=require`.
2. Keep it out of tracked files, commits and chat; you'll paste it into the commands below.

Neon Free: the database sleeps after 5 minutes idle and wakes on the next request (the first
request after a pause is slower). If the month's compute hours run out, the database is
suspended until the next month.

## 2. Create the tables

Run the migrations against Neon once (and again after every schema change):

```powershell
$env:DATABASE_URL = "<direct connection string>"
npm run db:migrate
Remove-Item Env:DATABASE_URL
```

## 3. Cloudflare login and Hyperdrive

```powershell
npx wrangler login
```

```powershell
npx wrangler hyperdrive create klassdeck-db --caching-disabled --connection-string="<direct connection string>"
```

Keep `--caching-disabled`. With caching on, Hyperdrive serves some reads from a 60-second cache
that isn't cleared by writes, so a set an AI just saved could look missing, and Better Auth's
rate-limit rows can fail on a cached "not found".

The command prints an `id`. Put it in `wrangler.jsonc` under `hyperdrive[0].id`, replacing
`00000000000000000000000000000000`, and commit that change (the id is not a secret).

## 4. Secrets

The first deploy gives the Worker a URL like `https://klassdeck.<your-subdomain>.workers.dev`
(shown in the Cloudflare dashboard under Workers & Pages once your workers.dev subdomain is set).
`BETTER_AUTH_URL` must be exactly that origin, or your custom domain if you add one later.

```powershell
npx wrangler secret put BETTER_AUTH_URL
```

```powershell
npx wrangler secret put BETTER_AUTH_SECRET
```

For `BETTER_AUTH_SECRET`, paste a new random value (don't reuse the one in `.env.local`), e.g.
from:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Never change `BETTER_AUTH_SECRET` after users sign up: it encrypts the OAuth signing keys, and a
new secret makes every issued token unusable (Better Auth then reports "Failed to decrypt
private key").

If `wrangler secret put` says the Worker doesn't exist yet, run step 5 once first, then set the
secrets and deploy again.

### Google sign-in (required for the live site)

The deployed Worker turns email and password sign-in off (`EMAIL_PASSWORD_LOGIN = "off"` in
`wrangler.jsonc`, see "CPU limit" below), so Google is the only way to sign in. Without these two
secrets nobody can sign in, and the login page says sign-in isn't available.

1. In [Google Cloud Console](https://console.cloud.google.com/): create or pick a project, then
   **APIs & Services → OAuth consent screen**. Set the app name (Klassdeck), a support email,
   and the authorized domain of your Worker URL. Only the `openid`, `email` and `profile` scopes
   are needed.
2. **APIs & Services → Credentials → Create credentials → OAuth client ID**, type
   **Web application**.
   - Authorized redirect URI: `<BETTER_AUTH_URL>/api/auth/callback/google`, e.g.
     `https://klassdeck.<your-subdomain>.workers.dev/api/auth/callback/google`.
   - For local testing you can also add `http://localhost:3000/api/auth/callback/google`.
3. Copy the client ID and client secret and set them on the Worker:

   ```powershell
   npx wrangler secret put GOOGLE_CLIENT_ID
   ```

   ```powershell
   npx wrangler secret put GOOGLE_CLIENT_SECRET
   ```

   For local `npm run dev`, put the same two names in `.env.local` instead (never in a tracked
   file).
4. While the consent screen is in "Testing", only the test users you list can sign in. Publish
   it (**Publishing status → In production**) before students use it; with only these basic
   scopes Google doesn't require a review.

Google sign-in also works while connecting an AI: the person picks Google on Klassdeck's login
page, and after Google they land on the consent screen and then back in the AI app. Someone who
already signed up with a password can't then use Google with the same email (the login page
says so), because email addresses aren't verified yet.

## 5. Deploy

```powershell
npm run deploy
```

This builds the Worker and deploys it. It also strips values from local `.env` files out of the
bundle (OpenNext would otherwise upload `.env.local`, including the dev secret).

The free plan allows a Worker of at most 3 MB compressed. The build is about 2.9 MB today; if
`npm run deploy` fails with a size error, see `docs/LIMITATIONS.md`.

## 6. Check it

1. Open `https://<your worker url>/login` and sign in with Google.
2. `https://<your worker url>/.well-known/oauth-protected-resource/mcp` should return JSON whose
   `resource` is `https://<your worker url>/mcp`.
3. Run the smoke test against it:

   ```powershell
   node scripts/smoke-mcp.mjs https://<your worker url>
   ```

   With email sign-in off it can't sign in, so it checks discovery, the 401 challenge, client
   registration and the redirect to `/login`, then prints "Partial pass". The sign-in, consent,
   token and tool steps are covered by connecting Claude.ai in step 7.

## 7. Connect Claude.ai

1. In Claude.ai: **Settings → Connectors → Add custom connector**.
2. URL: `https://<your worker url>/mcp`. Leave the OAuth client fields empty.
3. Claude opens Klassdeck's login page; sign in and approve.
4. Ask Claude to make a short quiz and save it to Klassdeck, then check it on the dashboard.

## CPU limit (Workers free plan)

The free plan allows 10 ms of CPU per request. Measured locally under workerd (2026-11-24):

| Request | CPU |
|---------|-----|
| Password hash or check (sign-up, sign-in), scrypt N=16384 r=16 | ~41 ms per hash |
| Ordinary pages and discovery documents (warm) | ≤ 5–10 ms (wall time, so an upper bound) |

So sign-up and sign-in are about 4–5× over the free limit, and ordinary pages are close to it.
Cloudflare may reject those requests with error 1102 ("Worker exceeded resource limits").

Decision (2026-11-25): the live site is **Google-only** for now. `wrangler.jsonc` sets
`EMAIL_PASSWORD_LOGIN = "off"`, which turns off the email sign-up and sign-in endpoints, not just
the form; Google sign-in hashes no password. To bring email and password back, switch to Workers
Paid (from $5/month; 30 s CPU by default) and remove that variable. Local `npm run dev` and
`npm run preview` (via `.dev.vars`) keep email and password on so the smoke test works.

## Local Worker preview

To run the production build locally in workerd, against the embedded Postgres from
`npm run dev`:

```powershell
Copy-Item .dev.vars.example .dev.vars
```

Set `BETTER_AUTH_SECRET` in `.dev.vars` to the same value as in `.env.local` (both use the same
local database, and its signing keys are encrypted with that secret). Then, with `npm run dev`
running (it starts Postgres on port 5433):

```powershell
npm run preview
```

The app is at http://localhost:8787. Hyperdrive uses `localConnectionString` from
`wrangler.jsonc` there, which points at the local Postgres.

```powershell
node scripts/smoke-mcp.mjs http://localhost:8787
```
