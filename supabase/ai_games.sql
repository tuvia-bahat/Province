-- Province: games played against the computer. Safe to re-run. Run in the Supabase SQL Editor (needs supabase/analytics.sql first: uses is_admin()).
--
-- * The browser sends the move log of a game WHILE it is played (every few seconds after a move), so a game exists on the server even if the player just leaves.
-- * A game that is not finished and has had no move for 30 minutes counts as ABANDONED: it is shown as a win for the computer ("resigned"),
--   in the public lobby history and in the dashboard (where you can see how many moves the player made before leaving).
-- * Every finished or abandoned game (6+ events) is PUBLIC in the lobby history and can be replayed. The visitor id and the country are never public.
-- * The admin can hide a game from the public list.

create table if not exists public.ai_games (
  gid uuid primary key,
  vid text not null,
  size int not null check (size in (6, 8)),
  events jsonb not null,
  moves int not null default 0,
  winner int,                        -- 0 = the player, 1 = the computer, null = unfinished
  ended text not null default 'live',
  nn boolean not null default false, -- true = the neural-network computer was used
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.ai_games add column if not exists name text;
alter table public.ai_games add column if not exists hidden boolean not null default false;
alter table public.ai_games add column if not exists beta boolean not null default false;   -- played with ?beta=1: never shown in the public lobby list
alter table public.ai_games add column if not exists my_moves int not null default 0;   -- actions (moves and passes) the player made
alter table public.ai_games drop constraint if exists ai_games_ended_check;
alter table public.ai_games add constraint ai_games_ended_check check (ended in ('win', 'abandoned', 'live'));
create index if not exists ai_games_created_idx on public.ai_games (created_at desc);
create index if not exists ai_games_vid_idx on public.ai_games (vid, created_at desc);
alter table public.ai_games enable row level security;   -- no policies: all access goes through the functions below

drop function if exists public.log_ai_game(uuid, text, int, jsonb, int, text, boolean);
drop function if exists public.log_ai_game(uuid, text, int, jsonb, int, text, boolean, text);
drop function if exists public.log_ai_game(uuid, text, int, jsonb, int, text, boolean, text, boolean);
create or replace function public.log_ai_game(p_gid uuid, p_vid text, p_size int, p_events jsonb, p_winner int, p_ended text, p_nn boolean, p_name text default null, p_beta boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare nm text := left(coalesce(nullif(trim(p_name), ''), 'Player'), 20); mine int;
begin
  if p_gid is null or p_vid is null or length(p_vid) < 8 or length(p_vid) > 64 then return; end if;
  if p_size not in (6, 8) or p_ended not in ('win', 'abandoned', 'live') then return; end if;
  if p_events is null or jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) > 2000 or length(p_events::text) > 400000 then return; end if;
  if p_winner is not null and p_winner not in (0, 1) then return; end if;
  if not exists (select 1 from ai_games where gid = p_gid)
     and (select count(*) from ai_games where vid = p_vid and created_at > now() - interval '1 day') >= 200 then return; end if;
  select count(*) into mine from jsonb_array_elements(p_events) e where e ->> 'actor' = '0' and e ->> 'kind' in ('act', 'skip');
  insert into ai_games (gid, vid, size, events, moves, my_moves, winner, ended, nn, name, beta)
  values (p_gid, p_vid, p_size, p_events, jsonb_array_length(p_events), mine, p_winner, p_ended, coalesce(p_nn, false), nm, coalesce(p_beta, false))
  on conflict (gid) do update
    set events = excluded.events, moves = excluded.moves, my_moves = excluded.my_moves, winner = excluded.winner, ended = excluded.ended, nn = excluded.nn, name = excluded.name, beta = excluded.beta, updated_at = now()
    where ai_games.vid = excluded.vid;
end $$;
grant execute on function public.log_ai_game(uuid, text, int, jsonb, int, text, boolean, text, boolean) to anon, authenticated;

-- PUBLIC: lobby list = games being played right now (a move in the last 10 minutes) + finished games + abandoned games (a win for the computer).
-- Beta games (?beta=1) are never listed. No visitor id, no country.
create or replace function public.public_ai_games(p_limit int default 20)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(g), '[]'::jsonb) from (
    select jsonb_build_object('id', gid, 'at', updated_at, 'size', size, 'name', coalesce(name, 'Player'), 'moves', moves, 'nn', nn,
             'live', ended = 'live' and updated_at >= now() - interval '10 minutes',
             'winner', case when ended = 'win' then winner when ended = 'live' and updated_at >= now() - interval '10 minutes' then null else 1 end,
             'quit', ended <> 'win' and not (ended = 'live' and updated_at >= now() - interval '10 minutes')) g
    from ai_games
    where not hidden and not beta
      and ((ended = 'live' and updated_at >= now() - interval '10 minutes' and moves >= 4)
        or (moves >= 6 and (ended in ('win', 'abandoned') or (ended = 'live' and updated_at < now() - interval '30 minutes'))))
    order by updated_at desc limit greatest(1, least(coalesce(p_limit, 20), 100))) t;
$$;
grant execute on function public.public_ai_games(int) to anon, authenticated;

-- PUBLIC: one game with its move log (for the replay)
create or replace function public.public_ai_game(p_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', gid, 'at', updated_at, 'size', size, 'name', coalesce(name, 'Player'), 'nn', nn, 'events', events,
           'winner', case when ended = 'win' then winner when ended = 'live' and updated_at >= now() - interval '10 minutes' then null else 1 end,
           'ended', case when ended = 'win' then 'win' when ended = 'live' and updated_at >= now() - interval '10 minutes' then 'live' else 'abandoned' end)
  from ai_games where gid = p_id and not hidden;
$$;
grant execute on function public.public_ai_game(uuid) to anon, authenticated;

-- ADMIN: dashboard list + summary; p_day (optional) shows one day only (Asia/Jerusalem)
drop function if exists public.admin_ai_games(int, date, int);
create or replace function public.admin_ai_games(p_days int default 30, p_day date default null, p_limit int default 200)
returns jsonb language plpgsql security definer set search_path = public as $$
declare since timestamptz; upto timestamptz;
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  if p_day is not null then since := p_day::timestamp at time zone 'Asia/Jerusalem'; upto := (p_day + 1)::timestamp at time zone 'Asia/Jerusalem';
  else since := now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365))); upto := now() + interval '1 day'; end if;
  return (with x as (
    select a.*, case when a.ended = 'live' and a.updated_at < now() - interval '30 minutes' then 'abandoned' else a.ended end as eff
    from ai_games a where a.created_at >= since and a.created_at < upto)
  select jsonb_build_object(
    'summary', (select jsonb_build_object('games', count(*), 'finished', count(*) filter (where eff = 'win'),
                  'player_wins', count(*) filter (where eff = 'win' and winner = 0),
                  'quit', count(*) filter (where eff = 'abandoned'), 'live', count(*) filter (where eff = 'live'),
                  'quit_median_moves', (select percentile_cont(0.5) within group (order by my_moves) from x where eff = 'abandoned'),
                  'quit_early', count(*) filter (where eff = 'abandoned' and my_moves < 5),
                  'nn_finished', count(*) filter (where eff = 'win' and nn), 'nn_player_wins', count(*) filter (where eff = 'win' and winner = 0 and nn),
                  'old_finished', count(*) filter (where eff = 'win' and not nn), 'old_player_wins', count(*) filter (where eff = 'win' and winner = 0 and not nn)) from x),
    'games', (select coalesce(jsonb_agg(g order by (g ->> 'at') desc), '[]'::jsonb) from (
                select jsonb_build_object('id', x.gid, 'at', x.created_at, 'size', x.size, 'moves', x.moves, 'my_moves', x.my_moves, 'winner', x.winner, 'ended', x.eff, 'nn', x.nn,
                         'name', coalesce(x.name, 'Player'), 'hidden', x.hidden, 'beta', x.beta, 'vid', left(x.vid, 6),
                         'country', (select e.country from events e where e.vid = x.vid and e.country is not null order by e.at desc limit 1)) g
                from x order by x.created_at desc limit greatest(1, least(coalesce(p_limit, 200), 500))) t)));
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

drop function if exists public.admin_ai_game(uuid);
