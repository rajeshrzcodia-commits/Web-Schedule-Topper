import { useState, useEffect } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { fetchTargets, deleteTarget, updateTarget } from '../api/endpoints';
import { ApiError } from '../api/client';
import './ActiveSchedules.css';

export default function ActiveSchedules() {
  const navigate = useNavigate();
  const {
    globalSearchQuery = '',
    selectedFilter = null,
    setAvailableSchedules,
  } = useOutletContext() || {};

  const [schedules, setSchedules] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadTargets = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await fetchTargets();
        const list = data.targets || [];
        setSchedules(list);
        // Register schedules with the layout so the top global search bar can
        // show matching schedule names/URLs in its dropdown.
        setAvailableSchedules?.(list);
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err.message || 'Failed to load schedules.');
        } else {
          setError('An unexpected error occurred while loading schedules.');
        }
        console.error('Load targets failed:', err);
      } finally {
        setIsLoading(false);
      }
    };
    loadTargets();
  }, []);

  const filtered = schedules.filter((s) => {
    if (!s) return false;
    // A click-to-filter selection takes precedence: show only that item.
    if (selectedFilter) {
      const name = String(s.name || '').toLowerCase();
      const url = String(s.url || '').toLowerCase();
      return (
        name === String(selectedFilter.name || '').toLowerCase() ||
        url === String(selectedFilter.url || '').toLowerCase()
      );
    }
    // Live query filter (clearing the input restores all items).
    const q = (globalSearchQuery || '').toLowerCase();
    if (!q) return true;
    return (
      String(s.name || '').toLowerCase().includes(q) ||
      String(s.url || '').toLowerCase().includes(q)
    );
  });

  const emptyText =
    selectedFilter
      ? 'No schedules match the selected filter.'
      : globalSearchQuery
      ? `No schedules match "${globalSearchQuery}".`
      : 'No schedules found. Submit a new uptime check to get started.';

  const handleAddNew = () => {
    navigate('/dashboard/new-check');
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this schedule?')) return;
    try {
      await deleteTarget(id);
      setSchedules((prev) => prev.filter((s) => s._id !== id));
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message || 'Failed to delete schedule.');
      } else {
        setError('An unexpected error occurred while deleting.');
      }
      console.error('Delete target failed:', err);
    }
  };

  const handleToggle = async (s) => {
    try {
      await updateTarget(s._id, { active: !s.active });
      setSchedules((prev) =>
        prev.map((t) => (t._id === s._id ? { ...t, active: !t.active } : t))
      );
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message || 'Failed to update schedule.');
      } else {
        setError('An unexpected error occurred while updating.');
      }
      console.error('Toggle target failed:', err);
    }
  };

  const statusLabel = (s) => (s.active ? 'Active' : 'Inactive');

  return (
    <div className="active-schedules-page">
      {error && (
        <p className="error-message" style={{ marginBottom: '12px', color: '#DC2626', fontSize: '12px', padding: '0 12px' }}>
          {error}
        </p>
      )}
      {isLoading ? (
        <p style={{ textAlign: 'center', padding: '24px', color: '#6B7280', fontSize: '14px' }}>Loading schedules...</p>
      ) : (
        <>
          <div className="active-schedules-table-wrap">
            <table className="active-schedules-table">
              <thead>
                <tr>
                  <th className="active-schedules-th-id">ID</th>
                  <th>Schedule Name</th>
                  <th>Target URL / Sheet Name</th>
                  <th>Check Frequency</th>
                  <th>Last Checked</th>
                  <th>Status</th>
                  <th className="active-schedules-th-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s, index) => (
                  <tr key={s._id}>
                    <td className="active-schedules-td-id">#{index + 1}</td>
                    <td>
                      <div className="active-schedules-name">{s.name || '-'}</div>
                    </td>
                    <td className="active-schedules-url">{s.url}</td>
                    <td>{s.frequency || '-'}</td>
                    <td>{s.updatedAt || s.createdAt || '-'}</td>
                    <td>
                      <span className={`active-schedules-badge active-schedules-badge-${s.active ? 'up' : 'down'}`}>
                        {statusLabel(s)}
                      </span>
                    </td>
                    <td className="active-schedules-td-actions">
                      <button
                        type="button"
                        className="active-schedules-icon-btn"
                        title="Edit"
                        aria-label="Edit"
                        onClick={() => navigate('/dashboard/new-check')}
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        className="active-schedules-icon-btn"
                        title={s.active ? 'Deactivate' : 'Activate'}
                        aria-label={s.active ? 'Deactivate' : 'Activate'}
                        onClick={() => handleToggle(s)}
                      >
                        {s.active ? '⏸' : '▶'}
                      </button>
                      <button
                        type="button"
                        className="active-schedules-icon-btn"
                        title="Delete"
                        aria-label="Delete"
                        onClick={() => handleDelete(s._id)}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filtered.length === 0 && (
            <div className="active-schedules-empty-state">
              <p className="active-schedules-empty-text">{emptyText}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
