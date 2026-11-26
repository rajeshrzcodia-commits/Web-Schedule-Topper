import { useState, useEffect } from 'react';
import { useNavigate, useOutletContext, useLocation } from 'react-router-dom';
import { Activity, Clock, ChevronDown } from 'lucide-react';
import { fetchTargets, fetchLatestResults, triggerScan, getScanStatus } from '../api/endpoints';
import { ApiError } from '../api/client';
import './LiveMonitor.css';


export default function LiveMonitor() {
  const navigate = useNavigate();
  const location = useLocation();
  const [monitors, setMonitors] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const {
    globalSearchQuery = '',
    selectedFilter = null,
    setAvailableSchedules,
  } = useOutletContext() || {};

  useEffect(() => {
    loadLatest();
  }, [location.pathname]);

  // Page-transition safety: reset availableSchedules on unmount so stale
  // items never carry over to other pages.
  useEffect(() => {
    return () => {
      setAvailableSchedules?.([]);
    };
  }, [setAvailableSchedules]);

  const loadLatest = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [targetsData, resultsData] = await Promise.all([
        fetchTargets(),
        fetchLatestResults(),
      ]);
      const targets = targetsData.targets || [];
      const results = resultsData.results || [];

      // Build a URL -> latest scan result lookup so each target row shows
      // scan details when a scan has run, or a clean "not scanned yet" entry
      // for targets that have never been scanned.
      const resultByUrl = {};
      results.forEach((r) => {
        if (r.url) resultByUrl[r.url] = r;
      });

      // Newest-first order with a safe createdAt fallback so sorting
      // never produces NaN and the newest-stored entry stands first.
      const orderedTargets = [...targets].sort((a, b) => {
        const at = Date.parse(a.createdAt) || 0;
        const bt = Date.parse(b.createdAt) || 0;
        return bt - at;
      });

      setMonitors(
        orderedTargets.map((t) => {
          const r = resultByUrl[t.url];
          return {
            id: t._id || t.url,
            name: t.name || 'Unknown Monitor',
            url: t.url,
            status: r ? r.status : 'pending',
            response:
              r && r.responseTimeMs !== null ? `${r.responseTimeMs} ms` : '-',
            lastChecked: r ? (r.timestamp || '-') : '-',
            frequency: t.frequency || '-',
            active: t.active,
            createdAt: t.createdAt,
          };
        })
      );

      // Populate availableSchedules for the global search dropdown so monitor
      // names/URLs can be searched from the top bar on any page.
      setAvailableSchedules?.(
        orderedTargets.map((t) => ({
          id: t._id || t.url,
          name: t.name || 'Unknown Monitor',
          url: t.url,
        }))
      );
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message || 'Failed to load monitor status.');
      } else {
        setError('An unexpected error occurred while loading monitors.');
      }
      console.error('Load latest results failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const pollScanStatus = async (maxAttempts = 30) => {
    for (let i = 0; i < maxAttempts; i++) {
      const status = await getScanStatus();
      if (!status.running) {
        return status;
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    throw new Error('Scan did not complete within the timeout period.');
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await triggerScan();
      await pollScanStatus();
      await loadLatest();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message || 'Refresh failed.');
      } else {
        setError(err.message || 'Refresh failed.');
      }
      console.error('Refresh failed:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const statusLabel = (status) => {
    if (status === 'up') return 'Operational';
    if (status === 'down') return 'Down';
    return 'Not scanned yet';
  };

  const filteredMonitors = monitors.filter((m) => {
    if (!m) return false;
    if (selectedFilter) {
      return (
        String(m.name || '').toLowerCase() === String(selectedFilter.name || '').toLowerCase() ||
        String(m.url || '').toLowerCase() === String(selectedFilter.url || '').toLowerCase()
      );
    }
    const q = (globalSearchQuery || '').toLowerCase();
    if (!q) return true;
    return (
      String(m.name || '').toLowerCase().includes(q) ||
      String(m.url || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="live-monitor">
      <div className="live-monitor-page-header">
        <div className="live-monitor-header-left">
          {error && (
            <p className="error-message" style={{ color: '#DC2626', fontSize: '12px', margin: 0 }}>
              {error}
            </p>
          )}
        </div>
        <div className="live-monitor-header-right">
          <button type="button" className="live-monitor-btn-back" onClick={() => navigate('/dashboard')}>
            <ChevronDown size={16} strokeWidth={2} /> Back to New Check
          </button>
          <button
            type="button"
            className="live-monitor-icon-btn"
            title="Refresh"
            aria-label="Refresh"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            {isRefreshing ? (
              <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}><Activity size={16} strokeWidth={2} /></span>
            ) : (
              <Activity size={16} strokeWidth={2} />
            )}
          </button>
        </div>
      </div>

      {isLoading ? (
        <p style={{ textAlign: 'center', padding: '24px', color: '#6B7280', fontSize: '14px' }}>Loading monitors...</p>
      ) : (
        <>
          <div className="live-monitor-table-wrap">
            <table className="live-monitor-monitors-table">
              <thead>
                <tr>
                  <th>Monitor</th>
                  <th>URL</th>
                  <th>Status</th>
                  <th>Response Time</th>
                  <th>Last Checked</th>
                  <th className="live-monitor-th-actions">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredMonitors.map((m, i) => (
                  <tr key={i}>
                    <td>
                      <div className="live-monitor-monitor-name">
                        {m.name}
                      </div>
                    </td>
                    <td className="live-monitor-url-cell">{m.url}</td>
                    <td>
                      <span className={`live-monitor-badge live-monitor-badge-${m.status}`}>
                        {statusLabel(m.status)}
                      </span>
                    </td>
                    <td>{m.response}</td>
                    <td>{m.lastChecked}</td>
                    <td className="live-monitor-td-actions">
                      <button
                        type="button"
                        className="live-monitor-icon-btn"
                        title="Refresh"
                        aria-label="Refresh"
                      >
                        <Activity size={16} strokeWidth={2} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredMonitors.length === 0 && (
            <div className="live-monitor-empty-state">
              <Clock size={30} strokeWidth={2} className="live-monitor-empty-icon" />
              <p className="live-monitor-empty-text">No monitors match the selected status.</p>
            </div>
          )}
        </>
      )}
    </div>
  )

}