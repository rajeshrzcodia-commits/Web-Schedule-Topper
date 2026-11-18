import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './components/Login';
import DashboardLayout from './pages/DashboardLayout';
import NewCheck from './pages/NewCheck';
import LiveMonitor from './pages/LiveMonitor';
import EditProfile from './pages/EditProfile';
import ActiveSchedules from './pages/ActiveSchedules';
import DownAlerts from './pages/DownAlerts';
import History from './pages/History';
import AlertConfig from './pages/AlertConfig';

export default function App() {
  return (
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="dashboard" element={<DashboardLayout />}>
          <Route index element={<NewCheck />} />
          <Route path="live-monitor" element={<LiveMonitor />} />
          <Route path="edit-profile" element={<EditProfile />} />
          <Route path="active-schedules" element={<ActiveSchedules />} />
          <Route path="down-alerts-logs" element={<DownAlerts />} />
          <Route path="history" element={<History />} />
          <Route path="alert-config" element={<AlertConfig />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}