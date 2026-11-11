-- Synthesized working model for each topic (shown + updated via coach chat)

alter table public.topics
  add column if not exists current_view text not null default '';
