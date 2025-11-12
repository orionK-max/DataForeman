export async function chartComposerRoutes(app) {
  // Chart composer (historian data access)
  app.addHook('preHandler', async (req, reply) => {
    const userId = req.user?.sub;
    if (!await app.permissions.can(userId, 'chart_composer', 'read')) {
      return reply.code(403).send({ error: 'forbidden', feature: 'chart_composer', operation: 'read' });
    }
  });

  // Query raw telemetry points by conn_id, tag_id, time range (from tag_values)
  app.get('/points', async (req, reply) => {
    try {
      req.log.debug({
        from: req.query.from,
        to: req.query.to,
        conn_id: req.query.conn_id,
        tag_id: req.query.tag_id,
        tag_ids: req.query.tag_ids,
        limit: req.query.limit
      }, 'chart_composer.points request');
    } catch {}
    const { conn_id, tag_id, tag_ids, from, to, limit } = req.query || {};
    const requestedLimit = Number(limit || 1000);
    // Allow users to set max points up to 50,000
    // Higher limits may impact performance but are necessary for detailed analysis
    
    // Helper function to fetch tag metadata for write-on-change support
    const fetchTagMetadata = async (tagIds, from, useSystemMetricsTable, tableName) => {
      const tagMetadata = {};
      const lastValuesBefore = {};
      
      if (!tagIds || tagIds.length === 0) {
        return { tagMetadata, lastValuesBefore };
      }
      
      try {
        // Get write-on-change configuration for requested tags
        const metaQuery = `
          SELECT tag_id, on_change_enabled, on_change_heartbeat_ms, 
                 on_change_deadband, on_change_deadband_type
          FROM tag_metadata
          WHERE tag_id = ANY($1::int[])
        `;
        const { rows: metaRows } = await app.db.query(metaQuery, [tagIds]);
        
        for (const row of metaRows) {
          tagMetadata[row.tag_id] = {
            on_change_enabled: row.on_change_enabled || false,
            on_change_heartbeat_ms: row.on_change_heartbeat_ms || 60000,
            on_change_deadband: row.on_change_deadband || 0,
            on_change_deadband_type: row.on_change_deadband_type || 'absolute'
          };
        }
        
        // For write-on-change tags with a time range, fetch last value before range
        if (from && Object.keys(tagMetadata).some(tid => tagMetadata[tid].on_change_enabled)) {
          const writeOnChangeTagIds = Object.keys(tagMetadata)
            .filter(tid => tagMetadata[tid].on_change_enabled)
            .map(tid => Number(tid));
          
          if (writeOnChangeTagIds.length > 0) {
            // Build individual subqueries per tag and UNION them
            const subqueries = writeOnChangeTagIds.map(tagId => 
              useSystemMetricsTable
                ? `(SELECT ${tagId} as tag_id, ts, v_num as v
                    FROM ${tableName}
                    WHERE tag_id = ${tagId} AND ts < $1
                    ORDER BY ts DESC
                    LIMIT 1)`
                : `(SELECT ${tagId} as tag_id, ts, 
                           COALESCE(v_json::text, v_num::text, v_text) as v
                    FROM ${tableName}
                    WHERE tag_id = ${tagId} AND ts < $1
                    ORDER BY ts DESC
                    LIMIT 1)`
            );
            
            const lastValueQuery = subqueries.join(' UNION ALL ');
            const lastValueResult = await (app.tsdb || app.db).query(lastValueQuery, [from]);
            for (const row of lastValueResult.rows) {
              lastValuesBefore[row.tag_id] = {
                ts: row.ts,
                v: row.v
              };
            }
          }
        }
      } catch (err) {
        req.log.warn({ err: err.message }, 'Failed to fetch tag metadata for write-on-change support');
      }
      
      return { tagMetadata, lastValuesBefore };
    };
    
    const params = [];
    const where = [];
    
    // Parse tag IDs first
    let selectedTagIds = [];
    if (tag_ids !== undefined && tag_ids !== '') {
      selectedTagIds = String(tag_ids).split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));
    } else if (tag_id !== undefined && tag_id !== '') { 
      const tid = Number(tag_id); 
      if (Number.isFinite(tid)) selectedTagIds = [tid]; 
    }
    
    // Determine which table to query based on connection_id of tags
    // System tags (is_system_connection=true) are stored in system_metrics table
    // All other tags are in tag_values table
    let useSystemMetricsTable = false;
    let validTagIds = []; // Keep track of which tags actually exist and are not deleted
    
    if (selectedTagIds.length > 0) {
      // First check which tags exist and are not deleted
      const { rows: tagRows } = await app.db.query(
        `SELECT DISTINCT tm.tag_id, c.is_system_connection 
         FROM tag_metadata tm 
         JOIN connections c ON tm.connection_id = c.id 
         WHERE tm.tag_id = ANY($1::int[]) 
           AND coalesce(tm.status,'active') <> 'deleted'`,
        [selectedTagIds]
      );
      
      validTagIds = tagRows.map(r => r.tag_id);
      useSystemMetricsTable = tagRows.length > 0 && tagRows.every(r => r.is_system_connection === true);
    } else if (conn_id) {
      // Check if this connection is a system connection
      const { rows } = await app.db.query(
        `SELECT is_system_connection FROM connections WHERE id = $1`,
        [conn_id]
      );
      useSystemMetricsTable = rows.length > 0 && rows[0].is_system_connection === true;
    }
    
    const tableName = useSystemMetricsTable ? 'system_metrics' : 'tag_values';
    
    // Connection filter (not needed for system_metrics since it's System-only)
    if (!useSystemMetricsTable && conn_id !== undefined && conn_id !== '') {
      params.push(conn_id);
      where.push(`connection_id = $${params.length}`);
    }
    
    // Tag filter: single tag_id or list tag_ids (comma CSV)
    // Only query for valid (non-deleted) tags
    if (validTagIds.length > 0) { 
      params.push(validTagIds); 
      where.push(`tag_id = ANY($${params.length}::int[])`); 
    } else if (selectedTagIds.length > 0) {
      // All requested tags are deleted or don't exist - return empty result with missing tag info
      const missingTagInfo = {};
      selectedTagIds.forEach(tagId => {
        missingTagInfo[tagId] = { reason: 'tag_deleted_or_not_found' };
      });
      
      try {
        req.log.info({ 
          route: 'chart_composer.points.empty_deleted_tags', 
          requested_tag_ids: selectedTagIds,
          missing_tag_info: missingTagInfo
        }, 'All requested tags are deleted/missing');
      } catch {}
      
      return { 
        items: [], 
        limit: requestedLimit, 
        limitHit: false, 
        tagLimitHits: [],
        tag_metadata: {},
        last_values_before: {},
        missing_tags: missingTagInfo
      };
    }
    if (from) { params.push(from); where.push(`ts >= $${params.length}`); }
    if (to) { params.push(to); where.push(`ts <= $${params.length}`); }
    
    try {
      req.log.debug({ requestedLimit, hasFromTo: !!(from && to), from, to, where: where.join(' and '), params }, 'chart_composer.points query setup');
    } catch {}
    
    // Implement new semantics for Limit handling
    const noAggregation = req.query.no_aggregation === 'true'; // Smart Compression OFF when true
    req.log.info({ noAggregation, smartCompressionEnabled: !noAggregation, requestedLimit, query_param: req.query.no_aggregation }, 'Smart Compression mode check');
    
    // Time range provided
    if (from && to) {
      const db = app.tsdb || app.db;
      // Mode A: Smart Compression OFF (and Time Aggregation OFF on UI -> points route)
      if (noAggregation) {
        // OPTIMIZED: Use simple subquery per tag instead of expensive window functions
        const numTags = selectedTagIds.length;
        const perTagQuota = numTags > 0 ? Math.floor(requestedLimit / numTags) : requestedLimit;
        
        // Build individual queries per tag and execute them
        const started = Date.now();
        const allRows = [];
        
        // Execute query for each tag separately - more efficient than window functions
        for (const tagId of selectedTagIds) {
          // Build new WHERE clause and params array for this specific tag
          const tagWhere = [];
          const tagParams = [];
          
          // Add time range conditions if present
          if (from) {
            tagParams.push(from);
            tagWhere.push(`ts >= $${tagParams.length}`);
          }
          if (to) {
            tagParams.push(to);
            tagWhere.push(`ts <= $${tagParams.length}`);
          }
          
          // Add this specific tag_id
          tagParams.push(tagId);
          tagWhere.push(`tag_id = $${tagParams.length}`);
          
          const tagQuery = useSystemMetricsTable
            ? `SELECT tv.ts, tv.tag_id, tv.v_num
               FROM ${tableName} tv
               WHERE ${tagWhere.join(' AND ')}
               ORDER BY tv.ts DESC
               LIMIT ${perTagQuota}`
            : `SELECT tv.ts, tv.connection_id, tv.tag_id, tv.quality as q, tv.v_num, tv.v_text, tv.v_json
               FROM ${tableName} tv
               WHERE ${tagWhere.join(' AND ')}
               ORDER BY tv.ts DESC
               LIMIT ${perTagQuota}`;
          
          const { rows: tagRows } = await db.query(tagQuery, tagParams);
          allRows.push(...tagRows);
        }
        
        // Sort all results by timestamp
        allRows.sort((a, b) => new Date(a.ts) - new Date(b.ts));
        
        // Skip the expensive COUNT query - we can infer from result size
        let tagLimitHits = [];
        let limitHit = allRows.length >= (perTagQuota * numTags * 0.9); // Approximate
        
        const items = allRows.map(r => useSystemMetricsTable 
          ? {
              ts: r.ts,
              conn_id: 'System',
              tag_id: r.tag_id,
              v: r.v_num != null ? Number(r.v_num) : null,
              q: 192, // Good quality
              src_ts: null,
            }
          : {
              ts: r.ts,
              conn_id: r.connection_id,
              tag_id: r.tag_id,
              v: r.v_json != null ? r.v_json : (r.v_num != null ? Number(r.v_num) : (r.v_text != null ? r.v_text : null)),
              q: r.q,
              src_ts: null,
            }
        );
        try {
          req.log.info({ route: 'chart_composer.points.per_tag_limit_no_compression_optimized', conn_id, tag_ids: selectedTagIds, from, to, requestedLimit, rows: items.length, limitHit, tagLimitHits, ms: Date.now() - started }, 'chart_composer points (optimized UNION ALL query)');
        } catch {}
        
        // Fetch tag metadata for write-on-change support
        const { tagMetadata, lastValuesBefore } = await fetchTagMetadata(selectedTagIds, from, useSystemMetricsTable, tableName);
        
        return { 
          items, 
          limit: requestedLimit, 
          limitHit, 
          tagLimitHits, 
          tag_metadata: tagMetadata,
          last_values_before: lastValuesBefore
        };
      }

      // Mode B: Smart Compression ON - Min/Max Envelope Preservation Algorithm
      // Fetch poll rates for selected tags
      try {
        let tagIdsForQuota = selectedTagIds;
        if (!tagIdsForQuota.length && typeof tag_id !== 'undefined' && tag_id !== '') {
          const tid = Number(tag_id); if (Number.isFinite(tid)) tagIdsForQuota = [tid];
        }
        if (!tagIdsForQuota.length) {
          // If no explicit tags provided, fall back to regular behavior (latest across all)
          // to avoid scanning all tags in the system.
          const q = useSystemMetricsTable
            ? `select ts, tag_id, v_num
               from ${tableName}
               where ${where.join(' and ')}
               order by ts desc
               limit ${requestedLimit}`
            : `select ts, connection_id, tag_id, quality as q, v_num, v_text, v_json
               from ${tableName}
               where ${where.join(' and ')}
               order by ts desc
               limit ${requestedLimit}`;
          const { rows } = await db.query(q, params);
          const items = rows.reverse().map(r => useSystemMetricsTable
            ? {
                ts: r.ts,
                conn_id: 'System',
                tag_id: r.tag_id,
                v: r.v_num != null ? Number(r.v_num) : null,
                q: 192,
                src_ts: null,
              }
            : {
                ts: r.ts,
                conn_id: r.connection_id,
                tag_id: r.tag_id,
                v: r.v_json != null ? r.v_json : (r.v_num != null ? Number(r.v_num) : (r.v_text != null ? r.v_text : null)),
                q: r.q,
                src_ts: null,
              }
          );
          
          // Fetch tag metadata for write-on-change support
          const { tagMetadata, lastValuesBefore } = await fetchTagMetadata(selectedTagIds, from, useSystemMetricsTable, tableName);
          
          return { 
            items, 
            limit: requestedLimit, 
            limitHit: rows.length === requestedLimit,
            tag_metadata: tagMetadata,
            last_values_before: lastValuesBefore
          };
        }

        // Query poll rates (works across multiple connections)
        const pgRes = await app.db.query(
          `SELECT tm.tag_id, tm.connection_id, pg.poll_rate_ms
           FROM tag_metadata tm
           JOIN poll_groups pg ON tm.poll_group_id = pg.group_id
           WHERE tm.tag_id = ANY($1::int[])`,
          [tagIdsForQuota]
        );
        const rateMap = new Map(pgRes.rows.map(r => [Number(r.tag_id), Number(r.poll_rate_ms)]));
        
        // Fallback if any tag missing: assume 1000ms
        for (const tid of tagIdsForQuota) { if (!rateMap.has(tid)) rateMap.set(tid, 1000); }
        const fastestMs = Math.min(...Array.from(rateMap.values()).filter(Number.isFinite));
        
        // Compute proportional weights based on poll rates (faster tags get higher weight)
        const weights = tagIdsForQuota.map(tid => {
          const ms = Math.max(1, Number(rateMap.get(tid) || fastestMs));
          return { tag_id: tid, weight: fastestMs / ms };
        });
        
        req.log.info({ weights }, 'Weights calculated');
        
        // Calculate total weight
        const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0);
        
        // Distribute requestedLimit proportionally and ensure total doesn't exceed limit
        const quotas = weights.map(({ tag_id, weight }) => {
          const proportionalQuota = Math.max(1, Math.floor((weight / totalWeight) * requestedLimit));
          return { tag_id, quota: proportionalQuota };
        });
        
        // Verify total and adjust if needed (shouldn't exceed but safety check)
        const totalQuota = quotas.reduce((sum, q) => sum + q.quota, 0);
        req.log.info({ requestedLimit, quotas, totalQuota, numTags: quotas.length }, 'Smart Compression quotas calculated');
        if (totalQuota > requestedLimit) {
          // Scale down proportionally to fit within limit
          const scaleFactor = requestedLimit / totalQuota;
          quotas.forEach(q => {
            q.quota = Math.max(1, Math.floor(q.quota * scaleFactor));
          });
          req.log.info({ scaleFactor, adjustedQuotas: quotas, newTotal: quotas.reduce((sum, q) => sum + q.quota, 0) }, 'Quotas scaled down to fit limit');
        }

        // Build quotas arrays
        const quotaTagIds = quotas.map(q => q.tag_id);
        const quotaValues = quotas.map(q => q.quota);
        
        // Build UNION ALL query for each tag to optimize min/max envelope extraction
        const envelopeQueries = [];
        
        for (let i = 0; i < quotas.length; i++) {
          const { tag_id, quota } = quotas[i];
          const bucketsPerTag = Math.max(Math.floor(quota / 2), 1);
          
          // Build WHERE clause with correct parameter positions for this envelope query
          // Since we're using literal tag_id, we need to rebuild the WHERE with sequential params
          const envelopeWhere = [];
          let paramIdx = 1;
          if (!useSystemMetricsTable && conn_id) {
            envelopeWhere.push(`connection_id = $${paramIdx++}`);
          }
          envelopeWhere.push(`tv.tag_id = ${tag_id}`); // Literal tag_id
          if (from) envelopeWhere.push(`ts >= $${paramIdx++}`);
          if (to) envelopeWhere.push(`ts <= $${paramIdx++}`);
          
          if (useSystemMetricsTable) {
            envelopeQueries.push(`
              (WITH tag_data AS (
                SELECT tv.ts, tv.tag_id, tv.v_num,
                       ntile(${bucketsPerTag}) OVER (ORDER BY tv.ts ASC) as bucket
                FROM ${tableName} tv
                WHERE ${envelopeWhere.join(' AND ')}
                  AND tv.v_num IS NOT NULL
              ),
              min_max AS (
                SELECT DISTINCT ON (bucket, extreme)
                  ts, tag_id, v_num, bucket,
                  CASE WHEN rk = 1 THEN 'min' ELSE 'max' END as extreme
                FROM (
                  SELECT ts, tag_id, v_num, bucket,
                         ROW_NUMBER() OVER (PARTITION BY bucket ORDER BY v_num ASC) as rk
                  FROM tag_data
                  UNION ALL
                  SELECT ts, tag_id, v_num, bucket,
                         ROW_NUMBER() OVER (PARTITION BY bucket ORDER BY v_num DESC) as rk
                  FROM tag_data
                ) sub
                WHERE rk = 1
              )
              SELECT DISTINCT ts, tag_id, v_num
              FROM min_max
              ORDER BY ts ASC
              LIMIT ${quota})
            `);
          } else {
            envelopeQueries.push(`
              (WITH tag_data AS (
                SELECT tv.ts, tv.connection_id, tv.tag_id, tv.quality as q, 
                       tv.v_num, tv.v_text, tv.v_json,
                       ntile(${bucketsPerTag}) OVER (ORDER BY tv.ts ASC) as bucket
                FROM ${tableName} tv
                WHERE ${envelopeWhere.join(' AND ')}
              ),
              sampled AS (
                SELECT DISTINCT ON (bucket, sample_type)
                  ts, connection_id, tag_id, q, v_num, v_text, v_json,
                  CASE WHEN rk <= 2 THEN rk ELSE 0 END as sample_type
                FROM (
                  SELECT *, ROW_NUMBER() OVER (PARTITION BY bucket ORDER BY 
                    CASE WHEN v_num IS NOT NULL THEN v_num ELSE 0 END ASC) as rk
                  FROM tag_data
                  UNION ALL
                  SELECT *, ROW_NUMBER() OVER (PARTITION BY bucket ORDER BY 
                    CASE WHEN v_num IS NOT NULL THEN v_num ELSE 0 END DESC) as rk
                  FROM tag_data
                ) sub
                WHERE rk <= 2
              )
              SELECT DISTINCT ts, connection_id, tag_id, q, v_num, v_text, v_json
              FROM sampled
              ORDER BY ts ASC
              LIMIT ${quota})
            `);
          }
        }
        
        const q = envelopeQueries.join(' UNION ALL ') + ' ORDER BY tag_id ASC, ts ASC';
        
        // Build adjusted params: envelope queries use literal tag_ids, so we only need connection_id, from, to
        // Original params array: [connection_id?, tag_ids_array, from, to]
        const adjustedParams = [];
        if (!useSystemMetricsTable && conn_id) {
          adjustedParams.push(conn_id); // $1
        }
        if (from) adjustedParams.push(from); // $2 or $1 if no conn_id
        if (to) adjustedParams.push(to);     // $3 or $2 if no conn_id
        
        const { rows } = await db.query(q, adjustedParams);
        
        // Count actual points returned per tag
        const pointsPerTag = {};
        rows.forEach(r => {
          pointsPerTag[r.tag_id] = (pointsPerTag[r.tag_id] || 0) + 1;
        });

        // Compute limitHit based on post-optimization (returned) counts per tag
        // Rationale: Only signal a limit hit when a tag's returned points reached its quota,
        // not merely because more raw points existed before optimization.
        let limitHit = false;
        let tagLimitHits = [];
        try {
          const returnedByTag = new Map();
          for (const r of rows) {
            const tid = Number(r.tag_id);
            returnedByTag.set(tid, (returnedByTag.get(tid) || 0) + 1);
          }
          for (const { tag_id: tid, quota } of quotas) {
            const returned = Number(returnedByTag.get(tid) || 0);
            if (returned >= quota) tagLimitHits.push(tid);
          }
          limitHit = tagLimitHits.length > 0;
        } catch {}

        const items = rows.map(r => useSystemMetricsTable
          ? {
              ts: r.ts,
              conn_id: 'System',
              tag_id: r.tag_id,
              v: r.v_num != null ? Number(r.v_num) : null,
              q: 192,
              src_ts: null,
            }
          : {
              ts: r.ts,
              conn_id: r.connection_id,
              tag_id: r.tag_id,
              v: r.v_json != null ? r.v_json : (r.v_num != null ? Number(r.v_num) : (r.v_text != null ? r.v_text : null)),
              q: r.q,
              src_ts: null,
            }
        );
        try {
          req.log.info({ 
            route: 'chart_composer.points.minmax_envelope', 
            conn_id, 
            tag_ids: tagIdsForQuota, 
            from, 
            to, 
            requestedLimit, 
            quotas, 
            rows: items.length, 
            limitHit, 
            tagLimitHits, 
            compressionMethod: 'min_max_envelope',
            extremesPreserved: true,
            ms: Date.now() - started 
          }, 'chart_composer points (min/max envelope - extreme values preserved)');
        } catch {}
        
        // Fetch tag metadata for write-on-change support
        const { tagMetadata, lastValuesBefore } = await fetchTagMetadata(tagIdsForQuota, from, useSystemMetricsTable, tableName);
        
        return { 
          items, 
          limit: requestedLimit, 
          limitHit, 
          tagLimitHits,
          tag_metadata: tagMetadata,
          last_values_before: lastValuesBefore,
          compression: {
            method: 'min_max_envelope',
            extremesPreserved: true,
            quotas: quotas.reduce((acc, q) => { acc[q.tag_id] = q.quota; return acc; }, {})
          }
        };
      } catch (e) {
        req.log.warn({ err: e, errorMessage: e.message, errorStack: e.stack }, 'per-tag quota path failed, falling back');
        // Fallback to latest N across all
        const q = useSystemMetricsTable
          ? `select ts, tag_id, v_num
             from ${tableName}
             where ${where.join(' and ')}
             order by ts desc
             limit ${requestedLimit}`
          : `select ts, connection_id, tag_id, quality as q, v_num, v_text, v_json
             from ${tableName}
             where ${where.join(' and ')}
             order by ts desc
             limit ${requestedLimit}`;
        const started = Date.now();
        const { rows } = await (app.tsdb || app.db).query(q, params);
        const items = rows.reverse().map(r => useSystemMetricsTable
          ? {
              ts: r.ts,
              conn_id: 'System',
              tag_id: r.tag_id,
              v: r.v_num != null ? Number(r.v_num) : null,
              q: 192,
              src_ts: null,
            }
          : {
              ts: r.ts,
              conn_id: r.connection_id,
              tag_id: r.tag_id,
              v: r.v_json != null ? r.v_json : (r.v_num != null ? Number(r.v_num) : (r.v_text != null ? r.v_text : null)),
              q: r.q,
              src_ts: null,
            }
        );
        
        // Fetch tag metadata for write-on-change support
        const { tagMetadata, lastValuesBefore } = await fetchTagMetadata(selectedTagIds, from, useSystemMetricsTable, tableName);
        
        return { 
          items, 
          limit: requestedLimit, 
          limitHit: rows.length === requestedLimit, 
          tagLimitHits: [],
          tag_metadata: tagMetadata,
          last_values_before: lastValuesBefore
        };
      }
    }
    
    // Regular query - use envelope preservation to distribute data over time frame
    // Always use the UI limit, but ensure data is distributed across the requested time range
    let q;
    if (from && to) {
      // For time range queries, use envelope preservation to distribute points across the full time range
      // Strategy: Always include start/end points + systematic sampling in between
      q = useSystemMetricsTable
        ? `WITH numbered_data AS (
             SELECT ts, tag_id, v_num,
                    ROW_NUMBER() OVER (PARTITION BY tag_id ORDER BY ts ASC) as rn,
                    COUNT(*) OVER (PARTITION BY tag_id) as total_count
             FROM ${tableName}
             WHERE ${where.join(' and ')}
           ),
           sampled_data AS (
             SELECT *, 
                    CASE 
                      WHEN total_count <= ${requestedLimit} THEN true
                      WHEN rn <= 5 THEN true
                      WHEN rn > total_count - 5 THEN true
                      ELSE (rn - 6) % GREATEST(1, (total_count - 10) / GREATEST(1, ${requestedLimit} - 10)) = 0
                    END as include_row
             FROM numbered_data
           )
           SELECT ts, tag_id, v_num
           FROM sampled_data
           WHERE include_row = true
           ORDER BY ts ASC
           LIMIT ${requestedLimit}`
        : `WITH numbered_data AS (
             SELECT ts, connection_id, tag_id, quality as q, v_num, v_text, v_json,
                    ROW_NUMBER() OVER (PARTITION BY tag_id ORDER BY ts ASC) as rn,
                    COUNT(*) OVER (PARTITION BY tag_id) as total_count
             FROM ${tableName}
             WHERE ${where.join(' and ')}
           ),
           sampled_data AS (
             SELECT *, 
                    CASE 
                      WHEN total_count <= ${requestedLimit} THEN true
                      WHEN rn <= 5 THEN true
                      WHEN rn > total_count - 5 THEN true
                      ELSE (rn - 6) % GREATEST(1, (total_count - 10) / GREATEST(1, ${requestedLimit} - 10)) = 0
                    END as include_row
             FROM numbered_data
           )
           SELECT ts, connection_id, tag_id, q, v_num, v_text, v_json
           FROM sampled_data
           WHERE include_row = true
           ORDER BY ts ASC
           LIMIT ${requestedLimit}`;
    } else {
      // For no time range (latest data), use DESC order with UI limit
      q = useSystemMetricsTable
        ? `select ts, tag_id, v_num
           from ${tableName}
           where ${where.join(' and ')}
           order by ts desc
           limit ${requestedLimit}`
        : `select ts, connection_id, tag_id, quality as q, v_num, v_text, v_json
           from ${tableName}
           where ${where.join(' and ')}
           order by ts desc
           limit ${requestedLimit}`;
    }
  const db = app.tsdb || app.db;
    const started = Date.now();
    const { rows } = await db.query(q, params);
    
    // Check if we hit the limit (indicates more data available)
    // Only set limitHit if we got exactly the requested limit AND we used envelope preservation sampling
    // which suggests there might be more data available
  let limitHit = false;
    
    try {
      req.log.debug({ rowsLength: rows.length, requestedLimit, rowsEqualsLimit: rows.length === requestedLimit, hasFromTo: !!(from && to), from, to, willCheckLimit: rows.length === requestedLimit && from && to }, 'chart_composer.points limit check');
    } catch {}
    
    if (rows.length === requestedLimit && from && to) {
      // For time range queries with envelope preservation, check if we had to sample
      // We can do this by checking if the query used envelope preservation logic
      const actualCountInRange = await db.query(
        `SELECT COUNT(*) as total FROM ${tableName} WHERE ${where.join(' and ')}`, 
        params
      );
      const totalAvailable = Number(actualCountInRange.rows[0]?.total || 0);
      limitHit = totalAvailable > requestedLimit;
      
      try {
        req.log.debug({ rowsReturned: rows.length, requestedLimit, totalAvailable, useAggregation, limitHit, calculation: useAggregation ? 'skipped (aggregated)' : `${totalAvailable} > ${requestedLimit} = ${limitHit}` }, 'chart_composer.points limit decision');
      } catch {}
    }
    
    try {
      req.log.info({ route: 'chart_composer.points', conn_id, tag_id, tag_ids, from, to, requestedLimit, actualLimit: requestedLimit, rows: rows.length, limitHit, ms: Date.now() - started }, 'chart_composer points query (envelope preserved)');
    } catch {}
    
    // Map precedence: json -> num -> text, and include src_ts as null (not tracked in MVP)
    // For time range queries (ASC order), data is already chronological
    // For no time range (DESC order), reverse to get chronological order
    let items = rows.map(r => useSystemMetricsTable
      ? {
          ts: r.ts,
          conn_id: 'System',
          tag_id: r.tag_id,
          v: r.v_num != null ? Number(r.v_num) : null,
          q: 192,
          src_ts: null,
        }
      : {
          ts: r.ts,
          conn_id: r.connection_id,
          tag_id: r.tag_id,
          v: r.v_json != null ? r.v_json : (r.v_num != null ? Number(r.v_num) : (r.v_text != null ? r.v_text : null)),
          q: r.q,
          src_ts: null,
        }
    );
    
    // If we used DESC order (no time range), reverse to chronological order
    if (!from || !to) {
      items = items.reverse();
    }
    
    // Fetch tag metadata for write-on-change support
    const tagMetadata = {};
    const lastValuesBefore = {};
    
    if (selectedTagIds.length > 0) {
      try {
        // Get write-on-change configuration for requested tags
        const metaQuery = `
          SELECT tag_id, on_change_enabled, on_change_heartbeat_ms, 
                 on_change_deadband, on_change_deadband_type
          FROM tag_metadata
          WHERE tag_id = ANY($1::int[])
        `;
        const { rows: metaRows } = await app.db.query(metaQuery, [selectedTagIds]);
        
        for (const row of metaRows) {
          tagMetadata[row.tag_id] = {
            on_change_enabled: row.on_change_enabled || false,
            on_change_heartbeat_ms: row.on_change_heartbeat_ms || 60000,
            on_change_deadband: row.on_change_deadband || 0,
            on_change_deadband_type: row.on_change_deadband_type || 'absolute'
          };
        }
        
        // For write-on-change tags with a time range, fetch last value before range
        if (from && Object.keys(tagMetadata).some(tid => tagMetadata[tid].on_change_enabled)) {
          const writeOnChangeTagIds = Object.keys(tagMetadata)
            .filter(tid => tagMetadata[tid].on_change_enabled)
            .map(tid => Number(tid));
          
          if (writeOnChangeTagIds.length > 0) {
            const lastValueQuery = useSystemMetricsTable
              ? `SELECT DISTINCT ON (tag_id) tag_id, ts, v_num as v
                 FROM ${tableName}
                 WHERE tag_id = ANY($1::int[]) AND ts < $2
                 ORDER BY tag_id, ts DESC`
              : `SELECT DISTINCT ON (tag_id) tag_id, ts, 
                   COALESCE(v_json, v_num, v_text) as v, quality as q
                 FROM ${tableName}
                 WHERE tag_id = ANY($1::int[]) AND ts < $2
                 ${!useSystemMetricsTable && conn_id ? 'AND connection_id = $3' : ''}
                 ORDER BY tag_id, ts DESC`;
            
            const lastValueParams = useSystemMetricsTable || !conn_id 
              ? [writeOnChangeTagIds, from]
              : [writeOnChangeTagIds, from, conn_id];
            
            const { rows: lastValueRows } = await db.query(lastValueQuery, lastValueParams);
            
            for (const row of lastValueRows) {
              lastValuesBefore[row.tag_id] = {
                ts: row.ts,
                v: useSystemMetricsTable 
                  ? (row.v != null ? Number(row.v) : null)
                  : (typeof row.v === 'object' ? row.v : (row.v != null ? Number(row.v) : null)),
                q: row.q || 192
              };
            }
          }
        }
      } catch (err) {
        req.log.warn({ err: err.message }, 'Failed to fetch tag metadata for write-on-change support');
      }
    }
    
    return { 
      items, 
      limit: requestedLimit, 
      limitHit,
      tag_metadata: tagMetadata,
      last_values_before: lastValuesBefore
    };
  });

  // Aggregated buckets for numeric values only (from tag_values)
  // Query params: conn_id (required), tag_id/tag_ids (optional), from, to, bucket ('1m'|'5m'|'15m'|'1h'), limit (optional)
  app.get('/buckets', async (req, reply) => {
    const { conn_id, tag_id, tag_ids, from, to, bucket, limit } = req.query || {};
    if (!conn_id) return reply.code(400).send({ error: 'missing conn_id' });
    const map = { '1m': '1 minute', '5m': '5 minutes', '15m': '15 minutes', '1h': '1 hour' };
    const interval = map[String(bucket || '1m')] || '1 minute';
    const params = [interval, conn_id];
    const where = ['connection_id = $2', 'v_num is not null'];
    let selectedTagIds = [];
    if (tag_ids !== undefined && tag_ids !== '') {
      selectedTagIds = String(tag_ids).split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));
      if (selectedTagIds.length) { params.push(selectedTagIds); where.push(`tag_id = ANY($${params.length}::int[])`); }
    } else if (tag_id !== undefined && tag_id !== '') { const tid = Number(tag_id); if (Number.isFinite(tid)) { selectedTagIds = [tid]; params.push(tid); where.push(`tag_id = $${params.length}`); } }
    if (from) { params.push(from); where.push(`ts >= $${params.length}`); }
    if (to) { params.push(to); where.push(`ts <= $${params.length}`); }

    const requestedLimit = Number(limit || 0);
    const applyPerTagLimit = requestedLimit > 0 && selectedTagIds.length > 0;

    let q;
    if (!applyPerTagLimit) {
      // Original behavior
      q = `select time_bucket($1::interval, ts) as bucket, tag_id,
                   count(*) as n,
                   avg(v_num) as avg,
                   min(v_num) as min,
                   max(v_num) as max
            from tag_values
            where ${where.join(' and ')}
            group by bucket, tag_id
            order by bucket asc, tag_id asc`;
    } else {
      // Per-tag proportional limits: compute quotas based on poll rates
      try {
        const { rows: rateRows } = await app.db.query(
          `SELECT tm.tag_id, pg.poll_rate_ms
           FROM tag_metadata tm
           JOIN poll_groups pg ON tm.poll_group_id = pg.group_id
           WHERE tm.connection_id = $1 AND tm.tag_id = ANY($2::int[])`,
          [conn_id, selectedTagIds]
        );
        const rateMap = new Map(rateRows.map(r => [Number(r.tag_id), Number(r.poll_rate_ms)]));
        for (const tid of selectedTagIds) { if (!rateMap.has(tid)) rateMap.set(tid, 1000); }
        const fastestMs = Math.min(...Array.from(rateMap.values()).filter(Number.isFinite));
        const quotas = selectedTagIds.map(tid => {
          const ms = Math.max(1, Number(rateMap.get(tid) || fastestMs));
          const qv = Math.max(1, Math.floor(requestedLimit * (fastestMs / ms)));
          return { tag_id: tid, quota: qv };
        });
        const quotaTagIds = quotas.map(q => q.tag_id);
        const quotaValues = quotas.map(q => q.quota);

        // Window over aggregated buckets, keep last N buckets per tag (ORDER BY bucket DESC)
        q = `WITH quotas AS (
               SELECT unnest($${params.length + 1}::int[]) AS tag_id,
                      unnest($${params.length + 2}::int[]) AS quota
             ),
             agg AS (
               SELECT time_bucket($1::interval, ts) as bucket, tag_id,
                      count(*) as n,
                      avg(v_num) as avg,
                      min(v_num) as min,
                      max(v_num) as max,
                      ROW_NUMBER() OVER (PARTITION BY tag_id ORDER BY time_bucket($1::interval, ts) DESC) as rn
               FROM tag_values
               WHERE ${where.join(' and ')}
               GROUP BY bucket, tag_id
             )
             SELECT a.bucket, a.tag_id, a.n, a.avg, a.min, a.max
             FROM agg a
             JOIN quotas qz ON qz.tag_id = a.tag_id
             WHERE a.rn <= qz.quota
             ORDER BY a.bucket ASC, a.tag_id ASC`;

        // Execute immediately with quotas appended to params
        const db = app.tsdb || app.db;
        const started = Date.now();
        const { rows } = await db.query(q, [...params, quotaTagIds, quotaValues]);
        // Compute tagLimitHits: number of aggregated buckets available per tag vs quotas
        let tagLimitHits = [];
        try {
          const countQ = `SELECT tag_id, COUNT(*)::bigint as n
                          FROM (
                            SELECT time_bucket($1::interval, ts) as bucket, tag_id
                            FROM tag_values
                            WHERE ${where.join(' and ')}
                            GROUP BY bucket, tag_id
                          ) as sub
                          GROUP BY tag_id`;
          const { rows: counts } = await db.query(countQ, params);
          const countMap = new Map(counts.map(r => [Number(r.tag_id), Number(r.n)]));
          tagLimitHits = quotas.filter(q => (Number(countMap.get(q.tag_id) || 0)) > q.quota).map(q => q.tag_id);
        } catch {}
        try {
          req.log.info({ route: 'chart_composer.buckets.per_tag_quota', conn_id, tag_ids: selectedTagIds, from, to, bucket: interval, limit: requestedLimit, quotas, rows: rows.length, tagLimitHits, ms: Date.now() - started }, 'chart_composer buckets (per-tag quotas)');
        } catch {}
        
        // Fetch tag metadata for write-on-change support
        const { tagMetadata, lastValuesBefore } = await fetchTagMetadata(selectedTagIds, from, useSystemMetricsTable, tableName);
        
        return { 
          items: rows, 
          bucket: interval, 
          limit: requestedLimit, 
          tagLimitHits,
          tag_metadata: tagMetadata,
          last_values_before: lastValuesBefore
        };
      } catch (e) {
        req.log.warn({ err: e }, 'buckets per-tag quota failed, falling back to original');
        q = `select time_bucket($1::interval, ts) as bucket, tag_id,
                     count(*) as n,
                     avg(v_num) as avg,
                     min(v_num) as min,
                     max(v_num) as max
              from tag_values
              where ${where.join(' and ')}
              group by bucket, tag_id
              order by bucket asc, tag_id asc`;
      }
    }
    const db = app.tsdb || app.db;
    const started = Date.now();
    const { rows } = await db.query(q, params);
    try {
      req.log.info({ route: 'chart_composer.buckets', conn_id, tag_id, tag_ids, from, to, bucket: interval, rows: rows.length, ms: Date.now() - started }, 'chart_composer buckets query');
    } catch {}
    
    // Fetch tag metadata for write-on-change support
    const { tagMetadata, lastValuesBefore } = await fetchTagMetadata(selectedTagIds, from, useSystemMetricsTable, tableName);
    
    return { 
      items: rows, 
      bucket: interval,
      tag_metadata: tagMetadata,
      last_values_before: lastValuesBefore
    };
  });

  // Diagnostic: quick existence check with count and sample rows
  app.get('/check', async (req, reply) => {
    const { conn_id, tag_id, from, to, limit } = req.query || {};
    if (!conn_id) return reply.code(400).send({ error: 'missing conn_id' });
    const tid = Number(tag_id);
    if (!Number.isFinite(tid)) return reply.code(400).send({ error: 'missing tag_id' });
    let fromTs = from ? new Date(from) : new Date(Date.now() - 24 * 60 * 60 * 1000);
    let toTs = to ? new Date(to) : new Date();
    if (isNaN(fromTs.getTime()) || isNaN(toTs.getTime())) return reply.code(400).send({ error: 'bad_time' });
    if (fromTs > toTs) [fromTs, toTs] = [toTs, fromTs];
    const lim = Math.min(Number(limit || 5), 100);
    const db = app.tsdb || app.db;
    try {
      const qCount = `select count(*)::bigint as n, min(ts) as first_ts, max(ts) as last_ts
                      from tag_values where connection_id=$1 and tag_id=$2 and ts between $3 and $4`;
      const { rows: crows } = await db.query(qCount, [conn_id, tid, fromTs.toISOString(), toTs.toISOString()]);
      const count = Number(crows[0]?.n || 0);
      let sample = [];
      if (count > 0) {
        const qSample = `select ts, quality as q, coalesce(v_json::text, v_num::text, v_text) as v
                         from tag_values where connection_id=$1 and tag_id=$2 and ts between $3 and $4
                         order by ts asc limit $5`;
        const { rows: srows } = await db.query(qSample, [conn_id, tid, fromTs.toISOString(), toTs.toISOString(), lim]);
        sample = srows;
      }
      return { conn_id, tag_id: tid, from: fromTs.toISOString(), to: toTs.toISOString(), count, first_ts: crows[0]?.first_ts || null, last_ts: crows[0]?.last_ts || null, sample };
    } catch (e) {
      req.log.warn({ err: e, conn_id, tag_id: tid }, 'chart_composer.check failed');
      return reply.code(500).send({ error: 'check_failed' });
    }
  });

  // Bulk tag metadata lookup by tag_ids (global uniqueness assumed).
  // Query: GET /historian/tag-metadata?tag_ids=1,2,3
  // Optional future: support POST with JSON body for very large lists; current charts capped at 50.
  app.get('/tag-metadata', async (req, reply) => {
    const { tag_ids } = req.query || {};
    if (!tag_ids) return reply.code(400).send({ error: 'no_tag_ids' });
    const raw = String(tag_ids).split(',').map(s => Number(s.trim())).filter(n => Number.isFinite(n));
    const ids = Array.from(new Set(raw));
    if (!ids.length) return reply.code(400).send({ error: 'no_valid_tag_ids' });
    const MAX = 200; // defensive upper bound > current chart tag limit (50)
    if (ids.length > MAX) {
      return reply.code(400).send({ error: 'too_many_tag_ids', requested: ids.length, max: MAX, message: `Split into batches of <=${MAX}` });
    }
    try {
      const q = `SELECT 
                   tm.tag_id,
                   tm.connection_id,
                   tm.tag_name,
                   tm.tag_path,
                   tm.data_type,
                   tm.driver_type,
                   tm.on_change_enabled,
                   tm.on_change_heartbeat_ms,
                   tm.on_change_deadband,
                   tm.on_change_deadband_type,
                   pg.poll_rate_ms,
                   pg.group_id as poll_group_id,
                   pg.name as poll_group_name
                 FROM tag_metadata tm
                 JOIN poll_groups pg ON tm.poll_group_id = pg.group_id
                 WHERE tm.tag_id = ANY($1::int[])
                   AND coalesce(tm.status,'active') <> 'deleted'`;
      const db = app.db;
      const { rows } = await db.query(q, [ids]);
      
      // Track which tags were found vs missing/deleted
      const foundTagIds = new Set(rows.map(r => r.tag_id));
      const missingTagIds = ids.filter(id => !foundTagIds.has(id));
      
      let missingTagInfo = {};
      if (missingTagIds.length > 0) {
        // Check if missing tags are deleted or simply don't exist
        const { rows: deletedRows } = await db.query(
          `SELECT tag_id FROM tag_metadata WHERE tag_id = ANY($1::int[]) AND coalesce(status,'active') = 'deleted'`,
          [missingTagIds]
        );
        const deletedTagIds = new Set(deletedRows.map(r => r.tag_id));
        
        missingTagIds.forEach(tagId => {
          missingTagInfo[tagId] = { 
            reason: deletedTagIds.has(tagId) ? 'tag_deleted' : 'tag_not_found' 
          };
        });
      }
      
      return { 
        items: rows, 
        count: rows.length, 
        requested: ids.length,
        missing_tags: Object.keys(missingTagInfo).length > 0 ? missingTagInfo : undefined
      };
    } catch (e) {
      req.log.error({ err: e }, 'failed to fetch tag-metadata batch');
      return reply.code(500).send({ error: 'metadata_fetch_failed' });
    }
  });
}
