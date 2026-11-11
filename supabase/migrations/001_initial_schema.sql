-- =============================================================================
-- Ori — initial schema
-- Tables: profiles, topics, content, experiments, messages, conflict_choices
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "vector" with schema extensions;

-- ---------------------------------------------------------------------------
-- Helper: updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  goals text[] not null default '{}'::text[],
  constraints text not null default '',
  proactivity_frequency text not null default 'off'
    check (proactivity_frequency in ('off', 'daily', 'weekly')),
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint profiles_goals_max_three check (cardinality(goals) <= 3)
);

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.handle_updated_at();

-- Auto-create a profile row when a new auth user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- topics
-- ---------------------------------------------------------------------------
create table public.topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  description text,
  current_view text not null default '',
  status text not null default 'active'
    check (status in ('active', 'archived', 'resolved')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index topics_user_id_idx on public.topics (user_id);

create trigger topics_updated_at
  before update on public.topics
  for each row execute function public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- content
-- ---------------------------------------------------------------------------
create table public.content (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  topic_id uuid not null references public.topics (id) on delete cascade,
  title text,
  body text not null,
  source_url text,
  summary text,
  content_type text not null default 'note'
    check (content_type in ('note', 'document', 'summary', 'source', 'link', 'file')),
  embedding extensions.vector(1536),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index content_user_id_idx on public.content (user_id);
create index content_topic_id_idx on public.content (topic_id);

create trigger content_updated_at
  before update on public.content
  for each row execute function public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- experiments
-- ---------------------------------------------------------------------------
create table public.experiments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  topic_id uuid not null references public.topics (id) on delete cascade,
  name text not null,
  hypothesis text,
  status text not null default 'draft'
    check (status in ('draft', 'running', 'completed', 'cancelled')),
  config jsonb not null default '{}'::jsonb,
  results jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index experiments_user_id_idx on public.experiments (user_id);
create index experiments_topic_id_idx on public.experiments (topic_id);

create trigger experiments_updated_at
  before update on public.experiments
  for each row execute function public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- messages
-- ---------------------------------------------------------------------------
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  topic_id uuid not null references public.topics (id) on delete cascade,
  role text not null
    check (role in ('user', 'assistant', 'system')),
  content text not null,
  embedding extensions.vector(1536),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index messages_user_id_idx on public.messages (user_id);
create index messages_topic_id_idx on public.messages (topic_id);
create index messages_topic_id_created_at_idx on public.messages (topic_id, created_at);

-- ---------------------------------------------------------------------------
-- conflict_choices
-- ---------------------------------------------------------------------------
create table public.conflict_choices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  topic_id uuid not null references public.topics (id) on delete cascade,
  experiment_id uuid references public.experiments (id) on delete set null,
  prompt text not null,
  choice_a text not null,
  choice_b text not null,
  selected text
    check (selected is null or selected in ('a', 'b')),
  rationale text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index conflict_choices_user_id_idx on public.conflict_choices (user_id);
create index conflict_choices_topic_id_idx on public.conflict_choices (topic_id);

create trigger conflict_choices_updated_at
  before update on public.conflict_choices
  for each row execute function public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.topics enable row level security;
alter table public.content enable row level security;
alter table public.experiments enable row level security;
alter table public.messages enable row level security;
alter table public.conflict_choices enable row level security;

-- profiles
create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- topics
create policy "Users can view their own topics"
  on public.topics for select
  using (auth.uid() = user_id);

create policy "Users can insert their own topics"
  on public.topics for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own topics"
  on public.topics for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own topics"
  on public.topics for delete
  using (auth.uid() = user_id);

-- content
create policy "Users can view their own content"
  on public.content for select
  using (auth.uid() = user_id);

create policy "Users can insert their own content"
  on public.content for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own content"
  on public.content for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own content"
  on public.content for delete
  using (auth.uid() = user_id);

-- experiments
create policy "Users can view their own experiments"
  on public.experiments for select
  using (auth.uid() = user_id);

create policy "Users can insert their own experiments"
  on public.experiments for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own experiments"
  on public.experiments for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own experiments"
  on public.experiments for delete
  using (auth.uid() = user_id);

-- messages
create policy "Users can view their own messages"
  on public.messages for select
  using (auth.uid() = user_id);

create policy "Users can insert their own messages"
  on public.messages for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own messages"
  on public.messages for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own messages"
  on public.messages for delete
  using (auth.uid() = user_id);

-- conflict_choices
create policy "Users can view their own conflict choices"
  on public.conflict_choices for select
  using (auth.uid() = user_id);

create policy "Users can insert their own conflict choices"
  on public.conflict_choices for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own conflict choices"
  on public.conflict_choices for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own conflict choices"
  on public.conflict_choices for delete
  using (auth.uid() = user_id);
