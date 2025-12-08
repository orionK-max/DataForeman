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
   * Get current cached values for all nodes in a flow.
   * Returns tag values for tag nodes and runtime outputs for all other nodes.
   * 
   * Returns: { nodeId: { value, quality, timestamp, ...runtime } }
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

    const liveData = {};

    // Get runtime outputs for all nodes from RuntimeStateStore
    // This includes automatic I/O capture for all node types
    if (app.runtimeState) {
      const nodeOutputs = app.runtimeState.getNodeOutputs(flowId);
      for (const [nodeId, runtimeData] of nodeOutputs.entries()) {
        liveData[nodeId] = runtimeData;
      }
    }

    return reply.send(liveData);
  });
}