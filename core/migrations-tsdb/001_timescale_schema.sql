-- =====================================================
-- TimescaleDB Schema
-- Time-series data tables
-- =====================================================

-- =====================================================
-- Tag Values (Time-series data)
-- =====================================================

CREATE TABLE IF NOT EXISTS tag_values (
    ts timestamptz NOT NULL DEFAULT now(),
    connection_id uuid NOT NULL,
    tag_id integer NOT NULL,
    quality smallint,
    v_num double precision,
    v_text text,
    v_json jsonb,
    PRIMARY KEY (connection_id, tag_id, ts)
);

-- Indexes for tag_values
CREATE INDEX IF NOT EXISTS idx_tag_values_ts_desc ON tag_values (connection_id, tag_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_tag_values_ts ON tag_values (ts DESC);
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
    ts timestamptz NOT NULL,
    metric_name text NOT NULL,
    value double precision NOT NULL,
    labels jsonb DEFAULT '{}'::jsonb,
    ingested_at timestamptz DEFAULT now()
);

-- Convert to hypertable
DO $$
BEGIN
    PERFORM create_hypertable('system_metrics', 'ts',
        chunk_time_interval => INTERVAL '1 day',
        if_not_exists => TRUE
    );
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Hypertable creation skipped or failed: %', SQLERRM;
END $$;

CREATE INDEX IF NOT EXISTS idx_system_metrics_name_ts ON system_metrics(metric_name, ts DESC);
