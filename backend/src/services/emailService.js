






const nodemailer = require('nodemailer');
const { createLogger } = require('../config/logger');

const logger = createLogger('email');

let transporter = null;






const escapeHtml = (value) =>
  String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');








const renderUrl = (url) => {
  const safe = escapeHtml(url);
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return `<a href="${safe}">${safe}</a>`;
    }
  } catch (error) {
      }
  return safe;
};






const parseRecipients = (to) => {
  if (!to || typeof to !== 'string') return [];
  return to
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .filter((entry) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(entry));
};





const createTransporter = (smtpConfig) => {
  transporter = nodemailer.createTransport({
    host: smtpConfig.host,
    port: smtpConfig.port,
    secure: smtpConfig.secure,
    auth: {
      user: smtpConfig.user,
      pass: smtpConfig.pass,
    },
    connectionTimeout: 10000,
    greetingTimeout: 5000,
    socketTimeout: 10000,
  });

  return transporter;
};






const getTransporter = (smtpConfig) => {
  if (!transporter) {
    return createTransporter(smtpConfig);
  }
  return transporter;
};







const sendAlert = async (smtpConfig, alert) => {
  const recipients = parseRecipients(smtpConfig.to);
  if (recipients.length === 0) {
    throw new Error(
      'No valid alert recipients configured. Set ALERT_TO to one or more comma separated email addresses.'
    );
  }
  if (!smtpConfig.from) {
    throw new Error('No alert sender configured. Set ALERT_FROM.');
  }

  const tx = getTransporter(smtpConfig);

  const { type, target, result, previousResult, consecutiveFailures } = alert;

  const targetLabel = escapeHtml(target.name || target.url);

  const subjectMap = {
    down: `[ALERT] Target DOWN: ${target.name || target.url}`,
    threshold: `[ALERT] Failure threshold reached: ${target.name || target.url}`,
    recovered: `[RECOVERED] Target back UP: ${target.name || target.url}`,
  };

      const subject = (
    subjectMap[type] || `[ALERT] ${target.name || target.url}`
  ).replace(/[\r\n]+/g, ' ');

  const previousStatusRow = previousResult
    ? `<tr><td style="font-weight:bold;">Previous Status</td><td>${escapeHtml(
        previousResult.status
      )}</td></tr>`
    : '';
  const previousTimestampRow = previousResult
    ? `<tr><td style="font-weight:bold;">Previous Timestamp</td><td>${escapeHtml(
        new Date(previousResult.timestamp).toISOString()
      )}</td></tr>`
    : '';

  const html = `
    <h2>${escapeHtml(subject)}</h2>
    <table border="0" cellpadding="6" cellspacing="0" style="border-collapse:collapse; font-family: Arial, sans-serif; font-size: 14px;">
      <tr><td style="font-weight:bold;">Target</td><td>${targetLabel}</td></tr>
      <tr><td style="font-weight:bold;">URL</td><td>${renderUrl(result.url)}</td></tr>
      <tr><td style="font-weight:bold;">Type</td><td>${escapeHtml(type)}</td></tr>
      <tr><td style="font-weight:bold;">Status</td><td>${escapeHtml(
        result.status
      )}</td></tr>
      <tr><td style="font-weight:bold;">HTTP Status Code</td><td>${escapeHtml(
        result.statusCode ?? 'N/A'
      )}</td></tr>
      <tr><td style="font-weight:bold;">Response Time</td><td>${escapeHtml(
        result.responseTimeMs ?? 'N/A'
      )} ms</td></tr>
      <tr><td style="font-weight:bold;">Consecutive Failures</td><td>${escapeHtml(
        consecutiveFailures ?? 0
      )}</td></tr>
      <tr><td style="font-weight:bold;">Error</td><td>${escapeHtml(
        result.error ?? 'None'
      )}</td></tr>
      <tr><td style="font-weight:bold;">Timestamp</td><td>${escapeHtml(
        new Date().toISOString()
      )}</td></tr>
      ${previousStatusRow}
      ${previousTimestampRow}
    </table>
    <p style="margin-top:20px; color:#666; font-size:12px;">
      Sent by Backend Monitoring System. Do not reply to this email.
    </p>
  `;

  await tx.sendMail({
    from: smtpConfig.from,
    to: recipients,
    subject,
    html,
  });

  logger.info(`Alert "${type}" sent to ${recipients.length} recipient(s).`);
};

module.exports = {
  createTransporter,
  getTransporter,
  sendAlert,
  escapeHtml,
  parseRecipients,
};
