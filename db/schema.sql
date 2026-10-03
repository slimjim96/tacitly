-- InsideOut schema: human-defined vectors.
-- Idempotent: the app runs this on every start. Safe to run by hand with psql too.
--
--   lenses        a named vector space you define ("Feel", "Value")
--   dimensions    the axes of a lens, each bipolar with a label at both ends
--   entries       thoughts, aspirations and patterns (plain text)
--   scores        judgement: entry x dimension x scorer -> value in [-5, 5]   (source of truth)
--   score_history every score change, so shapes can be watched moving over time
--   entry_vectors pgvector materialisation of YOUR ('me') scores, one row per entry per lens (maintained by triggers)
--
-- Vector for (entry, lens) = [ score_or_0 * sqrt(weight) for each active dimension ordered by position ].
-- Unscored dimensions count as neutral (0). Weight 0 = observed only (scored and shown, never measured).
-- Archived dimensions keep their scores but leave the vector.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS lenses (
    id          uuid PRIMARY KEY,
    name        text NOT NULL,
    description text NOT NULL DEFAULT '',
    gravity     double precision NOT NULL DEFAULT 0.75 CHECK (gravity > 0 AND gravity < 1),
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dimensions (
    id          uuid PRIMARY KEY,
    lens_id     uuid NOT NULL REFERENCES lenses(id) ON DELETE CASCADE,
    name        text NOT NULL,
    low_label   text NOT NULL DEFAULT '',
    high_label  text NOT NULL DEFAULT '',
    weight      double precision NOT NULL DEFAULT 1,
    position    int NOT NULL DEFAULT 0,
    wildcard    boolean NOT NULL DEFAULT false,
    archived_at timestamptz NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dimensions_lens_idx ON dimensions (lens_id, position);
ALTER TABLE dimensions ADD COLUMN IF NOT EXISTS wildcard boolean NOT NULL DEFAULT false;
ALTER TABLE dimensions ADD COLUMN IF NOT EXISTS archived_at timestamptz NULL;
ALTER TABLE dimensions DROP CONSTRAINT IF EXISTS dimensions_weight_check;
ALTER TABLE dimensions ADD CONSTRAINT dimensions_weight_check CHECK (weight >= 0 AND weight <= 5);

CREATE TABLE IF NOT EXISTS entries (
    id         uuid PRIMARY KEY,
    kind       text NOT NULL,
    body       text NOT NULL,
    status     text NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL,
    touched_at timestamptz NOT NULL,
    weight     double precision NOT NULL DEFAULT 1,
    source     text NOT NULL DEFAULT 'app'
);
CREATE INDEX IF NOT EXISTS entries_created_idx ON entries (created_at DESC);
ALTER TABLE entries ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'app';

-- Upgrade from v1 (AI embeddings): drop machine columns, widen kinds.
ALTER TABLE entries DROP COLUMN IF EXISTS embedding;
ALTER TABLE entries DROP COLUMN IF EXISTS theme_id;
DROP TABLE IF EXISTS themes;
DROP TABLE IF EXISTS io_meta;
ALTER TABLE entries DROP CONSTRAINT IF EXISTS entries_kind_check;
ALTER TABLE entries ADD CONSTRAINT entries_kind_check CHECK (kind IN ('thought', 'aspiration', 'pattern'));
ALTER TABLE entries DROP CONSTRAINT IF EXISTS entries_status_check;
ALTER TABLE entries ADD CONSTRAINT entries_status_check CHECK (status IN ('active', 'done', 'released'));

-- scorer: 'me' is you; any other name is a second perspective (compared, never vectorised).
CREATE TABLE IF NOT EXISTS scores (
    entry_id     uuid NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
    dimension_id uuid NOT NULL REFERENCES dimensions(id) ON DELETE CASCADE,
    scorer       text NOT NULL DEFAULT 'me',
    value        real NOT NULL CHECK (value >= -5 AND value <= 5),
    scored_at    timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (entry_id, dimension_id, scorer)
);
CREATE INDEX IF NOT EXISTS scores_dimension_idx ON scores (dimension_id);

-- Upgrade from v2: add scorer and widen the primary key.
ALTER TABLE scores ADD COLUMN IF NOT EXISTS scorer text NOT NULL DEFAULT 'me';
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
        WHERE c.conname = 'scores_pkey' AND a.attname = 'scorer'
    ) THEN
        ALTER TABLE scores DROP CONSTRAINT scores_pkey;
        ALTER TABLE scores ADD PRIMARY KEY (entry_id, dimension_id, scorer);
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS score_history (
    id           bigserial PRIMARY KEY,
    entry_id     uuid NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
    dimension_id uuid NOT NULL REFERENCES dimensions(id) ON DELETE CASCADE,
    scorer       text NOT NULL,
    value        real NULL,              -- NULL = score cleared
    at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS score_history_entry_idx ON score_history (entry_id, at);

-- Seed history once from existing scores (upgrades), so every entry has a starting shape.
INSERT INTO score_history (entry_id, dimension_id, scorer, value, at)
SELECT entry_id, dimension_id, scorer, value, scored_at FROM scores
WHERE NOT EXISTS (SELECT 1 FROM score_history);

-- No fixed dimension count: each lens has its own length. Exact search is fine at personal scale.
CREATE TABLE IF NOT EXISTS entry_vectors (
    entry_id uuid NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
    lens_id  uuid NOT NULL REFERENCES lenses(id) ON DELETE CASCADE,
    v        vector NOT NULL,
    scored   int NOT NULL,          -- how many dimensions were explicitly scored
    PRIMARY KEY (lens_id, entry_id)
);

-- Rebuild vectors for a lens (all entries, or one). Only 'me' scores on active dimensions count.
CREATE OR REPLACE FUNCTION io_rebuild(p_lens uuid, p_entry uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    IF p_lens IS NULL THEN RETURN; END IF;

    DELETE FROM entry_vectors WHERE lens_id = p_lens AND (p_entry IS NULL OR entry_id = p_entry);

    INSERT INTO entry_vectors (entry_id, lens_id, v, scored)
    SELECT e.entry_id,
           p_lens,
           array_agg(coalesce(s.value, 0) * sqrt(d.weight) ORDER BY d.position, d.id)::real[]::vector,
           count(s.value)
    FROM (SELECT DISTINCT s2.entry_id
          FROM scores s2 JOIN dimensions d2 ON d2.id = s2.dimension_id
          WHERE d2.lens_id = p_lens AND d2.archived_at IS NULL AND s2.scorer = 'me'
            AND (p_entry IS NULL OR s2.entry_id = p_entry)) e
    CROSS JOIN dimensions d
    LEFT JOIN scores s ON s.dimension_id = d.id AND s.entry_id = e.entry_id AND s.scorer = 'me'
    WHERE d.lens_id = p_lens AND d.archived_at IS NULL
    GROUP BY e.entry_id;
END $$;

CREATE OR REPLACE FUNCTION io_scores_changed() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE r record;
BEGIN
    r := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;

    -- History. Skipped when the delete is a cascade from a removed entry or dimension.
    INSERT INTO score_history (entry_id, dimension_id, scorer, value)
    SELECT r.entry_id, r.dimension_id, r.scorer, CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE r.value END
    WHERE EXISTS (SELECT 1 FROM entries WHERE id = r.entry_id)
      AND EXISTS (SELECT 1 FROM dimensions WHERE id = r.dimension_id);

    IF r.scorer = 'me' THEN
        -- On a cascaded dimension delete the dimension is already gone; the dimension trigger handles that lens.
        PERFORM io_rebuild((SELECT lens_id FROM dimensions WHERE id = r.dimension_id), r.entry_id);
    END IF;
    RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION io_dimensions_changed() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN PERFORM io_rebuild(OLD.lens_id, NULL); END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') AND (TG_OP = 'INSERT' OR NEW.lens_id <> OLD.lens_id) THEN
        PERFORM io_rebuild(NEW.lens_id, NULL);
    END IF;
    RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS scores_vectorise ON scores;
CREATE TRIGGER scores_vectorise AFTER INSERT OR UPDATE OR DELETE ON scores
    FOR EACH ROW EXECUTE FUNCTION io_scores_changed();

DROP TRIGGER IF EXISTS dimensions_vectorise ON dimensions;
CREATE TRIGGER dimensions_vectorise AFTER INSERT OR UPDATE OF weight, position, lens_id, archived_at OR DELETE ON dimensions
    FOR EACH ROW EXECUTE FUNCTION io_dimensions_changed();
