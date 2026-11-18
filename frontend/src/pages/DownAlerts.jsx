import { useState, useEffect } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { Trash2, Clock, RotateCw } from 'lucide-react';
import { fetchResults } from '../api/endpoints';
import { ApiError } from '../api/client';
import './DownAlerts.css';

/**
 * DownAlerts - "Down Alerts & Logs" page
 *
 * Design notes:
 * - Entries are populated from the backend /api/results endpoint filtered by status === 'down'.
 * - Reuses the dashboard's global `searchQuery` (from Outlet context) for filtering.
 * - "CLEAR LOGS" clears the local displayed list (does not delete backend records).
 * - Individual delete removes the row from the local UI only.
 */

export default function DownAlerts() {
  const navigate = useNavigate();
  const { globalSearchQuery = '' } = useOutletContext() || {};

  const [alerts, setAlerts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadAlerts();
  }, []);

  const loadAlerts = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchResults({ limit: 500 });
      const results = data.results || [];
      const downResults = results.filter((r) => r.status === 'down');
      setAlerts(
        downResults.map((r) => ({
          id: r.url + '|' + r.timestamp,
          timestamp: r.timestamp || '-',
          scheduleName: r.name || r.url,
          failureReason: r.error || `HTTP ${r.statusCode ?? 'N/A'}`,
          status: r.status,
          severity: r.consecutiveFailures >= 3 ? 'high' : r.consecutiveFailures >= 1 ? 'medium' : 'low',
          url: r.url,
          statusCode: r.statusCode,
          responseTimeMs: r.responseTimeMs,
          consecutiveFailures: r.consecutiveFailures,
        }))
      );
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message || 'Failed to load down alerts.');
      } else {
        setError('An unexpected error occurred while loading down alerts.');
      }
      console.error('Load down alerts failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearLogs = () => {
    setAlerts([]);
  };

  const handleDeleteAlert = (id) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  const filteredAlerts = alerts.filter((a) => {
    if (!a) return false;
    const q = (globalSearchQuery || '').toLowerCase();
    return (
      String(a.id || '').includes(q) ||
      String(a.scheduleName || '').toLowerCase().includes(q) ||
      String(a.failureReason || '').toLowerCase().includes(q) ||
      String(a.severity || '').toLowerCase().includes(q)
    );
  });

  const handleRefresh = async () => {
    await loadAlerts();
  };

  return (
    <div className="down-alerts-page">
      <div className="down-alerts-controls">
        <button
          type="button"
          className="down-alerts-btn-clear"
          onClick={handleRefresh}
          disabled={isLoading}
        >
          {isLoading ? (
            <span>Loading...</span>
          ) : (
            <>
              <RotateCw size={16} strokeWidth={2} /> Refresh
            </>
          )}
        </button>
        <button
          type="button"
          className="down-alerts-btn-clear"
          onClick={handleClearLogs}
        >
          <Trash2 size={16} strokeWidth={2} /> CLEAR LOGS
        </button>
      </div>

      {error && (
        <p className="error-message" style={{ marginBottom: '12px', color: '#DC2626', fontSize: '12px', padding: '0 12px' }}>
          {error}
        </p>
      )}

      {isLoading ? (
        <p style={{ textAlign: 'center', padding: '24px', color: '#6B7280', fontSize: '14px' }}>Loading down alerts...</p>
      ) : (
        <>
          <div className="down-alerts-table-wrap">
            <table className="down-alerts-table">
              <thead>
                <tr>
                  <th className="down-alerts-th-id">ID</th>
                  <th>Timestamp</th>
                  <th>Schedule Name</th>
                  <th>Failure Reason / Status</th>
                  <th>Severity</th>
                  <th className="down-alerts-th-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAlerts.map((a, index) => (
                  <tr key={a.id}>
                    <td className="down-alerts-td-id">#{index + 1}</td>
                    <td>{a.timestamp}</td>
                    <td>
                      <div className="down-alerts-schedule-name">{a.scheduleName}</div>
                    </td>
                    <td>
                      <div className="down-alerts-failure">
                        <span
                          className={`down-alerts-status down-alerts-status-${a.status}`}
                        >
                          {a.status === 'up' ? 'Up' : 'Down'}
                        </span>
                        <p className="down-alerts-reason">{a.failureReason}</p>
                      </div>
                    </td>
                    <td>
                      <span
                        className={`down-alerts-severity down-alerts-severity-${a.severity}`}
                      >
                        {a.severity.charAt(0).toUpperCase() + a.severity.slice(1)}
                      </span>
                    </td>
                    <td className="down-alerts-td-actions">
                      <button
                        type="button"
                        className="down-alerts-icon-btn"
                        title="Delete"
                        aria-label="Delete"
                        onClick={() => handleDeleteAlert(a.id)}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredAlerts.length === 0 && (
            <div className="down-alerts-empty-state">
              <Clock size={30} strokeWidth={2} className="down-alerts-empty-icon" />
              <p className="down-alerts-empty-text">
                No down alerts found. Submit a new uptime check to begin logging failures.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
