// Self-play server: runs many games in lock-step and talks to the Python trainer over stdin/stdout (binary, little endian).
//
// Server -> Python, once per step:
//   int32 G
//   G x { int32 nc, int32 mover, int32 finished(-2 none, -1 unfinished, 0/1 winner of the game that just ended in this slot),
//         int32 prog0, int32 prog1, int32 held0, int32 held1 }   (final progress numbers of the finished game)
//   total_nc x F bytes of afterstate features (see Features.Encode), slot after slot
//   total_nc bytes: 1 if that candidate wins the game immediately
// Python -> server: G x int32 (chosen candidate index per slot; -1 to quit)
using System.Diagnostics;

namespace Province;

public static class Server
{
    sealed class Slot
    {
        public State S; public Random Rng; public int Turns; public List<Act> Acts = new(); public byte[] Feat = new byte[0]; public byte[] Term = new byte[0];
        public int Finished = -2, P0, P1, H0, H1;
    }

    public static int Run(int size, int G, int seed, int maxTurns)
    {
        var b = new Board(size); int F = Features.Length(b);
        var slots = new Slot[G];
        for (int g = 0; g < G; g++) { slots[g] = new Slot { Rng = new Random(seed * 100003 + g) }; Start(b, slots[g]); }
        var stdout = new BufferedStream(Console.OpenStandardOutput(), 1 << 20);
        var stdin = Console.OpenStandardInput();
        var hdr = new byte[4 * (1 + 7 * G)]; var choice = new byte[4 * G];

        while (true)
        {
            Parallel.For(0, G, g => Prepare(b, slots[g], F));
            int total = 0; foreach (var sl in slots) total += sl.Acts.Count;
            var w = new BinaryWriter(stdout);
            w.Write(G);
            foreach (var sl in slots) { w.Write(sl.Acts.Count); w.Write(sl.S.Turn); w.Write(sl.Finished); w.Write(sl.P0); w.Write(sl.P1); w.Write(sl.H0); w.Write(sl.H1); }
            foreach (var sl in slots) stdout.Write(sl.Feat, 0, sl.Acts.Count * F);
            foreach (var sl in slots) stdout.Write(sl.Term, 0, sl.Acts.Count);
            stdout.Flush();
            int got = 0; while (got < choice.Length) { int r = stdin.Read(choice, got, choice.Length - got); if (r <= 0) return 0; got += r; }
            var ch = new int[G]; for (int g = 0; g < G; g++) { ch[g] = BitConverter.ToInt32(choice, 4 * g); if (ch[g] < 0) return 0; }
            Parallel.For(0, G, g => Advance(b, slots[g], ch[g], maxTurns));
        }
    }

    static void Start(Board b, Slot sl)
    {
        sl.S = new State(b); sl.Turns = 0;
        sl.S.Roll(sl.Rng.Next(1, b.Size + 1), sl.Rng.Next(1, b.Size + 1));
    }

    static void Prepare(Board b, Slot sl, int F)
    {
        var s = sl.S; var t = Rules.Terrs(s);
        Features.Candidates(s, sl.Acts, t);
        int n = sl.Acts.Count;
        if (sl.Feat.Length < n * F) { sl.Feat = new byte[n * F * 5 / 4]; sl.Term = new byte[n * 5 / 4 + 8]; }
        int m = s.Turn;
        for (int i = 0; i < n; i++)
        {
            var ns = Rules.Apply(s, sl.Acts[i], t);
            Features.Encode(ns, m, sl.Feat, i * F);
            sl.Term[i] = (byte)(ns.Winner == m ? 1 : 0);
        }
    }

    static void Advance(Board b, Slot sl, int choice, int maxTurns)
    {
        sl.Finished = -2;
        var s = sl.S; var t = Rules.Terrs(s);
        var ns = Rules.Apply(s, sl.Acts[choice], t);
        sl.Turns++;
        if (ns.Winner >= 0 || sl.Turns >= maxTurns)
        {
            sl.Finished = ns.Winner >= 0 ? ns.Winner : -1;
            sl.P0 = Rules.WinProgress(ns, 0); sl.P1 = Rules.WinProgress(ns, 1);
            sl.H0 = Rules.ProvincesHeld(ns, 0); sl.H1 = Rules.ProvincesHeld(ns, 1);
            Start(b, sl);
        }
        else { sl.S = ns; ns.Roll(sl.Rng.Next(1, b.Size + 1), sl.Rng.Next(1, b.Size + 1)); }
    }
}
