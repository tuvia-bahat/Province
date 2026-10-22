// Move enumeration and afterstate feature encoding for the learned evaluation function.
using System.Buffers.Binary;

namespace Province;

public static class Features
{
    public const int Planes = 12;
    public const int Scalars = 10;
    public static int Length(Board b) => Planes * b.Cells + Scalars;

    // Every legal action for the player to move, with EVERY soldier count (deduplicated across the two rolled squares), plus Pass.
    public static void Candidates(State s, List<Act> outp, Rules.Terr[] t)
    {
        outp.Clear();
        int p = s.Turn;
        var seen = new HashSet<long>();
        var src = new List<int>(); var tmp = new List<Target>(); var tg = new List<Target>();
        bool Add(Act a)
        {
            long key = ((long)a.Type << 40) | ((long)(a.From + 1) << 28) | ((long)(a.To + 1) << 16) | (long)a.Count;
            if (!seen.Add(key)) return false;
            outp.Add(a); return true;
        }
        int camp = s.Camp(p);
        foreach (int R in s.RollCells)
        {
            if (camp > 0 && Rules.CanLand(s, R, t[p], t[1 - p]))
                for (int c = 1; c <= camp; c++) Add(new Act { Type = AT.Land, R = R, From = -1, To = R, Count = c });
            foreach (var ty in new[] { AT.Move, AT.Transport, AT.Withdraw, AT.Bridge })
            {
                Rules.Sources(s, ty, R, t[p], src, tmp);
                foreach (int f in src.ToArray())
                {
                    int n = s.N[f];
                    if (ty == AT.Withdraw) { for (int c = 1; c <= n; c++) Add(new Act { Type = ty, R = R, From = f, To = f, Count = c }); continue; }
                    Rules.Targets(s, ty, R, f, t[p], tg);
                    foreach (var x in tg.ToArray())
                    {
                        if (ty == AT.Bridge) Add(new Act { Type = ty, R = R, From = f, To = x.To, Count = 0 });
                        else for (int c = 1; c <= n; c++) Add(new Act { Type = ty, R = R, From = f, To = x.To, Count = c });
                    }
                }
            }
        }
        outp.Add(new Act { Type = AT.Pass, From = -1, To = -1 });
    }

    // Compact wire format for training: soldier planes as bytes, the 10 binary planes bit-packed (LSB first), then the 10 scalars.
    public static int PackedLength(Board b) => 2 * b.Cells + (10 * b.Cells + 7) / 8 + Scalars;
    public static void EncodePacked(State ns, int m, byte[] dst, int off, byte[] tmp)
    {
        Encode(ns, m, tmp, 0);
        var b = ns.B; int C = b.Cells, nb = (10 * C + 7) / 8;
        Array.Copy(tmp, 0, dst, off, 2 * C);
        int bo = off + 2 * C; Array.Clear(dst, bo, nb);
        for (int j = 0; j < 10 * C; j++) if (tmp[2 * C + j] != 0) dst[bo + (j >> 3)] |= (byte)(1 << (j & 7));
        Array.Copy(tmp, Planes * C, dst, bo + nb, Scalars);
    }

    // Encode the position after the mover's move, from the mover's point of view.
    // Layout: 12 planes of Size*Size bytes, then 10 scalar bytes.
    public static void Encode(State ns, int m, byte[] dst, int off)
    {
        var b = ns.B; int S = b.Size, C = b.Cells;
        Array.Clear(dst, off, Length(b));
        int o = 1 - m;
        var ctl = new int[b.NProv]; Rules.Control(ns, ctl);
        var tm = Rules.MakeTerr(ns, m); var to = Rules.MakeTerr(ns, o);
        int bestM = BestComp(b, tm, m), bestO = BestComp(b, to, o);
        int heldM = 0, heldO = 0; foreach (int c in ctl) { if (c == m) heldM++; else if (c == o) heldO++; }
        for (int i = 0; i < C; i++)
        {
            if (ns.O[i] == m) dst[off + 0 * C + i] = ns.N[i];
            else if (ns.O[i] == o) dst[off + 1 * C + i] = ns.N[i];
            int pr = b.Prov[i], c = ctl[pr];
            if (c == m) { dst[off + 2 * C + i] = 1; if (bestM >= 0 && tm.Id[b.FirstCell[pr]] == bestM) dst[off + 4 * C + i] = 1; }
            else if (c == o) { dst[off + 3 * C + i] = 1; if (bestO >= 0 && to.Id[b.FirstCell[pr]] == bestO) dst[off + 5 * C + i] = 1; }
        }
        for (int e = 0; e < b.NEdges; e++)
        {
            int a = b.EdgeA[e], c2 = b.EdgeB[e];
            bool east = c2 == a + 1; int ow = ns.Br[e];
            if (ow == m) dst[off + (east ? 6 : 7) * C + a] = 1;
            else if (ow == o) dst[off + (east ? 8 : 9) * C + a] = 1;
        }
        // static river planes: river between a cell and its east / south neighbour
        for (int i = 0; i < C; i++)
        {
            if (i % S < S - 1 && b.Prov[i] != b.Prov[i + 1]) dst[off + 10 * C + i] = 1;
            if (i / S < S - 1 && b.Prov[i] != b.Prov[i + S]) dst[off + 11 * C + i] = 1;
        }
        int so = off + Planes * C;
        dst[so + 0] = (byte)ns.Camp(m); dst[so + 1] = (byte)ns.Camp(o);
        dst[so + 2] = (byte)ns.Grave[m]; dst[so + 3] = (byte)ns.Grave[o];
        dst[so + 4] = (byte)ns.BridgesLeft[m]; dst[so + 5] = (byte)ns.BridgesLeft[o];
        dst[so + 6] = (byte)heldM; dst[so + 7] = (byte)heldO;
        dst[so + 8] = (byte)CompCount(b, tm, m, bestM); dst[so + 9] = (byte)CompCount(b, to, o, bestO);
    }

    // id of the connected territory component that holds the most controlled provinces (-1 if none)
    static int BestComp(Board b, Rules.Terr t, int p)
    {
        int best = -1, bn = 0; Span<int> cnt = stackalloc int[b.Cells + 1]; cnt.Clear();
        for (int k = 0; k < b.NProv; k++)
        {
            if (t.Ctl[k] != p) continue;
            int id = t.Id[b.FirstCell[k]]; if (id < 0) continue;
            cnt[id]++;
            if (cnt[id] > bn) { bn = cnt[id]; best = id; }
        }
        return best;
    }
    static int CompCount(Board b, Rules.Terr t, int p, int best)
    {
        if (best < 0) return 0; int n = 0;
        for (int k = 0; k < b.NProv; k++) if (t.Ctl[k] == p && t.Id[b.FirstCell[k]] == best) n++;
        return n;
    }
}
