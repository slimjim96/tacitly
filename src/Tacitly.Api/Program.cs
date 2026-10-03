using System.Data.Common;
using Tacitly;
using Tacitly.Engine;
using Tacitly.Store;

var builder = WebApplication.CreateBuilder(args);
var cfg = builder.Configuration.GetSection("Tacitly");
var accessToken = cfg["AccessToken"];
var connectionString = cfg["ConnectionString"]
    ?? throw new InvalidOperationException("Tacitly:ConnectionString is required");

builder.Services.AddSingleton(cfg.GetSection("Mind").Get<MindOptions>() ?? new MindOptions());
builder.Services.AddSingleton(Npgsql.NpgsqlDataSource.Create(connectionString));
builder.Services.AddSingleton<Db>();
builder.Services.AddSingleton<Mind>();

var app = builder.Build();

// Wait for Postgres, then apply db/schema.sql (idempotent).
for (int attempt = 1; ; attempt++)
{
    try { await app.Services.GetRequiredService<Db>().MigrateAsync(CancellationToken.None); break; }
    catch (Exception ex) when (attempt < 30)
    {
        app.Logger.LogWarning("Database not ready ({Message}); retry {Attempt}/30", ex.Message, attempt);
        await Task.Delay(TimeSpan.FromSeconds(2));
    }
}

// Constraint violations (bad ids, out-of-range values) come back as 400s, not 500s.
app.Use(async (ctx, next) =>
{
    try { await next(); }
    catch (DbException ex) when (!ctx.Response.HasStarted)
    {
        ctx.Response.StatusCode = StatusCodes.Status400BadRequest;
        await ctx.Response.WriteAsJsonAsync(new { error = ex.Message });
    }
});

if (!string.IsNullOrWhiteSpace(accessToken))
{
    var expected = System.Text.Encoding.UTF8.GetBytes(accessToken);
    app.Use(async (ctx, next) =>
    {
        var guarded = (ctx.Request.Path.StartsWithSegments("/api") && !ctx.Request.Path.StartsWithSegments("/api/health"))
                      || ctx.Request.Path.StartsWithSegments("/mcp");
        if (guarded)
        {
            var header = ctx.Request.Headers["X-Tacitly-Token"].FirstOrDefault();
            var auth = ctx.Request.Headers.Authorization.FirstOrDefault();
            if (header is null && auth is not null && auth.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)) header = auth[7..].Trim();
            var supplied = System.Text.Encoding.UTF8.GetBytes(header ?? "");
            if (!System.Security.Cryptography.CryptographicOperations.FixedTimeEquals(supplied, expected))
            {
                ctx.Response.StatusCode = StatusCodes.Status401Unauthorized;
                return;
            }
        }
        await next();
    });
}

app.UseDefaultFiles();
app.UseStaticFiles();

var api = app.MapGroup("/api");
static IResult Bad(string error) => Results.BadRequest(new { error });

api.MapGet("/health", () => Results.Ok(new { ok = true }));
api.MapGet("/pulse", (Mind m, CancellationToken ct) => m.PulseAsync(ct));

// ---- lenses & dimensions ---------------------------------------------------------------------

api.MapGet("/lenses", (Mind m, CancellationToken ct) => m.LensesAsync(ct));
api.MapPost("/lenses/starter", (Mind m, CancellationToken ct) => m.CreateStarterLensesAsync(ct));
api.MapPost("/lenses/starter/shadow", (Mind m, CancellationToken ct) => m.CreateShadowLensAsync(ct));

api.MapPost("/lenses", async (LensRequest req, Db db, CancellationToken ct) =>
{
    if (string.IsNullOrWhiteSpace(req.Name)) return Bad("name is required");
    if (req.Gravity is <= 0 or >= 1) return Bad("gravity must be between 0 and 1");
    var lens = new Lens { Name = req.Name.Trim(), Description = req.Description?.Trim() ?? "", Gravity = req.Gravity ?? 0.75 };
    await db.InsertLensAsync(lens, ct);
    return Results.Ok(lens);
});

api.MapPatch("/lenses/{id:guid}", async (Guid id, LensRequest req, Db db, CancellationToken ct) =>
{
    var lens = await db.GetLensAsync(id, ct);
    if (lens is null) return Results.NotFound();
    if (req.Gravity is <= 0 or >= 1) return Bad("gravity must be between 0 and 1");
    if (!string.IsNullOrWhiteSpace(req.Name)) lens.Name = req.Name.Trim();
    if (req.Description is not null) lens.Description = req.Description.Trim();
    if (req.Gravity is { } g) lens.Gravity = g;
    await db.UpdateLensAsync(lens, ct);
    return Results.Ok(lens);
});

api.MapDelete("/lenses/{id:guid}", async (Guid id, Db db, CancellationToken ct) =>
    await db.DeleteLensAsync(id, ct) ? Results.NoContent() : Results.NotFound());

api.MapPost("/lenses/{id:guid}/dimensions", async (Guid id, DimensionRequest req, Db db, CancellationToken ct) =>
{
    if (await db.GetLensAsync(id, ct) is null) return Results.NotFound();
    if (string.IsNullOrWhiteSpace(req.Name)) return Bad("name is required");
    if (req.Weight is < 0 or > 5) return Bad("weight must be between 0 (observed only) and 5");
    var d = new Dimension
    {
        LensId = id, Name = req.Name.Trim(), LowLabel = req.LowLabel?.Trim() ?? "",
        HighLabel = req.HighLabel?.Trim() ?? "", Weight = req.Weight ?? 1, Wildcard = req.Wildcard ?? false
    };
    await db.InsertDimensionAsync(d, ct);
    return Results.Ok(await db.GetDimensionAsync(d.Id, ct));
});

api.MapPut("/lenses/{id:guid}/order", async (Guid id, ReorderRequest req, Db db, CancellationToken ct) =>
{
    var lens = await db.GetLensAsync(id, ct);
    if (lens is null) return Results.NotFound();
    if (!req.DimensionIds.ToHashSet().SetEquals(lens.Dimensions.Where(d => d.ArchivedAt is null).Select(d => d.Id)))
        return Bad("dimensionIds must list every dimension in the lens exactly once");
    await db.ReorderDimensionsAsync(id, req.DimensionIds, ct);
    return Results.Ok(await db.GetLensAsync(id, ct));
});

api.MapPatch("/dimensions/{id:guid}", async (Guid id, DimensionRequest req, Db db, CancellationToken ct) =>
{
    var d = await db.GetDimensionAsync(id, ct);
    if (d is null) return Results.NotFound();
    if (req.Weight is < 0 or > 5) return Bad("weight must be between 0 (observed only) and 5");
    if (!string.IsNullOrWhiteSpace(req.Name)) d.Name = req.Name.Trim();
    if (req.LowLabel is not null) d.LowLabel = req.LowLabel.Trim();
    if (req.HighLabel is not null) d.HighLabel = req.HighLabel.Trim();
    if (req.Weight is { } w) d.Weight = w;
    if (req.Wildcard is { } wild) d.Wildcard = wild;
    await db.UpdateDimensionAsync(d, ct);
    if (req.Archived is { } archived) await db.SetArchivedAsync(id, archived, ct);
    return Results.Ok(await db.GetDimensionAsync(id, ct));
});

api.MapDelete("/dimensions/{id:guid}", async (Guid id, Db db, CancellationToken ct) =>
    await db.DeleteDimensionAsync(id, ct) ? Results.NoContent() : Results.NotFound());

// ---- entries & scores --------------------------------------------------------------------------

api.MapPost("/entries", async (CaptureRequest req, Mind m, Db db, CancellationToken ct) =>
{
    if (!Kinds.IsValid(req.Kind)) return Bad("kind must be thought, aspiration or pattern");
    if (string.IsNullOrWhiteSpace(req.Body) || req.Body.Length > 4000) return Bad("body must be 1-4000 characters");
    if (await ValidateScores(req.Scores, db, ct) is { } err) return Bad(err);
    return Results.Ok(await m.CaptureAsync(req, ct));
});

api.MapGet("/entries", (string? kind, string? status, string? q, Guid? unscoredIn, int? limit, Mind m, CancellationToken ct) =>
    m.StreamAsync(kind, status, q, unscoredIn, Math.Clamp(limit ?? 100, 1, 1000), ct));

api.MapGet("/entries/{id:guid}", async (Guid id, Mind m, CancellationToken ct) =>
    await m.DetailAsync(id, ct) is { } d ? Results.Ok(d) : Results.NotFound());

api.MapPatch("/entries/{id:guid}", async (Guid id, UpdateRequest req, Mind m, CancellationToken ct) =>
{
    if (req.Status is not null && !Statuses.IsValid(req.Status)) return Bad("status must be active, done or released");
    if (req.Kind is not null && !Kinds.IsValid(req.Kind)) return Bad("kind must be thought, aspiration or pattern");
    return await m.UpdateAsync(id, req, ct) is { } e ? Results.Ok(e) : Results.NotFound();
});

api.MapDelete("/entries/{id:guid}", async (Guid id, Db db, CancellationToken ct) =>
    await db.DeleteEntryAsync(id, ct) ? Results.NoContent() : Results.NotFound());

// Set values (-5..5) or clear them (null). Only the dimensions you send are touched.
// ?scorer=name records someone else's perspective; it's compared with yours but never changes your vectors.
api.MapPut("/entries/{id:guid}/scores", async (Guid id, string? scorer, Dictionary<Guid, double?> values, Mind m, Db db, CancellationToken ct) =>
{
    var who = string.IsNullOrWhiteSpace(scorer) ? "me" : scorer.Trim().ToLowerInvariant();
    if (!System.Text.RegularExpressions.Regex.IsMatch(who, "^[a-z0-9_-]{1,32}$")) return Bad("scorer must be 1-32 of a-z, 0-9, _ or -");
    if (await ValidateScores(values, db, ct) is { } err) return Bad(err);
    return await m.SetScoresAsync(id, values, who, ct) is { } d ? Results.Ok(d) : Results.NotFound();
});

api.MapGet("/scorers", (Db db, CancellationToken ct) => db.ScorersAsync(ct));

// ---- the river -------------------------------------------------------------------------------

api.MapGet("/review", (int? limit, Mind m, CancellationToken ct) => m.ReviewAsync(Math.Clamp(limit ?? 25, 1, 200), ct));
api.MapPost("/entries/{id:guid}/affirm", async (Guid id, Mind m, CancellationToken ct) =>
    await m.AffirmAsync(id, ct) ? Results.NoContent() : Results.NotFound());

// For shortcuts, scripts and other systems: scores by "Lens/Dimension" name.
api.MapPost("/ingest", async (IngestRequest req, Mind m, CancellationToken ct) =>
{
    var kind = string.IsNullOrWhiteSpace(req.Kind) ? Kinds.Thought : req.Kind.Trim().ToLowerInvariant();
    if (!Kinds.IsValid(kind)) return Bad("kind must be thought, aspiration or pattern");
    if (string.IsNullOrWhiteSpace(req.Body) || req.Body.Length > 4000) return Bad("body must be 1-4000 characters");
    var (ids, err) = await m.ResolveNamesAsync(req.Scores, ct);
    if (err is not null) return Bad(err);
    if (ids.Values.Any(v => v is < Scale.Min or > Scale.Max)) return Bad("scores must be between -5 and 5");
    return Results.Ok(await m.CaptureAsync(new CaptureRequest(kind, req.Body, ids, req.Source ?? "api"), ct));
});

// ---- per-lens views ----------------------------------------------------------------------------

api.MapPost("/lenses/{id:guid}/match", async (Guid id, MatchRequest req, Mind m, CancellationToken ct) =>
    await m.MatchAsync(id, req, ct) is { } r ? Results.Ok(r) : Results.NotFound());
api.MapGet("/lenses/{id:guid}/orbits", async (Guid id, Mind m, CancellationToken ct) =>
    await m.OrbitsAsync(id, ct) is { } r ? Results.Ok(r) : Results.NotFound());
api.MapGet("/lenses/{id:guid}/drift", async (Guid id, Mind m, CancellationToken ct) =>
    await m.DriftAsync(id, ct) is { } r ? Results.Ok(r) : Results.NotFound());
api.MapGet("/lenses/{id:guid}/map", async (Guid id, Mind m, CancellationToken ct) =>
    await m.MapAsync(id, ct) is { } r ? Results.Ok(r) : Results.NotFound());

// ---- export ------------------------------------------------------------------------------------

api.MapGet("/export", async (Db db, CancellationToken ct) =>
{
    var lenses = await db.ListLensesAsync(ct);
    var entries = await db.ListEntriesAsync(null, null, null, null, int.MaxValue, ct);
    var scores = await db.ScoresForAsync(entries.Select(e => e.Id).ToList(), ct);
    return new
    {
        exportedAt = DateTime.UtcNow,
        lenses,
        entries = entries.Select(e => new { e.Id, e.Kind, e.Body, e.Status, e.Source, e.CreatedAt, e.TouchedAt, e.Weight, scores = scores[e.Id] }),
    };
});

McpEndpoint.Map(app);

app.MapFallbackToFile("index.html");
app.Run();

static async Task<string?> ValidateScores(Dictionary<Guid, double?>? values, Db db, CancellationToken ct)
{
    if (values is null || values.Count == 0) return null;
    var known = (await db.ListLensesAsync(ct)).SelectMany(l => l.Dimensions).Where(d => d.ArchivedAt is null).Select(d => d.Id).ToHashSet();
    foreach (var k in values.Keys)
        if (!known.Contains(k)) return $"unknown or archived dimension {k}";
    if (values.Values.Any(v => v is < Scale.Min or > Scale.Max)) return "scores must be between -5 and 5";
    return null;
}

public partial class Program;
