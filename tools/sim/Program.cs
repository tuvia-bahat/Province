using System.Diagnostics;
using System.Text.Json;
using Province;

static class Program
{
    static int Main(string[] args)
    {
        if (args.Length >= 2 && args[0] == "parity") return Parity.Run(args[1]);
        if (args.Length >= 1 && args[0] == "bench") return Bench.Run(args.Length > 1 ? int.Parse(args[1]) : 6, args.Length > 2 ? int.Parse(args[2]) : 2000);
        Console.WriteLine("usage: parity <trace.json> | bench [size] [games]");
        return 1;
    }
}

static class Parity
{
    static string Key(int[] a) => string.Join(",", a);
    static State Load(Board b, JsonElement s)
    {
        var st = new State(b);
        var o = s.GetProperty("o"); var n = s.GetProperty("n");
        for (int i = 0; i < b.Cells; i++) { int ov = o[i].GetInt32(); st.O[i] = ov < 0 ? State.None : (byte)ov; st.N[i] = (byte)n[i].GetInt32(); }
        foreach (var kv in s.GetProperty("br").EnumerateObject())
        {
            var parts = kv.Name.Split('-'); int a = int.Parse(parts[0]), c = int.Parse(parts[1]);
            st.Br[b.Edge[a, c]] = (sbyte)kv.Value.GetInt32();
        }
        st.BridgesLeft[0] = s.GetProperty("bl")[0].GetInt32(); st.BridgesLeft[1] = s.GetProperty("bl")[1].GetInt32();
        st.Grave[0] = s.GetProperty("g")[0].GetInt32(); st.Grave[1] = s.GetProperty("g")[1].GetInt32();
        st.Turn = s.GetProperty("t").GetInt32();
        var w = s.GetProperty("winner"); st.Winner = w.ValueKind == JsonValueKind.Null ? -1 : w.GetInt32();
        return st;
    }
    static string Diff(Board b, State a, State e)
    {
        for (int i = 0; i < b.Cells; i++) if (a.O[i] != e.O[i] || (a.O[i] != State.None && a.N[i] != e.N[i]) ) return $"cell {i}: got o={a.O[i]} n={a.N[i]} want o={e.O[i]} n={e.N[i]}";
        for (int i = 0; i < b.NEdges; i++) if (a.Br[i] != e.Br[i]) return $"bridge edge {i}: got {a.Br[i]} want {e.Br[i]}";
        if (a.BridgesLeft[0] != e.BridgesLeft[0] || a.BridgesLeft[1] != e.BridgesLeft[1]) return "bridgesLeft";
        if (a.Grave[0] != e.Grave[0] || a.Grave[1] != e.Grave[1]) return $"graveyard got {a.Grave[0]},{a.Grave[1]} want {e.Grave[0]},{e.Grave[1]}";
        if (a.Turn != e.Turn) return $"turn got {a.Turn} want {e.Turn}";
        if (a.Winner != e.Winner) return $"winner got {a.Winner} want {e.Winner}";
        return null;
    }
    static string[] Str(JsonElement arr) => arr.EnumerateArray().Select(x => x.GetString()).OrderBy(x => x, StringComparer.Ordinal).ToArray();

    public static int Run(string path)
    {
        using var doc = JsonDocument.Parse(File.ReadAllText(path));
        var root = doc.RootElement;
        int size = root.GetProperty("size").GetInt32();
        var b = new Board(size);
        int games = 0, steps = 0, fails = 0;
        foreach (var game in root.GetProperty("games").EnumerateArray())
        {
            games++;
            int si = 0;
            foreach (var step in game.EnumerateArray())
            {
                si++; steps++;
                var s = Load(b, step.GetProperty("s"));
                s.Roll(step.GetProperty("w").GetInt32(), step.GetProperty("b").GetInt32());
                var terrs = Rules.Terrs(s); int p = s.Turn;
                string err = null;
                // legality info per rolled cell
                foreach (var inf in step.GetProperty("info").EnumerateArray())
                {
                    int R = inf.GetProperty("R").GetInt32();
                    var types = Rules.ActionTypes(s, R, terrs).Select(x => x.ToString().ToLower()).OrderBy(x => x, StringComparer.Ordinal).ToArray();
                    var wantTypes = Str(inf.GetProperty("types"));
                    if (!types.SequenceEqual(wantTypes)) { err = $"types R={R}: got [{string.Join(",", types)}] want [{string.Join(",", wantTypes)}]"; break; }
                    var land = Rules.CanLand(s, R, terrs[p], terrs[1 - p]) ? "1" : "0";
                    if (land != inf.GetProperty("land").GetString()) { err = $"landable R={R}: got {land}"; break; }
                    var src = new List<int>(); var tmp = new List<Target>();
                    foreach (var ty in new[] { AT.Move, AT.Transport, AT.Withdraw, AT.Bridge })
                    {
                        Rules.Sources(s, ty, R, terrs[p], src, tmp);
                        string got = string.Join(",", src.OrderBy(x => x));
                        string want = inf.GetProperty("src").GetProperty(ty.ToString().ToLower()).GetString();
                        if (got != want) { err = $"sources {ty} R={R}: got [{got}] want [{want}]"; break; }
                        if (ty == AT.Withdraw) continue;
                        foreach (int f in src)
                        {
                            var tg = new List<Target>(); Rules.Targets(s, ty, R, f, terrs[p], tg);
                            string g2 = string.Join(",", tg.Select(x => $"{x.To}:{x.Kind.ToString().ToLower()}:{(int)x.Cross}").OrderBy(x => x, StringComparer.Ordinal));
                            string w2 = inf.GetProperty("tg").GetProperty($"{ty.ToString().ToLower()}:{f}").GetString();
                            if (g2 != w2) { err = $"targets {ty} R={R} from={f}: got [{g2}] want [{w2}]"; break; }
                        }
                        if (err != null) break;
                    }
                    if (err != null) break;
                }
                if (err == null)
                {
                    bool any = Rules.HasAnyMove(s);
                    if (any != step.GetProperty("any").GetBoolean()) err = $"hasAnyMove got {any}";
                }
                if (err == null)
                {
                    var a = step.GetProperty("act");
                    string ty = a.GetProperty("type").GetString();
                    State ns;
                    if (ty == "pass" || ty == "skip") ns = Rules.Pass(s);
                    else
                    {
                        var act = new Act
                        {
                            Type = Enum.Parse<AT>(ty, true), R = a.GetProperty("R").GetInt32(),
                            From = a.TryGetProperty("from", out var fr) && fr.ValueKind != JsonValueKind.Null ? fr.GetInt32() : -1,
                            To = a.TryGetProperty("to", out var to) && to.ValueKind != JsonValueKind.Null ? to.GetInt32() : -1,
                            Count = a.GetProperty("count").GetInt32(),
                        };
                        try { ns = Rules.Apply(s, act, terrs); } catch (Exception ex) { err = "apply threw: " + ex.Message; ns = null; }
                    }
                    if (err == null)
                    {
                        var after = step.GetProperty("after");
                        var exp = Load(b, after);
                        err = Diff(b, ns, exp);
                        if (err == null && ns.Winner < 0 || err == null)
                        {
                            for (int pl = 0; pl < 2 && err == null; pl++)
                            {
                                int held = Rules.ProvincesHeld(ns, pl), prog = Rules.WinProgress(ns, pl);
                                if (held != after.GetProperty("held")[pl].GetInt32() || prog != after.GetProperty("prog")[pl].GetInt32())
                                    err = $"held/progress p{pl}: got {held}/{prog} want {after.GetProperty("held")[pl].GetInt32()}/{after.GetProperty("prog")[pl].GetInt32()}";
                            }
                        }
                    }
                }
                if (err != null) { fails++; if (fails <= 10) Console.WriteLine($"FAIL game {games} step {si}: {err}"); }
            }
        }
        Console.WriteLine($"parity: size {size}, {games} games, {steps} steps, {fails} failures");
        return fails == 0 ? 0 : 2;
    }
}

static class Bench
{
    // random-playout speed (uniformly random legal action shapes)
    public static int Run(int size, int games)
    {
        var b = new Board(size); var rng = new Random(1);
        var sw = Stopwatch.StartNew(); long moves = 0; int w0 = 0, w1 = 0, dr = 0;
        for (int g = 0; g < games; g++)
        {
            var s = new State(b); int t = 0;
            while (s.Winner < 0 && t < 400)
            {
                s.Roll(rng.Next(1, size + 1), rng.Next(1, size + 1));
                var a = RandomAction.Pick(s, rng);
                s = Rules.Apply(s, a); t++; moves++;
            }
            if (s.Winner == 0) w0++; else if (s.Winner == 1) w1++; else dr++;
        }
        sw.Stop();
        Console.WriteLine($"{games} games, {moves} moves in {sw.Elapsed.TotalSeconds:F1}s = {moves / sw.Elapsed.TotalSeconds:F0} moves/s; wins {w0}/{w1}, unfinished {dr}");
        return 0;
    }
}

static class RandomAction
{
    public static Act Pick(State s, Random rng)
    {
        var terrs = Rules.Terrs(s); int p = s.Turn;
        var list = new List<Act>();
        var src = new List<int>(); var tmp = new List<Target>();
        foreach (int R in s.RollCells)
        {
            if (s.Camp(p) > 0 && Rules.CanLand(s, R, terrs[p], terrs[1 - p])) list.Add(new Act { Type = AT.Land, R = R, To = R, Count = rng.Next(1, s.Camp(p) + 1) });
            foreach (var ty in new[] { AT.Move, AT.Transport, AT.Withdraw, AT.Bridge })
            {
                Rules.Sources(s, ty, R, terrs[p], src, tmp);
                foreach (int f in src.ToArray())
                {
                    if (ty == AT.Withdraw) { list.Add(new Act { Type = ty, R = R, From = f, To = f, Count = rng.Next(1, s.N[f] + 1) }); continue; }
                    var tg = new List<Target>(); Rules.Targets(s, ty, R, f, terrs[p], tg);
                    foreach (var x in tg) list.Add(new Act { Type = ty, R = R, From = f, To = x.To, Count = ty == AT.Bridge ? 0 : rng.Next(1, s.N[f] + 1) });
                }
            }
        }
        if (list.Count == 0) return new Act { Type = AT.Pass };
        return list[rng.Next(list.Count)];
    }
}
