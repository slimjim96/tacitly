# Changelog

## Unreleased
- Quick capture (spec 0004): notes and to-dos, the Inbox as the first tab, promote a note to place it, stale to-dos in "Still true?", the app works with no lenses, `/api/inbox`, MCP `note`/`todos`/`done`
- Renamed from InsideOut to Tacitly: namespace and project folder, config keys (`Tacitly__*`), env vars (`TACITLY_*`), `X-Tacitly-Token` header, database/user/image name, localStorage keys, MCP server name

## 3.0.0
- Score history (trigger-recorded), map trails, "How it has moved" in the entry drawer
- "Still true?" review queue for faded entries
- Stated vs revealed shape on each aspiration
- Other perspectives (`scorer`), compared with yours, never vectorised
- Wild cards: observed-only dimensions (weight 0), wild-card pool on capture, archive/restore, Shadow lens
- `/api/ingest` (scores by "Lens/Dimension" name, source tag) and an MCP server at `/mcp`

## 2.0.0
- Human-defined vectors replace AI embeddings: lenses, bipolar dimensions, scores
- pgvector rows maintained by Postgres triggers
- Radar, fingerprint, axis-picker map, shape search, patterns

## 1.0.0
- Thoughts and aspirations embedded with Ollama (`nomic-embed-text`), gravity, drift, themes
