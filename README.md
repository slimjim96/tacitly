# Tacitly

A self-hosted place for quick notes and to-dos, and for thoughts and aspirations where **you** write the vectors.

## Quick capture

The Inbox is the front door. Type a line and press Enter: it's a **note**. Start it with `[]` (or tick *to-do*) and it's a **to-do** with a checkbox. There's no kind to pick, nothing to score, and no lens needed. Open to-dos sit at the top, notes below by day, newest first.

A note can become more. *Make thought* or *make aspiration* moves it into the lens views, unscored and ready to place; that's the only way into the vectors. Until then, notes stay out of the unscored count, drift, themes, orbits and the map. Plain notes fade quietly; a to-do left open for 14 days comes back in *Still true?*.

Prefer to score as you capture? *Capture with a shape* opens the full capture panel.

## You write the vectors

There's no embedding model. You design the vector spaces yourself, score each entry along axes you chose, and Postgres (pgvector) stores and searches the result. Every similarity, cluster and orbit traces back to a judgement you made, on a dimension you named.

## The model

| Concept | What it is |
|---|---|
| **Lens** | A vector space you define, e.g. *Feel* or *Value*. Keep as many as you like. |
| **Dimension** | One axis of a lens, bipolar with your own words at each end: *draining ↔ energising*. Scored −5 to +5, 0 is neutral. Optional **weight** makes it count for more. |
| **Entry** | A **thought**, an **aspiration** (a goal) or a **pattern** (a named shape you want to recognise: *burnout*, *flow*). |
| **Score** | Your judgement of one entry on one dimension. Unscored dimensions count as neutral. |
| **Vector** | For each entry in each lens: `[score × √weight for each dimension, in order]`. Maintained by Postgres triggers. |

What the engine does with your vectors:

- **Gravity**: each thought orbits the aspiration whose shape is closest, if similarity clears the lens's threshold (default 0.75, set per lens).
- **Drift**: scored thoughts no aspiration is pulling on, plus entries you haven't placed in the lens yet.
- **Shape search**: dial in a vector with sliders and pgvector returns the nearest entries as you move them. Save a shape as a pattern.
- **Themes**: k-means over the lens, each cluster named by its strongest poles in your own words (e.g. "desire · energising").
- **Salience**: weight × 30-day half-life, bumped when you rescore something.

## Keeping it moving

Thoughts are the river; aspirations and lenses are the rocks. These features let both move, and show you when they do.

- **Score history.** Every score change is recorded by a trigger, never overwritten. The entry drawer shows *How it has moved* (Energy +3 → −1 → +4) and overlays your first shape on the radar. On the Map, with your own dimensions on both axes, **trails** run from where an entry started to where it is now.
- **Still true?** Entries whose salience has fallen below half come back in the *Still true?* tab (the badge shows how many). *Still true* reinforces the entry and resets its clock, *rescore* opens it, *release* lets it go.
- **Stated vs revealed.** Each aspiration with two or more orbiting thoughts shows its own shape against the average shape of what it actually pulls in, with the widest gap spelled out: "Pull: you scored it desire (+5); what it pulls in is milder (+3.0)".
- **Other perspectives.** In the entry drawer, *Scoring as* lets someone else score the same entry (e.g. `aaron`). Their shape is overlaid on yours for comparison and never touches your vectors, orbits or themes. There's no separate login: it's one app, and perspectives are labels.
- **Outside currents.** Anything can feed entries in through `/api/ingest` or the MCP endpoint, tagged with a source (`slimfin`, `homelab`, `shortcut`, `claude`) that shows on the entry.

## Wild cards

- **Observed-only dimensions (weight 0).** Scored, shown on the radar and fingerprint, usable as a map axis or colour, but never counted in distance, orbits or themes. Trial an axis before trusting it; raise the weight when it earns it and every vector rebuilds.
- **Wild-card pool.** Tick *Wild* on any dimension. The capture box then offers one wild-card dimension from another lens at random each time (*another* rerolls it). You build a sample across many entries without scoring everything.
- **Archive.** Takes a dimension out of the vector but keeps every score and its history. Restore brings it back exactly as it was. Use it instead of deleting when retiring a seasonal axis.
- **Shadow lens.** One click under Lenses: Avoidance, Residue, Ego, Source, Regret, Reversibility, Decay, Drag. All are wild cards. Source (my voice ↔ borrowed) and Drag (frees ↔ entangles) count from the start; the rest are observed-only until you promote them.

Similarity is `1 − distance / max_distance`, where max distance is two points at opposite corners of the lens. 1.0 means the same shape, 0 means opposite.

## Visuals

- **Radar**: every entry's shape. Overlays show a thought against the aspiration it orbits, or a result against the shape you're searching for. Lenses with fewer than three dimensions fall back to bars.
- **Fingerprint**: the vector as a strip of coloured cells next to every entry (cool = low pole, warm = high pole, dashed = unscored).
- **Map**: scatter plot of the lens. Put **your own dimensions on the axes** (Energy × Pull) or use PCA, and colour by theme or by a third dimension. Rings are aspirations, diamonds are patterns, lines show gravity.
- **Distribution**: where everything sits on each axis.
- **Orbits**: each aspiration's shape, what it's pulling in, and an 8-week trend.

## Run it

```bash
cp .env.example .env            # set POSTGRES_PASSWORD
docker compose up -d --build
```

Open `http://<host>:8080`. First run offers two starter lenses (Feel: energy, mood, fear, pull; Value: impact, effort, urgency, alignment). Use them or build your own under **Lenses**.

Two containers: `db` (pgvector/pgvector:pg17) and `app` (.NET 10 API serving the React UI). The app applies `db/schema.sql` on every start. It's idempotent and upgrades older databases in place: from v1 (Ollama), embeddings are dropped and entries kept, unscored; from v2, existing scores become your perspective and seed the history.

### Behind HAProxy / Cloudflare

A single HTTP port, so it's one more HAProxy backend. Don't expose it bare. Keep it LAN/VPN-only, put Cloudflare Access in front, or set `TACITLY_TOKEN` (the UI asks once and sends it as `X-Tacitly-Token`). `/api/health` stays open for health checks.

### Feeding it from elsewhere

Scores go by `"Lens/Dimension"` name (case-insensitive), so callers don't need ids:

```bash
curl -X POST https://your-host/api/ingest \
  -H "content-type: application/json" -H "X-Tacitly-Token: $TACITLY_TOKEN" \
  -d '{"body":"SlimFin: drawdown hit 4%","source":"slimfin","scores":{"Feel/Fear":3,"Feel/Energy":-2}}'
```

An iOS Shortcut is the same call: *Ask for Input* → *Get Contents of URL* (POST, JSON body `{"body": <input>, "source": "shortcut"}`). Add `"todo": true`, or start the text with `[]`, to drop a to-do in the Inbox; `"kind": "note"` drops a plain note. Without either, ingest keeps its old default of a thought. `createdAt` backdates an import.

**Claude (MCP).** `/mcp` is a Model Context Protocol server (Streamable HTTP, tools only). Tools: `note`, `todos`, `done` for the Inbox, and `list_lenses`, `capture`, `search`, `match`, `orbits`, `review_queue`, `get_entry`, `score` for the lenses.

```bash
claude mcp add --transport http tacitly https://your-host/mcp --header "Authorization: Bearer $TACITLY_TOKEN"
```

For Claude Desktop or claude.ai, add it as a custom connector with the same URL. The endpoint accepts `Authorization: Bearer <token>` or `X-Tacitly-Token`. Entries Claude captures are tagged `source: claude`.

### Checking a deployment

```bash
python3 scripts/smoke.py http://<host>:8080 [token]          # creates a temp lens, asserts behaviour, cleans up
python3 scripts/smoke.py http://<host>:8080 [token] --keep   # leaves the sample data so you can see it in the UI
```

## The database does the vector bookkeeping

`scores` is the source of truth. `entry_vectors` holds one pgvector row per entry per lens, built from **your** (`scorer = 'me'`) scores on non-archived dimensions, and rebuilt by triggers whenever you:

- score, rescore or clear a value
- add, delete, reweight, reorder, archive or restore a dimension

The same trigger appends every change to `score_history`.

So you can write scores straight into Postgres from anywhere (a script, n8n, another app) and the vectors stay correct. Useful queries:

```sql
-- nearest to an entry in a lens
SELECT e.body, ev.v <-> src.v AS distance
FROM entry_vectors ev JOIN entries e ON e.id = ev.entry_id,
     (SELECT v FROM entry_vectors WHERE lens_id = :lens AND entry_id = :entry) src
WHERE ev.lens_id = :lens ORDER BY distance LIMIT 10;

-- every score, readable
SELECT e.body, l.name AS lens, d.name AS dimension, s.value
FROM scores s JOIN dimensions d ON d.id = s.dimension_id JOIN lenses l ON l.id = d.lens_id
JOIN entries e ON e.id = s.entry_id ORDER BY e.created_at DESC;
```

The vector column has no fixed size, because each lens has its own dimension count. Search is exact, which is instant at personal scale (thousands of entries).

## Designing good dimensions

- Make both poles meaningful. *draining ↔ energising* works. *not energy ↔ energy* doesn't: most things end up at one end.
- 3 to 7 dimensions per lens. Fewer and everything looks alike; more and you'll stop scoring.
- Separate lenses for separate questions. How something *feels* and what it's *worth* are different spaces, and mixing them blurs both.
- Weight the axis you trust most, e.g. *Alignment ×2* in Value.
- If Drift fills with things that clearly belong to an aspiration, lower that lens's gravity. If orbits collect junk, raise it.

## API

| Method | Path | |
|---|---|---|
| GET/POST | `/api/lenses` | list (with dimensions) / create `{name, description, gravity}` |
| POST | `/api/lenses/starter` | create Feel + Value if no lenses exist |
| PATCH/DELETE | `/api/lenses/{id}` | |
| POST | `/api/lenses/{id}/dimensions` | `{name, lowLabel, highLabel, weight (0-5), wildcard}` |
| PUT | `/api/lenses/{id}/order` | `{dimensionIds: [...]}` in the new order |
| PATCH/DELETE | `/api/dimensions/{id}` | PATCH also takes `wildcard` and `archived` |
| GET | `/api/inbox` | `{todos, notes, doneRecently}`: open to-dos, notes newest first, to-dos ticked in the last day |
| POST | `/api/entries` | `{body, kind?, todo?, scores?}` → entry + where it landed. No kind = note; `[]` or `todo` = to-do; notes refuse scores |
| GET | `/api/entries?kind=&status=&q=&unscoredIn=&limit=` | stream / text search |
| GET/PATCH/DELETE | `/api/entries/{id}` | detail (with gravity and neighbours per lens) / `{body, status, kind, isTodo}`. Note → other kind promotes it |
| PUT | `/api/entries/{id}/scores?scorer=` | `{dimensionId: value \| null}`; null clears. `scorer` defaults to `me` |
| GET | `/api/scorers` | other perspectives in use |
| GET / POST | `/api/review` · `/api/entries/{id}/affirm` | the *still true?* queue / "still true" |
| POST | `/api/ingest` | `{body, kind?, todo?, source?, createdAt?, scores: {"Lens/Dimension": value}}` |
| POST | `/api/lenses/starter/shadow` | create the Shadow lens |
| POST | `/mcp` | MCP server (JSON-RPC over HTTP) |
| POST | `/api/lenses/{id}/match` | `{values: {dimensionId: value}, kind?, k?}` → nearest by shape |
| GET | `/api/lenses/{id}/orbits` · `/drift` · `/map` | per-lens views; map includes PCA and themes |
| GET | `/api/pulse` · `/api/export` | counts / everything as JSON |

## Develop

```bash
docker compose up -d db                       # just Postgres
cd src/Tacitly.Api
Tacitly__ConnectionString="Host=localhost;Database=tacitly;Username=tacitly;Password=<pw>" \
  dotnet run --urls http://localhost:5080
cd web && npm install && npm run dev          # UI with hot reload, proxies /api to :5080
# or `npm run build` once to have the API serve the UI itself (wwwroot is not committed)
```

(Expose `5432` on the db service for local dev.)

## Contributing to yourself

New ideas start as a short spec in `docs/specs/` (see the README there). CI builds the UI and API and runs `scripts/smoke.py` against real Postgres + pgvector on every push.

## Backup

```bash
docker compose exec db pg_dump -U tacitly tacitly | gzip > tacitly-$(date +%F).sql.gz
```

`/api/export` gives the same data as plain JSON (lenses, dimensions, entries, scores).

## Layout

```
db/schema.sql             tables, vector triggers, v1 upgrade (compiled into the app, runnable by hand)
src/Tacitly.Api/
  Program.cs              endpoints, validation, optional token
  Mcp.cs                  MCP server at /mcp (hand-rolled JSON-RPC, tools only)
  Model.cs                lenses, dimensions, entries, DTOs
  Store/Db.cs             all SQL; pgvector nearest-neighbour queries
  Engine/Mind.cs          gravity, drift, themes, map, capture/detail
  Engine/Algorithms.cs    vector space rules, k-means, PCA
web/src/
  viz.tsx                 radar, fingerprint, sliders, sparkline
  MapView.tsx             axis-picker scatter, themes, distribution strips
  Shape.tsx               shape search and pattern builder
  Lenses.tsx              lens and dimension editor
  Drawer.tsx              entry detail, scoring, perspectives, history
  Views.tsx               orbits (stated vs revealed), stream, drift, still-true queue
scripts/smoke.py          end-to-end test against a running instance
```
