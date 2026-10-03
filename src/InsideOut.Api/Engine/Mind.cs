using InsideOut.Store;

namespace InsideOut.Engine;

public sealed class MindOptions
{
    /// <summary>Salience halves after this many days untouched.</summary>
    public double HalfLifeDays { get; set; } = 30;
}

/// <summary>
/// Human vectors, machine bookkeeping.
///   You define lenses (vector spaces) and their bipolar dimensions.
///   You score entries on those dimensions. That is the vector.
///   The engine only measures: distance, gravity toward aspirations, drift, clusters, projections.
/// </summary>
public sealed class Mind(Db db, MindOptions opt)
{
    // ---- lenses -------------------------------------------------------------------------------

    public Task<List<Lens>> LensesAsync(CancellationToken ct) => db.ListLensesAsync(ct);

    public async Task<List<Lens>> CreateStarterLensesAsync(CancellationToken ct)
    {
        if ((await db.ListLensesAsync(ct)).Count > 0) return await db.ListLensesAsync(ct);

        async Task Make(string name, string desc, params (string Name, string Low, string High, double Weight)[] dims)
        {
            var lens = new Lens { Name = name, Description = desc };
            await db.InsertLensAsync(lens, ct);
            foreach (var d in dims)
                await db.InsertDimensionAsync(new Dimension { LensId = lens.Id, Name = d.Name, LowLabel = d.Low, HighLabel = d.High, Weight = d.Weight }, ct);
        }

        await Make("Feel", "How it sits with you",
            ("Energy", "draining", "energising", 1),
            ("Mood", "heavy", "light", 1),
            ("Fear", "safe", "scary", 1),
            ("Pull", "obligation", "desire", 1.5));
        await Make("Value", "What it's worth doing",
            ("Impact", "trivial", "big", 1.5),
            ("Effort", "easy", "hard", 1),
            ("Urgency", "whenever", "now", 1),
            ("Alignment", "off-path", "on-path", 2));
        return await db.ListLensesAsync(ct);
    }

    /// <summary>
    /// The unflattering counterpart to Feel and Value. Everything is in the wild-card pool;
    /// Source and Drag count from day one, the rest are observed-only (weight 0) until you promote them.
    /// </summary>
    public async Task<Lens> CreateShadowLensAsync(CancellationToken ct)
    {
        var existing = (await db.ListLensesAsync(ct)).FirstOrDefault(l => l.Name == "Shadow");
        if (existing is not null) return existing;
        var lens = new Lens { Name = "Shadow", Description = "The side you'd rather not score" };
        await db.InsertLensAsync(lens, ct);
        foreach (var (name, low, high, w) in new (string, string, string, double)[]
        {
            ("Avoidance", "facing it", "dodging it", 0), ("Residue", "clean", "lingers", 0),
            ("Ego", "curious", "defensive", 0), ("Source", "my voice", "borrowed", 1),
            ("Regret", "none", "lasting", 0), ("Reversibility", "two-way door", "one-way", 0),
            ("Decay", "keeps", "spoils", 0), ("Drag", "frees", "entangles", 1),
        })
            await db.InsertDimensionAsync(new Dimension { LensId = lens.Id, Name = name, LowLabel = low, HighLabel = high, Weight = w, Wildcard = true }, ct);
        return (await db.GetLensAsync(lens.Id, ct))!;
    }

    // ---- entries ------------------------------------------------------------------------------

    public async Task<EntryDetail> CaptureAsync(CaptureRequest req, CancellationToken ct)
    {
        var e = new Entry { Kind = req.Kind, Body = req.Body.Trim(), Source = string.IsNullOrWhiteSpace(req.Source) ? "app" : req.Source.Trim().ToLowerInvariant() };
        await db.InsertEntryAsync(e, ct);
        if (req.Scores is { Count: > 0 }) await db.SetScoresAsync(e.Id, req.Scores, "me", ct);
        return (await DetailAsync(e.Id, ct))!;
    }

    public async Task<EntryDetail?> DetailAsync(Guid id, CancellationToken ct)
    {
        var e = await db.GetEntryAsync(id, ct);
        if (e is null) return null;
        var scores = (await db.ScoresForAsync([id], ct))[id];
        var lenses = await db.ListLensesAsync(ct);

        var landings = new List<LensLanding>();
        foreach (var lens in lenses)
        {
            var space = new VectorSpace(lens);
            if (!space.Dims.Any(d => scores.ContainsKey(d.Id))) continue;
            var near = await db.NearestToEntryAsync(lens.Id, id, 6, null, false, ct);
            ScoredDto? gravity = null;
            if (e.Kind == Kinds.Thought)
            {
                var pull = (await db.NearestToEntryAsync(lens.Id, id, 1, Kinds.Aspiration, true, ct)).FirstOrDefault();
                if (pull.Entry is not null && space.ToSimilarity(pull.Distance) >= lens.Gravity)
                    gravity = (await DtosAsync([(pull.Entry, space.ToSimilarity(pull.Distance))], ct))[0];
            }
            var nearDtos = await DtosAsync(near.Select(n => (n.Entry, space.ToSimilarity(n.Distance))).ToList(), ct);
            landings.Add(new LensLanding(lens.Id, lens.Name, gravity, nearDtos));
        }
        return new EntryDetail(Dto(e, scores), landings, await db.PerspectivesAsync(id, ct), await db.HistoryAsync(id, ct));
    }

    public async Task<EntryDetail?> SetScoresAsync(Guid id, Dictionary<Guid, double?> values, string scorer, CancellationToken ct)
    {
        if (await db.GetEntryAsync(id, ct) is null) return null;
        await db.SetScoresAsync(id, values, scorer, ct);
        if (scorer == "me") await db.TouchAsync([id], 0.1, ct);
        return await DetailAsync(id, ct);
    }

    public async Task<EntryDto?> UpdateAsync(Guid id, UpdateRequest req, CancellationToken ct)
    {
        var e = await db.GetEntryAsync(id, ct);
        if (e is null) return null;
        if (!string.IsNullOrWhiteSpace(req.Body)) e.Body = req.Body.Trim();
        if (req.Status is not null) e.Status = req.Status;
        if (req.Kind is not null) e.Kind = req.Kind;
        e.TouchedAt = DateTime.UtcNow;
        await db.UpdateEntryAsync(e, ct);
        return Dto(e, (await db.ScoresForAsync([id], ct))[id]);
    }

    public async Task<List<EntryDto>> StreamAsync(string? kind, string? status, string? q, Guid? unscoredIn, int limit, CancellationToken ct)
    {
        var entries = await db.ListEntriesAsync(kind, status, q, unscoredIn, limit, ct);
        var scores = await db.ScoresForAsync(entries.Select(e => e.Id).ToList(), ct);
        return entries.Select(e => Dto(e, scores[e.Id])).ToList();
    }

    /// <summary>Query by shape: the nearest entries to a vector you dial in. Not reinforcing: sliders fire this constantly.</summary>
    public async Task<List<ScoredDto>?> MatchAsync(Guid lensId, MatchRequest req, CancellationToken ct)
    {
        var lens = await db.GetLensAsync(lensId, ct);
        if (lens is null) return null;
        var space = new VectorSpace(lens);
        if (space.Dims.Count == 0) return [];
        var values = req.Values.Where(kv => kv.Value is not null).ToDictionary(kv => kv.Key, kv => kv.Value!.Value);
        var hits = await db.NearestToValuesAsync(lensId, values, Math.Clamp(req.K ?? 12, 1, 100), req.Kind, false, ct);
        return await DtosAsync(hits.Select(h => (h.Entry, space.ToSimilarity(h.Distance))).ToList(), ct);
    }

    // ---- per-lens analysis (computed in memory; one person's data is small) ------------------------

    private sealed record Field(VectorSpace Space, List<Entry> Entries, Dictionary<Guid, ScoreMap> Scores, Dictionary<Guid, double[]> Vectors);

    private async Task<Field?> FieldAsync(Guid lensId, CancellationToken ct)
    {
        var lens = await db.GetLensAsync(lensId, ct);
        if (lens is null) return null;
        var space = new VectorSpace(lens);
        var entries = (await db.EntriesInLensAsync(lensId, ct)).Where(e => e.Status == Statuses.Active).ToList();
        var scores = await db.LensScoresAsync(lensId, ct);
        foreach (var e in entries) scores.TryAdd(e.Id, new ScoreMap());
        var vectors = entries.ToDictionary(e => e.Id, e => space.Vector(scores[e.Id]));
        return new Field(space, entries, scores, vectors);
    }

    private sealed record Pull(Entry Thought, Entry Aspiration, double Similarity);

    /// <summary>Each thought goes to its single closest aspiration, if that clears the lens's gravity threshold.</summary>
    private static List<Pull> Gravity(Field f)
    {
        var aspirations = f.Entries.Where(e => e.Kind == Kinds.Aspiration).ToList();
        var pulls = new List<Pull>();
        if (aspirations.Count == 0) return pulls;
        foreach (var t in f.Entries.Where(e => e.Kind == Kinds.Thought))
        {
            var best = aspirations
                .Select(a => (A: a, S: f.Space.Similarity(f.Vectors[t.Id], f.Vectors[a.Id])))
                .MaxBy(x => x.S);
            if (best.S >= f.Space.Lens.Gravity) pulls.Add(new Pull(t, best.A, best.S));
        }
        return pulls;
    }

    public async Task<List<Orbit>?> OrbitsAsync(Guid lensId, CancellationToken ct)
    {
        var f = await FieldAsync(lensId, ct);
        if (f is null) return null;
        var pulls = Gravity(f);
        var now = DateTime.UtcNow;

        return f.Entries.Where(e => e.Kind == Kinds.Aspiration).Select(a =>
        {
            var mine = pulls.Where(p => p.Aspiration.Id == a.Id).OrderByDescending(p => p.Thought.CreatedAt).ToList();
            var weekly = new int[8];
            foreach (var p in mine)
            {
                int w = (int)((now - p.Thought.CreatedAt).TotalDays / 7);
                if (w < 8) weekly[7 - w]++;
            }
            var (revealed, gap, note) = Revealed(f, a, mine.Select(p => p.Thought).ToList());
            return new Orbit(
                Dto(a, f.Scores[a.Id]),
                mine.Count,
                mine.Count(p => (now - p.Thought.CreatedAt).TotalDays <= 30),
                weekly,
                mine.FirstOrDefault()?.Thought.CreatedAt,
                mine.OrderByDescending(p => p.Similarity).Take(6)
                    .Select(p => new ScoredDto(Dto(p.Thought, f.Scores[p.Thought.Id]), Math.Round(p.Similarity, 3))).ToList(),
                revealed, gap, note);
        })
        .OrderByDescending(o => o.Last30Days).ThenByDescending(o => o.OrbitCount)
        .ToList();
    }

    /// <summary>
    /// Stated vs revealed: the aspiration's own shape against the average shape of the thoughts it actually pulls in.
    /// Needs at least two orbiting thoughts to mean anything.
    /// </summary>
    private static (Dictionary<Guid, double>?, double?, string?) Revealed(Field f, Entry aspiration, List<Entry> thoughts)
    {
        if (thoughts.Count < 2 || f.Space.Dims.Count == 0) return (null, null, null);
        var dims = f.Space.Dims;
        var revealed = dims.ToDictionary(d => d.Id,
            d => Math.Round(thoughts.Average(t => f.Scores[t.Id].GetValueOrDefault(d.Id)), 2));
        var stated = f.Scores[aspiration.Id];
        var sim = f.Space.Similarity(f.Space.Vector(stated), f.Space.Vector(revealed));

        var widest = dims.Where(d => d.Weight > 0)
            .Select(d => (Dim: d, Said: stated.GetValueOrDefault(d.Id), Got: revealed[d.Id]))
            .OrderByDescending(x => Math.Abs(x.Said - x.Got) * Math.Sqrt(x.Dim.Weight))
            .FirstOrDefault();
        string? note = null;
        if (widest.Dim is not null && Math.Abs(widest.Said - widest.Got) >= 2)
        {
            string Pole(double v) => v > 0.5 ? widest.Dim.HighLabel : v < -0.5 ? widest.Dim.LowLabel : "neutral";
            var said = $"{Pole(widest.Said)} ({widest.Said:+0;-0;0})";
            var got = $"({widest.Got:+0.0;-0.0;0})";
            note = Pole(widest.Said) == Pole(widest.Got)
                ? $"{widest.Dim.Name}: you scored it {said}; what it pulls in is {(Math.Abs(widest.Got) < Math.Abs(widest.Said) ? "milder" : "stronger")} {got}"
                : $"{widest.Dim.Name}: you scored it {said}; what it pulls in averages {Pole(widest.Got)} {got}";
        }
        return (revealed, Math.Round(sim, 3), note);
    }

    public async Task<DriftResult?> DriftAsync(Guid lensId, CancellationToken ct)
    {
        var f = await FieldAsync(lensId, ct);
        if (f is null) return null;
        var pulled = Gravity(f).Select(p => p.Thought.Id).ToHashSet();
        var aspirations = f.Entries.Where(e => e.Kind == Kinds.Aspiration).ToList();

        var drifting = f.Entries
            .Where(e => e.Kind == Kinds.Thought && !pulled.Contains(e.Id))
            .Select(t => new ScoredDto(Dto(t, f.Scores[t.Id]),
                Math.Round(aspirations.Count == 0 ? 0 : aspirations.Max(a => f.Space.Similarity(f.Vectors[t.Id], f.Vectors[a.Id])), 3)))
            .OrderByDescending(s => s.Entry.CreatedAt)
            .ToList();

        var unscored = await StreamAsync(null, Statuses.Active, null, lensId, 50, ct);
        return new DriftResult(drifting, unscored);
    }

    public async Task<LensMap?> MapAsync(Guid lensId, CancellationToken ct)
    {
        var f = await FieldAsync(lensId, ct);
        if (f is null) return null;

        var entries = f.Entries;
        var vectors = entries.Select(e => f.Vectors[e.Id]).ToList();
        var xy = Algorithms.Project2D(vectors);
        var orbitOf = Gravity(f).ToDictionary(p => p.Thought.Id, p => p.Aspiration.Id);

        // Themes: cluster thoughts and aspirations. Patterns are reference shapes, not content.
        var content = entries.Select((e, i) => (e, i)).Where(x => x.e.Kind != Kinds.Pattern).ToList();
        var themeOf = new Dictionary<Guid, int>();
        var themes = new List<ThemeDto>();
        if (content.Count >= 4 && f.Space.Dims.Count > 0)
        {
            int k = Math.Clamp((int)Math.Round(Math.Sqrt(content.Count / 2.0)), 2, 8);
            var (assign, centroids) = Algorithms.KMeans(content.Select(x => vectors[x.i]).ToList(), k);
            var order = Enumerable.Range(0, centroids.Length)
                .Where(c => assign.Contains(c))
                .OrderByDescending(c => assign.Count(a => a == c)).ToList();
            foreach (var c in order)
            {
                int id = themes.Count + 1;
                var members = content.Where((_, j) => assign[j] == c).Select(x => x.e).ToList();
                foreach (var m in members) themeOf[m.Id] = id;
                var centroid = f.Space.Unweight(centroids[c]);
                themes.Add(new ThemeDto(id, f.Space.Describe(centroid), members.Count, centroid,
                    members.OrderByDescending(Salience).Take(5).Select(m => Dto(m, f.Scores[m.Id])).ToList()));
            }
        }

        var first = await db.FirstShapesAsync(lensId, ct);
        IReadOnlyDictionary<Guid, double>? Was(Entry e)
        {
            if (!first.TryGetValue(e.Id, out var then)) return null;
            var now = f.Scores[e.Id];
            bool moved = f.Space.Dims.Any(d => then.GetValueOrDefault(d.Id) != now.GetValueOrDefault(d.Id));
            return moved ? then : null;
        }

        var points = entries.Select((e, i) => new MapPoint(
            e.Id, e.Kind, e.Status, e.Body, Salience(e), f.Scores[e.Id],
            Math.Round(xy[i].X, 4), Math.Round(xy[i].Y, 4),
            themeOf.TryGetValue(e.Id, out var t) ? t : null,
            orbitOf.TryGetValue(e.Id, out var a) ? a : null,
            Was(e))).ToList();

        return new LensMap(f.Space.Lens, points, themes);
    }

    // ---- the river: resurfacing and outside currents ---------------------------------------------------

    /// <summary>Active entries that have faded (salience under half) and deserve a "still true?".</summary>
    public async Task<List<EntryDto>> ReviewAsync(int limit, CancellationToken ct)
    {
        var entries = (await db.ListEntriesAsync(null, Statuses.Active, null, null, 5000, ct))
            .Where(e => Salience(e) < 0.5)
            .OrderBy(Salience).Take(limit).ToList();
        var scores = await db.ScoresForAsync(entries.Select(e => e.Id).ToList(), ct);
        return entries.Select(e => Dto(e, scores[e.Id])).ToList();
    }

    /// <summary>"Still true": reinforce and reset the clock.</summary>
    public async Task<bool> AffirmAsync(Guid id, CancellationToken ct)
    {
        if (await db.GetEntryAsync(id, ct) is null) return false;
        await db.TouchAsync([id], 0.25, ct);
        return true;
    }

    /// <summary>Resolve "Lens/Dimension" names to ids (case-insensitive). Returns an error message for the first unknown name.</summary>
    public async Task<(Dictionary<Guid, double?> Ids, string? Error)> ResolveNamesAsync(Dictionary<string, double?>? named, CancellationToken ct)
    {
        var result = new Dictionary<Guid, double?>();
        if (named is null || named.Count == 0) return (result, null);
        var lenses = await db.ListLensesAsync(ct);
        foreach (var (key, value) in named)
        {
            var parts = key.Split('/', 2, StringSplitOptions.TrimEntries);
            var dim = parts.Length == 2
                ? lenses.FirstOrDefault(l => l.Name.Equals(parts[0], StringComparison.OrdinalIgnoreCase))?
                        .Dimensions.FirstOrDefault(d => d.ArchivedAt is null && d.Name.Equals(parts[1], StringComparison.OrdinalIgnoreCase))
                : null;
            if (dim is null) return (result, $"unknown dimension '{key}' (use \"Lens/Dimension\")");
            result[dim.Id] = value;
        }
        return (result, null);
    }

    public async Task<object> PulseAsync(CancellationToken ct)
    {
        var c = await db.CountsAsync(ct);
        return new
        {
            thoughts = c["thought"], aspirations = c["aspiration"], patterns = c["pattern"],
            lenses = c["lens"], dimensions = c["dimension"], scores = c["score"], unscored = c["unscored"],
        };
    }

    // ---- helpers ------------------------------------------------------------------------------------

    public double Salience(Entry e)
    {
        var days = Math.Max(0, (DateTime.UtcNow - e.TouchedAt).TotalDays);
        return Math.Round(e.Weight * Math.Pow(0.5, days / opt.HalfLifeDays), 3);
    }

    private EntryDto Dto(Entry e, IReadOnlyDictionary<Guid, double> scores) =>
        new(e.Id, e.Kind, e.Body, e.Status, e.CreatedAt, e.TouchedAt, Math.Round(e.Weight, 2), Salience(e), e.Source, scores);

    private async Task<List<ScoredDto>> DtosAsync(List<(Entry Entry, double Sim)> hits, CancellationToken ct)
    {
        var scores = await db.ScoresForAsync(hits.Select(h => h.Entry.Id).ToList(), ct);
        return hits.Select(h => new ScoredDto(Dto(h.Entry, scores[h.Entry.Id]), Math.Round(h.Sim, 3))).ToList();
    }
}
