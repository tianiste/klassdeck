# Known limitations

What the project does not do yet, or does only approximately. Add every new known
limitation when it is found; remove it when it is fixed.

| Limitation | Effect for the user | Why / blocked on | Since |
|------------|---------------------|------------------|-------|
| Sets can't be edited in the browser yet | A wrong answer can only be fixed by asking the AI (update_question) | Editor is milestone 2 | 2026-11-24 |
| An AI can fix questions but not delete questions or sets | A duplicate or unwanted set stays until a delete option exists | Not decided whether an AI should be allowed to delete | 2026-11-24 |
| No practice mode or spaced repetition yet | Sets can be viewed, not studied | Milestone 2 | 2026-11-24 |
| No classes or sharing yet | Sets are private to their owner | Milestone 3 | 2026-11-24 |
| No Microsoft sign-in | School Microsoft accounts can't be used; Google or email and password only | Needs an OAuth app from the owner | 2026-11-24 |
| A password account can't add Google later | Someone who signed up with a password and then picks Google with the same email gets "log in with your password" | Emails aren't verified, so Better Auth refuses to link (prevents account takeover); needs email verification | 2026-11-24 |
| Neon Free plan limits | First request after 5 minutes idle is slower; if the month's compute hours run out the site is down until the next month | Free plan for now; move to a paid plan before real classes rely on it | 2026-11-24 |
| No email verification or password reset | A forgotten password can't be recovered | No email provider chosen yet | 2026-11-24 |
| No way to see or revoke connected AIs in the UI | A user can't disconnect an AI from Klassdeck's side | Connections settings page not built yet | 2026-11-24 |
| Save limit uses clock-hour windows | A burst across the top of the hour can reach up to 120 saves instead of 60 | Hourly counter in Postgres, chosen for one atomic write per save | 2026-11-24 |
| English UI only | Slovenian students see English labels | Localisation is milestone 5 | 2026-11-24 |
