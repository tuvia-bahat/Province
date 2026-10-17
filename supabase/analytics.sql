-- Province analytics: run once in the Supabase SQL Editor (safe to re-run).
--
-- BEFORE RUNNING: replace  YOUR_EMAIL@example.com  (last line) with the email you will use to log in to the dashboard.
-- Then create that user in Supabase: Authentication -> Users -> Add user -> Create new user (email + password, tick "Auto Confirm User").
--
-- events  = anonymous usage events (random visitor id, no personal data). Nobody can read it directly.
-- admins  = who may open the dashboard (checked by email on the logged-in, non-anonymous account).

create table if not exists public.events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  vid text not null,
  sid text,
  name text not null,
  props jsonb not null default '{}'::jsonb
);
alter table public.events add column if not exists country text;
alter table public.events add column if not exists city text;
alter table public.events add column if not exists lat double precision;
alter table public.events add column if not exists lng double precision;
create index if not exists events_at_idx on public.events (at);
create index if not exists events_name_at_idx on public.events (name, at);
create index if not exists events_vid_idx on public.events (vid, at);
alter table public.events enable row level security;   -- no policies: no direct reads or writes

create table if not exists public.admins (email text primary key);
alter table public.admins enable row level security;

create or replace function public.track_event(p_vid text, p_sid text, p_name text, p_props jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare h json; cc text; ct text; la double precision; ln double precision;
begin
  if p_name is null or p_name !~ '^[a-z_0-9]{1,40}$' then return; end if;
  if p_vid is null or length(p_vid) < 8 or length(p_vid) > 64 then return; end if;
  -- light spam guard: at most 120 events per visitor per minute
  if (select count(*) from events where vid = p_vid and at > now() - interval '1 minute') > 120 then return; end if;
  -- rough location from the request headers (no IP address is stored)
  begin h := nullif(current_setting('request.headers', true), '')::json; exception when others then h := null; end;
  cc := upper(left(coalesce(h ->> 'cf-ipcountry', ''), 2));
  if cc !~ '^[A-Z]{2}$' or cc in ('XX', 'T1') then cc := null; end if;
  ct := nullif(left(coalesce(h ->> 'cf-ipcity', ''), 60), '');
  begin la := nullif(h ->> 'cf-iplatitude', '')::double precision; ln := nullif(h ->> 'cf-iplongitude', '')::double precision; exception when others then la := null; ln := null; end;
  if ct is null and p_props ? 'city' then ct := nullif(left(p_props ->> 'city', 60), ''); end if;
  if la is null and p_props ? 'lat' then
    begin la := (p_props ->> 'lat')::double precision; ln := (p_props ->> 'lng')::double precision; exception when others then la := null; ln := null; end;
  end if;
  if la is not null and (la < -90 or la > 90 or ln < -180 or ln > 180) then la := null; ln := null; end if;
  insert into events (vid, sid, name, props, country, city, lat, lng)
  values (p_vid, left(p_sid, 64), p_name, case when length(coalesce(p_props, '{}'::jsonb)::text) > 500 then '{}'::jsonb else coalesce(p_props, '{}'::jsonb) end, cc, ct, la, ln);
end $$;
grant execute on function public.track_event(text, text, text, jsonb) to anon, authenticated;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
     and exists (select 1 from admins where lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;
grant execute on function public.is_admin() to authenticated;

create or replace function public.admin_stats(p_days int default 30)
returns jsonb language plpgsql security definer set search_path = public as $$
declare since timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)));
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  return jsonb_build_object(
    'since', since,
    'visitors', (select count(distinct vid) from events where at >= since),
    'visits', (select count(*) from events where name = 'visit' and at >= since),
    'returning', (select count(distinct vid) from events where name = 'visit' and at >= since and props ->> 'returning' = 'true'),
    'mobile', (select count(distinct vid) from events where name = 'visit' and at >= since and props ->> 'mobile' = 'true'),
    'desktop', (select count(distinct vid) from events where name = 'visit' and at >= since and coalesce(props ->> 'mobile', 'false') <> 'true'),
    'standalone', (select count(distinct vid) from events where name = 'visit' and at >= since and props ->> 'standalone' = 'true'),
    'steps', (select coalesce(jsonb_object_agg(name, n), '{}'::jsonb) from (select name, count(distinct vid) n from events where at >= since group by name) s),
    'counts', (select coalesce(jsonb_object_agg(name, n), '{}'::jsonb) from (select name, count(*) n from events where at >= since group by name) s),
    'ai_start_by_board', (select coalesce(jsonb_object_agg(b, n), '{}'::jsonb) from (select props ->> 'board' b, count(distinct vid) n from events where name = 'ai_start' and at >= since group by 1) s),
    'ai_end_by_board', (select coalesce(jsonb_object_agg(b, n), '{}'::jsonb) from (select props ->> 'board' b, count(distinct vid) n from events where name = 'ai_end' and at >= since group by 1) s),
    'ai_win_by_board', (select coalesce(jsonb_object_agg(b, n), '{}'::jsonb) from (select props ->> 'board' b, count(distinct vid) n from events where name = 'ai_end' and props ->> 'won' = 'true' and at >= since group by 1) s),
    'lessons', (select coalesce(jsonb_object_agg(n, c), '{}'::jsonb) from (select props ->> 'n' n, count(distinct vid) c from events where name = 'tutorial_lesson_done' and at >= since group by 1) s),
    'countries', (select coalesce(jsonb_object_agg(country, n), '{}'::jsonb) from (select country, count(distinct vid) n from events where at >= since and country is not null group by country) s),
    'cities', (select coalesce(jsonb_agg(jsonb_build_object('city', city, 'country', country, 'lat', lat, 'lng', lng, 'n', n) order by n desc), '[]'::jsonb)
               from (select city, country, round(lat::numeric, 2)::float8 lat, round(lng::numeric, 2)::float8 lng, count(distinct vid) n
                     from events where at >= since and lat is not null and lng is not null group by 1, 2, 3, 4 order by 5 desc limit 300) s),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'visitors', v, 'games', g) order by d), '[]'::jsonb)
              from (select (at at time zone 'Asia/Jerusalem')::date d, count(distinct vid) v,
                           count(*) filter (where name in ('ai_start', 'online_create', 'online_join')) g
                    from events where at >= since group by 1) t)
  );
end $$;
grant execute on function public.admin_stats(int) to authenticated;

-- who may open the dashboard: run this ONCE with your own email (it is already done if the dashboard works for you).
-- Do not commit your real email to the repo.
-- insert into public.admins (email) values ('YOUR_EMAIL@example.com') on conflict do nothing;

-- diagnostic: shows which location headers the platform provides (safe: returns only the caller's own request headers)
create or replace function public.debug_headers() returns json language sql stable as $$
  select coalesce(nullif(current_setting('request.headers', true), '')::json, '{}'::json);
$$;
grant execute on function public.debug_headers() to anon, authenticated;
