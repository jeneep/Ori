-- Persona settings for Ori's coaching voice.

alter table public.profiles
  add column if not exists ori_name text not null default 'Ori',
  add column if not exists persona_tone text not null default 'calm_guide',
  add column if not exists persona_custom_tone text not null default '',
  add column if not exists persona_guide_note text not null default '';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_persona_tone_check'
  ) then
    alter table public.profiles
      add constraint profiles_persona_tone_check
      check (
        persona_tone in (
          'calm_guide',
          'direct_coach',
          'wise_friend',
          'custom'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_ori_name_not_blank'
  ) then
    alter table public.profiles
      add constraint profiles_ori_name_not_blank
      check (length(trim(ori_name)) > 0);
  end if;
end $$;
