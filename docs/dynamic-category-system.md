# Dynamic Category System

## Overview

DataForeman's Flow Studio uses a **dynamic category system** that allows libraries to extend the node palette without modifying core code. Categories and sections are stored in the database and automatically managed based on installed libraries.

## Architecture

### Core Components

1. **CategoryDefinitions.js** (`core/src/nodes/base/CategoryDefinitions.js`)
   - Defines static core categories (TAG_OPERATIONS, LOGIC_MATH, etc.)
   - Source of truth for core palette organization
   - Not modified by libraries

2. **CategoryService.js** (`core/src/services/CategoryService.js`)
   - Manages dynamic category/section lifecycle
   - Initializes core categories on startup
   - Registers library categories when nodes load
   - Cleans up empty categories when libraries unload

3. **Database Tables**
   - `node_categories`: Stores all categories (core + library)
   - `node_sections`: Stores sections within categories
   - Both tables have `is_core` boolean flag to distinguish origin

### How It Works

```
┌─────────────────────────────────────────────────────────────┐
│ 1. System Startup                                           │
│    - CategoryService reads CategoryDefinitions.js           │
│    - Populates node_categories with is_core=true            │
│    - Populates node_sections with is_core=true              │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. Library Installation                                     │
│    - LibraryManager loads library nodes                     │
│    - For each node, reads category and section              │
│    - CategoryService.registerCategorySection()              │
│      • Creates category if doesn't exist (is_core=false)    │
│      • Creates section if doesn't exist (is_core=false)     │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. API Response                                             │
│    - GET /api/flows/categories queries database             │
│    - Returns merged core + library categories               │
│    - Frontend displays all categories in node browser       │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. Library Uninstallation                                   │
│    - LibraryManager unregisters library nodes               │
│    - CategoryService.cleanupUnusedLibraryCategories()       │
│      • Finds sections with no remaining nodes               │
│      • Deletes empty library sections (is_core=false)       │
│      • Deletes empty library categories (is_core=false)     │
│      • Core categories/sections never deleted               │
└─────────────────────────────────────────────────────────────┘
```

## Core Categories

These categories are always present (defined in CategoryDefinitions.js):

| Category | Key | Icon | Core Sections |
|----------|-----|------|---------------|
| Tag Operations | `TAG_OPERATIONS` | 📊 | BASIC, ADVANCED |
| Logic & Math | `LOGIC_MATH` | 🔢 | MATH, COMPARISON, CONTROL, ADVANCED |
| Communication | `COMMUNICATION` | 📡 | BASIC, DATABASE |
| Data Transform | `DATA_TRANSFORM` | 🔄 | BASIC |
| Utility | `UTILITY` | 🛠️ | BASIC |
| Other | `OTHER` | 📦 | BASIC |

## Library Categories

Libraries can extend the palette in two ways:

### 1. Add to Existing Categories

Add nodes to core categories with new sections:

```javascript
// In your node class
description = {
  category: 'LOGIC_MATH',      // Use core category
  section: 'INDUSTRIAL_LOGIC',  // New custom section
  // ...
}
```

Result: **INDUSTRIAL_LOGIC** section appears under **Logic & Math** category

### 2. Create New Categories

Create entirely new categories:

```javascript
// In your node class
description = {
  category: 'ROBOTICS',         // New category
  section: 'MOTION_CONTROL',    // New section
  icon: '🤖',
  // ...
}
```

Result: New **ROBOTICS** category appears with **MOTION_CONTROL** section

## Benefits

1. **No Core Modification**: Libraries don't touch CategoryDefinitions.js
2. **Dynamic Appearance**: Categories appear only when library is installed
3. **Automatic Cleanup**: Empty categories disappear when library is uninstalled
4. **Hot-Reload**: All changes happen without system restart
5. **Namespace Isolation**: Core vs library categories clearly marked in database

## API Endpoints

### Get Categories
```
GET /api/flows/categories
```

Returns merged core + library categories:
```json
{
  "categories": {
    "TAG_OPERATIONS": {
      "displayName": "Tag Operations",
      "icon": "📊",
      "sections": ["BASIC", "ADVANCED"]
    },
    "ROBOTICS": {
      "displayName": "Robotics",
      "icon": "🤖",
      "sections": ["MOTION_CONTROL"],
      "isCore": false
    }
  }
}
```

## Database Schema

### node_categories
```sql
CREATE TABLE node_categories (
  category_key text PRIMARY KEY,
  display_name text NOT NULL,
  icon text NOT NULL DEFAULT '📦',
  description text,
  display_order integer NOT NULL DEFAULT 99,
  is_core boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz DEFAULT CURRENT_TIMESTAMP
);
```

### node_sections
```sql
CREATE TABLE node_sections (
  category_key text NOT NULL,
  section_key text NOT NULL,
  display_name text NOT NULL,
  description text,
  display_order integer NOT NULL DEFAULT 99,
  is_core boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (category_key, section_key),
  FOREIGN KEY (category_key) REFERENCES node_categories ON DELETE CASCADE
);
```

## Implementation Details

### CategoryService Methods

- **`initializeCoreCategories(db)`**: Populates DB from CategoryDefinitions on startup (idempotent)
- **`registerCategorySection(db, categoryKey, sectionKey, nodeMetadata)`**: Creates category/section if doesn't exist
- **`getAllCategories(db)`**: Returns merged core + library categories
- **`cleanupUnusedLibraryCategories(db, NodeRegistry)`**: Removes empty library categories/sections

### LibraryManager Integration

```javascript
// When loading a library
async loadLibrary(libraryPath, NodeRegistry, options = {}) {
  // ... register nodes ...
  
  if (options.db) {
    const libraryNodes = NodeRegistry.getNodesByLibrary(manifest.libraryId);
    for (const node of libraryNodes) {
      const description = NodeRegistry.getDescription(node.type);
      if (description && description.category && description.section) {
        await CategoryService.registerCategorySection(
          options.db,
          description.category,
          description.section,
          description
        );
      }
    }
  }
}

// When unloading a library
async unloadLibrary(libraryId, NodeRegistry, options = {}) {
  NodeRegistry.unregisterLibraryNodes(libraryId);
  
  if (options.db) {
    await CategoryService.cleanupUnusedLibraryCategories(options.db, NodeRegistry);
  }
}
```

## Best Practices

### For Library Developers

1. **Choose appropriate categories**: Use core categories when your nodes fit existing groupings
2. **Create custom categories sparingly**: Only for distinctly different functionality
3. **Use meaningful section names**: Make it clear what the section contains
4. **Provide icons**: Custom categories should have relevant emoji icons
5. **Test cleanup**: Verify your categories disappear cleanly on uninstall

### For Core Developers

1. **Never modify CategoryDefinitions.js for libraries**: Use dynamic system
2. **Core categories are stable**: Only add core categories for universal functionality
3. **Trust the cleanup**: CategoryService handles lifecycle automatically
4. **Database is source of truth**: API serves from DB, not static definitions

## Troubleshooting

### Categories not appearing
- Check node has both `category` and `section` in description
- Verify LibraryManager passes `{ db }` option to loadLibrary
- Check CategoryService logs for registration confirmation

### Categories not disappearing
- Verify cleanupUnusedLibraryCategories is called on unload
- Check if nodes from other libraries use the same category
- Core categories (is_core=true) are never deleted

### Duplicate sections
- Multiple libraries can add to the same category/section
- ON CONFLICT DO NOTHING prevents duplicates
- Section appears as long as any library uses it

## Related Documentation

- [Library System](./library-system.md) - Complete library development guide
- [Flow Node Schema](./flow-node-schema.md) - Node description schema including category/section fields
- CategoryDefinitions.js - Core category definitions
- CategoryService.js - Dynamic category management implementation
