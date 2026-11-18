import { useState, useEffect } from 'react';
import { RotateCw, Copy, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { fetchResults } from '../api/endpoints';
import { ApiError } from '../api/client';
import './History.css';

const ITEMS_PER_PAGE = 5;

export default function History() {
  const [history, setHistory] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [openLog, setOpenLog] = useState(null);
  const [localSearchQuery, setLocalSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadHistory();
  }, []);

  const location = useLocation();

  // Page-transition safety: reset the isolated History search when navigating
  // so no stale filter state carries across routes. (History never reads the
  // top global search bar state, so the two searches are fully isolated.)
  useEffect(() => {
    setLocalSearchQuery('');
    setCurrentPage(1);
  }, [location.pathname]);

  // Reset to page 1 whenever the isolated History search changes so filtered
  // results never render on an out-of-range page.
  useEffect(() => {
    setCurrentPage(1);
  }, [localSearchQuery]);

  const loadHistory = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchResults({ limit: 500 });
      const results = data.results || [];
      setHistory(
        results.map((r) => ({
          id: r.url + '|' + r.timestamp,
          scheduleName: r.name || r.url,
          status: r.status,
          timestamp: r.timestamp || '-',
          errorMessage: r.error || '',
          url: r.url,
          statusCode: r.statusCode,
          responseTimeMs: r.responseTimeMs,
        }))
      );
      setCurrentPage(1);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message || 'Failed to load history.');
      } else {
        setError('An unexpected error occurred while loading history.');
      }
      console.error('Load history failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    await loadHistory();
  };

  const handleViewLogs = (entry) => {
    setOpenLog(entry);
  };

  const handleCloseModal = () => {
    setOpenLog(null);
  };

  // Resolves the error message for a log entry, checking the primary
  // errorMessage field first, then common alternate property names, so the
  // View Logs modal reliably displays an error whenever one exists.
  const getErrorMessage = (log) => {
    if (!log) return '';
    if (log.errorMessage) return log.errorMessage;
    if (log.error) return log.error;
    return '';
  };

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    console.log('Copied log:', text);
  };

  const handlePrevPage = () => {
    if (currentPage > 1) setCurrentPage((prev) => prev - 1);
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) setCurrentPage((prev) => prev + 1);
  };

  const filteredHistory = history.filter((h) => {
    if (!h) return false;
    const q = (localSearchQuery || '').toLowerCase();
    // History is filtered by Schedule Name and URL (case-insensitive). It uses
    // its own isolated localSearchQuery and never reads the top global
    // search bar state, so the two searches cannot leak into each other.
    return (
      String(h.scheduleName || '').toLowerCase().includes(q) ||
      String(h.url || '').toLowerCase().includes(q)
    );
  });

  const totalPages = Math.ceil(filteredHistory.length / ITEMS_PER_PAGE) || 1;

  const paginated = filteredHistory.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  return (
    <div className="history-page">
      <div className="history-controls">
        <div className="history-search-wrapper">
          <input
            type="text"
            placeholder="Search history..."
            className="history-search-input"
            value={localSearchQuery}
            onChange={(e) => setLocalSearchQuery(e.target.value)}
          />
        </div>
        <button
          type="button"
          className="history-btn-refresh"
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
      </div>

      {error && (
        <p className="error-message" style={{ marginBottom: '12px', color: '#DC2626', fontSize: '12px', padding: '0 12px' }}>
          {error}
        </p>
      )}

      {isLoading ? (
        <p style={{ textAlign: 'center', padding: '24px', color: '#6B7280', fontSize: '14px' }}>Loading history...</p>
      ) : (
        <div className="history-table-wrap">
          <table className="history-table">
            <thead>
              <tr>
                <th>Schedule Name</th>
                <th>Status</th>
                <th>Time</th>
                <th className="history-th-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((h) => (
                <tr key={h.id}>
                  <td>
                    <div className="history-schedule-name">{h.scheduleName}</div>
                  </td>
                  <td>
                    <span
                      className={`history-status history-status-${h.status}`}
                    >
                      {h.status.charAt(0).toUpperCase() + h.status.slice(1)}
                    </span>
                  </td>
                  <td className="history-time">{h.timestamp}</td>
                  <td className="history-td-actions">
                    <button
                      type="button"
                      className="history-btn-view"
                      title="View Logs"
                      aria-label="View Logs"
                      onClick={() => handleViewLogs(h)}
                    >
                      View Logs
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredHistory.length === 0 ? (
            <div className="history-empty-state">
              <RotateCw size={30} strokeWidth={2} className="history-empty-icon" />
              <p className="history-empty-text">
                No history entries found. Run scheduled checks to begin logging history.
              </p>
            </div>
          ) : (
            <div className="history-pagination">
              <span className="history-pagination-info">
                Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} to{' '}
                {Math.min(currentPage * ITEMS_PER_PAGE, filteredHistory.length)} of{' '}
                {filteredHistory.length} entries
              </span>
              <div className="history-pagination-nav">
                <button
                  type="button"
                  className="history-pagination-btn"
                  onClick={handlePrevPage}
                  disabled={currentPage === 1}
                  aria-label="Previous page"
                >
                  <ChevronLeft size={14} strokeWidth={2} />
                </button>
                <button
                  type="button"
                  className="history-pagination-btn"
                  onClick={handleNextPage}
                  disabled={currentPage === totalPages}
                  aria-label="Next page"
                >
                  <ChevronRight size={14} strokeWidth={2} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {openLog && (
        <div className="history-modal-overlay" onClick={handleCloseModal}>
          <div className="history-modal" onClick={(e) => e.stopPropagation()}>
            <div className="history-modal-header">
              <h2 className="history-modal-title">Error Log</h2>
              <button
                type="button"
                className="history-modal-close"
                onClick={handleCloseModal}
                aria-label="Close"
              >
                <X size={20} strokeWidth={2} />
              </button>
            </div>
            <div className="history-modal-body">
              <div className="history-modal-field">
                <span className="history-modal-field-label">Schedule</span>
                <span className="history-modal-field-value">{openLog.scheduleName}</span>
              </div>
              <div className="history-modal-field">
                <span className="history-modal-field-label">Timestamp</span>
                <span className="history-modal-field-value">{openLog.timestamp}</span>
              </div>
              <div className="history-modal-field">
                <span className="history-modal-field-label">Status</span>
                {['active', 'healthy'].includes(String(openLog.status || '').toLowerCase()) ? (
                  <div className="history-modal-status-active">Active</div>
                ) : (
                  <span className="history-modal-field-value">
                    {String(openLog.status || '').charAt(0).toUpperCase() + String(openLog.status || '').slice(1)}
                  </span>
                )}
              </div>
              {(() => {
                const errMsg = getErrorMessage(openLog);
                if (!errMsg) return null;
                return (
                  <div className="history-modal-field">
                    <span className="history-modal-field-label">Error Message</span>
                    <div className="history-modal-error-message">
                      {errMsg}
                    </div>
                  </div>
                );
              })()}
            </div>
            <div className="history-modal-actions">
              <button
                type="button"
                className="history-btn-copy"
                onClick={() => handleCopy(`${openLog.timestamp} — ${openLog.scheduleName}: ${openLog.errorMessage}`)}
              >
                <Copy size={16} strokeWidth={2} /> Copy
              </button>
              <button
                type="button"
                className="history-btn-close"
                onClick={handleCloseModal}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

