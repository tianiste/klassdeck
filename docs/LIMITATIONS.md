# Known limitations

What the project does not do yet, or does only approximately. Add every new known
limitation when it is found; remove it when it is fixed.

| Limitation | Effect for the user | Why / blocked on | Since |
|------------|---------------------|------------------|-------|
| Not yet tested with a real Claude.ai or ChatGPT connector | Connecting may hit a client-specific issue the test client didn't | Needs a public HTTPS URL (deploy or tunnel) | 2026-11-24 |
| Sets can't be edited in the browser yet | A wrong answer can only be fixed by asking the AI (update_question) | Editor is milestone 2 | 2026-11-24 |
| An AI can fix questions but not delete questions or sets | A duplicate or unwanted set stays until a delete option exists | Not decided whether an AI should be allowed to delete | 2026-11-24 |
| No practice mode or spaced repetition yet | Sets can be viewed, not studied | Milestone 2 | 2026-11-24 |
| No classes or sharing yet | Sets are private to their owner | Milestone 3 | 2026-11-24 |
| Email and password sign-in only | No Google or Microsoft school accounts | Needs OAuth apps from the owner | 2026-11-24 |
| No email verification or password reset | A forgotten password can't be recovered | No email provider chosen yet | 2026-11-24 |
| No way to see or revoke connected AIs in the UI | A user can't disconnect an AI from Klassdeck's side | Connections settings page not built yet | 2026-11-24 |
| Save limit uses clock-hour windows | A burst across the top of the hour can reach up to 120 saves instead of 60 | Hourly counter in Postgres, chosen for one atomic write per save | 2026-11-24 |
| Sign-up and sign-in exceed the Workers free plan's CPU limit | On the free plan these requests may fail with Cloudflare error 1102 | Password hashing costs ~41 ms CPU, the free plan allows 10 ms; needs Workers Paid or lighter hashing (owner decision) | 2026-11-24 |
| Worker is close to the free plan's 3 MB size limit | A few more libraries could make `npm run deploy` fail on the free plan | 2.91 MB compressed today; shrinking further needs `serverExternalPackages`, which breaks the OpenNext build on Windows without Developer Mode | 2026-11-24 |
| CIMD metadata fetch on Workers can't pin DNS | A public hostname that resolves to a private address isn't rejected up front | Workers expose no DNS control; requests leave from Cloudflare's edge, see `docs/decisions.md` | 2026-11-24 |
| Not yet run against a hosted database | Hyperdrive + Neon settings are untested end to end | Needs the owner's Cloudflare account and deploy; checked locally with the Hyperdrive binding only | 2026-11-24 |
| English UI only | Slovenian students see English labels | Localisation is milestone 5 | 2026-11-24 |
