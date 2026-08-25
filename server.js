#!/usr/bin/env node
// Lokale ontwikkelserver — vervangt Netlify voor lokaal gebruik
// Gebruik: node server.js (of dubbelklik start-dashboard.command)

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { exec } = require('child_process');

const PORT = 8888;
const ROOT = __dirname;
const ENV_PATH = path.join(ROOT, '.env');

// ─── .env laden ───────────────────────────────────────────
function loadEnv() {
  if (!fs.existsSync(ENV_PATH)) return;
  fs.readFileSync(ENV_PATH, 'utf8').split('\n').forEach(line => {
    const [key, ...rest] = line.split('=');
    if (key && rest.length) process.env[key.trim()] = rest.join('=').trim();
  });
}
loadEnv();

// ─── Setup nodig? ─────────────────────────────────────────
function setupNodig() {
  return !process.env.ANTHROPIC_KEY && !process.env.JIRA_TOKEN && !process.env.SLACK_TOKEN;
}

// ─── MIME types ───────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
};

// ─── Helpers ──────────────────────────────────────────────
function jsonResponse(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => { try { resolve(JSON.parse(body)); } catch(e) { reject(e); } });
    req.on('error', reject);
  });
}

// ─── Lokale opslag ────────────────────────────────────────
const DATA_DIR = path.join(ROOT, 'data');

function localGet(key) {
  const fp = path.join(DATA_DIR, key + '.json');
  if (!fs.existsSync(fp)) return null;
  try { return JSON.parse(fs.readFileSync(fp, 'utf8')); } catch(e) { return null; }
}

function localSet(key, value) {
  fs.writeFileSync(path.join(DATA_DIR, key + '.json'), JSON.stringify(value, null, 2), 'utf8');
}

// ─── Setup pagina HTML ────────────────────────────────────
function setupHTML() {
  return `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Werkdag Dashboard — Instellen</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, sans-serif; background: #1a1a2e; color: #e0e0e0; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
  .card { background: #16213e; border-radius: 16px; padding: 40px; max-width: 560px; width: 100%; box-shadow: 0 20px 60px rgba(0,0,0,0.5); }
  h1 { font-size: 22px; margin-bottom: 6px; color: #fff; }
  .sub { color: #888; font-size: 14px; margin-bottom: 32px; line-height: 1.5; }
  .group { margin-bottom: 20px; }
  label { display: block; font-size: 13px; color: #aaa; margin-bottom: 6px; font-weight: 500; }
  label a { color: #5b8ef0; text-decoration: none; font-weight: normal; font-size: 12px; float: right; }
  label a:hover { text-decoration: underline; }
  input { width: 100%; padding: 10px 14px; background: #0f3460; border: 1px solid #2a4a7f; border-radius: 8px; color: #fff; font-size: 14px; font-family: monospace; }
  input:focus { outline: none; border-color: #5b8ef0; }
  input::placeholder { color: #456; }
  .hint { font-size: 12px; color: #666; margin-top: 5px; }
  .hint a { color: #5b8ef0; }
  button { width: 100%; padding: 14px; background: #5b8ef0; color: white; border: none; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer; margin-top: 12px; }
  button:hover { background: #4a7de0; }
  .success { display: none; background: #1a3a2a; border: 1px solid #2a6a4a; border-radius: 8px; padding: 16px; margin-top: 16px; color: #4caf87; font-size: 14px; line-height: 1.6; }
  .divider { border: none; border-top: 1px solid #2a3a5a; margin: 24px 0; }
  .section-title { font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #556; margin-bottom: 16px; }
</style>
</head>
<body>
<div class="card">
  <h1>⚙️ Werkdag Dashboard instellen</h1>
  <p class="sub">Vul hieronder je API keys in. Je haalt ze op via de links naast elk veld.<br>Ze worden veilig opgeslagen op jouw Mac — nergens anders.</p>

  <form id="form">
    <div class="section-title">Verplicht</div>

    <div class="group">
      <label>
        Anthropic (Claude) API key
        <a href="https://console.anthropic.com/settings/keys" target="_blank">→ Ophalen</a>
      </label>
      <input type="password" name="ANTHROPIC_KEY" placeholder="sk-ant-api03-..." autocomplete="off">
      <div class="hint">Log in op console.anthropic.com → API Keys → Create Key</div>
    </div>

    <div class="group">
      <label>
        Jira API token
        <a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank">→ Ophalen</a>
      </label>
      <input type="password" name="JIRA_TOKEN" placeholder="ATATT3x..." autocomplete="off">
      <div class="hint">Atlassian account → Security → API tokens → Create token</div>
    </div>

    <div class="group">
      <label>Jira e-mailadres</label>
      <input type="text" name="JIRA_EMAIL" value="Rick.de.Jong@topicus.nl">
    </div>

    <hr class="divider">
    <div class="section-title">Optioneel</div>

    <div class="group">
      <label>
        Slack Bot token
        <a href="https://api.slack.com/apps" target="_blank">→ Ophalen</a>
      </label>
      <input type="password" name="SLACK_TOKEN" placeholder="xoxb-..." autocomplete="off">
      <div class="hint">api.slack.com/apps → jouw app → OAuth & Permissions → Bot User OAuth Token</div>
    </div>

    <button type="submit">💾 Opslaan en dashboard openen</button>
  </form>

  <div class="success" id="success">
    ✅ Instellingen opgeslagen!<br>
    Je wordt doorgestuurd naar het dashboard…
  </div>
</div>

<script>
document.getElementById('form').addEventListener('submit', async e => {
  e.preventDefault();
  const data = {};
  new FormData(e.target).forEach((v, k) => { if (v.trim()) data[k] = v.trim(); });

  const res = await fetch('/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (res.ok) {
    document.getElementById('success').style.display = 'block';
    document.querySelector('button').disabled = true;
    setTimeout(() => window.location.href = '/', 1500);
  } else {
    alert('Er ging iets mis. Probeer opnieuw.');
  }
});
</script>
</body>
</html>`;
}

// ─── Handler: /setup ─────────────────────────────────────
async function handleSetup(req, res) {
  if (req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(setupHTML());
  }

  if (req.method === 'POST') {
    let body;
    try { body = await readBody(req); } catch(e) { return jsonResponse(res, 400, { error: 'Invalid JSON' }); }

    const lines = Object.entries(body).map(([k, v]) => `${k}=${v}`).join('\n');
    fs.writeFileSync(ENV_PATH, lines + '\n', 'utf8');
    loadEnv();
    return jsonResponse(res, 200, { success: true });
  }

  res.writeHead(405); res.end();
}

// ─── Handler: /.netlify/functions/proxy ──────────────────
async function handleProxy(req, res) {
  if (req.method === 'OPTIONS') return jsonResponse(res, 200, {});
  if (req.method !== 'POST') return jsonResponse(res, 405, { error: 'Method not allowed' });

  let body;
  try { body = await readBody(req); } catch(e) { return jsonResponse(res, 400, { error: 'Invalid JSON' }); }

  const { service, payload } = body;

  try {
    if (service === 'claude') {
      const key = process.env.ANTHROPIC_KEY || payload?.apiKey || '';
      if (!key) return jsonResponse(res, 400, { error: 'Geen Claude API key. Ga naar http://localhost:8888/setup' });
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-sonnet-4-5', max_tokens: 1000, system: payload.system, messages: payload.messages }),
      });
      return jsonResponse(res, 200, await r.json());
    }

    if (service === 'graph') {
      const token = process.env.MS_TOKEN || payload?.token || '';
      if (!token) return jsonResponse(res, 400, { error: 'Geen Microsoft token.' });
      const r = await fetch(payload.url, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Prefer': 'outlook.timezone="Europe/Amsterdam"' },
      });
      return jsonResponse(res, 200, await r.json());
    }

    if (service === 'jira') {
      const email = process.env.JIRA_EMAIL || payload?.email || '';
      const token = process.env.JIRA_TOKEN || payload?.token || '';
      if (!email || !token) return jsonResponse(res, 400, { error: 'Geen Jira credentials. Ga naar http://localhost:8888/setup' });
      const auth = Buffer.from(`${email}:${token}`).toString('base64');
      const r = await fetch(payload.url, {
        method: payload.method || 'GET',
        headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: payload.body ? JSON.stringify(payload.body) : undefined,
      });
      return jsonResponse(res, 200, await r.json());
    }

    if (service === 'slack') {
      const token = process.env.SLACK_TOKEN || payload?.token || '';
      if (!token) return jsonResponse(res, 400, { error: 'Geen Slack token. Ga naar http://localhost:8888/setup' });
      const method = payload.method || 'POST';
      const fetchOpts = { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } };
      if (method === 'POST' && payload.body) fetchOpts.body = JSON.stringify(payload.body);
      const r = await fetch(payload.url || 'https://slack.com/api/chat.postMessage', fetchOpts);
      return jsonResponse(res, 200, await r.json());
    }

    return jsonResponse(res, 400, { error: 'Onbekende service: ' + service });

  } catch(e) {
    console.error('[Proxy] Fout:', e.message);
    return jsonResponse(res, 500, { error: e.message });
  }
}

// ─── Handler: /.netlify/functions/storage ────────────────
async function handleStorage(req, res) {
  if (req.method === 'OPTIONS') return jsonResponse(res, 200, {});
  if (req.method !== 'POST') return jsonResponse(res, 405, { error: 'Method not allowed' });

  let body;
  try { body = await readBody(req); } catch(e) { return jsonResponse(res, 400, { error: 'Invalid JSON' }); }

  const { action, key, value } = body;

  try {
    if (action === 'get_agenda') return jsonResponse(res, 200, { value: localGet('agenda') });

    if (action === 'set_agenda') {
      let events = body.events;
      if (typeof events === 'string') { try { events = JSON.parse(events); } catch(e) {} }
      if (!events) return jsonResponse(res, 400, { error: 'events verplicht' });
      localSet('agenda', { events, updatedAt: new Date().toISOString(), date: new Date().toLocaleDateString('nl-NL') });
      return jsonResponse(res, 200, { success: true, count: Array.isArray(events) ? events.length : 0 });
    }

    if (action === 'get') return jsonResponse(res, 200, { value: localGet(key) });

    if (action === 'set') {
      localSet(key, value);
      return jsonResponse(res, 200, { success: true });
    }

    if (action === 'getAll') {
      const keys = ['todos', 'projects', 'hidden_projects', 'user_settings', 'agenda', 'bugs', 'hidden_modules'];
      const data = {};
      keys.forEach(k => { data[k] = localGet(k); });
      return jsonResponse(res, 200, data);
    }

    if (action === 'setAll') {
      Object.entries(body.data).forEach(([k, v]) => localSet(k, v));
      return jsonResponse(res, 200, { success: true });
    }

    return jsonResponse(res, 400, { error: 'Onbekende actie: ' + action });

  } catch(e) {
    console.error('[Storage] Fout:', e.message);
    return jsonResponse(res, 500, { error: e.message });
  }
}

// ─── Hoofd-router ─────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const { pathname } = url.parse(req.url);

  if (req.method === 'OPTIONS') {
    res.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS' });
    return res.end();
  }

  if (pathname === '/setup') return handleSetup(req, res);
  if (pathname === '/api/proxy' || pathname === '/.netlify/functions/proxy') return handleProxy(req, res);
  if (pathname === '/api/storage' || pathname === '/.netlify/functions/storage') return handleStorage(req, res);

  // Stuur door naar setup als er nog geen keys zijn
  if (pathname === '/' && setupNodig()) {
    res.writeHead(302, { Location: '/setup' });
    return res.end();
  }

  // Statische bestanden — komen uit public/ (zelfde output die naar Cloudflare Pages gaat)
  const PUBLIC_DIR = path.join(ROOT, 'public');
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('Forbidden'); }
  if (!fs.existsSync(filePath)) { res.writeHead(404); return res.end('Niet gevonden: ' + pathname); }

  const mime = MIME[path.extname(filePath)] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': mime });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, () => {
  const isSetup = setupNodig();
  const openUrl = `http://localhost:${PORT}${isSetup ? '/setup' : '/'}`;

  console.log('\n🟢 Werkdag Dashboard gestart');
  console.log(`   Open: ${openUrl}\n`);

  // Browser alleen openen als we niet vanuit Electron draaien
  if (!process.env.ELECTRON) exec(`open "${openUrl}"`);
});
