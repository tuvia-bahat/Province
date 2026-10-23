-- Province: games played against the computer. Safe to re-run. Run in the Supabase SQL Editor (needs supabase/analytics.sql first: uses is_admin()).
--
-- * Every finished game vs the computer is PUBLIC: it appears in the lobby history (player name vs Computer) and anyone can replay it.
-- * The browser sends the move log (rolls and actions, same format as online games) and the name the player typed.
-- * The visitor id and the country are NEVER public; only the dashboard (admin) sees them. The admin can hide a game from the public list.

create table if not exists public.ai_games (
  gid uuid primary key,
  vid text not null,
  size int not null check (size in (6, 8)),
  events jsonb not null,
  moves int not null default 0,
  winner int,                        -- 0 = the player, 1 = the computer, null = unfinished
  ended text not null check (ended in ('win', 'abandoned')),
  nn boolean not null default false, -- true = the neural-network computer was used
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.ai_games add column if not exists name text;
alter table public.ai_games add column if not exists hidden boolean not null default false;
create index if not exists ai_games_created_idx on public.ai_games (created_at desc);
create index if not exists ai_games_vid_idx on public.ai_games (vid, created_at desc);
alter table public.ai_games enable row level security;   -- no policies: all access goes through the functions below

drop function if exists public.log_ai_game(uuid, text, int, jsonb, int, text, boolean);
create or replace function public.log_ai_game(p_gid uuid, p_vid text, p_size int, p_events jsonb, p_winner int, p_ended text, p_nn boolean, p_name text default null)
returns void language plpgsql security definer set search_path = public as $$
declare nm text := left(coalesce(nullif(trim(p_name), ''), 'Player'), 20);
begin
  if p_gid is null or p_vid is null or length(p_vid) < 8 or length(p_vid) > 64 then return; end if;
  if p_size not in (6, 8) or p_ended not in ('win', 'abandoned') then return; end if;
  if p_events is null or jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) > 2000 or length(p_events::text) > 400000 then return; end if;
  if p_winner is not null and p_winner not in (0, 1) then return; end if;
  if not exists (select 1 from ai_games where gid = p_gid)
     and (select count(*) from ai_games where vid = p_vid and created_at > now() - interval '1 day') >= 200 then return; end if;
  insert into ai_games (gid, vid, size, events, moves, winner, ended, nn, name)
  values (p_gid, p_vid, p_size, p_events, jsonb_array_length(p_events), p_winner, p_ended, coalesce(p_nn, false), nm)
  on conflict (gid) do update
    set events = excluded.events, moves = excluded.moves, winner = excluded.winner, ended = excluded.ended, nn = excluded.nn, name = excluded.name, updated_at = now()
    where ai_games.vid = excluded.vid;
end $$;
grant execute on function public.log_ai_game(uuid, text, int, jsonb, int, text, boolean, text) to anon, authenticated;

-- PUBLIC: finished games for the lobby history (no visitor id, no country)
create or replace function public.public_ai_games(p_limit int default 20)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(g), '[]'::jsonb) from (
    select jsonb_build_object('id', gid, 'at', updated_at, 'size', size, 'name', coalesce(name, 'Player'), 'winner', winner, 'moves', moves, 'nn', nn) g
    from ai_games where ended = 'win' and not hidden and moves >= 6
    order by updated_at desc limit greatest(1, least(coalesce(p_limit, 20), 100))) t;
$$;
grant execute on function public.public_ai_games(int) to anon, authenticated;

-- PUBLIC: one finished game with its move log (for the replay)
create or replace function public.public_ai_game(p_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', gid, 'at', updated_at, 'size', size, 'name', coalesce(name, 'Player'), 'winner', winner, 'ended', ended, 'nn', nn, 'events', events)
  from ai_games where gid = p_id and not hidden;
$$;
grant execute on function public.public_ai_game(uuid) to anon, authenticated;

-- ADMIN: dashboard list (with name, country and hidden flag); p_day (optional) shows one day only (Asia/Jerusalem)
drop function if exists public.admin_ai_games(int, date, int);
create or replace function public.admin_ai_games(p_days int default 30, p_day date default null, p_limit int default 200)
returns jsonb language plpgsql security definer set search_path = public as $$
declare since timestamptz; upto timestamptz;
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  if p_day is not null then since := p_day::timestamp at time zone 'Asia/Jerusalem'; upto := (p_day + 1)::timestamp at time zone 'Asia/Jerusalem';
  else since := now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365))); upto := now() + interval '1 day'; end if;
  return jsonb_build_object(
    'summary', (select jsonb_build_object('games', count(*), 'finished', count(*) filter (where ended = 'win'),
                  'player_wins', count(*) filter (where winner = 0),
                  'nn_finished', count(*) filter (where ended = 'win' and nn), 'nn_player_wins', count(*) filter (where winner = 0 and nn),
                  'old_finished', count(*) filter (where ended = 'win' and not nn), 'old_player_wins', count(*) filter (where winner = 0 and not nn))
                from ai_games where created_at >= since and created_at < upto),
    'games', (select coalesce(jsonb_agg(g order by (g ->> 'at') desc), '[]'::jsonb) from (
                select jsonb_build_object('id', a.gid, 'at', a.created_at, 'size', a.size, 'moves', a.moves, 'winner', a.winner, 'ended', a.ended, 'nn', a.nn,
                         'name', coalesce(a.name, 'Player'), 'hidden', a.hidden, 'vid', left(a.vid, 6),
                         'country', (select e.country from events e where e.vid = a.vid and e.country is not null order by e.at desc limit 1)) g
                from ai_games a where a.created_at >= since and a.created_at < upto order by a.created_at desc limit greatest(1, least(coalesce(p_limit, 200), 500))) t));
end $$;
grant execute on function public.admin_ai_games(int, date, int) to authenticated;

-- ADMIN: hide / show a game in the public list
create or replace function public.admin_hide_ai_game(p_id uuid, p_hidden boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  update ai_games set hidden = coalesce(p_hidden, true) where gid = p_id;
end $$;
grant execute on function public.admin_hide_ai_game(uuid, boolean) to authenticated;

-- (the old admin-only replay function is no longer used)
drop function if exists public.admin_ai_game(uuid);
