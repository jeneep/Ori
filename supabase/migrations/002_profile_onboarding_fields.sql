-- Additive profile fields for onboarding + settings.
-- Safe to run if 001 already applied without these columns.

alter table public.profiles
  add column if not exists goals text[] not null default '{}'::text[],
  add column if not exists constraints text not null default '',
  add column if not exists proactivity_frequency text not null default 'off',
  add column if not exists onboarding_completed boolean not null default false;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_proactivity_frequency_check'
  ) then
    alter table public.profiles
      add constraint profiles_proactivity_frequency_check
      check (proactivity_frequency in ('off', 'daily', 'weekly'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_goals_max_three'
  ) then
    alter table public.profiles
      add constraint profiles_goals_max_three
      check (cardinality(goals) <= 3);
  end if;
end $$;
