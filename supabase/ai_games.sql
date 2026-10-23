-- Province: record every game played against the computer, readable only from the admin dashboard.
-- Run once in the Supabase SQL Editor (safe to re-run). Needs supabase/analytics.sql to have been run first (uses is_admin()).
--
-- The browser sends the move log of a game (rolls and actions, same format as online games) when the game ends, or when the player
-- leaves in the middle ("abandoned"). No names and no personal data: only the random visitor id that analytics already uses.

create table if not exists public.ai_games (
  gid uuid primary key,
  vid text not null,
  size int not null check (size in (6, 8)),
  events jsonb not null,
  moves int not null default 0,
  winner int,                       -- 0 = the player, 1 = the computer, null = unfinished
  ended text not null check (ended in ('win', 'abandoned')),
  nn boolean not null default false, -- true = the neural-network computer was used
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ai_games_created_idx on public.ai_games (created_at desc);
create index if not exists ai_games_vid_idx on public.ai_games (vid, created_at desc);
alter table public.ai_games enable row level security;   -- no policies: nobody reads or writes directly

create or replace function public.log_ai_game(p_gid uuid, p_vid text, p_size int, p_events jsonb, p_winner int, p_ended text, p_nn boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_gid is null or p_vid is null or length(p_vid) < 8 or length(p_vid) > 64 then return; end if;
  if p_size not in (6, 8) or p_ended not in ('win', 'abandoned') then return; end if;
  if p_events is null or jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) > 2000 or length(p_events::text) > 400000 then return; end if;
  if p_winner is not null and p_winner not in (0, 1) then return; end if;
  -- light spam guard: new games per visitor per day
  if not exists (select 1 from ai_games where gid = p_gid)
     and (select count(*) from ai_games where vid = p_vid and created_at > now() - interval '1 day') >= 200 then return; end if;
  insert into ai_games (gid, vid, size, events, moves, winner, ended, nn)
  values (p_gid, p_vid, p_size, p_events, jsonb_array_length(p_events), p_winner, p_ended, coalesce(p_nn, false))
  on conflict (gid) do update
    set events = excluded.events, moves = excluded.moves, winner = excluded.winner, ended = excluded.ended, nn = excluded.nn, updated_at = now()
    where ai_games.vid = excluded.vid;
end $$;
grant execute on function public.log_ai_game(uuid, text, int, jsonb, int, text, boolean) to anon, authenticated;

-- dashboard list: newest first (without the move log); p_day (optional) shows one day only (Asia/Jerusalem)
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
                select jsonb_build_object('id', gid, 'at', created_at, 'size', size, 'moves', moves, 'winner', winner, 'ended', ended, 'nn', nn, 'vid', left(vid, 6)) g
                from ai_games where created_at >= since and created_at < upto order by created_at desc limit greatest(1, least(coalesce(p_limit, 200), 500))) t));
end $$;
grant execute on function public.admin_ai_games(int, date, int) to authenticated;

-- one game with its move log (for the replay)
create or replace function public.admin_ai_game(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r ai_games;
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  select * into r from ai_games where gid = p_id;
  if not found then return null; end if;
  return jsonb_build_object('id', r.gid, 'at', r.created_at, 'size', r.size, 'winner', r.winner, 'ended', r.ended, 'nn', r.nn, 'events', r.events);
end $$;
grant execute on function public.admin_ai_game(uuid) to authenticated;
