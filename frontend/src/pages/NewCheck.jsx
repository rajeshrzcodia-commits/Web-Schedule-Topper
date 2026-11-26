import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Globe, Calendar, Clock, Play, Save } from 'lucide-react';
import './NewCheck.css';
import { createTarget, triggerScan, getScanStatus, fetchLatestResults } from '../api/endpoints';
import { ApiError } from '../api/client';

const FREQUENCIES = [
  'Every 15 Mins',
  'Every 30 Mins',
  'Every Hour',
  'Every 6 Hours',
  'Every 12 Hours',
  'Daily',
];

const generateTimeOptions = () => {
  const options = ['00:00'];
  for (let i = 0; i < 24; i++) {
    const hour = i === 0 || i === 12 ? 12 : i % 12;
    const ampm = i < 12 ? 'AM' : 'PM';
    options.push(`${hour}:00 ${ampm}`);
  }
  return options;
};

const TIME_OPTIONS = generateTimeOptions();

export default function NewCheck() {
  const navigate = useNavigate();
  const [siteUrl, setSiteUrl] = useState('');
  const [scheduleName, setScheduleName] = useState('');
  const [frequency, setFrequency] = useState('Every 15 Mins');
  const [scheduleTime, setScheduleTime] = useState('00:00');
  const [alertEmail, setAlertEmail] = useState('');

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [scanStatus, setScanStatus] = useState('idle');
  const [confirmationEmail, setConfirmationEmail] = useState(null);
  const [isTesting, setIsTesting] = useState(false);
  const [testError, setTestError] = useState(null);
  const [lastTestResult, setLastTestResult] = useState(null);

  const handleSave = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveError(null);
    setConfirmationEmail(null);

    // Strict validation: block submission and navigation if required fields are missing.
    if (!siteUrl || !siteUrl.trim()) {
      setSaveError('Site URL is required.');
      setIsSaving(false);
      return;
    }
    if (!scheduleName || !scheduleName.trim()) {
      setSaveError('Schedule Name is required.');
      setIsSaving(false);
      return;
    }

    try {
      const payload = {
        url: siteUrl.trim(),
        name: scheduleName.trim() || '',
        scheduleTime: scheduleTime.trim() || '00:00',
        frequency: frequency.trim() || '',
        alertEmail: alertEmail.trim() || '',
        expectedStatusCode: 200,
        active: true,
      };

      const created = await createTarget(payload);
      setConfirmationEmail(created.confirmationEmail || null);
      setSaveError(null);
      setLastTestResult(null);
      console.log('Target created:', payload);

      // Poll initial scan status so the user understands why a scan entry
      // appears shortly after saving. The backend triggers triggerManualScan
      // (fire-and-forget); persistResult writes the ScanResult after the check.
      setScanStatus('running');
      try {
        await pollScanStatus(30);
        setScanStatus('completed');
      } catch {
        setScanStatus('failed');
      }

      if (!created.confirmationEmail || created.confirmationEmail.status === 'sent') {
        navigate('/dashboard/live-monitor');
      }
    } catch (error) {
      if (error instanceof ApiError) {
        setSaveError(error.message || 'Failed to save target. Please try again.');
      } else {
        setSaveError('An unexpected error occurred while saving.');
      }
      console.error('Save target failed:', error);
    } finally {
      setIsSaving(false);
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

  const handleQuickTest = async (e) => {
    e.preventDefault();
    setIsTesting(true);
    setTestError(null);
    setLastTestResult(null);

    try {
      await triggerScan();
      await pollScanStatus();
      const data = await fetchLatestResults();
      const results = data.results || [];
      const match = results.find((r) => r.url === siteUrl.trim());

      if (match) {
        setLastTestResult({
          url: match.url,
          status: match.status,
          statusCode: match.statusCode,
          responseTimeMs: match.responseTimeMs,
          error: match.error,
          timestamp: match.timestamp,
        });
      } else {
        setLastTestResult({
          url: siteUrl.trim(),
          status: 'unknown',
          statusCode: null,
          responseTimeMs: null,
          error: 'No scan result available yet.',
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      if (error instanceof ApiError) {
        setTestError(error.message || 'Quick test failed. Please try again.');
      } else {
        setTestError(error.message || 'Quick test failed. Please try again.');
      }
      console.error('Quick test failed:', error);
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="newcheck-page">
      <form onSubmit={handleSave} className="newcheck-form" noValidate>
        <div className="newcheck-field">
          <label className="newcheck-label">Site URL</label>
          <div className="newcheck-input-wrapper">
            <span className="newcheck-input-addon"><Globe size={16} strokeWidth={1.8} /></span>
            <input
              type="text"
              placeholder="https://example.com"
              className="newcheck-input"
              value={siteUrl}
              onChange={(e) => setSiteUrl(e.target.value)}
              spellCheck={false}
            />
          </div>
        </div>

        <div className="newcheck-field">
          <label className="newcheck-label">Schedule Name</label>
          <input
            type="text"
            placeholder="Site Name"
            className="newcheck-input newcheck-schedule-input"
            value={scheduleName}
            onChange={(e) => setScheduleName(e.target.value)}
          />
        </div>

        <div className="newcheck-fields-row">
          <div className="newcheck-field">
            <label className="newcheck-label">Check Frequency</label>
            <div className="newcheck-input-wrapper">
              <span className="newcheck-input-addon"><Clock size={16} strokeWidth={1.8} /></span>
              <select
                className="newcheck-select"
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
              >
                {FREQUENCIES.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="newcheck-field">
            <label className="newcheck-label">Schedule Time</label>
            <div className="newcheck-input-wrapper">
              <span className="newcheck-input-addon"><Calendar size={16} strokeWidth={1.8} /></span>
              <select
                className="newcheck-select"
                value={scheduleTime}
                onChange={(e) => setScheduleTime(e.target.value)}
              >
                {TIME_OPTIONS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="newcheck-field">
          <label className="newcheck-label">Alert Email</label>
          <div className="newcheck-input-wrapper">
            <span className="newcheck-input-addon"><Mail size={16} strokeWidth={1.8} /></span>
            <input
              type="email"
              placeholder="alerts@example.com"
              className="newcheck-input"
              value={alertEmail}
              onChange={(e) => setAlertEmail(e.target.value)}
            />
          </div>
        </div>

        <div className="newcheck-actions">
          <button
            type="button"
            className="newcheck-btn-quick-test"
            onClick={handleQuickTest}
            disabled={isTesting}
          >
            {isTesting ? (
              <span>Testing...</span>
            ) : (
              <>
                <Play size={16} strokeWidth={2} /> Run Quick Test
              </>
            )}
          </button>
          <button
            type="submit"
            className="newcheck-btn-save"
            disabled={isSaving}
          >
            {isSaving ? (
              <span>Saving...</span>
            ) : (
              <>
                <Save size={16} strokeWidth={2} /> Save & Start Monitoring
              </>
            )}
          </button>
        </div>

        {saveError && (
          <p className="error-message" style={{ marginTop: '8px', color: '#DC2626', fontSize: '12px' }}>
            {saveError}
          </p>
        )}
        {scanStatus === 'running' && (
          <p style={{ marginTop: '8px', color: '#2563EB', fontSize: '12px', fontStyle: 'italic' }}>
            Initial scan running\u2026 results will appear in Live Monitor shortly.
          </p>
        )}
        {scanStatus === 'failed' && (
          <p style={{ marginTop: '8px', color: '#DC2626', fontSize: '12px', fontStyle: 'italic' }}>
            Initial scan did not complete in time. Results may still appear in Live Monitor.
          </p>
        )}
        {confirmationEmail && (
          <p
            role="status"
            aria-live="polite"
            style={{
              marginTop: '8px',
              color: confirmationEmail.status === 'sent'
                ? '#16A34A'
                : confirmationEmail.status === 'skipped'
                  ? '#6B7280'
                  : '#DC2626',
              fontSize: '12px',
            }}
          >
            {confirmationEmail.status === 'sent'
              ? `Confirmation email sent to ${confirmationEmail.to}.`
              : confirmationEmail.status === 'skipped'
                ? `Confirmation email skipped: ${confirmationEmail.error}`
                : `Confirmation email failed for ${confirmationEmail.to}: ${confirmationEmail.error}`}
          </p>
        )}

        {testError && (
          <p className="error-message" style={{ marginTop: '8px', color: '#DC2626', fontSize: '12px' }}>
            {testError}
          </p>
        )}

        {lastTestResult && (
          <div style={{ marginTop: '12px', padding: '10px', border: '1px solid #E5E7EB', borderRadius: '8px', background: '#F9FAFB', fontSize: '13px', color: '#111827' }}>
            <div style={{ fontWeight: 600, marginBottom: '4px' }}>Quick Test Result</div>
            <div><strong>URL:</strong> {lastTestResult.url}</div>
            <div><strong>Status:</strong> {lastTestResult.status}</div>
            {lastTestResult.statusCode !== null && <div><strong>HTTP Status:</strong> {lastTestResult.statusCode}</div>}
            {lastTestResult.responseTimeMs !== null && <div><strong>Response Time:</strong> {lastTestResult.responseTimeMs} ms</div>}
            {lastTestResult.error && <div><strong>Error:</strong> {lastTestResult.error}</div>}
          </div>
        )}
      </form>
    </div>
  );
}
