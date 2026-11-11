-- Capture/ingest fields for content records

alter table public.content
  add column if not exists source_url text,
  add column if not exists summary text;

-- Expand allowed content types for link/file capture
alter table public.content
  drop constraint if exists content_content_type_check;

alter table public.content
  add constraint content_content_type_check
  check (content_type in ('note', 'document', 'summary', 'source', 'link', 'file'));
