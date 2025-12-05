import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './theme/ThemeProvider';
import { AuthProvider, useAuth } from './context/AuthContext';
import { PermissionsProvider } from './contexts/PermissionsContext';
import { PermissionsLoader } from './components/PermissionsLoader';
import { PageTitleProvider } from './contexts/PageTitleContext';
import { fetchBackendNodeMetadata, fetchCategories } from './constants/nodeTypes';
import MainLayout from './layouts/MainLayout';
import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import DashboardList from './pages/DashboardList';
import Connectivity from './pages/Connectivity';
import ChartComposer from './pages/ChartComposer';
import ChartBrowser from './pages/ChartBrowser';
import Diagnostic from './pages/Diagnostic';
import Users from './pages/Users';
import Profile from './pages/Profile';
import FlowBrowser from './pages/FlowBrowser';
import FlowEditor from './pages/FlowEditor';

// Protected wrapper that redirects to login if not authenticated
const ProtectedApp = () => {
  const { isAuthenticated } = useAuth();
  const [nodeMetadataLoaded, setNodeMetadataLoaded] = React.useState(false);

  // Fetch node metadata from backend when app initializes
  useEffect(() => {
    if (isAuthenticated) {
      setNodeMetadataLoaded(false);
      Promise.all([
        fetchCategories(),
        fetchBackendNodeMetadata()
      ])
        .then(() => {
          setNodeMetadataLoaded(true);
        })
        .catch(err => {
          console.error('Failed to load node metadata from backend:', err);
          // Still set to true so app can function (with limited node info)
          setNodeMetadataLoaded(true);
        });
    }
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  // Show loading screen while metadata loads
  if (!nodeMetadataLoaded) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div>Loading node metadata...</div>
      </div>
    );
  }

  return (
    <PermissionsLoader>
      <MainLayout>
        <Routes>
          <Route path="/" element={<DashboardList />} />
          <Route path="/dashboards" element={<DashboardList />} />
          <Route path="/dashboards/:id" element={<Dashboard />} />
          <Route path="/connectivity" element={<Connectivity />} />
          <Route path="/flows" element={<FlowBrowser />} />
          <Route path="/flows/:id" element={<FlowEditor />} />
          <Route path="/charts" element={<ChartBrowser />} />
          <Route path="/charts/:id" element={<ChartComposer />} />
          <Route path="/diagnostic" element={<Diagnostic />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/admin/users" element={<Users />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </MainLayout>
    </PermissionsLoader>
  );
};

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <PermissionsProvider>
          <PageTitleProvider>
            <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
              <ProtectedApp />
            </Router>
          </PageTitleProvider>
        </PermissionsProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
