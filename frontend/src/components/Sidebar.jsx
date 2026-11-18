import { useLocation, useNavigate } from 'react-router-dom';
import { Clock, Monitor, Activity, AlertCircle, History, Settings } from 'lucide-react';
import logo from '../assets/mainlogo.png';
import './Sidebar.css';

const MENU = [
  { key: 'new-check', label: 'New Check', Icon: Clock, route: '/dashboard' },
  { key: 'live-monitor', label: 'Live Monitor', Icon: Monitor, route: '/dashboard/live-monitor' },
  { key: 'active-schedules', label: 'Active Schedules', Icon: Activity, route: '/dashboard/active-schedules' },
  { key: 'down-alerts-logs', label: 'Down Alerts & Logs', Icon: AlertCircle, route: '/dashboard/down-alerts-logs' },
  { key: 'history', label: 'History', Icon: History, route: '/dashboard/history' },
  { key: 'alert-config', label: 'Alert Config', Icon: Settings, route: '/dashboard/alert-config' },
];

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (route) => {
    if (route === '/dashboard') {
      return location.pathname === '/dashboard' || location.pathname.startsWith('/dashboard/new-check');
    }
    return location.pathname === route;
  };

  const handleClick = (route) => {
    navigate(route);
  };

  return (
    <nav className="sidebar">
      <div className="sidebar-brand">
        {logo && (
          <img
            src={logo}
            alt="Web Schedule Topper"
            className="sidebar-logo"
            onError={(e) => {
              e.target.style.display = 'none';
            }}
          />
        )}
        <span className="sidebar-brand-name">
          <span className="sidebar-brand-line">Web Schedule</span>
          <span className="sidebar-brand-line">Topper</span>
        </span>
      </div>
      <div className="sidebar-menu">
        {MENU.map((item) => {
          const Icon = item.Icon;
          const active = isActive(item.route);
          return (
            <button
              key={item.key}
              type="button"
              className={`sidebar-item ${active ? 'sidebar-item-active' : ''}`}
              onClick={() => handleClick(item.route)}
              aria-pressed={active}
            >
              <Icon size={17} strokeWidth={2} className="sidebar-icon" />
              <span className="sidebar-label">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}