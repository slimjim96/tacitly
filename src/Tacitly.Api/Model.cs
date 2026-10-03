namespace Tacitly;

public static class Kinds
{
    public const string Note = "note";             // quick capture: never scored, may be a to-do; promote it to place it
    public const string Thought = "thought";
    public const string Aspiration = "aspiration"; // a goal: exerts gravity on thoughts
    public const string Pattern = "pattern";       // a named shape you want to recognise ("burnout", "flow")
    public static bool IsValid(string? k) => k is Note or Thought or Aspiration or Pattern;
    public const string Expected = "kind must be note, thought, aspiration or pattern";
}

public static class Statuses
{
    public const string Active = "active";
    public const string Done = "done";
    public const string Released = "released";
    public static bool IsValid(string? s) => s is Active or Done or Released;
}

public static class Scale
{
    public const double Min = -5, Max = 5, Span = Max - Min;
}

// ---- stored -----------------------------------------------------------------------

public sealed class Lens
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = "";
    public string Description { get; set; } = "";
    /// <summary>Similarity (0-1) a thought needs to count as orbiting an aspiration in this lens.</summary>
    public double Gravity { get; set; } = 0.75;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public List<Dimension> Dimensions { get; set; } = [];
}

public sealed class Dimension
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid LensId { get; set; }
    public string Name { get; set; } = "";
    public string LowLabel { get; set; } = "";
    public string HighLabel { get; set; } = "";
    /// <summary>0 = observed only: scored and shown, but never counted in distance.</summary>
    public double Weight { get; set; } = 1;
    public int Position { get; set; }
    /// <summary>In the wild-card pool: the capture box offers one at random.</summary>
    public bool Wildcard { get; set; }
    /// <summary>Archived dimensions keep their scores but leave the vector.</summary>
    public DateTime? ArchivedAt { get; set; }
}

public sealed class Entry
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Kind { get; set; } = Kinds.Thought;
    public string Body { get; set; } = "";
    public string Status { get; set; } = Statuses.Active;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime TouchedAt { get; set; } = DateTime.UtcNow;
    public double Weight { get; set; } = 1;
    /// <summary>Where it came from: app, shortcut, claude, slimfin, homelab...</summary>
    public string Source { get; set; } = "app";
    /// <summary>Notes only: shows a checkbox; ticking it sets status to done.</summary>
    public bool IsTodo { get; set; }
}

/// <summary>Scores keyed by dimension id. Absent = not scored.</summary>
public sealed class ScoreMap : Dictionary<Guid, double>;

public sealed record Scored(Entry Entry, double Similarity);

// ---- requests ---------------------------------------------------------------------

public sealed record LensRequest(string? Name, string? Description, double? Gravity);
public sealed record DimensionRequest(string? Name, string? LowLabel, string? HighLabel, double? Weight, bool? Wildcard = null, bool? Archived = null);
public sealed record ReorderRequest(Guid[] DimensionIds);
/// <summary>Kind defaults to note. A to-do is a note with Todo = true, or a body starting with "[]".</summary>
public sealed record CaptureRequest(string? Kind, string Body, Dictionary<Guid, double?>? Scores = null, string? Source = null, bool? Todo = null);
/// <summary>For scripts, shortcuts and agents: scores keyed by "Lens/Dimension" name instead of id.</summary>
/// <remarks>Kind defaults to thought, or note when it is a to-do. CreatedAt backdates an import.</remarks>
public sealed record IngestRequest(string Body, string? Kind, string? Source, Dictionary<string, double?>? Scores, bool? Todo = null, DateTime? CreatedAt = null);
public sealed record UpdateRequest(string? Body, string? Status, string? Kind, bool? IsTodo = null);
public sealed record MatchRequest(Dictionary<Guid, double?> Values, string? Kind, int? K);

// ---- responses --------------------------------------------------------------------

public sealed record EntryDto(
    Guid Id, string Kind, string Body, string Status,
    DateTime CreatedAt, DateTime TouchedAt, double Weight, double Salience, string Source,
    IReadOnlyDictionary<Guid, double> Scores, bool IsTodo);

/// <summary>The front door: open to-dos, then notes, newest first, plus to-dos ticked in the last day.</summary>
public sealed record Inbox(IReadOnlyList<EntryDto> Todos, IReadOnlyList<EntryDto> Notes, IReadOnlyList<EntryDto> DoneRecently);

public sealed record ScoredDto(EntryDto Entry, double Similarity);

/// <summary>What happened in one lens when an entry was captured or rescored.</summary>
public sealed record LensLanding(Guid LensId, string LensName, ScoredDto? Gravity, IReadOnlyList<ScoredDto> Near);

public sealed record HistoryItem(Guid DimensionId, string Scorer, double? Value, DateTime At);

public sealed record EntryDetail(
    EntryDto Entry, IReadOnlyList<LensLanding> Lenses,
    IReadOnlyDictionary<string, ScoreMap> Perspectives,   // other scorers' views of this entry
    IReadOnlyList<HistoryItem> History);

public sealed record Orbit(
    EntryDto Aspiration,
    int OrbitCount,
    int Last30Days,
    int[] Weekly,
    DateTime? LastPull,
    IReadOnlyList<ScoredDto> Thoughts,
    IReadOnlyDictionary<Guid, double>? Revealed,   // average shape of what it actually pulls in
    double? StatedVsRevealed,                      // similarity between the aspiration's own shape and Revealed
    string? GapNote);

public sealed record DriftResult(IReadOnlyList<ScoredDto> Drifting, IReadOnlyList<EntryDto> Unscored);

public sealed record ThemeDto(int Id, string Label, int Size, IReadOnlyDictionary<Guid, double> Centroid, IReadOnlyList<EntryDto> Members);

public sealed record MapPoint(
    Guid Id, string Kind, string Status, string Body, double Salience,
    IReadOnlyDictionary<Guid, double> Scores, double Pcx, double Pcy, int? Theme, Guid? Orbits,
    IReadOnlyDictionary<Guid, double>? Was);   // first recorded shape, when it differs from now

public sealed record LensMap(Lens Lens, IReadOnlyList<MapPoint> Points, IReadOnlyList<ThemeDto> Themes);
