import { useState, useCallback } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { Mail, Slack, Link, AlertCircle, CheckCircle, Save, Phone } from 'lucide-react';
import './AlertConfig.css';

const DEFAULT_EMAIL = 'default_user@example.com';

export default function AlertConfig() {
  const { user } = useOutletContext() || {};
  const navigate = useNavigate();

  const [toast, setToast] = useState(null);

  const [applyTo, setApplyTo] = useState('All Schedules');
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [email, setEmail] = useState((user && user.email) || DEFAULT_EMAIL);
  const [slackEnabled, setSlackEnabled] = useState(false);
  const [slackWebhook, setSlackWebhook] = useState('');
  const [webhookEnabled, setWebhookEnabled] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [notifyDown, setNotifyDown] = useState(false);
  const [notifyUp, setNotifyUp] = useState(false);
  const [failureThreshold, setFailureThreshold] = useState('3');

  const [testResult, setTestResult] = useState(null);

  const showToast = useCallback((type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const handleTestNotifications = () => {
    console.log('Test notifications triggered', {
      applyTo, emailEnabled, email, slackEnabled, slackWebhook,
      webhookEnabled, webhookUrl, notifyDown, notifyUp, failureThreshold,
    });
    setTestResult('Test notifications sent — check your configured channels.');
    setTimeout(() => setTestResult(null), 4000);
  };

  const handleSaveSettings = (e) => {
    e.preventDefault();
    console.log('Alert configurations saved', {
      applyTo, emailEnabled, email, slackEnabled, slackWebhook,
      webhookEnabled, webhookUrl, notifyDown, notifyUp, failureThreshold,
    });
    showToast('success', 'Alert configurations saved successfully!');
    setTestResult(null);
  };

  const defaultEmail = (user && user.email) || DEFAULT_EMAIL;
  return (
    <div className="alertconfig-page">
      <div className="alertconfig-container">

        <form onSubmit={handleSaveSettings} className="alertconfig-form" noValidate>
          <div className="alertconfig-dropdown-group">
            <label className="alertconfig-field-label">Apply to Schedule</label>
            <select
              className="alertconfig-select"
              value={applyTo}
              onChange={(e) => setApplyTo(e.target.value)}
            >
              <option value="All Schedules">All Schedules</option>
              <option value="Selected Schedules">Selected Schedules</option>
            </select>
          </div>

          <div className="alertconfig-cards-grid">
            <div className="alertconfig-card alertconfig-card-left">
              <div className="alertconfig-card-header">
                <span className="alertconfig-card-icon">
                  <Mail size={16} strokeWidth={1.8} />
                </span>
                <h3 className="alertconfig-card-title">NOTIFICATION CHANNELS</h3>
              </div>
              <div className="alertconfig-card-body">
                <label className="alertconfig-checkbox">
                  <input
                    type="checkbox"
                    checked={emailEnabled}
                    onChange={() => setEmailEnabled(!emailEnabled)}
                  />
                  <span className="alertconfig-checkmark"></span>
                  Email Alerts
                </label>
                <div className="alertconfig-input-wrap">
                  <span className="alertconfig-input-addon">
                    <Mail size={14} strokeWidth={1.6} />
                  </span>
                  <input
                    type="email"
                    placeholder="default_user@example.com"
                    className="alertconfig-field-input"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={!emailEnabled}
                  />
                </div>
                <p className="alertconfig-channel-hint">
                  Default registered email: {defaultEmail}
                </p>

                <label className="alertconfig-checkbox">
                  <input
                    type="checkbox"
                    checked={slackEnabled}
                    onChange={() => setSlackEnabled(!slackEnabled)}
                  />
                  <span className="alertconfig-checkmark"></span>
                  Slack Integration
                </label>
                <div className="alertconfig-input-wrap">
                  <span className="alertconfig-input-addon">
                    <Slack size={14} strokeWidth={1.6} />
                  </span>
                  <input
                    type="url"
                    placeholder="https://hooks.slack.com/services/..."
                    className="alertconfig-field-input"
                    value={slackWebhook}
                    onChange={(e) => setSlackWebhook(e.target.value)}
                    disabled={!slackEnabled}
                  />
                </div>
                <p className="alertconfig-channel-hint">
                  Incoming Webhook URL for Slack notifications.
                </p>

                <label className="alertconfig-checkbox">
                  <input
                    type="checkbox"
                    checked={webhookEnabled}
                    onChange={() => setWebhookEnabled(!webhookEnabled)}
                  />
                  <span className="alertconfig-checkmark"></span>
                  Webhooks
                </label>
                <div className="alertconfig-input-wrap">
                  <span className="alertconfig-input-addon">
                    <Link size={14} strokeWidth={1.6} />
                  </span>
                  <input
                    type="url"
                    placeholder="https://your-endpoint.com/webhook"
                    className="alertconfig-field-input"
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                    disabled={!webhookEnabled}
                  />
                </div>
                <p className="alertconfig-channel-hint">
                  Optional custom webhook endpoint.
                </p>
              </div>
            </div>
            <div className="alertconfig-card alertconfig-card-right">
              <div className="alertconfig-card-header">
                <span className="alertconfig-card-icon">
                  <AlertCircle size={16} strokeWidth={1.8} />
                </span>
                <h3 className="alertconfig-card-title">TRIGGER CONDITIONS</h3>
              </div>
              <div className="alertconfig-card-body">
                <label className="alertconfig-checkbox alertconfig-checkbox-block">
                  <input
                    type="checkbox"
                    checked={notifyDown}
                    onChange={() => setNotifyDown(!notifyDown)}
                  />
                  <span className="alertconfig-checkmark"></span>
                  Notify on: Failed / Down
                </label>
                <label className="alertconfig-checkbox alertconfig-checkbox-block">
                  <input
                    type="checkbox"
                    checked={notifyUp}
                    onChange={() => setNotifyUp(!notifyUp)}
                  />
                  <span className="alertconfig-checkmark"></span>
                  Notify on: Recovered / Up
                </label>
                <div className="alertconfig-threshold-group">
                  <label className="alertconfig-field-label">Send alert after</label>
                  <div className="alertconfig-input-wrap alertconfig-input-compact">
                    <input
                      type="number"
                      min="1"
                      placeholder="3"
                      className="alertconfig-field-input"
                      value={failureThreshold}
                      onChange={(e) => setFailureThreshold(e.target.value)}
                    />
                    <span className="alertconfig-input-addon">consecutive failures</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {testResult && (
            <div className="alertconfig-test-result">
              <Phone size={14} strokeWidth={1.6} className="alertconfig-test-icon" />
              <span className="alertconfig-test-message">{testResult}</span>
            </div>
          )}

          <div className="alertconfig-form-actions">
            <button
              type="button"
              className="alertconfig-btn-test"
              onClick={handleTestNotifications}
            >
              Test Notifications
            </button>
            <button type="submit" className="alertconfig-btn-save">
              <Save size={16} strokeWidth={2} /> Save Settings
            </button>
          </div>
        </form>

        {toast && (
          <div
            className={`alertconfig-toast alertconfig-toast--${toast.type}`}
            role="alert"
            aria-live="polite"
          >
            {toast.type === 'success' && (
              <CheckCircle size={16} strokeWidth={2} className="alertconfig-toast-icon" />
            )}
            <span className="alertconfig-toast-message">{toast.message}</span>
          </div>
        )}
      </div>
    </div>
  );
}
