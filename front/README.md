# DataForeman Frontend

A modern React-based frontend for DataForeman built with Material UI.

## Tech Stack

- **React 18** - UI library
- **Material UI (MUI) v5** - Component library
- **Apache ECharts** - Canvas-based charting library for high-performance data visualization
- **React Router v6** - Navigation and routing
- **Vite** - Build tool and dev server
- **Emotion** - CSS-in-JS styling (required by MUI)

## Project Structure

```
/front
  /src
    /components    - Reusable UI components
    /layouts       - App layout (Sidebar, TopBar, MainLayout)
    /pages         - Individual screens (Dashboard, Historian, Config, etc.)
    /theme         - Theme configuration (dark/light mode)
    /services      - API clients and service layer
  index.html       - HTML entry point
  vite.config.js   - Vite configuration
  package.json     - Dependencies and scripts
```

## Features

### Layout
- **Left Sidebar Navigation** - Contains main menu items:
  - Dashboard
  - Config
  - Connectivity
  - Historian
  - Diagnostic
  - Admin
  
- **Top App Bar** - Contains:
  - Theme toggle (dark/light mode)
  - Notifications icon
  - User menu (Profile, Settings, Logout)

- **Main Content Area** - Displays active page content

### Theme
- Default dark theme
- Light theme option
- Theme toggle in the top bar
- Persistent across page navigation

## Development

### Install Dependencies

```bash
cd front
npm install
```

### Run Development Server

The development server runs on port **5174** (different from the old "web" app):

```bash
npm run dev
```

This will start the Vite dev server at `http://localhost:5174`

### Build for Production

```bash
npm run build
```

Build output will be in the `/front/dist` directory.

### Preview Production Build

```bash
npm run preview
```

## API Integration

API services are located in `/src/services/`. The `api.js` file provides a basic client for making HTTP requests. You can configure the API base URL using the `VITE_API_BASE_URL` environment variable.

Example `.env` file:

```
VITE_API_BASE_URL=http://localhost:3000
```

## Next Steps

1. Implement actual functionality in each page
2. Connect to backend API endpoints
3. Add authentication and authorization
4. Implement data visualization components
5. Add proper error handling and loading states
6. Create reusable components in `/src/components`
7. Add tests

## Notes

- The old "web" app remains completely untouched
- Both apps can run in parallel during development
- Only the new "front" app will be used in production once complete
