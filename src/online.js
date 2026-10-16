/* Province – שכבת הרשת (Supabase). כל הגישה לשרת עוברת דרך הקובץ הזה, כדי שאפשר יהיה להחליף ספק בקלות.
 * שחקנים הם משתמשים אנונימיים של Supabase; השם נשמר בדפדפן. כל הכתיבה היא דרך פונקציות SQL (ראו supabase/schema.sql).
 */
(function (root) {
  'use strict';
  const URL = 'https://hckplrwzsfuwmscwhlhr.supabase.co';
  const KEY = 'sb_publishable_5ur391jcRIaWSoBT2CmN-w_yKlhKq-A';
  const NAME_KEY = 'province.name';
  let sb = null, uid = null, ready = null;

  const ago = (ms) => new Date(Date.now() - ms).toISOString();
  const must = ({ data, error }) => { if (error) throw new Error(error.message || String(error)); return data; };

  function init() {
    if (ready) return ready;
    ready = (async () => {
      if (!root.supabase || !root.supabase.createClient) throw new Error('Online play is unavailable (offline?)');
      sb = root.supabase.createClient(URL, KEY, { auth: { persistSession: true, autoRefreshToken: true } });
      let { data: { session } } = await sb.auth.getSession();
      if (!session) session = must(await sb.auth.signInAnonymously()).session;
      uid = session.user.id;
    })().catch((e) => { ready = null; throw e; });
    return ready;
  }

  const getName = () => { try { return localStorage.getItem(NAME_KEY) || ''; } catch (e) { return ''; } };
  const setName = (n) => { try { localStorage.setItem(NAME_KEY, n); } catch (e) { /* ignore */ } };
  const cleanName = (n) => String(n || '').trim().slice(0, 20);

  async function lobby() {
    await init();
    const [open, active, finished] = await Promise.all([
      sb.from('games').select('*').eq('status', 'open').gt('created_at', ago(60 * 60e3)).order('created_at', { ascending: false }).limit(30),
      sb.from('games').select('*, game_live!inner(last_move_at)').eq('status', 'active').gt('game_live.last_move_at', ago(20 * 60e3)).order('created_at', { ascending: false }).limit(30),
      sb.from('games').select('*').eq('status', 'finished').gt('moves_count', 0).order('last_move_at', { ascending: false }).limit(30),
    ]);
    return { open: must(open), active: must(active), finished: must(finished) };
  }
  async function getGame(id) {
    await init();
    const g = must(await sb.from('games').select('*, game_live(*)').eq('id', id).single());
    g.live = (Array.isArray(g.game_live) ? g.game_live[0] : g.game_live) || { last_move_at: g.last_move_at };
    return g;
  }
  async function getMoves(id) { await init(); return must(await sb.from('moves').select('n,actor,kind,data').eq('game_id', id).order('n', { ascending: true })); }

  async function createGame(size, name) { await init(); return must(await sb.rpc('create_game', { p_size: size, p_name: name })); }
  async function joinGame(id, name) { await init(); must(await sb.rpc('join_game', { p_id: id, p_name: name })); }
  async function cancelGame(id) { await init(); must(await sb.rpc('cancel_game', { p_id: id })); }
  async function resign(id) { await init(); must(await sb.rpc('resign', { p_id: id })); }
  async function claimTimeout(id) { await init(); must(await sb.rpc('claim_timeout', { p_id: id })); }
  async function submit(id, n, kind, data, turnAfter, winner) {
    await init();
    must(await sb.rpc('submit_event', { p_id: id, p_n: n, p_kind: kind, p_data: data || {}, p_turn_after: turnAfter, p_winner: winner === null || winner === undefined ? null : winner }));
  }

  // מנויים בזמן אמת; מחזירים פונקציית ביטול
  function watchLobby(cb) {
    const ch = sb.channel('lobby-' + Math.random().toString(36).slice(2))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games' }, cb).subscribe();
    return () => sb.removeChannel(ch);
  }
  function watchGame(id, onMove, onGame, onLive) {
    const ch = sb.channel('game-' + id + '-' + Math.random().toString(36).slice(2))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'moves', filter: `game_id=eq.${id}` }, (p) => onMove(p.new))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${id}` }, (p) => onGame(p.new))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'game_live', filter: `game_id=eq.${id}` }, (p) => onLive(p.new))
      .subscribe();
    return () => sb.removeChannel(ch);
  }

  // כמה אנשים מחוברים כרגע (Presence): ערוץ אחד פתוח כל עוד האתר פתוח
  let pres = null;
  async function presence(cb) {
    await init();
    if (pres) return;
    pres = sb.channel('presence-online', { config: { presence: { key: uid } } });
    pres.on('presence', { event: 'sync' }, () => cb(Object.keys(pres.presenceState()).length))
      .subscribe(async (status) => { if (status === 'SUBSCRIBED') await pres.track({ at: Date.now() }); });
  }

  root.Online = {
    init, presence, lobby, getGame, getMoves, createGame, joinGame, cancelGame, resign, claimTimeout, submit, watchLobby, watchGame,
    getName, setName, cleanName, get uid() { return uid; },
  };
})(window);
