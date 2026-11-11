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

### Coach chat
- Topic page shows `current_view` and a chat that loads recent messages
- `POST /api/coach` pulls the user model, current view, recent content, and recent messages, then replies consistently with that synthesis
- Important exchanges can offer a `current_view` update; chat can create experiment cards

## Environment variables

Copy `.env.local.example` to `.env.local` and set:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Values are in **Supabase Dashboard → Project Settings → API**.

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
| `/settings` | Edit goals, constraints, proactivity frequency |

Middleware refreshes the Supabase session, sends new users to `/onboarding`, and redirects unauthenticated users away from protected routes.
