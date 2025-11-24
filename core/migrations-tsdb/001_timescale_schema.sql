-- =====================================================
-- TimescaleDB Schema
-- Time-series data tables
-- =====================================================

-- =====================================================
-- Tag Values (Time-series data)
-- =====================================================

CREATE TABLE IF NOT EXISTS tag_values (
    connection_id uuid NOT NULL,
    tag_id integer NOT NULL,
    ts timestamptz NOT NULL DEFAULT now(),
    quality smallint,
    v_num double precision,
    v_text text,
    v_json jsonb,
    PRIMARY KEY (connection_id, tag_id, ts)
);

-- Indexes for tag_values
CREATE INDEX IF NOT EXISTS tag_values_ts_desc ON tag_values (connection_id, tag_id, ts DESC);
CREATE INDEX IF NOT EXISTS tag_values_ts_idx ON tag_values (ts DESC);
-- Index for queries filtering by tag_id without connection_id (e.g., chart composer queries)
-- Fixes slow queries when checking data existence: SELECT 1 FROM tag_values WHERE tag_id = ANY(...) AND ts >= ... LIMIT 1
CREATE INDEX IF NOT EXISTS idx_tag_values_tag_id_ts ON tag_values (tag_id, ts DESC);

-- Convert to hypertable
DO $$
BEGIN
    PERFORM create_hypertable('tag_values', 'ts', 
        chunk_time_interval => INTERVAL '1 day',
        if_not_exists => TRUE
    );
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Hypertable creation skipped or failed: %', SQLERRM;
END $$;

-- =====================================================
-- System Metrics
-- =====================================================

CREATE TABLE IF NOT EXISTS system_metrics (
    tag_id INTEGER NOT NULL,
    ts TIMESTAMPTZ NOT NULL,
    v_num DOUBLE PRECISION,
    PRIMARY KEY (tag_id, ts)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS system_metrics_ts_desc ON system_metrics(ts DESC);
CREATE INDEX IF NOT EXISTS system_metrics_tag_id_ts ON system_metrics(tag_id, ts DESC);

-- Convert to hypertable
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
        PERFORM create_hypertable('system_metrics', 'ts',
            chunk_time_interval => INTERVAL '1 day',
            if_not_exists => TRUE
        );
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Hypertable creation skipped or failed: %', SQLERRM;
END $$;
