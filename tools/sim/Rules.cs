// Province rules engine in C#: a faithful port of src/rules.js with the live-game options
// (provinceTerritory = true, winConnected = true). Used for fast self-play / AI training.
// Parity with the JS engine is checked by `dotnet run -c Release -- parity <trace.json>` (see tests/trace.html).
using System.Numerics;

namespace Province;

public enum AT : byte { Land = 0, Move = 1, Transport = 2, Withdraw = 3, Bridge = 4, Pass = 5 }
public enum Kind : byte { Move = 0, Attack = 1, Transport = 2, Bridge = 3 }
public enum Cross : sbyte { Blocked = -1, None = 0, Place = 1, Replace = 2 }

public struct Act
{
    public AT Type; public int R, From, To, Count;
    public override string ToString() => $"{Type} R{R} {From}->{To} x{Count}";
}

public struct Target { public int To; public Kind Kind; public Cross Cross; }

public sealed class Board
{
    public readonly int Size, Cells, PR, NProv, Soldiers, Bridges, Win;
    public readonly int[][] Nei;          // neighbours of each cell (order: +x, -x, +y, -y)
    public readonly int[] Prov;           // province of each cell
    public readonly int[,] Edge;          // river-crossing edge id for an adjacent pair, -1 otherwise
    public readonly int NEdges;
    public readonly int[] FirstCell;      // first cell of each province
    public readonly int[] EdgeA, EdgeB;   // the two cells of each river edge (A < B)

    public Board(int size)
    {
        Size = size; Cells = size * size; PR = size / 2; NProv = PR * PR;
        (Soldiers, Bridges, Win) = size == 6 ? (36, 8, 5) : (54, 14, 8);
        Prov = new int[Cells];
        for (int i = 0; i < Cells; i++) Prov[i] = (i / Size / 2) * PR + (i % Size) / 2;
        Nei = new int[Cells][];
        int[][] dirs = { new[] { 1, 0 }, new[] { -1, 0 }, new[] { 0, 1 }, new[] { 0, -1 } };
        for (int i = 0; i < Cells; i++)
        {
            var l = new List<int>(4); int x = i % Size, y = i / Size;
            foreach (var d in dirs) { int nx = x + d[0], ny = y + d[1]; if (nx >= 0 && nx < Size && ny >= 0 && ny < Size) l.Add(ny * Size + nx); }
            Nei[i] = l.ToArray();
        }
        Edge = new int[Cells, Cells];
        for (int a = 0; a < Cells; a++) for (int b = 0; b < Cells; b++) Edge[a, b] = -1;
        int e = 0;
        for (int a = 0; a < Cells; a++) foreach (int b in Nei[a]) if (a < b && Prov[a] != Prov[b]) { Edge[a, b] = Edge[b, a] = e++; }
        NEdges = e;
        EdgeA = new int[e]; EdgeB = new int[e];
        for (int a = 0; a < Cells; a++) foreach (int c in Nei[a]) if (a < c && Edge[a, c] >= 0) { EdgeA[Edge[a, c]] = a; EdgeB[Edge[a, c]] = c; }
        FirstCell = new int[NProv];
        for (int k = 0; k < NProv; k++) FirstCell[k] = (k / PR * 2) * Size + (k % PR) * 2;
    }
    public bool Crosses(int a, int b) => Prov[a] != Prov[b];
    public int Idx(int x, int y) => y * Size + x;
}

public sealed class State
{
    public readonly Board B;
    public byte[] O;        // owner: 0, 1 or 255 (none)
    public byte[] N;        // soldiers
    public sbyte[] Br;      // bridge owner per river edge, -1 none
    public int[] BridgesLeft = new int[2];
    public int[] Grave = new int[2];
    public int Turn;
    public bool HasRoll; public int RollW, RollB; public int[] RollCells = new int[2];
    public int Winner = -1;
    public const byte None = 255;

    public State(Board b)
    {
        B = b; O = new byte[b.Cells]; N = new byte[b.Cells]; Br = new sbyte[b.NEdges];
        Array.Fill(O, None); Array.Fill(Br, (sbyte)-1);
        BridgesLeft[0] = BridgesLeft[1] = b.Bridges;
    }
    public State Clone()
    {
        var s = new State(B);
        Array.Copy(O, s.O, O.Length); Array.Copy(N, s.N, N.Length); Array.Copy(Br, s.Br, Br.Length);
        s.BridgesLeft[0] = BridgesLeft[0]; s.BridgesLeft[1] = BridgesLeft[1];
        s.Grave[0] = Grave[0]; s.Grave[1] = Grave[1];
        s.Turn = Turn; s.HasRoll = HasRoll; s.RollW = RollW; s.RollB = RollB; s.RollCells[0] = RollCells[0]; s.RollCells[1] = RollCells[1]; s.Winner = Winner;
        return s;
    }
    public int OnBoard(int p) { int t = 0; for (int i = 0; i < O.Length; i++) if (O[i] == p) t += N[i]; return t; }
    public int Camp(int p) => B.Soldiers - OnBoard(p) - Grave[p];

    public void Roll(int w, int b)
    {
        HasRoll = true; RollW = w; RollB = b;
        RollCells[0] = B.Idx(w - 1, b - 1); RollCells[1] = B.Idx(B.Size - w, B.Size - b);
    }
}

public static class Rules
{
    // ---------- control / territory ----------
    public static void Control(State s, int[] ctl)   // -1 none, else owner
    {
        var b = s.B; Span<int> mask = stackalloc int[b.NProv]; mask.Clear();
        for (int i = 0; i < b.Cells; i++) if (s.O[i] != State.None) mask[b.Prov[i]] |= 1 << s.O[i];
        for (int k = 0; k < b.NProv; k++) ctl[k] = mask[k] == 1 ? 0 : mask[k] == 2 ? 1 : -1;
    }
    public static int ProvincesHeld(State s, int p)
    {
        var ctl = new int[s.B.NProv]; Control(s, ctl); int n = 0; foreach (int c in ctl) if (c == p) n++; return n;
    }
    public static bool[] Nodes(State s, int p, int[] ctl = null)
    {
        var b = s.B; var nodes = new bool[b.Cells];
        if (ctl == null) { ctl = new int[b.NProv]; Control(s, ctl); }
        for (int i = 0; i < b.Cells; i++) nodes[i] = s.O[i] == p || ctl[b.Prov[i]] == p;
        return nodes;
    }

    // component id per node (or -1) and the lists
    public static int[] Components(State s, int p, bool[] nodes, out List<List<int>> lists)
    {
        var b = s.B; var id = new int[b.Cells]; Array.Fill(id, -1); lists = new List<List<int>>();
        for (int i = 0; i < b.Cells; i++)
        {
            if (id[i] >= 0 || !nodes[i]) continue;
            int k = lists.Count; var list = new List<int> { i }; id[i] = k;
            for (int h = 0; h < list.Count; h++)
            {
                int cur = list[h];
                foreach (int n in b.Nei[cur])
                {
                    if (id[n] >= 0 || !nodes[n]) continue;
                    if (b.Crosses(cur, n) && s.Br[b.Edge[cur, n]] != p) continue;
                    id[n] = k; list.Add(n);
                }
            }
            lists.Add(list);
        }
        return id;
    }

    // Territory helper: component id + lists for player p
    public sealed class Terr { public bool[] Nodes; public int[] Id; public List<List<int>> Lists; public int[] Ctl; }
    public static Terr MakeTerr(State s, int p)
    {
        var t = new Terr { Ctl = new int[s.B.NProv] };
        Control(s, t.Ctl); t.Nodes = Nodes(s, p, t.Ctl); t.Id = Components(s, p, t.Nodes, out t.Lists);
        return t;
    }
    static bool InComp(Terr t, int start, int cell) => t.Id[start] >= 0 && t.Id[cell] == t.Id[start];

    public static int WinProgress(State s, int p)
    {
        var b = s.B; var t = MakeTerr(s, p);
        var done = new bool[b.NProv]; int best = 0;
        for (int k = 0; k < b.NProv; k++)
        {
            if (t.Ctl[k] != p || done[k]) continue;
            int c0 = t.Id[b.FirstCell[k]], n = 0;
            for (int j = 0; j < b.NProv; j++) if (t.Ctl[j] == p && t.Id[b.FirstCell[j]] == c0 && c0 >= 0) { n++; done[j] = true; }
            if (n > best) best = n;
        }
        return best;
    }

    // ---------- legality ----------
    public static Cross Crossing(State s, int p, int a, int c)
    {
        var b = s.B;
        if (!b.Crosses(a, c)) return Cross.None;
        int br = s.Br[b.Edge[a, c]];
        if (br == p) return Cross.None;
        if (br < 0) return s.BridgesLeft[p] > 0 ? Cross.Place : Cross.Blocked;
        if (s.O[a] == p && s.O[c] == p && s.BridgesLeft[p] > 0) return Cross.Replace;
        return Cross.Blocked;
    }

    public static void Targets(State s, AT type, int R, int from, Terr t, List<Target> outp)
    {
        var b = s.B; int p = s.Turn; outp.Clear();
        if (type == AT.Move || type == AT.Bridge)
        {
            bool inT = t.Nodes[R] && InComp(t, R, from);
            bool adjR = false; foreach (int n in b.Nei[from]) if (n == R) adjR = true;
            Span<int> cand = stackalloc int[4]; int nc = 0;
            if (inT) { foreach (int n in b.Nei[from]) cand[nc++] = n; }
            else if (adjR) cand[nc++] = R;
            for (int i = 0; i < nc; i++)
            {
                int n = cand[i];
                if (type == AT.Bridge)
                {
                    if (!b.Crosses(from, n)) continue;
                    var cr = Crossing(s, p, from, n);
                    if (cr != Cross.Blocked && cr != Cross.None) outp.Add(new Target { To = n, Kind = Kind.Bridge, Cross = cr });
                }
                else
                {
                    var cr = Crossing(s, p, from, n);
                    if (cr == Cross.Blocked) continue;
                    byte o = s.O[n];
                    outp.Add(new Target { To = n, Kind = o == State.None || o == p ? Kind.Move : Kind.Attack, Cross = cr });
                }
            }
        }
        else if (type == AT.Transport)
        {
            int fx = from % b.Size, fy = from / b.Size;
            int[] dx = { 1, -1, 0, 0 }, dy = { 0, 0, 1, -1 };
            for (int d = 0; d < 4; d++)
            {
                int cx = fx, cy = fy;
                for (; ; )
                {
                    int nx = cx + dx[d], ny = cy + dy[d];
                    if (nx < 0 || nx >= b.Size || ny < 0 || ny >= b.Size) break;
                    int prev = cy * b.Size + cx, nxt = ny * b.Size + nx;
                    if (!t.Nodes[nxt]) break;
                    if (b.Crosses(prev, nxt) && s.Br[b.Edge[prev, nxt]] != p) break;
                    outp.Add(new Target { To = nxt, Kind = Kind.Transport, Cross = Cross.None });
                    cx = nx; cy = ny;
                }
            }
        }
    }

    // sources for an action type given the rolled cell R
    public static void Sources(State s, AT type, int R, Terr t, List<int> outp, List<Target> tmp)
    {
        var b = s.B; int p = s.Turn; outp.Clear();
        if (type == AT.Land || type == AT.Pass) return;
        if (t.Nodes[R])
        {
            int k = t.Id[R];
            if (k >= 0) foreach (int i in t.Lists[k]) if (s.O[i] == p) outp.Add(i);
            if (type == AT.Move || type == AT.Bridge) foreach (int n in b.Nei[R]) if (s.O[n] == p && !outp.Contains(n)) outp.Add(n);
        }
        else if (type == AT.Move || type == AT.Bridge) { foreach (int n in b.Nei[R]) if (s.O[n] == p) outp.Add(n); }
        else return;
        if (type == AT.Withdraw) return;
        for (int i = outp.Count - 1; i >= 0; i--)
        {
            Targets(s, type, R, outp[i], t, tmp);
            if (tmp.Count == 0) outp.RemoveAt(i);
        }
    }

    public static bool CanLand(State s, int R, Terr mine, Terr theirs)
    {
        int p = s.Turn;
        if (theirs.Nodes[R]) return false;
        return s.O[R] == State.None || s.O[R] == p;
    }

    public static Terr[] Terrs(State s) => new[] { MakeTerr(s, 0), MakeTerr(s, 1) };

    // list the legal action *shapes* for a rolled cell: used by parity checks and tools
    public static List<AT> ActionTypes(State s, int R, Terr[] t)
    {
        var res = new List<AT>(); int p = s.Turn;
        if (s.Camp(p) > 0 && CanLand(s, R, t[p], t[1 - p])) res.Add(AT.Land);
        var src = new List<int>(); var tmp = new List<Target>();
        foreach (var ty in new[] { AT.Move, AT.Transport, AT.Withdraw, AT.Bridge })
        {
            Sources(s, ty, R, t[p], src, tmp);
            if (src.Count > 0) res.Add(ty);
        }
        return res;
    }

    public static bool HasAnyMove(State s)
    {
        if (!s.HasRoll) return false;
        var t = Terrs(s);
        foreach (int R in s.RollCells) if (ActionTypes(s, R, t).Count > 0) return true;
        return false;
    }

    // ---------- applying ----------
    public static void EndTurn(State s)
    {
        int p = s.Turn;
        if (ProvincesHeld(s, p) >= s.B.Win && WinProgress(s, p) >= s.B.Win) s.Winner = p;
        else s.Turn = 1 - p;
        s.HasRoll = false;
    }
    public static State Pass(State s) { var ns = s.Clone(); EndTurn(ns); return ns; }

    // Applies a legal action (callers must pass legal actions; use Validate for untrusted input).
    public static State Apply(State s, Act a, Terr[] t = null)
    {
        var b = s.B; int p = s.Turn, q = 1 - p;
        if (a.Type == AT.Pass) return Pass(s);
        var ns = s.Clone();
        if (a.Type == AT.Land)
        {
            int to = a.To < 0 ? a.R : a.To;
            ns.O[to] = (byte)p; ns.N[to] = (byte)(ns.N[to] + a.Count);
        }
        else
        {
            t ??= Terrs(s);
            int src = a.From;
            if (a.Type == AT.Withdraw) ns.N[src] = (byte)(ns.N[src] - a.Count);
            else
            {
                var tg = new List<Target>(); Targets(s, a.Type, a.R, a.From, t[p], tg);
                Target tt = default; bool found = false;
                foreach (var x in tg) if (x.To == a.To) { tt = x; found = true; break; }
                if (!found) throw new InvalidOperationException("illegal target");
                if (tt.Cross == Cross.Place || tt.Cross == Cross.Replace) { ns.Br[b.Edge[a.From, a.To]] = (sbyte)p; ns.BridgesLeft[p]--; }
                if (a.Type == AT.Bridge) { }
                else if (tt.Kind == Kind.Attack)
                {
                    int def = s.N[a.To], killed = Math.Min(a.Count, def);
                    ns.N[src] = (byte)(ns.N[src] - a.Count);
                    ns.Grave[q] += killed;
                    if (a.Count > def) { ns.O[a.To] = (byte)p; ns.N[a.To] = (byte)(a.Count - def); }
                    else if (a.Count == def) { ns.O[a.To] = State.None; ns.N[a.To] = 0; }
                    else ns.N[a.To] = (byte)(def - a.Count);
                }
                else
                {
                    ns.N[src] = (byte)(ns.N[src] - a.Count);
                    ns.O[a.To] = (byte)p; ns.N[a.To] = (byte)(ns.N[a.To] + a.Count);
                }
            }
            if (ns.N[src] == 0) ns.O[src] = State.None;
        }
        EndTurn(ns);
        return ns;
    }
}
