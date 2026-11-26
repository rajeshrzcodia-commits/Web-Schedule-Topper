import { useState, useEffect, useRef } from 'react';
import { RotateCw, Copy, Printer, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { fetchHistory } from '../api/endpoints';
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
  const [totalCount, setTotalCount] = useState(0);
  const historyRequestId = useRef(0);

  const location = useLocation();

  useEffect(() => {
    loadHistory();
  }, [location.pathname, currentPage, localSearchQuery]);

  // Page-transition safety: reset the isolated History search when navigating
  // so no stale filter state carries across routes. (History never reads the
  // top global search bar state, so the two searches are fully isolated.)
  useEffect(() => {
    setLocalSearchQuery('');
    setCurrentPage(1);
  }, [location.pathname]);

  const loadHistory = async () => {
    const requestId = ++historyRequestId.current;
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchHistory({
        limit: ITEMS_PER_PAGE,
        skip: (currentPage - 1) * ITEMS_PER_PAGE,
        search: localSearchQuery.trim(),
      });
      if (requestId !== historyRequestId.current) return;
      const results = data.entries || [];
      setHistory(
        results.map((r) => ({
          id: r._id,
          scheduleName: r.name || r.url,
          status: r.status,
          timestamp: r.timestamp || '-',
          errorMessage: r.errorMessage || r.error || '',
          error: r.errorMessage || r.error || '',
          url: r.url,
          statusCode: r.statusCode,
          responseTimeMs: r.responseTimeMs,
          consecutiveFailures: r.consecutiveFailures,
          recordType: r.recordType,
          eventType: r.eventType,
          emailStatus: r.emailStatus,
          alertType: r.alertType,
          recipientCount: r.recipientCount,
        }))
      );
      setTotalCount(data.totalCount || 0);
    } catch (err) {
      if (requestId !== historyRequestId.current) return;
      if (err instanceof ApiError) {
        setError(err.message || 'Failed to load history.');
      } else {
        setError('An unexpected error occurred while loading history.');
      }
      setHistory([]);
      setTotalCount(0);
      console.error('Load history failed:', err);
    } finally {
      if (requestId === historyRequestId.current) setIsLoading(false);
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
    if (!navigator.clipboard?.writeText) {
      setError('Clipboard access is unavailable in this browser context.');
      return;
    }
    navigator.clipboard.writeText(text).catch((err) => {
      setError(`Could not copy log details: ${err.message}`);
    });
  };

  const formatLog = (log) => [
    `Record: ${log.recordType === 'email' ? 'Email event' : 'Scan result'}`,
    `Schedule: ${log.scheduleName}`,
    `URL: ${log.url || 'N/A'}`,
    `Timestamp: ${log.timestamp}`,
    `Status: ${log.recordType === 'email' ? `${log.eventType} ${log.emailStatus}` : log.status}`,
    `HTTP status: ${log.statusCode ?? 'N/A'}`,
    `Response time: ${log.responseTimeMs == null ? 'N/A' : `${log.responseTimeMs} ms`}`,
    `Consecutive failures: ${log.consecutiveFailures ?? 'N/A'}`,
    `Alert type: ${log.alertType || 'N/A'}`,
    `Email recipient count: ${log.recipientCount ?? 'N/A'}`,
    `Error message: ${getErrorMessage(log) || 'No error'}`,
  ].join('\n');

  const handlePrevPage = () => {
    if (currentPage > 1) setCurrentPage((prev) => prev - 1);
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) setCurrentPage((prev) => prev + 1);
  };

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE) || 1;

  return (
    <div className="history-page">
      <div className="history-controls">
        <div className="history-search-wrapper">
          <input
            type="text"
            placeholder="Search history..."
            className="history-search-input"
            value={localSearchQuery}
            onChange={(e) => {
              setLocalSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
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
              {history.map((h) => (
                <tr key={h.id}>
                  <td>
                    <div className="history-schedule-name">{h.scheduleName}</div>
                  </td>
                  <td>
                    <span
                      className={`history-status history-status-${h.recordType === 'email' ? h.emailStatus : h.status}`}
                    >
                      {h.recordType === 'email' ? `${h.eventType} ${h.emailStatus}` : h.status || 'Unknown'}
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
          {history.length === 0 ? (
            <div className="history-empty-state">
              <RotateCw size={30} strokeWidth={2} className="history-empty-icon" />
              <p className="history-empty-text">
                No history entries found. Run scheduled checks to begin logging history.
              </p>
            </div>
          ) : (
            <div className="history-pagination">
              <span className="history-pagination-info">
                Showing {totalCount ? ((currentPage - 1) * ITEMS_PER_PAGE) + 1 : 0} to{' '}
                {Math.min(currentPage * ITEMS_PER_PAGE, totalCount)} of {totalCount} entries
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
              <h2 className="history-modal-title">Complete Log</h2>
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
                <span className="history-modal-field-value">
                  {openLog.recordType === 'email' ? `${openLog.eventType} ${openLog.emailStatus}` : openLog.status || 'Unknown'}
                </span>
              </div>
              {[
                ['URL', openLog.url || 'N/A'],
                ['HTTP Status Code', openLog.statusCode ?? 'N/A'],
                ['Response Time', openLog.responseTimeMs == null ? 'N/A' : `${openLog.responseTimeMs} ms`],
                ['Consecutive Failures', openLog.consecutiveFailures ?? 'N/A'],
                ['Alert Type', openLog.alertType || 'N/A'],
                ['Email Recipient Count', openLog.recipientCount ?? 'N/A'],
              ].map(([label, value]) => (
                <div className="history-modal-field" key={label}>
                  <span className="history-modal-field-label">{label}</span>
                  <span className="history-modal-field-value">{value}</span>
                </div>
              ))}
              <div className="history-modal-field">
                <span className="history-modal-field-label">Error Message</span>
                <div className="history-modal-error-message">
                  {getErrorMessage(openLog) || 'No error'}
                </div>
              </div>
            </div>
            <div className="history-modal-actions">
              <button
                type="button"
                className="history-btn-copy"
                onClick={() => handleCopy(formatLog(openLog))}
              >
                <Copy size={16} strokeWidth={2} /> Copy
              </button>
              <button type="button" className="history-btn-copy history-btn-print" onClick={() => window.print()}>
                <Printer size={16} strokeWidth={2} /> Print
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

