-- Allow users to delete their own profile (app data cascade + account cleanup)

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'Users can delete their own profile'
  ) then
    create policy "Users can delete their own profile"
      on public.profiles for delete
      using (auth.uid() = id);
  end if;
end $$;
