/**
 * Flow Live Data Routes
 * 
 * API endpoints for fetching live cached tag values for flow nodes.
 * Used by the Flow Editor to display current tag values on nodes.
 */

export default async function flowLiveDataRoutes(app, opts) {
  /**
   * Permission check helper
   */
  async function checkPermission(userId, operation, reply) {
    if (!userId) {
      app.log.warn({ userId }, 'No userId provided for live-data permission check');
      return reply.code(401).send({ error: 'unauthorized' });
    }
    const ok = await app.permissions.can(userId, 'flows', operation);
    app.log.info({ userId, operation, permitted: ok }, 'live-data permission check');
    if (!ok) {
      return reply.code(403).send({ error: 'forbidden' });
    }
    return true;
  }

  /**
   * GET /api/flows/:flowId/live-data
   * 
   * Get current cached values for all tag nodes in a flow.
   * Reads from tag_values table (memory layer) - same as flow execution.
   * 
   * Returns: { nodeId: { value, quality, timestamp } }
   */
  app.get('/api/flows/:flowId/live-data', async (req, reply) => {
    const userId = req.user?.sub;
    if (!(await checkPermission(userId, 'read', reply))) return;
    const { flowId } = req.params;

    // Get flow with definition
    const flowResult = await app.db.query(
      'SELECT definition FROM flows WHERE id = $1',
      [flowId]
    );

    if (flowResult.rows.length === 0) {
      return reply.code(404).send({ error: 'Flow not found' });
    }

    const definition = flowResult.rows[0].definition;
    if (!definition || !definition.nodes) {
      return reply.send({});
    }

    // Find all tag-input and tag-output nodes
    const tagNodes = definition.nodes.filter(n => 
      n.type === 'tag-input' || n.type === 'tag-output'
    );

    if (tagNodes.length === 0) {
      return reply.send({});
    }

    const liveData = {};

    // Fetch current cached values for each tag node
    for (const node of tagNodes) {
      const tagId = node.data?.tagId;
      if (!tagId) continue;

      try {
        // Try in-memory cache first (zero latency)
        if (app.runtimeState) {
          const cached = app.runtimeState.getTagValue(tagId);
          if (cached) {
            liveData[node.id] = {
              value: cached.value,
              quality: cached.quality,
              timestamp: cached.timestamp,
              tagPath: cached.tagPath,
              fromCache: true
            };
            continue; // Cache hit, skip DB query
          }
        }

        // Fallback to database if cache miss
        // Get tag metadata
        const metaResult = await app.db.query(
          'SELECT tag_path, connection_id, driver_type FROM tag_metadata WHERE tag_id = $1',
          [tagId]
        );

        if (metaResult.rows.length === 0) continue;

        const { tag_path: tagPath, connection_id: connectionId, driver_type: driverType } = metaResult.rows[0];

        let valueResult;
        
        // System tags use system_metrics table
        if (driverType === 'SYSTEM') {
          valueResult = await app.tsdb.query(
            'SELECT ts, v_num FROM system_metrics WHERE tag_id = $1 ORDER BY ts DESC LIMIT 1',
            [tagId]
          );

          if (valueResult.rows.length > 0) {
            const row = valueResult.rows[0];
            liveData[node.id] = {
              value: row.v_num != null ? Number(row.v_num) : null,
              quality: 0, // System metrics always good quality
              timestamp: row.ts,
              tagPath
            };
          }
        } else {
          // Regular tags use tag_values table (memory layer)
          valueResult = await app.tsdb.query(
            `SELECT ts, quality, v_num, v_text, v_json
             FROM tag_values
             WHERE connection_id = $1 AND tag_id = $2
             ORDER BY ts DESC
             LIMIT 1`,
            [connectionId, tagId]
          );

          if (valueResult.rows.length > 0) {
            const row = valueResult.rows[0];
            // Extract value with precedence: v_json -> v_num -> v_text
            const value = row.v_json != null ? row.v_json :
                         (row.v_num != null ? Number(row.v_num) :
                         (row.v_text != null ? row.v_text : null));
            
            liveData[node.id] = {
              value,
              quality: row.quality != null ? row.quality : 192,
              timestamp: row.ts,
              tagPath
            };
          }
        }
      } catch (error) {
        app.log.warn({ nodeId: node.id, tagId, error: error.message }, 'Failed to fetch live data for node');
      }
    }

    return reply.send(liveData);
  });
}
