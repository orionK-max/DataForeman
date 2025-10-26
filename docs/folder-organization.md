# Folder Organization

DataForeman provides a comprehensive folder system for organizing your dashboards and charts. This guide explains how to use folders to keep your workspace organized.

## Overview

The folder system allows you to:
- Create hierarchical folder structures with unlimited nesting
- Organize dashboards and charts separately
- Move items between folders
- Filter views by folder
- Search and manage your organized content

**Note:** Dashboard folders and chart folders are completely separate - dashboards can only be organized in dashboard folders, and charts in chart folders.

## Managing Folders

### Creating a Folder

**In Dashboard List:**
1. Navigate to the Dashboards page
2. Click the **"New Folder"** button at the bottom of the left sidebar
3. Enter a folder name (required)
4. Optionally add a description
5. Optionally select a parent folder to create a nested folder
6. Click **"Create"**

**In Chart Composer:**
1. Open the Saved Charts panel in Chart Composer
2. Click the **[+]** button next to the folder dropdown
3. Follow the same steps as above

### Editing a Folder

**For Dashboard Folders:**
1. In the Dashboard List, hover over the folder in the left sidebar
2. Click the **edit icon** (pencil)
3. Modify the name, description, or parent folder
4. Click **"Save"**

**For Chart Folders:**
The Chart Composer's dropdown interface doesn't currently have edit buttons for space reasons. You can:
- Use the API directly to edit chart folders
- Create a new folder with the desired name and move charts to it
- Future enhancement: A dedicated folder management page will be added

**Note:** You cannot move a folder to be a child of itself or its own descendants.

### Deleting a Folder

**For Dashboard Folders:**
1. In the Dashboard List, hover over the folder in the left sidebar
2. Click the **delete icon** (trash can)
3. Confirm the deletion

**For Chart Folders:**
The Chart Composer's dropdown interface doesn't currently have delete buttons for space reasons. You can:
- Use the API directly to delete chart folders (must be empty)
- Future enhancement: A dedicated folder management page will be added

**Important:** Folders must be empty before deletion. Move or delete all items and subfolders first.

## Organizing Items

### Moving Dashboards to Folders

**Method 1: Move Button**
1. In the Dashboard List, locate the dashboard card
2. Click the **"Move to folder"** button
3. Select the target folder from the menu
4. The dashboard moves immediately

**Method 2: From Folder View**
1. Select a folder from the left sidebar
2. Any dashboards you create while viewing that folder will be automatically placed there

### Moving Charts to Folders

1. In the Saved Charts panel, locate your chart
2. Click the **[⋮]** menu button
3. Select **"Move to Folder"**
4. Choose the target folder from the submenu

### Moving to Root (No Folder)

To remove an item from all folders:
1. Click the move button/menu
2. Select **"Root (No Folder)"** or **"No Folder"**
3. The item moves to the root level

## Navigating Folders

### Dashboard Folders (Tree View)

The Dashboard List shows a collapsible folder tree in the left sidebar:

```
All Items                    ← Shows all dashboards
├─ Production               ← Top-level folder
│  ├─ Line 1                ← Nested subfolder
│  └─ Line 2                ← Nested subfolder
├─ Development              ← Top-level folder
└─ Archived                 ← Top-level folder
```

**Navigation:**
- Click **"All Items"** to see all dashboards regardless of folder
- Click any folder to see only dashboards in that folder
- Click the arrow icon to expand/collapse nested folders
- The selected folder is highlighted

### Chart Folders (Dropdown View)

The Saved Charts panel uses a dropdown selector:

```
All Charts                   ← Shows all charts
No Folder                    ← Shows charts not in any folder
├─ Sensors                   ← Top-level folder
│  ├─ Temperature            ← Nested subfolder (indented)
│  └─ Pressure               ← Nested subfolder (indented)
└─ Production                ← Top-level folder
```

**Navigation:**
- Select **"All Charts"** to see everything
- Select **"No Folder"** to see charts without a folder
- Select any folder to filter to that folder only

## Creating Nested Folders

To create a subfolder:

**Method 1: From Tree View**
1. Hover over the parent folder
2. Click the **"New subfolder"** icon
3. The folder dialog opens with the parent already selected

**Method 2: From Folder Dialog**
1. Click **"New Folder"**
2. In the dialog, select the parent folder from the dropdown
3. Create your new subfolder

You can nest folders as deeply as needed.

## Folder Features

### Folder Tree Actions

When hovering over a folder in the tree, you'll see action buttons:
- **New subfolder** - Create a child folder
- **Edit** - Modify folder properties
- **Delete** - Remove the folder (if empty)

### Filtering by Folder

When you select a folder:
- **Dashboards**: Only dashboards in that folder are displayed
- **Charts**: Only charts in that folder are shown
- **All Items/All Charts**: Shows everything regardless of folder
- **No Folder/Root**: Shows only items not assigned to any folder

### Empty States

Different messages appear depending on the view:
- When viewing "All Items" with no dashboards: "No dashboards yet"
- When viewing a folder with no dashboards: "No dashboards in this folder"
- Similar messages for charts

## Best Practices

### Organizing Dashboards
- Create folders by department, project, or environment (Production, Development, Test)
- Use nested folders for complex organizations (e.g., Production → Line 1 → Shift A)
- Keep frequently accessed dashboards in top-level folders
- Archive old dashboards in an "Archived" folder

### Organizing Charts
- Group by data source or connection (OPCUA, S7, EtherNet/IP)
- Create folders by measurement type (Temperature, Pressure, Flow)
- Use nested folders for complex sensor hierarchies
- Keep template charts in a "Templates" folder

### Naming Conventions
- Use clear, descriptive folder names
- Consider using prefixes for sorting (e.g., "01 - Production", "02 - Development")
- Add descriptions to folders to explain their purpose
- Keep names short enough to display well in the UI

## Technical Details

### Database Structure

Folders are stored in separate tables:
- `dashboard_folders` - For dashboard organization
- `chart_folders` - For chart organization

Each folder has:
- Unique ID (UUID)
- Name (up to 255 characters)
- Optional description
- Reference to parent folder (for nesting)
- Sort order (for custom arrangement)
- Timestamps (created_at, updated_at)

Items reference folders through their `options` JSONB column:
```json
{
  "folder_id": "uuid-of-folder",
  "sort_order": 0
}
```

### API Endpoints

The folder system uses RESTful endpoints:

**Folder Management:**
- `GET /api/dashboard/folders` - List dashboard folders
- `GET /api/dashboard/folders/tree` - Get folder tree structure
- `POST /api/dashboard/folders` - Create folder
- `PUT /api/dashboard/folders/:id` - Update folder
- `DELETE /api/dashboard/folders/:id` - Delete folder

**Item Organization:**
- `PUT /api/dashboard/items/:id/move` - Move dashboard to folder
- `PUT /api/chart/items/:id/move` - Move chart to folder

Replace `dashboard` with `chart` for chart folder endpoints.

### Validation Rules

The system enforces these rules:
- Folder names are required (cannot be empty)
- Folders cannot be their own parent
- Folders cannot be moved under their own descendants (prevents circular references)
- Folders must be empty before deletion (no items or subfolders)
- Users can only access their own folders
- Folder type (dashboard/chart) cannot be mixed

## Troubleshooting

### Cannot Delete Folder
**Problem:** Error when trying to delete a folder.

**Solution:** The folder must be empty. Either:
- Move all items out of the folder
- Delete all items in the folder
- Move or delete all subfolders

### Folder Not Showing Items
**Problem:** Items don't appear when viewing a folder.

**Solution:** 
- Check that you've selected the correct folder
- Verify items were successfully moved (check in "All Items" view)
- Refresh the page if the view hasn't updated

### Cannot Move Folder
**Problem:** Error when trying to change a folder's parent.

**Solution:** You cannot move a folder to be a child of itself or its own descendants. Choose a different parent folder.

### Items Disappeared After Moving
**Problem:** Items no longer visible after moving to folder.

**Solution:** 
- Items are still there, just filtered by folder view
- Click "All Items" or "All Charts" to see everything
- Navigate to the target folder to see moved items

## Keyboard Shortcuts

While using the folder system:
- **Enter** in folder dialog - Save folder
- **Escape** in folder dialog - Cancel/close
- Click outside dialog - Cancel/close

## Related Features

- **Dashboard Management**: Create and organize dashboards
- **Chart Composer**: Create and save charts with folder organization
- **Search**: Search within folders (future enhancement)
- **Sharing**: Share entire folders with other users (future enhancement)
