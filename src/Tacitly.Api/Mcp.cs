using System.Text.Json;
using System.Text.Json.Nodes;
using Tacitly.Engine;
using Tacitly.Store;

namespace Tacitly;

/// <summary>
/// A minimal MCP server (Streamable HTTP, stateless, JSON responses) at /mcp, so Claude or any MCP client
/// can capture into and read from Tacitly. Hand-rolled JSON-RPC: tools only, no sessions, no streaming.
///
///   claude mcp add --transport http tacitly https://your-host/mcp --header "Authorization: Bearer $TACITLY_TOKEN"
/// </summary>
public static class McpEndpoint
{
    private static readonly string[] Versions = ["2025-06-18", "2025-03-26", "2024-11-05"];
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private static readonly JsonNode Scores = JsonNode.Parse("""
        {"type":"object","description":"Scores keyed by \"Lens/Dimension\" (e.g. \"Feel/Energy\"), each -5..5. Call list_lenses for names and pole labels.","additionalProperties":{"type":"number","minimum":-5,"maximum":5}}
        """)!;

    private static JsonArray Tools() =>
    [
        Tool("list_lenses", "List the user's lenses (vector spaces) with their dimensions, pole labels (-5 / +5) and weights. Call this before scoring.", new JsonObject()),
        Tool("capture", "Capture a thought, aspiration or pattern, optionally scoring it. Returns where it landed: the aspiration it orbits and its nearest neighbours per lens.",
            new JsonObject
            {
                ["body"] = new JsonObject { ["type"] = "string" },
                ["kind"] = new JsonObject { ["type"] = "string", ["enum"] = new JsonArray("thought", "aspiration", "pattern") },
                ["scores"] = Scores.DeepClone(),
            }, "body"),
        Tool("search", "Find entries whose text contains the query.",
            new JsonObject { ["query"] = new JsonObject { ["type"] = "string" }, ["limit"] = new JsonObject { ["type"] = "integer" } }, "query"),
        Tool("match", "Find entries nearest to a shape in one lens (pgvector). Unspecified dimensions count as neutral (0).",
            new JsonObject
            {
                ["lens"] = new JsonObject { ["type"] = "string", ["description"] = "Lens name" },
                ["values"] = new JsonObject { ["type"] = "object", ["description"] = "Dimension name -> -5..5", ["additionalProperties"] = new JsonObject { ["type"] = "number" } },
                ["kind"] = new JsonObject { ["type"] = "string", ["enum"] = new JsonArray("thought", "aspiration", "pattern") },
                ["k"] = new JsonObject { ["type"] = "integer" },
            }, "lens", "values"),
        Tool("orbits", "Aspirations in a lens, what each is pulling in, and the gap between the stated shape and the revealed one.",
            new JsonObject { ["lens"] = new JsonObject { ["type"] = "string" } }, "lens"),
        Tool("review_queue", "Entries that have faded and are due a 'still true?' check.",
            new JsonObject { ["limit"] = new JsonObject { ["type"] = "integer" } }),
        Tool("get_entry", "One entry with its scores, where it lands in each lens, other perspectives and score history.",
            new JsonObject { ["entry_id"] = new JsonObject { ["type"] = "string" } }, "entry_id"),
        Tool("score", "Set or clear (null) scores on an existing entry.",
            new JsonObject { ["entry_id"] = new JsonObject { ["type"] = "string" }, ["scores"] = Scores.DeepClone() }, "entry_id", "scores"),
    ];

    private static JsonObject Tool(string name, string description, JsonObject properties, params string[] required) => new()
    {
        ["name"] = name,
        ["description"] = description,
        ["inputSchema"] = new JsonObject
        {
            ["type"] = "object",
            ["properties"] = properties,
            ["required"] = new JsonArray(required.Select(r => (JsonNode)r).ToArray()),
        },
    };

    public static void Map(WebApplication app)
    {
        app.MapGet("/mcp", () => Results.StatusCode(StatusCodes.Status405MethodNotAllowed));
        app.MapDelete("/mcp", () => Results.StatusCode(StatusCodes.Status405MethodNotAllowed));
        app.MapPost("/mcp", async (HttpContext ctx, Mind mind, Db db, CancellationToken ct) =>
        {
            JsonNode? msg;
            try { msg = await JsonNode.ParseAsync(ctx.Request.Body, cancellationToken: ct); }
            catch (JsonException) { return Results.Json(Error(null, -32700, "Parse error")); }

            if (msg is not JsonObject req) return Results.Json(Error(null, -32600, "Batching is not supported"));
            var id = req["id"]?.DeepClone();
            var method = req["method"]?.GetValue<string>();
            var p = req["params"] as JsonObject ?? new JsonObject();

            if (id is null) return Results.Accepted(); // notification (e.g. notifications/initialized)

            try
            {
                JsonNode result = method switch
                {
                    "initialize" => new JsonObject
                    {
                        ["protocolVersion"] = Versions.Contains(p["protocolVersion"]?.GetValue<string>()) ? p["protocolVersion"]!.GetValue<string>() : Versions[0],
                        ["capabilities"] = new JsonObject { ["tools"] = new JsonObject() },
                        ["serverInfo"] = new JsonObject { ["name"] = "tacitly", ["version"] = "3.0.0" },
                        ["instructions"] = "Tacitly stores the user's thoughts and aspirations as vectors the user defines. " +
                                           "Scores are the user's own judgement on -5..5 bipolar dimensions; call list_lenses first and only score dimensions you have good reason to.",
                    },
                    "ping" => new JsonObject(),
                    "tools/list" => new JsonObject { ["tools"] = Tools() },
                    "tools/call" => await CallAsync(p["name"]?.GetValue<string>() ?? "", p["arguments"] as JsonObject ?? new JsonObject(), mind, db, ct),
                    _ => throw new McpError(-32601, $"Method not found: {method}"),
                };
                return Results.Json(new JsonObject { ["jsonrpc"] = "2.0", ["id"] = id, ["result"] = result });
            }
            catch (McpError e) { return Results.Json(Error(id, e.Code, e.Message)); }
        });
    }

    private static async Task<JsonNode> CallAsync(string name, JsonObject a, Mind mind, Db db, CancellationToken ct)
    {
        try
        {
            object result = name switch
            {
                "list_lenses" => (await mind.LensesAsync(ct)).Select(l => new
                {
                    l.Name, l.Description, l.Gravity,
                    dimensions = l.Dimensions.Where(d => d.ArchivedAt is null).OrderBy(d => d.Position)
                        .Select(d => new { d.Name, low = d.LowLabel, high = d.HighLabel, d.Weight, observedOnly = d.Weight == 0 }),
                }),
                "capture" => await CaptureAsync(a, mind, ct),
                "search" => await mind.StreamAsync(null, null, Str(a, "query", true), null, Math.Clamp(Int(a, "limit") ?? 20, 1, 100), ct),
                "match" => await MatchAsync(a, mind, ct),
                "orbits" => await mind.OrbitsAsync((await LensAsync(a, mind, ct)).Id, ct) ?? [],
                "review_queue" => await mind.ReviewAsync(Math.Clamp(Int(a, "limit") ?? 15, 1, 100), ct),
                "get_entry" => await mind.DetailAsync(Guid(a), ct) ?? throw new ToolError("entry not found"),
                "score" => await ScoreAsync(a, mind, ct),
                _ => throw new McpError(-32602, $"Unknown tool: {name}"),
            };
            return Content(JsonSerializer.Serialize(result, Json), false);
        }
        catch (ToolError e) { return Content(e.Message, true); }
    }

    private static async Task<object> CaptureAsync(JsonObject a, Mind mind, CancellationToken ct)
    {
        var body = Str(a, "body", true)!;
        var kind = Str(a, "kind") ?? Kinds.Thought;
        if (!Kinds.IsValid(kind)) throw new ToolError("kind must be thought, aspiration or pattern");
        var scores = await NamedScoresAsync(a, mind, ct);
        return await mind.CaptureAsync(new CaptureRequest(kind, body, scores, "claude"), ct);
    }

    private static async Task<object> ScoreAsync(JsonObject a, Mind mind, CancellationToken ct)
    {
        var scores = await NamedScoresAsync(a, mind, ct);
        return await mind.SetScoresAsync(Guid(a), scores, "me", ct) ?? throw new ToolError("entry not found");
    }

    private static async Task<object> MatchAsync(JsonObject a, Mind mind, CancellationToken ct)
    {
        var lens = await LensAsync(a, mind, ct);
        var values = new Dictionary<System.Guid, double?>();
        foreach (var (k, v) in a["values"] as JsonObject ?? new JsonObject())
        {
            var dim = lens.Dimensions.FirstOrDefault(d => d.ArchivedAt is null && d.Name.Equals(k, StringComparison.OrdinalIgnoreCase))
                      ?? throw new ToolError($"'{lens.Name}' has no dimension '{k}'");
            values[dim.Id] = Math.Clamp(v!.GetValue<double>(), Scale.Min, Scale.Max);
        }
        var kind = Str(a, "kind");
        return await mind.MatchAsync(lens.Id, new MatchRequest(values, kind, Int(a, "k") ?? 10), ct) ?? [];
    }

    private static async Task<Lens> LensAsync(JsonObject a, Mind mind, CancellationToken ct)
    {
        var name = Str(a, "lens", true)!;
        return (await mind.LensesAsync(ct)).FirstOrDefault(l => l.Name.Equals(name, StringComparison.OrdinalIgnoreCase))
               ?? throw new ToolError($"no lens named '{name}'");
    }

    private static async Task<Dictionary<System.Guid, double?>> NamedScoresAsync(JsonObject a, Mind mind, CancellationToken ct)
    {
        var named = (a["scores"] as JsonObject)?.ToDictionary(kv => kv.Key, kv => kv.Value is null ? (double?)null : kv.Value.GetValue<double>());
        var (ids, err) = await mind.ResolveNamesAsync(named, ct);
        if (err is not null) throw new ToolError(err);
        if (ids.Values.Any(v => v is < Scale.Min or > Scale.Max)) throw new ToolError("scores must be between -5 and 5");
        return ids;
    }

    private static string? Str(JsonObject a, string key, bool required = false)
    {
        var s = a[key]?.GetValue<string>();
        if (required && string.IsNullOrWhiteSpace(s)) throw new ToolError($"'{key}' is required");
        return s;
    }

    private static int? Int(JsonObject a, string key) => a[key] is JsonValue v && v.TryGetValue<int>(out var i) ? i : null;

    private static System.Guid Guid(JsonObject a) =>
        System.Guid.TryParse(Str(a, "entry_id", true), out var g) ? g : throw new ToolError("entry_id must be a UUID");

    private static JsonObject Content(string text, bool isError) => new()
    {
        ["content"] = new JsonArray(new JsonObject { ["type"] = "text", ["text"] = text }),
        ["isError"] = isError,
    };

    private static JsonObject Error(JsonNode? id, int code, string message) => new()
    {
        ["jsonrpc"] = "2.0", ["id"] = id, ["error"] = new JsonObject { ["code"] = code, ["message"] = message },
    };

    private sealed class McpError(int code, string message) : Exception(message) { public int Code { get; } = code; }
    private sealed class ToolError(string message) : Exception(message);
}
