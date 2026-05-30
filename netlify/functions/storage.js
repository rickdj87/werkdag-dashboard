let getStore;
try {
  ({ getStore } = require('@netlify/blobs'));
} catch(e) {
  getStore = null;
}

exports.handler = async function(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  if (!getStore) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: '@netlify/blobs niet beschikbaar' }) };
  }

  let body;
  try {
    const raw = event.body;
    body = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch(e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON', raw: event.body?.slice(0, 100) }) };
  }

  const { action, key, value } = body;

  // Timeout wrapper — max 8 seconden
  const withTimeout = (promise, ms = 8000) => Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout na ' + ms + 'ms')), ms))
  ]);

  try {
    const store = getStore('werkdag-dashboard');

    if (action === 'set_agenda') {
      let events = body.events;
      if (typeof events === 'string') {
        try { events = JSON.parse(events); } catch(e) {}
      }
      if (!events) return { statusCode: 400, headers, body: JSON.stringify({ error: 'events verplicht' }) };

      await withTimeout(store.setJSON('agenda', {
        events,
        updatedAt: new Date().toISOString(),
        date: new Date().toLocaleDateString('nl-NL'),
      }));

      console.log(`[Storage] Agenda bijgewerkt: ${Array.isArray(events) ? events.length : '?'} afspraken`);
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, count: Array.isArray(events) ? events.length : 0 }) };
    }

    if (action === 'get_agenda') {
      const data = await withTimeout(store.get('agenda', { type: 'json' }).catch(() => null));
      return { statusCode: 200, headers, body: JSON.stringify({ value: data }) };
    }

    if (action === 'get') {
      const data = await withTimeout(store.get(key, { type: 'json' }).catch(() => null));
      return { statusCode: 200, headers, body: JSON.stringify({ value: data }) };
    }

    if (action === 'set') {
      await withTimeout(store.setJSON(key, value));
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    if (action === 'getAll') {
      const keys = ['todos', 'projects', 'hidden_projects', 'user_settings', 'agenda'];
      const results = await withTimeout(Promise.allSettled(
        keys.map(k => store.get(k, { type: 'json' }).catch(() => null))
      ));
      const data = {};
      keys.forEach((k, i) => {
        if (results[i].status === 'fulfilled') data[k] = results[i].value;
      });
      return { statusCode: 200, headers, body: JSON.stringify(data) };
    }

    if (action === 'setAll') {
      const { data } = body;
      await withTimeout(Promise.allSettled(
        Object.entries(data).map(([k, v]) => store.setJSON(k, v))
      ));
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Onbekende actie: ' + action }) };

  } catch(e) {
    console.error('[Storage] Fout:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
