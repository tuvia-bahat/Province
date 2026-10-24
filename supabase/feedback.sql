-- Province: player feedback written at the end of a game. Safe to re-run. Run in the Supabase SQL Editor (needs supabase/analytics.sql first: uses is_admin()).
-- The visitor id is stored only to limit spam (5 messages a day per visitor); the dashboard shows only the country.

create table if not exists public.feedback (
  id bigserial primary key,
  vid text not null,
  body text not null,
  ctx jsonb not null default '{}'::jsonb,   -- {board, mode, won, beta}
  created_at timestamptz not null default now()
);
create index if not exists feedback_created_idx on public.feedback (created_at desc);
create index if not exists feedback_vid_idx on public.feedback (vid, created_at desc);
alter table public.feedback enable row level security;   -- no policies: all access goes through the functions below

create or replace function public.submit_feedback(p_vid text, p_body text, p_ctx jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare b text := left(trim(coalesce(p_body, '')), 1000);
begin
  if p_vid is null or length(p_vid) < 8 or length(p_vid) > 64 or length(b) < 2 then return; end if;
  if (select count(*) from feedback where vid = p_vid and created_at > now() - interval '1 day') >= 5 then return; end if;
  insert into feedback (vid, body, ctx)
  values (p_vid, b, case when jsonb_typeof(p_ctx) = 'object' and length(p_ctx::text) < 500 then p_ctx else '{}'::jsonb end);
end $$;
grant execute on function public.submit_feedback(text, text, jsonb) to anon, authenticated;

-- ADMIN: read the feedback
create or replace function public.admin_feedback(p_limit int default 200)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'at', f.created_at, 'body', f.body, 'ctx', f.ctx,
            'country', (select e.country from events e where e.vid = f.vid and e.country is not null order by e.at desc limit 1)) order by f.created_at desc), '[]'::jsonb)
          from (select * from feedback order by created_at desc limit greatest(1, least(coalesce(p_limit, 200), 500))) f);
end $$;
grant execute on function public.admin_feedback(int) to authenticated;
