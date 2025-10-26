# DataForeman Frontend - Quick Start Guide

## ✅ What's Been Created

A complete React + Material UI frontend application in the `/front` folder with:

### 📁 Project Structure
```
/front
  ├── src/
  │   ├── components/         # Reusable UI components
  │   │   └── ExampleCard.jsx
  │   ├── layouts/           # Layout components
  │   │   ├── MainLayout.jsx
  │   │   ├── Sidebar.jsx
  │   │   └── TopBar.jsx
  │   ├── pages/             # Main application pages
  │   │   ├── Dashboard.jsx
  │   │   ├── Config.jsx
  │   │   ├── Connectivity.jsx
  │   │   ├── Historian.jsx
  │   │   ├── Diagnostic.jsx
  │   │   └── Admin.jsx
  │   ├── services/          # API client services
  │   │   └── api.js
  │   ├── theme/             # Theme configuration
  │   │   ├── theme.js
  │   │   └── ThemeProvider.jsx
  │   ├── App.jsx            # Main app component with routing
  │   └── main.jsx           # Entry point
  ├── index.html
  ├── vite.config.js
  ├── package.json
  ├── .gitignore
  ├── .env.example
  └── README.md
```

### 🎨 Features Implemented

#### Layout System
- ✅ **Left Sidebar Navigation** with 6 main sections:
  - Dashboard (home icon)
  - Config (settings icon)
  - Connectivity (cable icon)
  - Historian (timeline icon)
  - Diagnostic (bug icon)
  - Admin (admin icon)

- ✅ **Top App Bar** with:
  - Theme toggle (dark/light mode)
  - Notifications icon (placeholder)
  - User menu (Profile, Settings, Logout)

- ✅ **Responsive Main Content Area**
  - Proper spacing and padding
  - Material UI Card-based layouts

#### Theme System
- ✅ Dark theme (default)
- ✅ Light theme option
- ✅ Theme toggle button in top bar
- ✅ Persistent theme across navigation

#### Pages
- ✅ Dashboard - with example metric cards
- ✅ Config - placeholder
- ✅ Connectivity - placeholder
- ✅ Historian - placeholder
- ✅ Diagnostic - placeholder
- ✅ Admin - placeholder

#### Navigation
- ✅ React Router v6 configured
- ✅ Sidebar navigation integrated
- ✅ Active route highlighting

## 🚀 Running the Application

### Development Mode

**Option 1: Using npm script (recommended)**
```bash
cd front
npm run dev
```

**Option 2: Direct Vite command**
```bash
cd front
npx vite --port 5174
```

The application will be available at:
- **Local**: http://localhost:5174/
- **Network**: http://[your-ip]:5174/

### Running Both Apps Simultaneously

The frontend runs on port **5174**, allowing both to run side-by-side:

**Terminal 2 - Frontend:**
```bash
cd front
npm run dev  # Runs on port 5174
```

### Build for Production

```bash
cd front
npm run build
```

Output will be in `/front/dist/`

### Preview Production Build

```bash
cd front
npm run preview
```

## 🔧 Configuration

### Environment Variables

Create a `.env` file in the `/front` directory (use `.env.example` as template):

```env
VITE_API_BASE_URL=http://localhost:3000
```

### API Integration

The API client is located at `/front/src/services/api.js` and provides methods for:
- GET requests
- POST requests
- PUT requests
- DELETE requests

Example usage:
```javascript
import { apiClient } from '../services/api';

// In your component
const data = await apiClient.get('/api/devices');
```

## 📦 Dependencies

### Main Dependencies
- **React 18.2** - UI library
- **Material UI 5.15** - Component library
- **React Router 6.22** - Routing
- **@emotion/react & @emotion/styled** - Required by MUI

### Dev Dependencies
- **Vite 5.2** - Build tool
- **ESLint 8.57** - Linting

## 🎯 Next Steps

### Immediate Tasks
1. Connect pages to real API endpoints
2. Implement authentication flow
3. Add proper error handling
4. Add loading states

### Component Development
1. Create data visualization components (charts, graphs)
2. Build form components for configuration
3. Add data tables for listing items
4. Create modal dialogs for actions

### Features to Add
1. Real-time data updates (WebSocket integration)
2. User authentication and role-based access
3. Data export functionality
4. Advanced filtering and search
5. Notifications system
6. User preferences persistence

## 🛠️ Development Tips

### Adding a New Page
1. Create component in `/front/src/pages/`
2. Add route in `/front/src/App.jsx`
3. Add navigation item in `/front/src/layouts/Sidebar.jsx`

### Using Material UI Components
```javascript
import { Button, Card, Typography } from '@mui/material';
import { Icon } from '@mui/icons-material';
```

### Accessing Theme
```javascript
import { useTheme } from '../theme/ThemeProvider';

const MyComponent = () => {
  const { mode, toggleTheme } = useTheme();
  // ...
};
```

## 🐛 Troubleshooting

### Port Already in Use
If port 5174 is already in use, you can change it in `vite.config.js`:
```javascript
server: {
  port: 5175, // or any other port
}
```

### Dependencies Issues
```bash
cd front
rm -rf node_modules package-lock.json
npm install
```

## 📚 Resources

- [Material UI Documentation](https://mui.com/)
- [React Router Documentation](https://reactrouter.com/)
- [Vite Documentation](https://vitejs.dev/)
- [React Documentation](https://react.dev/)

---

**Current Status**: ✅ Frontend is scaffolded and running successfully!
