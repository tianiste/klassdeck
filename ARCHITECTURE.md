# Klassdeck — Architecture

> Your AI makes the study material. Klassdeck keeps it, fixes it, schedules it, and shares it with your class.

## 1. Core idea

- **Bring your own AI.** All generation happens in the user's AI (Claude, ChatGPT, …). Klassdeck never calls an LLM, so running it costs almost nothing and it can stay free.
- **Klassdeck is the memory + practice layer.** It stores sets of questions, lets people edit them, schedules reviews with spaced repetition, and shares sets within a class.
- **The AI connects through MCP.** It can save sets *and* read back what the student keeps getting wrong. That is the loop:

```
 ┌──────────────┐  save_set / add_questions   ┌──────────────────┐
 │  User's AI   │ ─────────────────────────▶  │    Klassdeck     │
 │ (Claude,     │                             │  sets, classes,  │
 │  ChatGPT…)   │ ◀─────────────────────────  │  review schedule │
 └──────────────┘  get_weak_questions         └────────┬─────────┘
        ▲                                              │ practice in browser
        │ "help me with what I keep missing"           ▼
        └──────────────────────────────────────── Student / class
```

## 2. Tech stack

One TypeScript codebase. The web app and the MCP server live in the same deployment and share the database layer.

| Part | Choice | Why |
|---|---|---|
| Web app | **Next.js** (App Router) + React | One project for pages, API, and the MCP endpoint |
| Styling | Tailwind CSS | Fast to build |
| Database | **PostgreSQL** (Neon or Supabase, EU region); locally `embedded-postgres` | Relational data (classes ↔ sets ↔ questions); free tier; EU for GDPR. Embedded Postgres gives real Postgres locally with no Docker |
| ORM | Drizzle | Typed, lightweight, simple migrations |
| Auth | Better Auth: email + password now; Google + Microsoft sign-in later | Schools mostly use Google/Microsoft accounts |
| MCP server | `@modelcontextprotocol/server` (SDK v2), **Streamable HTTP** at `/mcp` | Serves both the 2026-07-28 spec and 2025-era clients from one handler |
| MCP auth | Better Auth `mcp()` plugin as the OAuth 2.1 server, plus `cimd()` for Client ID Metadata Documents; dynamic client registration kept as a fallback for older clients | Required for remote connectors. The user clicks "Connect", logs in to Klassdeck and approves. Tokens are audience-bound to `/mcp` |
| Spaced repetition | `ts-fsrs` (FSRS algorithm, same family Anki uses) | Proven scheduling, no AI needed |
| Validation | Zod | One schema shared by MCP tool input, the API, and the import format |
| Hosting | Vercel (app) + Neon (DB) | Free tier is enough for early stage |

## 3. Data model

```
users ─┬─< class_members >── classes
       │
       ├─< sets ──────────< questions ──< question_revisions
       │    (owner, optional class)  │
       │                             ├─< flags        (someone reports an error)
       │                             │
       └─< review_states >───────────┤  (per user × question: FSRS schedule)
       └─< review_logs   >───────────┘  (every answer, for stats)
```

### Tables

**users**: id, name, email, locale (`sl` / `en`), created_at

**classes**: id, name (e.g. "3.B Biologija"), school (optional), join_code (short, e.g. `K7P-Q2M`), created_by, created_at

**class_members**: class_id, user_id, role (`owner` | `teacher` | `student`), joined_at

**sets**
- id, title, subject, description
- owner_id, class_id (nullable means personal)
- visibility: `private` | `class` | `link` (anyone with the link can view)
- source: `mcp` | `web` | `import`; agent_name (e.g. "Claude"), recorded for transparency
- created_at, updated_at

**questions**
- id, set_id, position
- type: `flashcard` | `multiple_choice` | `true_false` | `short_answer`
- prompt, answer, choices (jsonb, MCQ only), explanation (optional)
- source_ref (optional, e.g. "Lecture 3, slide 12")
- verified_by (user_id, nullable). Set when a person marks the question as checked
- version (int), updated_at

**question_revisions**: question_id, version, snapshot (jsonb), edited_by, edited_at. This allows undo and shows who changed what in shared sets.

**flags**: id, question_id, user_id, reason (`wrong_answer` | `unclear` | `duplicate` | `other`), note, status (`open` | `resolved`), created_at

**review_states** (one row per user × question)
- user_id, question_id
- FSRS fields: due, stability, difficulty, reps, lapses, state, last_review

**review_logs**: user_id, question_id, rating (`again` | `hard` | `good` | `easy`), correct (bool), answered_at

### Rules

- Any class member can edit a class set, and each edit creates a revision. Owners and teachers can lock a set.
- Editing a question's prompt or answer clears `verified_by`.
- Every user has their own `review_states` for a shared set. Sharing a set shares the content, not the progress.

## 4. MCP server

Endpoint: `https://klassdeck.com/mcp` (Streamable HTTP, stateless). Each call runs as the logged-in user through the OAuth token.

### Tools

| Tool | Purpose | Input (short) |
|---|---|---|
| `list_classes` | Which classes am I in | — |
| `list_sets` | Find existing sets before creating duplicates | `query?`, `class_id?`, `subject?` |
| `get_set` | Read a set with its questions | `set_id` |
| `create_set` | Save a new set | `title`, `subject`, `class_id?`, `questions[]` |
| `add_questions` | Append to a set | `set_id`, `questions[]` |
| `update_question` | Fix a question (creates a revision) | `question_id`, changed fields |
| `get_weak_questions` | What the user keeps missing | `set_id?`, `subject?`, `limit` |
| `get_study_summary` | Due counts, streak, weakest subjects | `class_id?` |
| `report_issue` | AI-assisted fact check: flag a suspicious answer | `question_id`, `reason`, `note` |

Every write tool returns a **link to the set on Klassdeck**, so the chat always ends with "Saved: klassdeck.com/s/abc123".

### Question schema (shared by MCP, API, and import)

```ts
const Question = z.discriminatedUnion("type", [
  z.object({ type: z.literal("flashcard"),       prompt: z.string(), answer: z.string(), explanation: z.string().optional(), source_ref: z.string().optional() }),
  z.object({ type: z.literal("multiple_choice"), prompt: z.string(), choices: z.array(z.string()).min(2).max(6), correct_index: z.number().int(), explanation: z.string().optional(), source_ref: z.string().optional() }),
  z.object({ type: z.literal("true_false"),      prompt: z.string(), answer: z.boolean(), explanation: z.string().optional(), source_ref: z.string().optional() }),
  z.object({ type: z.literal("short_answer"),    prompt: z.string(), answer: z.string(), explanation: z.string().optional(), source_ref: z.string().optional() }),
]);
```

Tool descriptions should nudge the AI to include `explanation` and `source_ref`, which helps with trust and correction.

### Limits

- Maximum of 200 questions per call and 2,000 per set; text-length caps per field
- Rate limit per user (e.g. 60 writes/hour) so a looping agent can't flood the database

## 5. Import fallback (no MCP needed)

Many students use free AI plans or the mobile app, where custom connectors may not be available. So:

1. **"Copy prompt" button**: gives a ready-made prompt such as *"Make a quiz about X and output it in this JSON format: …"*
2. **Paste box**: accepts that JSON, or plain text such as `Q: … / A: …` lines or Markdown lists, parsed into questions
3. Preview → edit → save

Both paths end in the same validated `Question[]`.

## 6. Practice loop

- **Due today**: each user has a review queue built from `review_states.due <= now`, grouped by subject or class.
- **Modes**:
  - Flashcards: flip the card, then self-rate Again / Hard / Good / Easy
  - Quiz: MCQ and true/false are graded automatically and mapped to a rating (wrong = Again, right = Good)
  - Short answer: show the expected answer, then the user self-rates
- After each answer: write a `review_log` row and update `review_state` with FSRS.
- **Weak questions** = high lapse count or recent "again" ratings. This is what `get_weak_questions` returns.
- On a mistake, show the explanation plus a **"This answer is wrong"** button, which creates a flag.

## 7. Classes and sharing

- Create a class, then share the join code or QR code. Students join with one click.
- Class page: the class's sets, recent changes, and open flags.
- Optional class stats (teacher/owner only): the most-missed questions across the class, without exposing individual scores by default.
- `link` visibility: a read-only public page with a "Practice this / copy to my sets" button. This is how sets spread between classes.

## 8. Web app pages

```
/                     landing page + "Connect your AI" instructions
/login
/dashboard            due today, my classes, recent sets
/s/[id]               view set
/s/[id]/edit          editor (reorder, edit, delete, verify ✓)
/s/[id]/practice      practice session
/import               paste / copy-prompt flow
/c/[id]               class page
/join/[code]          join class
/settings/connections connected AIs (OAuth grants, revoke)
/mcp                  MCP endpoint (not a page)
```

## 9. Privacy and safety

- Many users will be minors. Collect the minimum: name, email, and study data. No ads or tracking.
- GDPR: EU-hosted database, account deletion and data export, and a clear privacy policy. In Slovenia, children under 15 need parental consent for online services. Decide early whether students sign up themselves or teachers invite them.
- Public (`link`) sets: report button and size limits. Watch for copied textbook content (copyright).
- OAuth scopes: AIs can only access the connected user's data. Grants can be revoked in settings.

## 10. Project structure

```
klassdeck/
├─ src/
│  ├─ app/                 Next.js pages + route handlers
│  │  └─ mcp/route.ts      MCP endpoint
│  ├─ core/                business logic (no web/MCP code here)
│  │  ├─ sets.ts           create/edit/revisions
│  │  ├─ classes.ts
│  │  ├─ review.ts         FSRS scheduling, weak questions
│  │  └─ schema.ts         Zod Question schema
│  ├─ mcp/tools/           one file per tool, thin wrappers around core/
│  ├─ db/                  Drizzle schema + migrations
│  └─ components/
└─ ARCHITECTURE.md
```

**Rule:** web pages, the REST API, and MCP tools all call `core/`, so behavior stays identical however content arrives.

## 11. Milestones

| # | Milestone | Done when |
|---|---|---|
| M1 | **Save from AI** | Log in, connect Claude, "save this quiz", and it appears on `/s/[id]` |
| M2 | **Edit + practice** | Editor works, FSRS practice works, the "due today" dashboard works |
| M3 | **Classes** | Create/join with a code, class sets, shared edits with revisions, flags |
| M4 | **Close the loop** | `get_weak_questions`, `get_study_summary`, class "most missed" stats |
| M5 | **Reach everyone** | Paste-import + copy-prompt, Slovenian/English UI, public link pages |
| M6 | **Pilot** | One real class uses it for 2 weeks. Measure how many come back to practice |

## 12. Open questions

1. Who signs up first: students alone, or teachers creating classes and inviting students? This affects onboarding and GDPR consent.
2. UI language at launch: Slovenian only, English only, or both from day one?
3. Do we need mobile from the start? A responsive web app / PWA is probably enough for M1–M5.
4. Which AI apps and plans support custom remote MCP connectors right now? Verify before M1.
