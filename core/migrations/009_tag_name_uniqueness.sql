-- 009_tag_name_uniqueness.sql
-- Add a partial unique index on (connection_id, tag_name) so that
-- publisher templates can safely reference tags by human-readable name.
-- NULL tag_names remain unrestricted (auto-discovered tags without display names).

-- Step 1: Rename any existing duplicates by appending a numeric suffix.
-- The lowest tag_id in each duplicate group keeps its original name.
DO $$
DECLARE
  rec    RECORD;
  dup_id INTEGER;
  suffix INTEGER;
  new_name TEXT;
BEGIN
  FOR rec IN
    SELECT connection_id, tag_name, array_agg(tag_id ORDER BY tag_id) AS ids
    FROM tag_metadata
    WHERE tag_name IS NOT NULL
    GROUP BY connection_id, tag_name
    HAVING COUNT(*) > 1
  LOOP
    -- Start from index 2 (keep ids[1] unchanged)
    FOR i IN 2..array_length(rec.ids, 1) LOOP
      dup_id := rec.ids[i];
      suffix := 1;
      LOOP
        suffix := suffix + 1;
        new_name := rec.tag_name || ' (' || suffix || ')';
        EXIT WHEN NOT EXISTS (
          SELECT 1 FROM tag_metadata
          WHERE connection_id = rec.connection_id
            AND tag_name = new_name
        );
      END LOOP;
      UPDATE tag_metadata SET tag_name = new_name WHERE tag_id = dup_id;
    END LOOP;
  END LOOP;
END $$;

-- Step 2: Add partial unique index. Multiple NULLs are allowed by PostgreSQL.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tag_name_per_connection
  ON tag_metadata (connection_id, tag_name)
  WHERE tag_name IS NOT NULL;

-- Step 3: Update token_key comment to reflect new {{tag_id:N}} format.
COMMENT ON COLUMN mqtt_publisher_tag_refs.token_key
  IS 'Stored as "tag_id:N" matching tokens {{tag_id:N}} in payload_template.';

COMMENT ON COLUMN mqtt_publishers.payload_template
  IS 'Payload body with {{tag_id:N}} tokens substituted at publish time. Display form uses {{ConnectionName|TagName}}.';
