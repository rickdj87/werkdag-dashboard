// Cloudflare Pages Function — generieke proxy voor externe services.
// Vervangt netlify/functions/proxy.js. Gebruikt context.env voor secrets
// (via `wrangler pages secret put`) en de globale fetch.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

export async function onRequestOptions() {
  return new Response('', { status: 200, headers: CORS_HEADERS });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const { service, payload } = body;

  try {
    // ─── Claude ────────────────────────────────────────────
    if (service === 'claude') {
      const key = env.ANTHROPIC_KEY || payload?.apiKey || '';
      if (!key) return json({ error: 'Geen Claude API key. Voeg ANTHROPIC_KEY toe als Pages secret.' }, 400);
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5',
          max_tokens: 1000,
          system: payload.system,
          messages: payload.messages,
        }),
      });
      return json(await res.json());
    }

    // ─── Microsoft Graph (agenda) ──────────────────────────
    if (service === 'graph') {
      const token = env.MS_TOKEN || payload?.token || '';
      if (!token) return json({ error: 'Geen Microsoft token. Gebruik de Token vernieuwen knop in het dashboard.' }, 400);
      const res = await fetch(payload.url, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Prefer': 'outlook.timezone="Europe/Amsterdam"',
        },
      });
      return json(await res.json());
    }

    // ─── Jira ──────────────────────────────────────────────
    if (service === 'jira') {
      const email = env.JIRA_EMAIL || payload?.email || '';
      const token = env.JIRA_TOKEN || payload?.token || '';
      if (!email || !token) return json({ error: 'Geen Jira credentials. Voeg JIRA_EMAIL en JIRA_TOKEN toe als Pages secrets.' }, 400);
      const auth = btoa(`${email}:${token}`);
      const res = await fetch(payload.url, {
        method: payload.method || 'GET',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: payload.body ? JSON.stringify(payload.body) : undefined,
      });
      return json(await res.json());
    }

    // ─── Slack ─────────────────────────────────────────────
    if (service === 'slack') {
      const token = env.SLACK_TOKEN || payload?.token || '';
      if (!token) return json({ error: 'Geen Slack token. Voeg SLACK_TOKEN toe als Pages secret.' }, 400);
      const method = payload.method || 'POST';
      const fetchOptions = {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      };
      if (method === 'POST' && payload.body) fetchOptions.body = JSON.stringify(payload.body);
      const res = await fetch(payload.url || 'https://slack.com/api/chat.postMessage', fetchOptions);
      return json(await res.json());
    }

    return json({ error: 'Onbekende service: ' + service }, 400);

  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS_HEADERS });
}
