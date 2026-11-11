-- Extreme proactivity: mute topics + track last digest delivery.

alter table public.topics
  add column if not exists muted boolean not null default false;

alter table public.profiles
  add column if not exists last_digest_at timestamptz;

create index if not exists topics_user_id_muted_idx
  on public.topics (user_id, muted);

comment on column public.topics.muted is
  'When true, topic is excluded from digests and proactive check-ins.';

comment on column public.profiles.last_digest_at is
  'UTC timestamp of the last generated proactive digest for this user.';

comment on column public.profiles.proactivity_frequency is
  'Digest cadence: off | daily | weekly.';
