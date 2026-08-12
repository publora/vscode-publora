'use strict';

/* Publora for VS Code.
   Sends the selected text, or the whole file, to Publora as a scheduled post
   or a draft. Talks to one host only: https://api.publora.com */

const vscode = require('vscode');
const https = require('https');

const HOST = 'api.publora.com';
const BASE_PATH = '/api/v1';
const KEYS_URL = 'https://app.publora.com/dashboard/api?utm_source=vscode&utm_medium=extension';

/* Networks that reject a post without an image or video. */
const MEDIA_REQUIRED = ['instagram', 'tiktok', 'youtube'];

/* -------------------------------- API -------------------------------- */

function apiKey() {
  return (vscode.workspace.getConfiguration('publora').get('apiKey') || '').trim();
}

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;

    const req = https.request(
      {
        host: HOST,
        path: BASE_PATH + path,
        method,
        headers: Object.assign(
          {
            'x-publora-key': apiKey(),
            'User-Agent': 'vscode-publora/1.0.0',
          },
          payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {},
        ),
        timeout: 30000,
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          if (res.statusCode === 401) {
            return reject(new Error('Publora rejected the API key. Check it in the extension settings.'));
          }
          if (res.statusCode === 429) {
            return reject(new Error('Publora rate limit reached. Try again in a moment.'));
          }
          if (res.statusCode >= 400) {
            return reject(new Error(describe(res.statusCode, raw)));
          }
          try {
            resolve(raw ? JSON.parse(raw) : {});
          } catch (error) {
            resolve({ raw });
          }
        });
      },
    );

    req.on('timeout', () => req.destroy(new Error('Publora did not answer in time.')));
    req.on('error', (error) => reject(new Error('Could not reach Publora: ' + error.message)));
    if (payload) req.write(payload);
    req.end();
  });
}

/** Show the API's own message rather than a bare status code. */
function describe(status, raw) {
  let detail = String(raw || '').slice(0, 300);
  try {
    const body = JSON.parse(raw);
    detail = body.error || body.message || detail;
  } catch (error) {
    // not JSON; the trimmed body above is the best we have
  }
  return 'Publora error ' + status + ': ' + detail;
}

async function requireKey() {
  if (apiKey()) return true;

  const action = await vscode.window.showWarningMessage(
    'Publora needs an API key before it can post.',
    'Open settings',
    'Where do I get one?',
  );
  if (action === 'Open settings') {
    vscode.commands.executeCommand('workbench.action.openSettings', 'publora.apiKey');
  }
  if (action === 'Where do I get one?') {
    vscode.env.openExternal(vscode.Uri.parse(KEYS_URL));
  }
  return false;
}

/* ------------------------------- flow -------------------------------- */

async function pickChannels() {
  const data = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Publora: loading your accounts…' },
    () => request('GET', '/platform-connections'),
  );

  const connections = Array.isArray(data) ? data : (data.connections || []);
  if (!connections.length) {
    vscode.window.showWarningMessage('No connected accounts yet. Connect one in the Publora dashboard first.');
    return null;
  }

  const picked = await vscode.window.showQuickPick(
    connections
      .filter((connection) => connection.platformId)
      .map((connection) => ({
        label: connection.username || connection.displayName || connection.platformId,
        description: connection.platformId.split('-')[0],
        id: connection.platformId,
      })),
    { canPickMany: true, title: 'Publora: where should this go?' },
  );

  if (!picked || !picked.length) return null;
  return picked.map((item) => item.id);
}

async function askTime() {
  const choice = await vscode.window.showQuickPick(
    [
      { label: 'Save as draft', detail: 'Nothing is published. Review it in the Publora dashboard.' },
      { label: 'Schedule for a time', detail: 'Enter a date and time in UTC.' },
    ],
    { title: 'Publora: draft or scheduled?' },
  );

  if (!choice) return undefined;
  if (choice.label === 'Save as draft') return null;

  const value = await vscode.window.showInputBox({
    title: 'Publora: when should it go out?',
    prompt: 'ISO 8601 in UTC, for example 2026-09-01T12:00:00Z',
    placeHolder: '2026-09-01T12:00:00Z',
    validateInput: (input) => (Number.isNaN(Date.parse(input)) ? 'That is not a date I can read.' : undefined),
  });

  return value ? new Date(value).toISOString() : undefined;
}

async function send(text) {
  if (!text.trim()) {
    vscode.window.showWarningMessage('There is nothing to send.');
    return;
  }
  if (!(await requireKey())) return;

  try {
    const platforms = await pickChannels();
    if (!platforms) return;

    const needsMedia = platforms.filter((id) => MEDIA_REQUIRED.some((p) => id.startsWith(p)));
    if (needsMedia.length) {
      vscode.window.showWarningMessage(
        needsMedia.join(', ') + ' need an image or video, which this version does not send. Attach it in the dashboard.',
      );
    }

    const scheduledTime = await askTime();
    if (scheduledTime === undefined) return;

    const payload = { content: text.trim(), platforms };
    if (scheduledTime) payload.scheduledTime = scheduledTime;

    const result = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Publora: sending…' },
      () => request('POST', '/create-post', payload),
    );

    const id = (result && (result.postGroupId || result.id)) || '';
    const message = scheduledTime
      ? 'Publora: scheduled on ' + platforms.length + ' channel(s). ' + id
      : 'Publora: draft saved. ' + id;

    const action = await vscode.window.showInformationMessage(message, 'Open dashboard');
    if (action === 'Open dashboard') {
      vscode.env.openExternal(vscode.Uri.parse('https://app.publora.com?utm_source=vscode&utm_medium=extension'));
    }
  } catch (error) {
    vscode.window.showErrorMessage(error.message);
  }
}

/* ------------------------------ commands ----------------------------- */

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('publora.sendSelection', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return vscode.window.showWarningMessage('Open a file first.');
      const selection = editor.document.getText(editor.selection);
      await send(selection || editor.document.getText());
    }),

    vscode.commands.registerCommand('publora.sendFile', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return vscode.window.showWarningMessage('Open a file first.');
      await send(editor.document.getText());
    }),
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
