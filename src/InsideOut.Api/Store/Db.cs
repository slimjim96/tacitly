using System.Globalization;
using System.Reflection;
using System.Text;
using System.Text.Json;
using Npgsql;

namespace InsideOut.Store;

/// <summary>
/// All SQL lives here. Scores are the source of truth; pgvector rows in entry_vectors are kept in
/// step by triggers (see db/schema.sql), so this class never writes a vector itself.
/// </summary>
public sealed class Db(NpgsqlDataSource ds)
{
    private const string EntryCols = "e.id, e.kind, e.body, e.status, e.created_at, e.touched_at, e.weight, e.source";
    private const string DimCols = "id, lens_id, name, low_label, high_label, weight, position, wildcard, archived_at";

    public async Task MigrateAsync(CancellationToken ct)
    {
        await using var s = Assembly.GetExecutingAssembly().GetManifestResourceStream("schema.sql")
                          ?? throw new InvalidOperationException("schema.sql resource missing");
        using var reader = new StreamReader(s);
        await Exec(await reader.ReadToEndAsync(ct), ct);
    }

    // ---- lenses & dimensions ------------------------------------------------------------

    public async Task<List<Lens>> ListLensesAsync(CancellationToken ct)
    {
        var lenses = new List<Lens>();
        await using (var cmd = ds.CreateCommand("SELECT id, name, description, gravity, created_at FROM lenses ORDER BY created_at"))
        await using (var r = await cmd.ExecuteReaderAsync(ct))
            while (await r.ReadAsync(ct))
                lenses.Add(new Lens
                {
                    Id = r.GetGuid(0), Name = r.GetString(1), Description = r.GetString(2),
                    Gravity = r.GetDouble(3), CreatedAt = r.GetFieldValue<DateTime>(4)
                });

        var byId = lenses.ToDictionary(l => l.Id);
        await using (var cmd = ds.CreateCommand(
            $"SELECT {DimCols} FROM dimensions ORDER BY lens_id, position, id"))
        await using (var r = await cmd.ExecuteReaderAsync(ct))
            while (await r.ReadAsync(ct))
            {
                var d = ReadDimension(r);
                if (byId.TryGetValue(d.LensId, out var l)) l.Dimensions.Add(d);
            }
        return lenses;
    }

    public async Task<Lens?> GetLensAsync(Guid id, CancellationToken ct) =>
        (await ListLensesAsync(ct)).FirstOrDefault(l => l.Id == id);

    public async Task InsertLensAsync(Lens l, CancellationToken ct)
    {
        await using var cmd = ds.CreateCommand(
            "INSERT INTO lenses (id, name, description, gravity, created_at) VALUES (@id, @name, @desc, @gravity, @at)");
        cmd.Parameters.AddWithValue("id", l.Id);
        cmd.Parameters.AddWithValue("name", l.Name);
        cmd.Parameters.AddWithValue("desc", l.Description);
        cmd.Parameters.AddWithValue("gravity", l.Gravity);
        cmd.Parameters.AddWithValue("at", Utc(l.CreatedAt));
        await cmd.ExecuteNonQueryAsync(ct);
    }

    public async Task UpdateLensAsync(Lens l, CancellationToken ct)
    {
        await using var cmd = ds.CreateCommand(
            "UPDATE lenses SET name = @name, description = @desc, gravity = @gravity WHERE id = @id");
        cmd.Parameters.AddWithValue("id", l.Id);
        cmd.Parameters.AddWithValue("name", l.Name);
        cmd.Parameters.AddWithValue("desc", l.Description);
        cmd.Parameters.AddWithValue("gravity", l.Gravity);
        await cmd.ExecuteNonQueryAsync(ct);
    }

    public Task<bool> DeleteLensAsync(Guid id, CancellationToken ct) => DeleteById("lenses", id, ct);

    public async Task<Dimension?> GetDimensionAsync(Guid id, CancellationToken ct)
    {
        await using var cmd = ds.CreateCommand(
            $"SELECT {DimCols} FROM dimensions WHERE id = @id");
        cmd.Parameters.AddWithValue("id", id);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        return await r.ReadAsync(ct) ? ReadDimension(r) : null;
    }

    public async Task InsertDimensionAsync(Dimension d, CancellationToken ct)
    {
        await using var cmd = ds.CreateCommand("""
            INSERT INTO dimensions (id, lens_id, name, low_label, high_label, weight, wildcard, position)
            VALUES (@id, @lens, @name, @low, @high, @weight, @wild,
                    (SELECT coalesce(max(position) + 1, 0) FROM dimensions WHERE lens_id = @lens))
            """);
        BindDimension(cmd, d);
        await cmd.ExecuteNonQueryAsync(ct);
    }

    public async Task UpdateDimensionAsync(Dimension d, CancellationToken ct)
    {
        await using var cmd = ds.CreateCommand("""
            UPDATE dimensions SET name = @name, low_label = @low, high_label = @high, weight = @weight, wildcard = @wild
            WHERE id = @id AND lens_id = @lens
            """);
        BindDimension(cmd, d);
        await cmd.ExecuteNonQueryAsync(ct);
    }

    public Task<bool> DeleteDimensionAsync(Guid id, CancellationToken ct) => DeleteById("dimensions", id, ct);

    public async Task SetArchivedAsync(Guid id, bool archived, CancellationToken ct)
    {
        await using var cmd = ds.CreateCommand(archived
            ? "UPDATE dimensions SET archived_at = now() WHERE id = @id AND archived_at IS NULL"
            : "UPDATE dimensions SET archived_at = NULL WHERE id = @id AND archived_at IS NOT NULL");
        cmd.Parameters.AddWithValue("id", id);
        await cmd.ExecuteNonQueryAsync(ct);
    }

    public async Task ReorderDimensionsAsync(Guid lensId, Guid[] orderedIds, CancellationToken ct)
    {
        await using var cmd = ds.CreateCommand("""
            UPDATE dimensions d SET position = x.ord - 1
            FROM unnest(@ids) WITH ORDINALITY AS x(id, ord)
            WHERE d.id = x.id AND d.lens_id = @lens
            """);
        cmd.Parameters.AddWithValue("ids", orderedIds);
        cmd.Parameters.AddWithValue("lens", lensId);
        await cmd.ExecuteNonQueryAsync(ct);
    }

    // ---- entries ----------------------------------------------------------------------------

    public async Task InsertEntryAsync(Entry e, CancellationToken ct)
    {
        await using var cmd = ds.CreateCommand("""
            INSERT INTO entries (id, kind, body, status, created_at, touched_at, weight, source)
            VALUES (@id, @kind, @body, @status, @created, @touched, @weight, @source)
            """);
        BindEntry(cmd, e);
        await cmd.ExecuteNonQueryAsync(ct);
    }

    public async Task UpdateEntryAsync(Entry e, CancellationToken ct)
    {
        await using var cmd = ds.CreateCommand("""
            UPDATE entries SET kind = @kind, body = @body, status = @status, created_at = @created,
                               touched_at = @touched, weight = @weight, source = @source
            WHERE id = @id
            """);
        BindEntry(cmd, e);
        await cmd.ExecuteNonQueryAsync(ct);
    }

    public async Task<Entry?> GetEntryAsync(Guid id, CancellationToken ct)
    {
        await using var cmd = ds.CreateCommand($"SELECT {EntryCols} FROM entries e WHERE e.id = @id");
        cmd.Parameters.AddWithValue("id", id);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        return await r.ReadAsync(ct) ? ReadEntry(r) : null;
    }

    public Task<bool> DeleteEntryAsync(Guid id, CancellationToken ct) => DeleteById("entries", id, ct);

    /// <summary>Newest first. <paramref name="unscoredIn"/> limits to entries with no scores in that lens.</summary>
    public async Task<List<Entry>> ListEntriesAsync(string? kind, string? status, string? text, Guid? unscoredIn, int limit, CancellationToken ct)
    {
        var sql = new StringBuilder($"SELECT {EntryCols} FROM entries e WHERE true");
        if (kind is not null) sql.Append(" AND e.kind = @kind");
        if (status is not null) sql.Append(" AND e.status = @status");
        if (!string.IsNullOrWhiteSpace(text)) sql.Append(" AND e.body ILIKE @text");
        if (unscoredIn is not null)
            sql.Append(" AND NOT EXISTS (SELECT 1 FROM entry_vectors ev WHERE ev.entry_id = e.id AND ev.lens_id = @lens)");
        sql.Append(" ORDER BY e.created_at DESC LIMIT @limit");

        await using var cmd = ds.CreateCommand(sql.ToString());
        if (kind is not null) cmd.Parameters.AddWithValue("kind", kind);
        if (status is not null) cmd.Parameters.AddWithValue("status", status);
        if (!string.IsNullOrWhiteSpace(text)) cmd.Parameters.AddWithValue("text", "%" + EscapeLike(text.Trim()) + "%");
        if (unscoredIn is not null) cmd.Parameters.AddWithValue("lens", unscoredIn.Value);
        cmd.Parameters.AddWithValue("limit", limit);

        var list = new List<Entry>();
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct)) list.Add(ReadEntry(r));
        return list;
    }

    /// <summary>Entries that have at least one score in the lens.</summary>
    public async Task<List<Entry>> EntriesInLensAsync(Guid lensId, CancellationToken ct)
    {
        await using var cmd = ds.CreateCommand($"""
            SELECT {EntryCols} FROM entries e JOIN entry_vectors ev ON ev.entry_id = e.id
            WHERE ev.lens_id = @lens ORDER BY e.created_at DESC
            """);
        cmd.Parameters.AddWithValue("lens", lensId);
        var list = new List<Entry>();
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct)) list.Add(ReadEntry(r));
        return list;
    }

    public async Task TouchAsync(IReadOnlyCollection<Guid> ids, double bump, CancellationToken ct)
    {
        if (ids.Count == 0) return;
        await using var cmd = ds.CreateCommand("UPDATE entries SET weight = weight + @b, touched_at = now() WHERE id = ANY(@ids)");
        cmd.Parameters.AddWithValue("b", bump);
        cmd.Parameters.AddWithValue("ids", ids.ToArray());
        await cmd.ExecuteNonQueryAsync(ct);
    }

    // ---- scores -------------------------------------------------------------------------------

    public async Task<Dictionary<Guid, ScoreMap>> ScoresForAsync(IReadOnlyCollection<Guid> entryIds, CancellationToken ct)
    {
        var result = entryIds.Distinct().ToDictionary(id => id, _ => new ScoreMap());
        if (result.Count == 0) return result;
        await using var cmd = ds.CreateCommand("SELECT entry_id, dimension_id, value::float8 FROM scores WHERE entry_id = ANY(@ids) AND scorer = 'me'");
        cmd.Parameters.AddWithValue("ids", result.Keys.ToArray());
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct)) result[r.GetGuid(0)][r.GetGuid(1)] = r.GetDouble(2);
        return result;
    }

    /// <summary>All scores in one lens, keyed by entry.</summary>
    public async Task<Dictionary<Guid, ScoreMap>> LensScoresAsync(Guid lensId, CancellationToken ct)
    {
        await using var cmd = ds.CreateCommand("""
            SELECT s.entry_id, s.dimension_id, s.value::float8
            FROM scores s JOIN dimensions d ON d.id = s.dimension_id
            WHERE d.lens_id = @lens AND s.scorer = 'me'
            """);
        cmd.Parameters.AddWithValue("lens", lensId);
        var result = new Dictionary<Guid, ScoreMap>();
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
        {
            var id = r.GetGuid(0);
            if (!result.TryGetValue(id, out var m)) result[id] = m = new ScoreMap();
            m[r.GetGuid(1)] = r.GetDouble(2);
        }
        return result;
    }

    /// <summary>Set (value) or clear (null) scores. Triggers re-vectorise the affected lenses.</summary>
    public async Task SetScoresAsync(Guid entryId, IReadOnlyDictionary<Guid, double?> values, string scorer, CancellationToken ct)
    {
        foreach (var (dimId, value) in values)
        {
            await using var cmd = value is null
                ? ds.CreateCommand("DELETE FROM scores WHERE entry_id = @e AND dimension_id = @d AND scorer = @s")
                : ds.CreateCommand("""
                    INSERT INTO scores (entry_id, dimension_id, scorer, value, scored_at) VALUES (@e, @d, @s, @v, now())
                    ON CONFLICT (entry_id, dimension_id, scorer) DO UPDATE SET value = EXCLUDED.value, scored_at = now()
                    WHERE scores.value IS DISTINCT FROM EXCLUDED.value
                    """);
            cmd.Parameters.AddWithValue("e", entryId);
            cmd.Parameters.AddWithValue("d", dimId);
            cmd.Parameters.AddWithValue("s", scorer);
            if (value is not null) cmd.Parameters.AddWithValue("v", (float)Math.Clamp(value.Value, Scale.Min, Scale.Max));
            await cmd.ExecuteNonQueryAsync(ct);
        }
    }

    /// <summary>Other people's scores for an entry, keyed by scorer.</summary>
    public async Task<Dictionary<string, ScoreMap>> PerspectivesAsync(Guid entryId, CancellationToken ct)
    {
        await using var cmd = ds.CreateCommand(
            "SELECT scorer, dimension_id, value::float8 FROM scores WHERE entry_id = @e AND scorer <> 'me' ORDER BY scorer");
        cmd.Parameters.AddWithValue("e", entryId);
        var result = new Dictionary<string, ScoreMap>();
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
        {
            var who = r.GetString(0);
            if (!result.TryGetValue(who, out var m)) result[who] = m = new ScoreMap();
            m[r.GetGuid(1)] = r.GetDouble(2);
        }
        return result;
    }

    public async Task<List<string>> ScorersAsync(CancellationToken ct)
    {
        await using var cmd = ds.CreateCommand("SELECT DISTINCT scorer FROM scores WHERE scorer <> 'me' ORDER BY scorer");
        var list = new List<string>();
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct)) list.Add(r.GetString(0));
        return list;
    }

    public async Task<List<HistoryItem>> HistoryAsync(Guid entryId, CancellationToken ct)
    {
        await using var cmd = ds.CreateCommand(
            "SELECT dimension_id, scorer, value::float8, at FROM score_history WHERE entry_id = @e ORDER BY at, id");
        cmd.Parameters.AddWithValue("e", entryId);
        var list = new List<HistoryItem>();
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
            list.Add(new HistoryItem(r.GetGuid(0), r.GetString(1), r.IsDBNull(2) ? null : r.GetDouble(2), r.GetFieldValue<DateTime>(3)));
        return list;
    }

    /// <summary>The first value you ever gave each (entry, dimension) in a lens: the starting shape.</summary>
    public async Task<Dictionary<Guid, ScoreMap>> FirstShapesAsync(Guid lensId, CancellationToken ct)
    {
        await using var cmd = ds.CreateCommand("""
            SELECT DISTINCT ON (h.entry_id, h.dimension_id) h.entry_id, h.dimension_id, h.value::float8
            FROM score_history h JOIN dimensions d ON d.id = h.dimension_id
            WHERE d.lens_id = @lens AND h.scorer = 'me' AND h.value IS NOT NULL
            ORDER BY h.entry_id, h.dimension_id, h.at, h.id
            """);
        cmd.Parameters.AddWithValue("lens", lensId);
        var result = new Dictionary<Guid, ScoreMap>();
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
        {
            var id = r.GetGuid(0);
            if (!result.TryGetValue(id, out var m)) result[id] = m = new ScoreMap();
            m[r.GetGuid(1)] = r.GetDouble(2);
        }
        return result;
    }

    // ---- pgvector search ------------------------------------------------------------------------

    /// <summary>Nearest entries to another entry's vector in a lens. Returns L2 distance.</summary>
    public Task<List<(Entry Entry, double Distance)>> NearestToEntryAsync(
        Guid lensId, Guid entryId, int k, string? kind, bool activeOnly, CancellationToken ct) =>
        NearestAsync(lensId, "SELECT v FROM entry_vectors WHERE lens_id = @lens AND entry_id = @src",
            p => p.AddWithValue("src", entryId), k, kind, activeOnly, entryId, ct);

    /// <summary>
    /// Nearest entries to an ad-hoc pattern. The query vector is assembled in SQL with exactly the same rule
    /// the triggers use, so the app never has to agree with the database about dimension order.
    /// </summary>
    public Task<List<(Entry Entry, double Distance)>> NearestToValuesAsync(
        Guid lensId, IReadOnlyDictionary<Guid, double> values, int k, string? kind, bool activeOnly, CancellationToken ct)
    {
        var json = JsonSerializer.Serialize(values.ToDictionary(kv => kv.Key.ToString(), kv => kv.Value));
        return NearestAsync(lensId, """
            SELECT array_agg(coalesce((CAST(@vals AS jsonb) ->> d.id::text)::real, 0) * sqrt(d.weight)
                             ORDER BY d.position, d.id)::real[]::vector AS v
            FROM dimensions d WHERE d.lens_id = @lens
            """, p => p.AddWithValue("vals", json), k, kind, activeOnly, null, ct);
    }

    private async Task<List<(Entry, double)>> NearestAsync(
        Guid lensId, string querySql, Action<NpgsqlParameterCollection> bindQuery,
        int k, string? kind, bool activeOnly, Guid? exclude, CancellationToken ct)
    {
        var sql = new StringBuilder($"""
            WITH q AS ({querySql})
            SELECT {EntryCols}, ev.v <-> q.v AS dist
            FROM entry_vectors ev JOIN entries e ON e.id = ev.entry_id CROSS JOIN q
            WHERE ev.lens_id = @lens AND q.v IS NOT NULL
            """);
        if (kind is not null) sql.Append(" AND e.kind = @kind");
        if (activeOnly) sql.Append(" AND e.status = 'active'");
        if (exclude is not null) sql.Append(" AND e.id <> @ex");
        sql.Append(" ORDER BY dist, e.created_at DESC LIMIT @k");

        await using var cmd = ds.CreateCommand(sql.ToString());
        cmd.Parameters.AddWithValue("lens", lensId);
        cmd.Parameters.AddWithValue("k", k);
        if (kind is not null) cmd.Parameters.AddWithValue("kind", kind);
        if (exclude is not null) cmd.Parameters.AddWithValue("ex", exclude.Value);
        bindQuery(cmd.Parameters);

        var list = new List<(Entry, double)>();
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct)) list.Add((ReadEntry(r), r.GetDouble(8)));
        return list;
    }

    // ---- misc -----------------------------------------------------------------------------------

    public async Task<Dictionary<string, long>> CountsAsync(CancellationToken ct)
    {
        await using var cmd = ds.CreateCommand("""
            SELECT 'thought', count(*) FROM entries WHERE kind = 'thought' AND status = 'active'
            UNION ALL SELECT 'aspiration', count(*) FROM entries WHERE kind = 'aspiration' AND status = 'active'
            UNION ALL SELECT 'pattern', count(*) FROM entries WHERE kind = 'pattern' AND status = 'active'
            UNION ALL SELECT 'lens', count(*) FROM lenses
            UNION ALL SELECT 'dimension', count(*) FROM dimensions
            UNION ALL SELECT 'score', count(*) FROM scores
            UNION ALL SELECT 'unscored', count(*) FROM entries e WHERE e.status = 'active'
                      AND NOT EXISTS (SELECT 1 FROM scores s WHERE s.entry_id = e.id)
            """);
        var result = new Dictionary<string, long>();
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct)) result[r.GetString(0)] = r.GetInt64(1);
        return result;
    }

    private async Task<bool> DeleteById(string table, Guid id, CancellationToken ct)
    {
        await using var cmd = ds.CreateCommand($"DELETE FROM {table} WHERE id = @id");
        cmd.Parameters.AddWithValue("id", id);
        return await cmd.ExecuteNonQueryAsync(ct) > 0;
    }

    private async Task Exec(string sql, CancellationToken ct)
    {
        await using var cmd = ds.CreateCommand(sql);
        await cmd.ExecuteNonQueryAsync(ct);
    }

    private static void BindEntry(NpgsqlCommand cmd, Entry e)
    {
        cmd.Parameters.AddWithValue("id", e.Id);
        cmd.Parameters.AddWithValue("kind", e.Kind);
        cmd.Parameters.AddWithValue("body", e.Body);
        cmd.Parameters.AddWithValue("status", e.Status);
        cmd.Parameters.AddWithValue("created", Utc(e.CreatedAt));
        cmd.Parameters.AddWithValue("touched", Utc(e.TouchedAt));
        cmd.Parameters.AddWithValue("weight", e.Weight);
        cmd.Parameters.AddWithValue("source", e.Source);
    }

    private static void BindDimension(NpgsqlCommand cmd, Dimension d)
    {
        cmd.Parameters.AddWithValue("id", d.Id);
        cmd.Parameters.AddWithValue("lens", d.LensId);
        cmd.Parameters.AddWithValue("name", d.Name);
        cmd.Parameters.AddWithValue("low", d.LowLabel);
        cmd.Parameters.AddWithValue("high", d.HighLabel);
        cmd.Parameters.AddWithValue("weight", d.Weight);
        cmd.Parameters.AddWithValue("wild", d.Wildcard);
    }

    private static Entry ReadEntry(NpgsqlDataReader r) => new()
    {
        Id = r.GetGuid(0), Kind = r.GetString(1), Body = r.GetString(2), Status = r.GetString(3),
        CreatedAt = r.GetFieldValue<DateTime>(4), TouchedAt = r.GetFieldValue<DateTime>(5), Weight = r.GetDouble(6), Source = r.GetString(7),
    };

    private static Dimension ReadDimension(NpgsqlDataReader r) => new()
    {
        Id = r.GetGuid(0), LensId = r.GetGuid(1), Name = r.GetString(2), LowLabel = r.GetString(3),
        HighLabel = r.GetString(4), Weight = r.GetDouble(5), Position = r.GetInt32(6),
        Wildcard = r.GetBoolean(7), ArchivedAt = r.IsDBNull(8) ? null : r.GetFieldValue<DateTime>(8),
    };

    private static DateTime Utc(DateTime d) => DateTime.SpecifyKind(d, DateTimeKind.Utc);

    private static string EscapeLike(string s) =>
        s.Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_");
}
