import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './theme/ThemeProvider';
import { AuthProvider, useAuth } from './context/AuthContext';
import { PermissionsProvider } from './contexts/PermissionsContext';
import { PermissionsLoader } from './components/PermissionsLoader';
import { PageTitleProvider } from './contexts/PageTitleContext';
import MainLayout from './layouts/MainLayout';
import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import DashboardList from './pages/DashboardList';
import Connectivity from './pages/Connectivity';
import ChartComposer from './pages/ChartComposer';
import Diagnostic from './pages/Diagnostic';
import Users from './pages/Users';
import Profile from './pages/Profile';

// Protected wrapper that redirects to login if not authenticated
const ProtectedApp = () => {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <PermissionsLoader>
      <MainLayout>
        <Routes>
          <Route path="/" element={<DashboardList />} />
          <Route path="/dashboards" element={<DashboardList />} />
          <Route path="/dashboards/:id" element={<Dashboard />} />
          <Route path="/connectivity" element={<Connectivity />} />
          <Route path="/chart-composer" element={<ChartComposer />} />
          <Route path="/chart-composer/:id" element={<ChartComposer />} />
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
