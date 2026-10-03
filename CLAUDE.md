# Working notes for Claude

A self-hosted tool where the user (Jim) writes his own vectors: he defines lenses (vector spaces) with bipolar dimensions, scores thoughts, aspirations and patterns from -5 to +5, and Postgres/pgvector keeps the vectors and does the searching. Read `README.md` for the model and `docs/PRINCIPLES.md` before proposing features.

## Handoff (3 October 2026)

- **State:** v3.0.0 is committed and tagged. It was built in a cloud sandbox that could not download NuGet packages, so the real Npgsql driver has never been compiled against or run. All testing went through a stand-in that ran the app's real SQL through `psql`; `scripts/smoke.py` passed 24 checks that way. The GitHub Actions workflow has never run either.
- **Next:**
  1. Rename the project (see below) before anything else touches names.
  2. Push and get CI green. This is the first real run of Npgsql; expect to fix type-mapping issues in `src/InsideOut.Api/Store/Db.cs` if any appear.
  3. `docker compose up --build` on the homelab, then `python3 scripts/smoke.py http://<host>:8080 <token>`.
  4. Build specs in this order: 0001 evening journal, 0003 playbook, 0002 pick-up brief.
- **Watch out:**
  - `db/schema.sql` runs on every start and must stay idempotent. It carries the v1 and v2 upgrade paths.
  - Vectors are built only by the triggers in `schema.sql`. Application code never writes a vector. The rule (`score_or_0 * sqrt(weight)`, active dimensions by position, `scorer = 'me'` only) is mirrored in `VectorSpace` in `Engine/Algorithms.cs`; change both together.
  - Likely Npgsql trouble spots: string parameters cast with `CAST(@x AS jsonb)`, `float` into a `real` column, `Guid[]` with `ANY(@ids)` and `unnest(@ids) WITH ORDINALITY`, and the multi-statement schema script with `$$` bodies sent as one command.
  - `src/InsideOut.Api/wwwroot/` is build output and is not committed. Run `npm run build` in `web/` to produce it.

## Rename

"InsideOut" is being dropped (it's a Disney film title). The new name is not chosen yet; ask Jim. Places it appears: the C# namespace and `InsideOut.Api` project/folder, the `InsideOut__*` config keys and compose env vars, the `X-InsideOut-Token` header, `insideout` database/user/image/compose names, `insideout.*` localStorage keys in `web/src`, the MCP `serverInfo.name`, `scripts/smoke.py`, and the docs.

## Open questions from the specs

- Store Claude's suggested scores as a `claude` perspective (proposed) or not at all?
- Is a project a flagged aspiration (proposed) or its own kind of entry?
- Should a project with no handoff for 14 days appear in "Still true?" (proposed: yes)

## Commands

```bash
docker compose up -d db                                   # Postgres + pgvector only
cd web && npm ci && npm run build                         # UI into wwwroot (or `npm run dev` for hot reload)
InsideOut__ConnectionString="Host=localhost;Database=insideout;Username=insideout;Password=<pw>" \
  dotnet run --project src/InsideOut.Api --urls http://localhost:5080
python3 scripts/smoke.py http://localhost:5080 [token]    # end-to-end; add --keep to leave sample data
```

## Conventions

- New work starts as a spec in `docs/specs/` (template there). Branch `spec/NNNN-short-name`.
- Every endpoint and trigger change gets a check in `scripts/smoke.py`.
- All SQL lives in `Store/Db.cs` and `db/schema.sql`.
- When you stop, replace the Handoff section above with a new three-line one: state, next, watch out.
