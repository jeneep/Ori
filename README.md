# Ori

Next.js 14 (App Router) starter with TypeScript, Tailwind CSS, and Supabase Auth.

## Stack

- **Next.js 14** — App Router, Server Components
- **TypeScript**
- **Tailwind CSS**
- **Supabase** — `@supabase/ssr` + `@supabase/supabase-js`

## Folder structure

```
app/
  (auth)/
    login/page.tsx
    signup/page.tsx
    layout.tsx
  (dashboard)/
    dashboard/page.tsx
    layout.tsx
  auth/callback/route.ts
  layout.tsx
  page.tsx
components/
  auth/
  dashboard/
lib/
  supabase/
    client.ts
    server.ts
    middleware.ts
types/
  database.ts
supabase/
  migrations/
    001_initial_schema.sql
middleware.ts
public/
```

## Database

Initial schema lives in `supabase/migrations/001_initial_schema.sql`:

- **profiles** — mirrors `auth.users` (auto-created on signup)
- **topics** — user-owned conversation / conflict topics
- **content** — topic content with optional `vector(1536)` embeddings
- **experiments** — topic experiments with JSON config/results
- **messages** — chat messages per topic (optional embeddings)
- **conflict_choices** — A/B conflict choices tied to a topic (and optional experiment)

All tables have RLS (own-row access). Indexes exist on `user_id` and `topic_id` where applicable.

Apply via the Supabase SQL editor or CLI (`supabase db push` / `supabase migration up`).

### Content capture
- `CaptureForm` accepts a pasted link or file upload and requires an existing topic
- `POST /api/ingest` stores `title`, `source_url` or raw text (`body`), `content_type`, and an LLM `summary`
- Topic pages at `/topics/[topicId]` list captured content

### Persona settings
- Settings lets you name Ori, choose a tone (calm guide / direct coach / wise friend / custom), and add a short guide note
- Stored on `profiles` (`ori_name`, `persona_tone`, `persona_custom_tone`, `persona_guide_note`)
- Injected into every coach system prompt and the synthetic reasoning layer
- Settings UI includes a live preview of how Ori will sound

### Extreme proactivity (digests)
- Digest frequency on `profiles.proactivity_frequency`: `off` | `daily` | `weekly`
- Mute individual topics via `topics.muted` (excluded from digests + dashboard check-in)
- Dashboard shows a calm dark **Check-in / Next digest** card summarizing open experiments and recent current-view updates
- `GET/POST /api/proactive` generates digest content from persona + current views + experiments (`lib/proactive/digest.ts`)
- Cron-ready: `POST /api/proactive` with `Authorization: Bearer $CRON_SECRET` and `{ "mode": "due" }` (needs `SUPABASE_SERVICE_ROLE_KEY`); advances `profiles.last_digest_at`
- Authenticated preview: `GET /api/proactive` or `POST /api/proactive` with `{ "force": true }`

### Coach chat
- Topic page shows `current_view` and a chat that loads recent messages
- `POST /api/coach` pulls the user model, current view, recent content, and recent messages, then replies consistently with that synthesis
- Substantial questions and new captures run a **synthetic reasoning** pass: retrieve relevant content + experiments + persona, compare reinforcements/conflicts/gaps, synthesize an updated understanding, then either auto-refine a small aligned `current_view` change or offer an update
- UI shows a calm “Refining current view…” indicator during deeper reasoning
- Important exchanges can offer a `current_view` update; chat can create experiment cards
- Requires `GROK_API_KEY` (also accepts `XAI_API_KEY` or `Grok_key`) for xAI chat completions at `https://api.x.ai/v1`; otherwise the API returns an offline fallback and surfaces the provider error
- Default model is `grok-4` (override with `GROK_MODEL` / `XAI_MODEL`)
- `GET /api/coach/health` probes Grok chat completions so bad/missing keys are reported as not ready
- `npm run smoke:coach-llm` exercises the Grok coach JSON path without Supabase
- `npm run smoke:persona-proactivity` verifies persona prompt injection, digest frequency/muting, and a Grok-polished sample digest that skips muted topics

### Export + deletion
- Export a topic or all account data as Markdown or JSON (`GET /api/export`)
- Delete a topic with typed confirmation (`DELETE /api/topics/[topicId]`)
- Delete account with typed confirmation (`DELETE /api/account`)
- Settings includes a short ownership note: you own your Ori data

## Environment variables

Copy `.env.local.example` to `.env.local` and set:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
GROK_API_KEY=your-grok-api-key
```

Supabase values are in **Supabase Dashboard → Project Settings → API**. Create a Grok/xAI key in the [xAI console](https://console.x.ai/).

## Getting started

```bash
npm install
cp .env.local.example .env.local
# fill in Supabase values
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Auth routes

| Path | Description |
|------|-------------|
| `/login` | Email/password sign-in |
| `/signup` | Email/password sign-up |
| `/auth/callback` | OAuth / email confirmation callback |
| `/dashboard` | Protected dashboard (requires session + onboarding) |
| `/onboarding` | Collect goals, constraints, and first topic |
| `/settings` | Edit persona, goals, digest frequency, muted topics |
| `/api/proactive` | Generate / preview digests (user session or cron) |

Middleware refreshes the Supabase session, sends new users to `/onboarding`, and redirects unauthenticated users away from protected routes.
