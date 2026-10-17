-- Pre-launch cleanup: deletes ALL games, moves and analytics events (test data).
-- Run once in the Supabase SQL Editor before you publish. It does not touch the admins table.
-- WARNING: this cannot be undone.

delete from public.moves;
delete from public.game_live;
delete from public.games;
delete from public.events;
