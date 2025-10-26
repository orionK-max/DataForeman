/**
 * Units of Measure API routes
 * Manages engineering units for tag values
 */

export async function unitsRoutes(app) {

  app.addHook('preHandler', async (req, reply) => {
    const userId = req.user?.sub;
    if (!await app.permissions.can(userId, 'connectivity.units', 'read')) {
      return reply.code(403).send({ error: 'forbidden', feature: 'connectivity.units', operation: 'read' });
    }
  });

  /**
   * GET /units
   * List all units of measure
   * Query params:
   *   - category: filter by category
   *   - include_custom: include user-created units (default: true)
   */
  app.get('/', async (req, reply) => {
    try {
      const { category, include_custom } = req.query;
      
      let whereClause = '';
      const params = [];
      
      if (category) {
        params.push(category);
        whereClause = `WHERE category = $${params.length}`;
      }
      
      if (include_custom === 'false') {
        if (whereClause) {
          whereClause += ' AND is_system = true';
        } else {
          whereClause = 'WHERE is_system = true';
        }
      }
      
      const { rows } = await app.db.query(
        `SELECT id, name, symbol, category, is_system, created_at, updated_at
         FROM units_of_measure
         ${whereClause}
         ORDER BY category ASC, name ASC`
      );
      
      return { units: rows };
    } catch (err) {
      req.log.error({ err }, 'Failed to fetch units of measure');
      return reply.code(500).send({ error: 'failed_to_fetch_units' });
    }
  });

  /**
   * GET /units/categories
   * List all unique categories
   */
  app.get('/categories', async (req, reply) => {
    try {
      const { rows } = await app.db.query(
        `SELECT DISTINCT category
         FROM units_of_measure
         ORDER BY category ASC`
      );
      
      return { categories: rows.map(r => r.category) };
    } catch (err) {
      req.log.error({ err }, 'Failed to fetch unit categories');
      return reply.code(500).send({ error: 'failed_to_fetch_categories' });
    }
  });

  /**
   * POST /units
   * Create a new unit of measure (user-defined, not system)
   */
  app.post('/', async (req, reply) => {
    const userId = req.user?.sub;
    if (!await app.permissions.can(userId, 'connectivity.units', 'create')) {
      return reply.code(403).send({ error: 'forbidden', feature: 'connectivity.units', operation: 'create' });
    }
    
    try {
      const { name, symbol, category } = req.body;
      
      // Validate required fields
      if (!name || typeof name !== 'string' || !name.trim()) {
        return reply.code(400).send({ error: 'name_required' });
      }
      if (!symbol || typeof symbol !== 'string' || !symbol.trim()) {
        return reply.code(400).send({ error: 'symbol_required' });
      }
      if (!category || typeof category !== 'string' || !category.trim()) {
        return reply.code(400).send({ error: 'category_required' });
      }
      
      // Check for duplicate name
      const { rows: existing } = await app.db.query(
        'SELECT id FROM units_of_measure WHERE name = $1',
        [name.trim()]
      );
      
      if (existing.length > 0) {
        return reply.code(409).send({ error: 'unit_name_already_exists' });
      }
      
      // Insert new unit (always user-defined, not system)
      const { rows } = await app.db.query(
        `INSERT INTO units_of_measure (name, symbol, category, is_system)
         VALUES ($1, $2, $3, false)
         RETURNING id, name, symbol, category, is_system, created_at, updated_at`,
        [name.trim(), symbol.trim(), category.trim()]
      );
      
      return { unit: rows[0] };
    } catch (err) {
      req.log.error({ err }, 'Failed to create unit');
      return reply.code(500).send({ error: 'failed_to_create_unit' });
    }
  });

  /**
   * PATCH /units/:id
   * Update a unit of measure (only user-defined units can be updated)
   */
  app.patch('/:id', async (req, reply) => {
    const userId = req.user?.sub;
    if (!await app.permissions.can(userId, 'connectivity.units', 'update')) {
      return reply.code(403).send({ error: 'forbidden', feature: 'connectivity.units', operation: 'update' });
    }
    
    try {
      const unitId = parseInt(req.params.id);
      if (isNaN(unitId)) {
        return reply.code(400).send({ error: 'invalid_unit_id' });
      }
      
      // Check if unit exists and is not a system unit
      const { rows: existing } = await app.db.query(
        'SELECT id, is_system FROM units_of_measure WHERE id = $1',
        [unitId]
      );
      
      if (existing.length === 0) {
        return reply.code(404).send({ error: 'unit_not_found' });
      }
      
      if (existing[0].is_system) {
        return reply.code(403).send({ error: 'cannot_modify_system_unit' });
      }
      
      const { name, symbol, category } = req.body;
      const updates = [];
      const params = [];
      
      if (name !== undefined) {
        if (typeof name !== 'string' || !name.trim()) {
          return reply.code(400).send({ error: 'invalid_name' });
        }
        // Check for duplicate name
        const { rows: duplicates } = await app.db.query(
          'SELECT id FROM units_of_measure WHERE name = $1 AND id != $2',
          [name.trim(), unitId]
        );
        if (duplicates.length > 0) {
          return reply.code(409).send({ error: 'unit_name_already_exists' });
        }
        params.push(name.trim());
        updates.push(`name = $${params.length}`);
      }
      
      if (symbol !== undefined) {
        if (typeof symbol !== 'string' || !symbol.trim()) {
          return reply.code(400).send({ error: 'invalid_symbol' });
        }
        params.push(symbol.trim());
        updates.push(`symbol = $${params.length}`);
      }
      
      if (category !== undefined) {
        if (typeof category !== 'string' || !category.trim()) {
          return reply.code(400).send({ error: 'invalid_category' });
        }
        params.push(category.trim());
        updates.push(`category = $${params.length}`);
      }
      
      if (updates.length === 0) {
        return reply.code(400).send({ error: 'no_updates_provided' });
      }
      
      updates.push(`updated_at = now()`);
      params.push(unitId);
      
      const { rows } = await app.db.query(
        `UPDATE units_of_measure
         SET ${updates.join(', ')}
         WHERE id = $${params.length}
         RETURNING id, name, symbol, category, is_system, created_at, updated_at`,
        params
      );
      
      return { unit: rows[0] };
    } catch (err) {
      req.log.error({ err }, 'Failed to update unit');
      return reply.code(500).send({ error: 'failed_to_update_unit' });
    }
  });

  /**
   * DELETE /units/:id
   * Delete a unit of measure (only user-defined units can be deleted)
   */
  app.delete('/:id', async (req, reply) => {
    const userId = req.user?.sub;
    if (!await app.permissions.can(userId, 'connectivity.units', 'delete')) {
      return reply.code(403).send({ error: 'forbidden', feature: 'connectivity.units', operation: 'delete' });
    }
    
    try{
      const unitId = parseInt(req.params.id);
      if (isNaN(unitId)) {
        return reply.code(400).send({ error: 'invalid_unit_id' });
      }
      
      // Check if unit exists and is not a system unit
      const { rows: existing } = await app.db.query(
        'SELECT id, is_system, name FROM units_of_measure WHERE id = $1',
        [unitId]
      );
      
      if (existing.length === 0) {
        return reply.code(404).send({ error: 'unit_not_found' });
      }
      
      if (existing[0].is_system) {
        return reply.code(403).send({ error: 'cannot_delete_system_unit' });
      }
      
      // Check if unit is in use by any tags
      const { rows: tags } = await app.db.query(
        'SELECT COUNT(*) as count FROM tag_metadata WHERE unit_id = $1',
        [unitId]
      );
      
      if (tags[0].count > 0) {
        return reply.code(409).send({ 
          error: 'unit_in_use',
          message: `Cannot delete unit. It is used by ${tags[0].count} tag(s).`
        });
      }
      
      // Delete the unit
      await app.db.query('DELETE FROM units_of_measure WHERE id = $1', [unitId]);
      
      return { success: true, message: 'Unit deleted successfully' };
    } catch (err) {
      req.log.error({ err }, 'Failed to delete unit');
      return reply.code(500).send({ error: 'failed_to_delete_unit' });
    }
  });
}
