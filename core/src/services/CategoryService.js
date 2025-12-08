/**
 * Category Service
 * 
 * Manages dynamic category and section registration for the node palette.
 * Combines core categories from CategoryDefinitions with categories/sections
 * added by libraries.
 */

import { getAllCategories } from '../nodes/base/CategoryDefinitions.js';

class CategoryServiceClass {
  constructor() {
    this._initialized = false;
  }

  /**
   * Initialize core categories in database
   * Should be called on server startup
   */
  async initializeCoreCategories(db) {
    if (this._initialized) return;

    try {
      const coreCategories = getAllCategories();

      // Insert or update core categories
      for (const [categoryKey, category] of Object.entries(coreCategories)) {
        await db.query(
          `INSERT INTO node_categories (category_key, display_name, icon, description, display_order, is_core)
           VALUES ($1, $2, $3, $4, $5, true)
           ON CONFLICT (category_key) 
           DO UPDATE SET 
             display_name = EXCLUDED.display_name,
             icon = EXCLUDED.icon,
             description = EXCLUDED.description,
             display_order = EXCLUDED.display_order`,
          [categoryKey, category.displayName, category.icon, category.description, category.order]
        );

        // Insert or update sections
        for (const [sectionKey, section] of Object.entries(category.sections || {})) {
          await db.query(
            `INSERT INTO node_sections (category_key, section_key, display_name, description, display_order, is_core)
             VALUES ($1, $2, $3, $4, $5, true)
             ON CONFLICT (category_key, section_key) 
             DO UPDATE SET 
               display_name = EXCLUDED.display_name,
               description = EXCLUDED.description,
               display_order = EXCLUDED.display_order`,
            [categoryKey, sectionKey, section.displayName, section.description, section.order]
          );
        }
      }

      this._initialized = true;
      console.log('[CategoryService] Initialized core categories and sections');
    } catch (error) {
      console.error('[CategoryService] Failed to initialize core categories:', error);
      throw error;
    }
  }

  /**
   * Register a category/section from a library node
   * Creates category and section if they don't exist
   */
  async registerCategorySection(db, categoryKey, sectionKey, nodeMetadata) {
    try {
      // Ensure category exists
      await db.query(
        `INSERT INTO node_categories (category_key, display_name, icon, description, display_order, is_core)
         VALUES ($1, $2, $3, $4, 99, false)
         ON CONFLICT (category_key) DO NOTHING`,
        [
          categoryKey,
          categoryKey.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          nodeMetadata.icon || '📦',
          `Library category: ${categoryKey}`
        ]
      );

      // Ensure section exists
      await db.query(
        `INSERT INTO node_sections (category_key, section_key, display_name, description, display_order, is_core)
         VALUES ($1, $2, $3, $4, 99, false)
         ON CONFLICT (category_key, section_key) DO NOTHING`,
        [
          categoryKey,
          sectionKey,
          sectionKey.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          `Library section: ${sectionKey}`
        ]
      );
    } catch (error) {
      console.error('[CategoryService] Failed to register category/section:', error);
      // Don't throw - this is not critical
    }
  }

  /**
   * Get all categories with their sections
   * Returns merged core + library categories
   */
  async getAllCategories(db) {
    try {
      const categoriesResult = await db.query(
        `SELECT category_key, display_name, icon, description, display_order, is_core
         FROM node_categories
         ORDER BY display_order, display_name`
      );

      const sectionsResult = await db.query(
        `SELECT category_key, section_key, display_name, description, display_order, is_core
         FROM node_sections
         ORDER BY category_key, display_order, display_name`
      );

      // Build category structure
      const categories = {};
      
      for (const cat of categoriesResult.rows) {
        categories[cat.category_key] = {
          key: cat.category_key,
          displayName: cat.display_name,
          icon: cat.icon,
          description: cat.description,
          order: cat.display_order,
          isCore: cat.is_core,
          sections: {}
        };
      }

      // Add sections
      for (const sec of sectionsResult.rows) {
        if (categories[sec.category_key]) {
          categories[sec.category_key].sections[sec.section_key] = {
            key: sec.section_key,
            displayName: sec.display_name,
            description: sec.description,
            order: sec.display_order,
            isCore: sec.is_core
          };
        }
      }

      return categories;
    } catch (error) {
      console.error('[CategoryService] Failed to get categories:', error);
      // Fallback to core categories
      return getAllCategories();
    }
  }

  /**
   * Check if a category/section combination is valid
   */
  async isValidCategorySection(db, categoryKey, sectionKey) {
    try {
      const result = await db.query(
        `SELECT 1 FROM node_sections 
         WHERE category_key = $1 AND section_key = $2`,
        [categoryKey, sectionKey]
      );
      return result.rows.length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Clean up library categories/sections that have no nodes
   * Called when libraries are uninstalled
   */
  async cleanupUnusedLibraryCategories(db, NodeRegistry) {
    try {
      // Get all library (non-core) sections
      const sectionsResult = await db.query(
        `SELECT category_key, section_key FROM node_sections WHERE is_core = false`
      );

      for (const sec of sectionsResult.rows) {
        // Check if any nodes use this section
        const hasNodes = NodeRegistry.getAll().some(nodeType => {
          const desc = NodeRegistry.getDescription(nodeType);
          return desc && desc.category === sec.category_key && desc.section === sec.section_key;
        });

        if (!hasNodes) {
          // Delete unused section
          await db.query(
            `DELETE FROM node_sections 
             WHERE category_key = $1 AND section_key = $2 AND is_core = false`,
            [sec.category_key, sec.section_key]
          );
          console.log(`[CategoryService] Removed unused section: ${sec.category_key}:${sec.section_key}`);
        }
      }

      // Clean up empty categories
      await db.query(
        `DELETE FROM node_categories 
         WHERE is_core = false 
         AND NOT EXISTS (
           SELECT 1 FROM node_sections 
           WHERE node_sections.category_key = node_categories.category_key
         )`
      );
    } catch (error) {
      console.error('[CategoryService] Failed to cleanup categories:', error);
    }
  }
}

export const CategoryService = new CategoryServiceClass();
