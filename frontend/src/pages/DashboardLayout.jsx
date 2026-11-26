import { useState, useEffect, useCallback } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import { ROUTES } from '../config/routes';
import { useAuth } from '../context/AuthContext';
import './DashboardLayout.css';

const ROUTE_TITLES = {
  '/dashboard': { title: 'New Check', subtitle: 'Schedule a new uptime check for your website.' },
  '/dashboard/new-check': { title: 'New Check', subtitle: 'Schedule a new uptime check for your website.' },
  '/dashboard/live-monitor': { title: 'Live Monitor', subtitle: 'Real-time status of your scheduled checks.' },
  '/dashboard/edit-profile': { title: 'Edit Profile', subtitle: 'Update your account details.' },
  '/dashboard/active-schedules': { title: 'Active Schedules', subtitle: '' },
  '/dashboard/down-alerts-logs': { title: 'Down Alerts & Logs', subtitle: '' },
  '/dashboard/history': { title: 'History', subtitle: '' },
  '/dashboard/alert-config': { title: 'Alert Config', subtitle: '' },
};

export default function DashboardLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, loading } = useAuth();
  const [open, setOpen] = useState(false);

  // Isolated global search bar state — dedicated, separate hooks so there is
  // zero cross-field or cross-search state leakage.
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [searchDropdownOpen, setSearchDropdownOpen] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState(null);

  // Source list for the dropdown (populated by the Active Schedules view).
  const [availableSchedules, setAvailableSchedules] = useState([]);

  const routeInfo = ROUTE_TITLES[location.pathname] || { title: 'Dashboard', subtitle: '' };

  // Page-transition safety: never carry search/filter state across routes so
  // switching pages during or after filtering never causes stale filters,
  // blank views, or cross-page filter errors.
  useEffect(() => {
    setGlobalSearchQuery('');
    setSearchDropdownOpen(false);
    setSelectedFilter(null);
  }, [location.pathname]);

  const handleLogout = useCallback(async () => {
    setOpen(false);
    await logout();
    navigate('/login', { replace: true });
  }, [logout, navigate]);

  const handleClickOutside = useCallback((e) => {
    const container = document.querySelector('.dashboard-header');
    const isOutside = container && !container.contains(e.target);
    if (isOutside) {
      setOpen(false);
      setSearchDropdownOpen(false);
    }
  }, []);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      setSearchDropdownOpen(false);
    }
  }, []);

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleClickOutside, handleKeyDown]);

  const avatar = user
    ? user.name ? user.name.charAt(0).toUpperCase() : 'U'
    : '';

  // While auth is still loading, render a minimal shell.
  if (loading) {
    return (
      <div className="dashboard">
        <aside className="dashboard-sidebar">
          <Sidebar />
        </aside>
        <div className="dashboard-body">
          <header className="dashboard-header">
            <div className="dashboard-header-branding">
              <h1 className="dashboard-title">{routeInfo.title}</h1>
              {routeInfo.subtitle && (
                <p className="dashboard-subtitle">{routeInfo.subtitle}</p>
              )}
            </div>
          </header>
          <main className="dashboard-content">
            <div style={{ padding: '40px 48px', color: 'var(--muted)', fontSize: 14 }}>
              Loading session…
            </div>
          </main>
        </div>
      </div>
    );
  }

  const handleSearchChange = (e) => {
    const value = e.target.value || '';
    setGlobalSearchQuery(value);
    setSearchDropdownOpen(true);
    // Typing or clearing always returns to live-query mode and restores all
    // items; a selected filter is cleared on any input change.
    setSelectedFilter(null);
  };

  const handleSearchFocus = () => {
    setSearchDropdownOpen(true);
  };

  const handleClearSearch = (e) => {
    e.stopPropagation();
    setGlobalSearchQuery('');
    setSelectedFilter(null);
    setSearchDropdownOpen(false);
  };

  const handleSelectSearchItem = (e, item) => {
    // preventDefault keeps the input focused so the click still fires normally
    // (click events are never blocked).
    e.preventDefault();
    setGlobalSearchQuery(item.name || '');
    setSelectedFilter(item);
    setSearchDropdownOpen(false);
  };

  const queryLower = (globalSearchQuery || '').toLowerCase();
  const dropdownOptions = queryLower === ''
    ? []
    : availableSchedules.filter((s) => {
        if (!s) return false;
        const name = String(s.name || '').toLowerCase();
        const url = String(s.url || '').toLowerCase();
        return name.includes(queryLower) || url.includes(queryLower);
      });

  return (
    <div className="dashboard">
      <aside className="dashboard-sidebar">
        <Sidebar />
      </aside>
      <div className="dashboard-body">
        <header className="dashboard-header">
          <div className="dashboard-header-branding">
            <h1 className="dashboard-title">{routeInfo.title}</h1>
            {routeInfo.subtitle && (
              <p className="dashboard-subtitle">{routeInfo.subtitle}</p>
            )}
          </div>
          <div className="dashboard-header-actions">
            <div className="dashboard-search-wrapper">
              <input
                type="text"
                placeholder="Search schedules, URLs..."
                className="dashboard-search-input"
                value={globalSearchQuery || ''}
                onChange={handleSearchChange}
                onFocus={handleSearchFocus}
              />
              {(globalSearchQuery || selectedFilter) && (
                <button
                  type="button"
                  className="dashboard-search-clear"
                  onClick={handleClearSearch}
                  aria-label="Clear search"
                >
                  Clear
                </button>
              )}
              {searchDropdownOpen && (
                <div className="dashboard-search-dropdown">
                  {globalSearchQuery.length > 0 ? (
                    dropdownOptions.length > 0 ? (
                      dropdownOptions.map((item, index) => (
                        <div
                          key={item.id || item.url || index}
                          className="dashboard-search-dropdown-item"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={(e) => handleSelectSearchItem(e, item)}
                        >
                          <div className="dashboard-search-dropdown-item-name">
                            {item.name}
                          </div>
                          <div className="dashboard-search-dropdown-item-url">
                            {item.url}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="dashboard-search-dropdown-empty">
                        No matching schedules or URLs
                        {location.pathname !== ROUTES.ACTIVE_SCHEDULES &&
                          location.pathname !== '/dashboard/live-monitor' && (
                          <div className="dashboard-search-dropdown-nav">
                            <button
                              type="button"
                              className="dashboard-search-dropdown-nav-link"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSearchDropdownOpen(false);
                                navigate(ROUTES.ACTIVE_SCHEDULES);
                              }}
                            >
                              Go to Active Schedules
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  ) : (
                    <div className="dashboard-search-dropdown-empty">
                      Type a schedule name or URL to search
                    </div>
                  )}
                </div>
              )}
            </div>
            {user ? (
              <div
                className="dashboard-user-dropdown"
                onClick={(e) => {
                  e.stopPropagation();
                  setSearchDropdownOpen(false);
                  setOpen((prev) => !prev);
                }}
              >
                <div className="dashboard-user-avatar">{avatar}</div>
                <span className="dashboard-user-name">{user.name}</span>
                <span className="dashboard-dropdown-chevron">{open ? '▲' : '▼'}</span>
              </div>
            ) : (
              <button
                type="button"
                className="dashboard-btn-login"
                onClick={() => navigate('/login')}
              >
                Login
              </button>
            )}
            {user && open && (
              <div className="dashboard-dropdown-menu">
                <div
                  className="dashboard-dropdown-item"
                  onClick={() => {
                    setOpen(false);
                    navigate('/dashboard/edit-profile');
                  }}
                >
                  <span className="dashboard-dropdown-label">Edit Profile</span>
                </div>
                <div className="dashboard-dropdown-divider" />
                <div
                  className="dashboard-dropdown-item dashboard-dropdown-item-logout"
                  onClick={handleLogout}
                >
                  <span className="dashboard-dropdown-label">Logout</span>
                </div>
              </div>
            )}
          </div>
        </header>
        <main className="dashboard-content">
          <Outlet
            context={{
              user,
              globalSearchQuery,
              setGlobalSearchQuery,
              searchDropdownOpen,
              setSearchDropdownOpen,
              selectedFilter,
              setSelectedFilter,
              availableSchedules,
              setAvailableSchedules,
            }}
          />
        </main>
      </div>
    </div>
  );
}
