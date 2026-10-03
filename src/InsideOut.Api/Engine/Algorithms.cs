namespace InsideOut.Engine;

/// <summary>
/// One lens as a vector space. Mirrors the rule in db/schema.sql:
/// component = (score or 0) * sqrt(weight), dimensions ordered by position.
/// </summary>
public sealed class VectorSpace(Lens lens)
{
    public Lens Lens { get; } = lens;
    /// <summary>Active (non-archived) dimensions in vector order.</summary>
    public IReadOnlyList<Dimension> Dims { get; } = lens.Dimensions.Where(d => d.ArchivedAt is null)
        .OrderBy(d => d.Position).ThenBy(d => d.Id.ToString()).ToList();

    /// <summary>Largest possible distance: every dimension at opposite extremes.</summary>
    public double MaxDistance => Scale.Span * Math.Sqrt(Dims.Sum(d => d.Weight));

    public double[] Vector(IReadOnlyDictionary<Guid, double> scores) =>
        Dims.Select(d => (scores.TryGetValue(d.Id, out var v) ? v : 0) * Math.Sqrt(d.Weight)).ToArray();

    /// <summary>1 = identical, 0 = opposite corners of the space.</summary>
    public double Similarity(double[] a, double[] b) => ToSimilarity(Algorithms.Distance(a, b));
    public double ToSimilarity(double distance) => MaxDistance <= 0 ? 0 : Math.Clamp(1 - distance / MaxDistance, 0, 1);

    /// <summary>Back from weighted space to the -5..5 scale, per dimension id.</summary>
    public Dictionary<Guid, double> Unweight(double[] v) =>
        Dims.Select((d, i) => (d.Id, Value: v[i] / Math.Sqrt(d.Weight))).ToDictionary(x => x.Id, x => Math.Round(x.Value, 2));

    /// <summary>Name a region of the space by its strongest poles, in your own words.</summary>
    public string Describe(IReadOnlyDictionary<Guid, double> centroid, double threshold = 1.5)
    {
        var poles = Dims
            .Select(d => (Dim: d, Value: centroid.GetValueOrDefault(d.Id)))
            .Where(x => x.Dim.Weight > 0 && Math.Abs(x.Value) >= threshold)
            .OrderByDescending(x => Math.Abs(x.Value) * Math.Sqrt(x.Dim.Weight))
            .Take(2)
            .Select(x => x.Value > 0
                ? (string.IsNullOrWhiteSpace(x.Dim.HighLabel) ? $"high {x.Dim.Name.ToLowerInvariant()}" : x.Dim.HighLabel)
                : (string.IsNullOrWhiteSpace(x.Dim.LowLabel) ? $"low {x.Dim.Name.ToLowerInvariant()}" : x.Dim.LowLabel))
            .ToList();
        return poles.Count == 0 ? "balanced" : string.Join(" · ", poles);
    }
}

public static class Algorithms
{
    public static double Distance(double[] a, double[] b)
    {
        double s = 0;
        for (int i = 0; i < a.Length; i++) { var d = a[i] - b[i]; s += d * d; }
        return Math.Sqrt(s);
    }

    /// <summary>Euclidean k-means with k-means++ seeding. Deterministic for a given input order.</summary>
    public static (int[] Assign, double[][] Centroids) KMeans(IReadOnlyList<double[]> x, int k, int seed = 42, int iters = 50)
    {
        int n = x.Count, d = x[0].Length;
        k = Math.Clamp(k, 1, n);
        var rng = new Random(seed);

        var cents = new List<double[]> { x[rng.Next(n)] };
        var dist = new double[n];
        while (cents.Count < k)
        {
            double total = 0;
            for (int i = 0; i < n; i++)
            {
                dist[i] = cents.Min(c => Distance(x[i], c));
                dist[i] *= dist[i];
                total += dist[i];
            }
            if (total <= 1e-12) break; // fewer distinct points than k
            double pick = rng.NextDouble() * total;
            int idx = 0;
            for (; idx < n - 1; idx++) { pick -= dist[idx]; if (pick <= 0) break; }
            cents.Add(x[idx]);
        }
        k = cents.Count;

        var centroids = cents.Select(c => (double[])c.Clone()).ToArray();
        var assign = new int[n];
        for (int it = 0; it < iters; it++)
        {
            bool changed = it == 0;
            for (int i = 0; i < n; i++)
            {
                int best = 0; double bestD = double.MaxValue;
                for (int c = 0; c < k; c++)
                {
                    var dd = Distance(x[i], centroids[c]);
                    if (dd < bestD) { bestD = dd; best = c; }
                }
                if (assign[i] != best) { assign[i] = best; changed = true; }
            }
            if (!changed) break;

            for (int c = 0; c < k; c++)
            {
                var members = Enumerable.Range(0, n).Where(i => assign[i] == c).ToList();
                if (members.Count == 0) continue;
                var m = new double[d];
                foreach (var i in members) for (int j = 0; j < d; j++) m[j] += x[i][j];
                for (int j = 0; j < d; j++) m[j] /= members.Count;
                centroids[c] = m;
            }
        }
        return (assign, centroids);
    }

    /// <summary>First two principal components via power iteration, scaled to [-1, 1].</summary>
    public static (double X, double Y)[] Project2D(IReadOnlyList<double[]> rows)
    {
        int n = rows.Count;
        if (n == 0) return [];
        int d = rows[0].Length;
        if (n == 1 || d == 0) return rows.Select(_ => (0.0, 0.0)).ToArray();

        var mean = new double[d];
        foreach (var r in rows) for (int j = 0; j < d; j++) mean[j] += r[j] / n;
        var c = rows.Select(r => r.Select((v, j) => v - mean[j]).ToArray()).ToArray();

        var pc1 = PowerIterate(c, d, null);
        var pc2 = d > 1 ? PowerIterate(c, d, pc1) : new double[d];

        var pts = c.Select(r => (Dot(r, pc1), Dot(r, pc2))).ToArray();
        double sx = pts.Max(p => Math.Abs(p.Item1)), sy = pts.Max(p => Math.Abs(p.Item2));
        return pts.Select(p => (sx > 1e-9 ? p.Item1 / sx : 0, sy > 1e-9 ? p.Item2 / sy : 0)).ToArray();
    }

    private static double[] PowerIterate(double[][] c, int d, double[]? orthogonalTo)
    {
        var rng = new Random(7);
        var v = Enumerable.Range(0, d).Select(_ => rng.NextDouble() - 0.5).ToArray();
        for (int it = 0; it < 100; it++)
        {
            var cv = c.Select(r => Dot(r, v)).ToArray();
            var w = new double[d];
            for (int i = 0; i < c.Length; i++)
                for (int j = 0; j < d; j++) w[j] += c[i][j] * cv[i];
            if (orthogonalTo is not null)
            {
                var p = Dot(w, orthogonalTo);
                for (int j = 0; j < d; j++) w[j] -= p * orthogonalTo[j];
            }
            var norm = Math.Sqrt(Dot(w, w));
            if (norm < 1e-12) break;
            for (int j = 0; j < d; j++) v[j] = w[j] / norm;
        }
        return v;
    }

    private static double Dot(double[] a, double[] b)
    {
        double s = 0;
        for (int i = 0; i < a.Length; i++) s += a[i] * b[i];
        return s;
    }
}
