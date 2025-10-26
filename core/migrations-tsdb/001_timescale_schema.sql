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

-- Convert to hypertable
SELECT create_hypertable('tag_values', 'ts', 
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

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
SELECT create_hypertable('system_metrics', 'ts',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

CREATE INDEX IF NOT EXISTS idx_system_metrics_name_ts ON system_metrics(metric_name, ts DESC);
