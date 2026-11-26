const nodemailer = require('nodemailer');
const { createLogger } = require('../config/logger');
const EmailLog = require('../models/EmailLog');
const { isDbConnected } = require('../config/mongoose');

const logger = createLogger('email');

let transporter = null;
let transporterConfigHash = null;

const recordEmailEvent = async ({ target, eventType, alertType = '', status, recipientCount = 0, error = null, scanResultId = null }) => {
  if (!isDbConnected() || !target || !target.url) return;
  try {
    await EmailLog.create({
      targetId: target._id || null,
      scanResultId: scanResultId || null,
      targetUrl: target.url,
      targetName: target.name || '',
      eventType,
      alertType,
      status,
      recipientCount,
      error: error || null,
    });
  } catch (logError) {
    logger.warn(`Could not persist ${eventType} email log for ${target.url}: ${logError.message}`);
  }
};

// Safe debug helper: never prints passwords, secrets, or full SMTP credentials.
const debugSmtp = (label, smtpConfig) => {
  console.log(
    `[email-debug] ${label} | host=${smtpConfig.host} | port=${smtpConfig.port} | secure=${smtpConfig.secure} | user=${smtpConfig.user ? 'SET' : 'NOT_SET'} | pass=${smtpConfig.pass ? 'SET' : 'NOT_SET'} | from=${smtpConfig.from || 'NOT_SET'} | to=${smtpConfig.to || 'NOT_SET'}`
  );
};

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
  debugSmtp('createTransporter', smtpConfig);
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

  transporterConfigHash = JSON.stringify({
    host: smtpConfig.host,
    port: smtpConfig.port,
    secure: smtpConfig.secure,
    user: smtpConfig.user,
    from: smtpConfig.from,
    to: smtpConfig.to,
  });

  console.log(`[email-debug] Transporter created and cached (config hash set).`);
  return transporter;
};

const getTransporter = (smtpConfig) => {
  const currentHash = JSON.stringify({
    host: smtpConfig.host,
    port: smtpConfig.port,
    secure: smtpConfig.secure,
    user: smtpConfig.user,
    from: smtpConfig.from,
    to: smtpConfig.to,
  });

  if (!transporter) {
    console.log(`[email-debug] getTransporter: no cached transporter, creating new one.`);
    return createTransporter(smtpConfig);
  }

  if (currentHash !== transporterConfigHash) {
    console.log(
      `[email-debug] getTransporter: SMTP config changed since last creation; recreating transporter.`
    );
    return createTransporter(smtpConfig);
  }

  console.log(`[email-debug] getTransporter: reusing cached transporter.`);
  return transporter;
};

const sendAlert = async (smtpConfig, alert) => {
  const { type, target } = alert;
  console.log(
    `[email-debug] sendAlert START | type=${type} | target=${target.name || target.url} | url=${target.url}`
  );

  const recipients = parseRecipients(smtpConfig.to);
  console.log(
    `[email-debug] sendAlert | recipients parsed=${recipients.length} | from=${smtpConfig.from || 'NOT_SET'} | to=${smtpConfig.to || 'NOT_SET'}`
  );
  if (recipients.length === 0) {
    console.log(
      `[email-debug] sendAlert SKIPPED | no alertEmail configured for target ${target.name || target.url}. Down alert email not sent.`
    );
    logger.info(
      `Down alert email skipped for ${target.name || target.url}: no alertEmail configured.`
    );
    await recordEmailEvent({ target, eventType: 'alert', alertType: type, status: 'skipped', scanResultId: alert.scanResultId });
    return;
  }
  if (!smtpConfig.from) {
    console.error(
      '[email-debug] sendAlert FAILED | no alert sender configured. Set ALERT_FROM.'
    );
    const error = new Error('No alert sender configured. Set ALERT_FROM.');
    await recordEmailEvent({ target, eventType: 'alert', alertType: type, status: 'failed', recipientCount: recipients.length, error: error.message, scanResultId: alert.scanResultId });
    throw error;
  }

  const tx = getTransporter(smtpConfig);

  const { result, previousResult, consecutiveFailures } = alert;

  const targetLabel = escapeHtml(target.name || target.url);

  const subjectMap = {
    down: `[ALERT] Target DOWN: ${target.name || target.url}`,
    threshold: `[ALERT] Failure threshold reached: ${target.name || target.url}`,
    recovered: `[RECOVERED] Target back UP: ${target.name || target.url}`,
  };

      const subject = (
    subjectMap[type] || `[ALERT] ${target.name || target.url}`
  ).replace(/[\r]+/g, ' ');

  console.log(
    `[email-debug] sendAlert | subject="${subject}" | status=${result.status} | statusCode=${result.statusCode} | consecutiveFailures=${consecutiveFailures} | error=${result.error || 'None'}`
  );

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

  try {
    console.log(
      `[email-debug] sendAlert SEND | type=${type} | recipients=${recipients.length}`
    );
    await tx.sendMail({
      from: smtpConfig.from,
      to: recipients,
      subject,
      html,
    });
    await recordEmailEvent({ target, eventType: 'alert', alertType: type, status: 'sent', recipientCount: recipients.length, scanResultId: alert.scanResultId });
    console.log(
      `[email-debug] sendAlert SUCCESS | type=${type} | sent to ${recipients.length} recipient(s)`
    );
    logger.info(`Alert "${type}" sent to ${recipients.length} recipient(s).`);
  } catch (sendError) {
    await recordEmailEvent({ target, eventType: 'alert', alertType: type, status: 'failed', recipientCount: recipients.length, error: sendError.message, scanResultId: alert.scanResultId });
    console.error(
      `[email-debug] sendAlert FAILED | type=${type} | target=${target.name || target.url} | error=${sendError.message}`
    );
    logger.error(`Failed to send alert "${type}" for ${target.name || target.url}: ${sendError.message}`);
    throw sendError;
  }
};

const sendConfirmation = async (smtpConfig, toEmail, target) => {
  console.log(
    `[email-debug] sendConfirmation START | to=${toEmail} | target=${target.name || target.url} | url=${target.url}`
  );

  const recipients = parseRecipients(toEmail);
  console.log(
    `[email-debug] sendConfirmation | recipients parsed=${recipients.length} | from=${smtpConfig.from || 'NOT_SET'}`
  );
  if (recipients.length === 0) {
    console.log(
      `[email-debug] sendConfirmation SKIPPED | no alertEmail configured for target ${target.name || target.url}. Confirmation email not sent.`
    );
    logger.info(
      `Confirmation email skipped for ${target.name || target.url}: no alertEmail configured.`
    );
    await recordEmailEvent({ target, eventType: 'confirmation', status: 'skipped' });
    return;
  }
  if (!smtpConfig.from) {
    console.error(
      '[email-debug] sendConfirmation FAILED | no alert sender configured. Set ALERT_FROM.'
    );
    const error = new Error('No alert sender configured. Set ALERT_FROM.');
    await recordEmailEvent({ target, eventType: 'confirmation', status: 'failed', recipientCount: recipients.length, error: error.message });
    throw error;
  }

  const tx = getTransporter(smtpConfig);
  const targetLabel = escapeHtml(target.name || target.url);

  const subject = `[Confirmation] Uptime monitoring added: ${target.name || target.url}`;

  console.log(
    `[email-debug] sendConfirmation | subject="${subject}" | frequency=${target.frequency || 'Daily'} | scheduleTime=${target.scheduleTime || '00:00'}`
  );

  const html = `
    <h2>${escapeHtml(subject)}</h2>
    <table border="0" cellpadding="6" cellspacing="0" style="border-collapse:collapse; font-family: Arial, sans-serif; font-size: 14px;">
      <tr><td style="font-weight:bold;">Target</td><td>${targetLabel}</td></tr>
      <tr><td style="font-weight:bold;">URL</td><td>${renderUrl(target.url)}</td></tr>
      <tr><td style="font-weight:bold;">Frequency</td><td>${escapeHtml(target.frequency || 'Daily')}</td></tr>
      <tr><td style="font-weight:bold;">Schedule Time</td><td>${escapeHtml(target.scheduleTime || '00:00')}</td></tr>
      <tr><td style="font-weight:bold;">Alert Email</td><td>${escapeHtml(toEmail)}</td></tr>
      <tr><td style="font-weight:bold;">Status</td><td>Active</td></tr>
      <tr><td style="font-weight:bold;">Timestamp</td><td>${escapeHtml(new Date().toISOString())}</td></tr>
    </table>
    <p style="margin-top:20px; color:#666; font-size:12px;">
      You have been added to uptime monitoring. You will receive alerts when this site goes down or recovers.
    </p>
  `;

  try {
    console.log(
      `[email-debug] sendConfirmation SEND | recipients=${recipients.length}`
    );
    await tx.sendMail({
      from: smtpConfig.from,
      to: recipients,
      subject,
      html,
    });
    await recordEmailEvent({ target, eventType: 'confirmation', status: 'sent', recipientCount: recipients.length });
    console.log(
      `[email-debug] sendConfirmation SUCCESS | sent to ${recipients.length} recipient(s) for ${target.name || target.url}`
    );
    logger.info(`Confirmation email sent to ${recipients.length} recipient(s) for ${target.name || target.url}.`);
  } catch (sendError) {
    await recordEmailEvent({ target, eventType: 'confirmation', status: 'failed', recipientCount: recipients.length, error: sendError.message });
    console.error(
      `[email-debug] sendConfirmation FAILED | target=${target.name || target.url} | error=${sendError.message}`
    );
    logger.error(`Confirmation email failed for ${target.name || target.url}: ${sendError.message}`);
    throw sendError;
  }
};

module.exports = {
  createTransporter,
  getTransporter,
  sendAlert,
  sendConfirmation,
  escapeHtml,
  parseRecipients,
  recordEmailEvent,
};
