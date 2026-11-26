import { useState, useEffect } from 'react';
import { useOutletContext, useLocation } from 'react-router-dom';
import { Trash2, Clock, RotateCw } from 'lucide-react';
import { fetchResults, deleteDownResult, clearDownResults } from '../api/endpoints';
import { ApiError } from '../api/client';
import './DownAlerts.css';

/**
 * DownAlerts - "Down Alerts & Logs" page
 *
 * Design notes:
 * - Entries are populated from persisted down scan records.
 * - Reuses the dashboard's global `searchQuery` (from Outlet context) for filtering.
 * - Clear and row delete operations remove matching database records.
 */

export default function DownAlerts() {
  const location = useLocation();
  const { globalSearchQuery = '' } = useOutletContext() || {};

  const [alerts, setAlerts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    loadAlerts();
  }, [location.pathname]);

  const loadAlerts = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchResults({ status: 'down', limit: 500 });
      const results = data.results || [];
      setAlerts(
        results.map((r) => ({
          id: r._id,
          timestamp: r.timestamp || '-',
          scheduleName: r.name || r.url,
          failureReason: r.error || `HTTP ${r.statusCode ?? 'N/A'}`,
          status: r.status,
          severity: r.consecutiveFailures >= 5 ? 'critical' : r.consecutiveFailures >= 3 ? 'high' : r.consecutiveFailures >= 1 ? 'medium' : 'low',
          url: r.url,
          statusCode: r.statusCode,
          responseTimeMs: r.responseTimeMs,
          consecutiveFailures: r.consecutiveFailures ?? 0,
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
    setError(null);
    setIsDeleting(true);
    clearDownResults()
      .then(() => setAlerts([]))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not clear down logs from the database.'))
      .finally(() => setIsDeleting(false));
  };

  const handleDeleteAlert = (id) => {
    setError(null);
    setIsDeleting(true);
    deleteDownResult(id)
      .then(() => setAlerts((prev) => prev.filter((a) => a.id !== id)))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not delete down log from the database.'))
      .finally(() => setIsDeleting(false));
  };

  const filteredAlerts = alerts.filter((a) => {
    if (!a) return false;
    const q = (globalSearchQuery || '').toLowerCase();
    return (
      String(a.id || '').includes(q) ||
      String(a.scheduleName || '').toLowerCase().includes(q) ||
      String(a.failureReason || '').toLowerCase().includes(q) ||
      String(a.url || '').toLowerCase().includes(q) ||
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
          disabled={isLoading || isDeleting}
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
                  <th>HTTP Status</th>
                  <th>Response Time</th>
                  <th>Consecutive Failures</th>
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
                    <td>{a.statusCode ?? 'N/A'}</td>
                    <td>{a.responseTimeMs == null ? 'N/A' : `${a.responseTimeMs} ms`}</td>
                    <td>{a.consecutiveFailures ?? 0}</td>
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
                        disabled={isDeleting}
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
