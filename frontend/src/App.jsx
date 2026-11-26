import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import DashboardLayout from './pages/DashboardLayout';
import NewCheck from './pages/NewCheck';
import LiveMonitor from './pages/LiveMonitor';
import EditProfile from './pages/EditProfile';
import ActiveSchedules from './pages/ActiveSchedules';
import DownAlerts from './pages/DownAlerts';
import History from './pages/History';
import AlertConfig from './pages/AlertConfig';
import ProtectedRoute from './components/ProtectedRoute';
import { AuthContextProvider } from './context/AuthContext';

export default function App() {
  return (
    <AuthContextProvider>
      <BrowserRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Navigate to="/dashboard" replace />
              </ProtectedRoute>
            }
          />
          <Route
            path="dashboard"
            element={
              <ProtectedRoute>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<NewCheck />} />
            <Route path="live-monitor" element={<LiveMonitor />} />
            <Route path="edit-profile" element={<EditProfile />} />
            <Route path="active-schedules" element={<ActiveSchedules />} />
            <Route path="down-alerts-logs" element={<DownAlerts />} />
            <Route path="history" element={<History />} />
            <Route path="alert-config" element={<AlertConfig />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthContextProvider>
  );
}