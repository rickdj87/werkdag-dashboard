exports.handler = async function(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch(e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { service, payload } = body;

  try {
    // ─── Claude ──────────────────────────────────────────
    if (service === 'claude') {
      const key = process.env.ANTHROPIC_KEY || payload?.apiKey || '';
      if (!key) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Geen Claude API key. Voeg ANTHROPIC_KEY toe in Netlify environment variables.' }) };
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-sonnet-4-5', max_tokens: 1000, system: payload.system, messages: payload.messages }),
      });
      const data = await res.json();
      return { statusCode: 200, headers, body: JSON.stringify(data) };
    }

    // ─── Microsoft Graph ─────────────────────────────────
    if (service === 'graph') {
      const token = process.env.MS_TOKEN || payload?.token || '';
      if (!token) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Geen Microsoft token. Voeg MS_TOKEN toe in Netlify environment variables.' }) };
      const res = await fetch(payload.url, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Prefer': 'outlook.timezone="Europe/Amsterdam"' },
      });
      const data = await res.json();
      return { statusCode: 200, headers, body: JSON.stringify(data) };
    }

    // ─── Jira ─────────────────────────────────────────────
    if (service === 'jira') {
      const email = process.env.JIRA_EMAIL || payload?.email || '';
      const token = process.env.JIRA_TOKEN || payload?.token || '';
      if (!email || !token) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Geen Jira credentials. Voeg JIRA_EMAIL en JIRA_TOKEN toe in Netlify environment variables.' }) };
      const auth = Buffer.from(`${email}:${token}`).toString('base64');
      const res = await fetch(payload.url, {
        method: payload.method || 'GET',
        headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: payload.body ? JSON.stringify(payload.body) : undefined,
      });
      const data = await res.json();
      return { statusCode: 200, headers, body: JSON.stringify(data) };
    }

    // ─── Slack ────────────────────────────────────────────
    if (service === 'slack') {
      const token = process.env.SLACK_TOKEN || payload?.token || '';
      if (!token) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Geen Slack token. Voeg SLACK_TOKEN toe in Netlify environment variables.' }) };
      const res = await fetch(payload.url || 'https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload.body),
      });
      const data = await res.json();
      return { statusCode: 200, headers, body: JSON.stringify(data) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Onbekende service: ' + service }) };

  } catch(e) {
    console.error('[Proxy] Fout bij service', service, ':', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
