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
    // ─── Claude ────────────────────────────────────────────
    if (service === 'claude') {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': payload.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5',
          max_tokens: 1000,
          system: payload.system,
          messages: payload.messages,
        }),
      });
      const data = await res.json();
      return { statusCode: 200, headers, body: JSON.stringify(data) };
    }

    // ─── Microsoft Graph (agenda) ──────────────────────────
    if (service === 'graph') {
      const res = await fetch(payload.url, {
        headers: {
          Authorization: `Bearer ${payload.token}`,
          'Content-Type': 'application/json',
        },
      });
      const data = await res.json();
      return { statusCode: 200, headers, body: JSON.stringify(data) };
    }

    // ─── Jira ──────────────────────────────────────────────
    if (service === 'jira') {
      const auth = Buffer.from(`${payload.email}:${payload.token}`).toString('base64');
      const res = await fetch(payload.url, {
        method: payload.method || 'GET',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: payload.body ? JSON.stringify(payload.body) : undefined,
      });
      const data = await res.json();
      return { statusCode: 200, headers, body: JSON.stringify(data) };
    }

    // ─── Slack ─────────────────────────────────────────────
    if (service === 'slack') {
      const res = await fetch(payload.url || 'https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${payload.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload.body),
      });
      const data = await res.json();
      return { statusCode: 200, headers, body: JSON.stringify(data) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Onbekende service: ' + service }) };

  } catch(e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
