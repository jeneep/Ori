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
middleware.ts
public/
```

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
| `/dashboard` | Protected dashboard (requires session) |

Middleware refreshes the Supabase session and redirects unauthenticated users away from `/dashboard`.
