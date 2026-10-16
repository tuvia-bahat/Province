-- Province online: safe to run again (idempotent). Run the whole file in the Supabase SQL Editor.
-- Players are anonymous Supabase users (auth.uid()); all writes go through the functions below.
--
-- games      = lifecycle only (created / joined / finished / cancelled)  -> the lobby listens to this
-- game_live  = per-move state (turn, move count, last move time)         -> only players/spectators of that game listen
-- moves      = the event log (rolls and actions)

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  size int not null check (size in (6, 8)),
  status text not null default 'open' check (status in ('open', 'active', 'finished', 'cancelled')),
  p0 uuid not null,
  p1 uuid,
  name0 text not null,
  name1 text,
  turn int not null default 0,
  winner int,
  ended_by text,
  moves_count int not null default 0,
  created_at timestamptz not null default now(),
  last_move_at timestamptz not null default now()
);
create index if not exists games_status_idx on public.games (status, created_at desc);

create table if not exists public.game_live (
  game_id uuid primary key references public.games (id) on delete cascade,
  turn int not null default 0,
  moves_count int not null default 0,
  last_move_at timestamptz not null default now()
);
insert into public.game_live (game_id, turn, moves_count, last_move_at)
  select id, turn, moves_count, last_move_at from public.games
  on conflict (game_id) do nothing;

create table if not exists public.moves (
  game_id uuid not null references public.games (id) on delete cascade,
  n int not null,
  actor int not null,
  kind text not null check (kind in ('roll', 'act', 'skip')),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (game_id, n)
);

alter table public.games enable row level security;
alter table public.game_live enable row level security;
alter table public.moves enable row level security;
drop policy if exists games_read on public.games;
drop policy if exists game_live_read on public.game_live;
drop policy if exists moves_read on public.moves;
create policy games_read on public.games for select using (true);
create policy game_live_read on public.game_live for select using (true);
create policy moves_read on public.moves for select using (true);
-- no insert/update/delete policies: clients can only write through the functions

create or replace function public.create_game(p_size int, p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); gid uuid;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if p_size not in (6, 8) then raise exception 'bad size'; end if;
  update games set status = 'cancelled' where p0 = uid and status = 'open';
  insert into games (size, p0, name0) values (p_size, uid, left(coalesce(nullif(trim(p_name), ''), 'Player'), 20))
  returning id into gid;
  insert into game_live (game_id) values (gid);
  return gid;
end $$;

create or replace function public.join_game(p_id uuid, p_name text)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in'; end if;
  update games set p1 = uid, name1 = left(coalesce(nullif(trim(p_name), ''), 'Player'), 20), status = 'active', last_move_at = now()
  where id = p_id and status = 'open' and p0 <> uid and p1 is null;
  if not found then raise exception 'game not available'; end if;
  update game_live set last_move_at = now() where game_id = p_id;
end $$;

create or replace function public.cancel_game(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update games set status = 'cancelled' where id = p_id and p0 = auth.uid() and status = 'open';
end $$;

create or replace function public.submit_event(p_id uuid, p_n int, p_kind text, p_data jsonb, p_turn_after int, p_winner int)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); g games; l game_live; seat int;
begin
  select * into g from games where id = p_id for update;
  if not found or g.status <> 'active' then raise exception 'game not active'; end if;
  select * into l from game_live where game_id = p_id for update;
  seat := case when g.p0 = uid then 0 when g.p1 = uid then 1 else null end;
  if seat is null then raise exception 'not a player'; end if;
  if seat <> l.turn then raise exception 'not your turn'; end if;
  if p_n <> l.moves_count + 1 then raise exception 'out of order'; end if;
  if p_kind not in ('roll', 'act', 'skip') then raise exception 'bad kind'; end if;
  insert into moves (game_id, n, actor, kind, data) values (p_id, p_n, seat, p_kind, coalesce(p_data, '{}'::jsonb));
  update game_live set moves_count = p_n, last_move_at = now(), turn = coalesce(p_turn_after, l.turn) where game_id = p_id;
  if p_winner is not null then
    update games set status = 'finished', winner = p_winner, ended_by = 'win', moves_count = p_n, last_move_at = now() where id = p_id;
  end if;
end $$;

create or replace function public.resign(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); g games; seat int;
begin
  select * into g from games where id = p_id for update;
  if not found or g.status <> 'active' then return; end if;
  seat := case when g.p0 = uid then 0 when g.p1 = uid then 1 else null end;
  if seat is null then raise exception 'not a player'; end if;
  update games set status = 'finished', winner = 1 - seat, ended_by = 'resign', last_move_at = now(), moves_count = (select moves_count from game_live where game_id = p_id) where id = p_id;
end $$;

create or replace function public.claim_timeout(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); g games; l game_live; seat int;
begin
  select * into g from games where id = p_id for update;
  if not found or g.status <> 'active' then return; end if;
  select * into l from game_live where game_id = p_id;
  seat := case when g.p0 = uid then 0 when g.p1 = uid then 1 else null end;
  if seat is null or seat = l.turn then raise exception 'not allowed'; end if;
  if now() - l.last_move_at < interval '5 minutes' then raise exception 'too early'; end if;
  update games set status = 'finished', winner = seat, ended_by = 'timeout', last_move_at = now(), moves_count = l.moves_count where id = p_id;
end $$;

grant execute on function public.create_game(int, text) to authenticated;
grant execute on function public.join_game(uuid, text) to authenticated;
grant execute on function public.cancel_game(uuid) to authenticated;
grant execute on function public.submit_event(uuid, int, text, jsonb, int, int) to authenticated;
grant execute on function public.resign(uuid) to authenticated;
grant execute on function public.claim_timeout(uuid) to authenticated;

-- live updates (ignore "already member" errors when re-running)
do $$ begin alter publication supabase_realtime add table public.games; exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table public.game_live; exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table public.moves; exception when others then null; end $$;
