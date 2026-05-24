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
    return { statusCode: 500, headers, body: JSON.stringify({
      error: '@netlify/blobs niet beschikbaar'
    })};
  }

  // Robuuste JSON parsing — accepteert zowel string als object
  let body;
  try {
    const raw = event.body;
    if (typeof raw === 'string') {
      // Probeer direct te parsen
      try {
        body = JSON.parse(raw);
      } catch(e1) {
        // Power Automate stuurt soms dubbel ge-escaped JSON
        body = JSON.parse(JSON.parse(raw));
      }
    } else {
      body = raw;
    }
  } catch(e) {
    console.error('[Storage] JSON parse fout:', e.message, '| Raw:', event.body?.slice(0, 200));
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON', raw: event.body?.slice(0, 100) }) };
  }

  const { action, key, value } = body;

  try {
    const store = getStore('werkdag-dashboard');

    // ─── Power Automate agenda endpoint ──────────────────
    if (action === 'set_agenda') {
      let events = body.events;

      // Events kan een string zijn als Power Automate concat gebruikt
      if (typeof events === 'string') {
        try { events = JSON.parse(events); } catch(e) {}
      }

      if (!events) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'events verplicht' }) };
      }

      await store.setJSON('agenda', {
        events,
        updatedAt: new Date().toISOString(),
        date: new Date().toLocaleDateString('nl-NL'),
      });

      console.log(`[Storage] Agenda bijgewerkt: ${Array.isArray(events) ? events.length : '?'} afspraken`);
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, count: Array.isArray(events) ? events.length : 0 }) };
    }

    // ─── Get agenda ───────────────────────────────────────
    if (action === 'get_agenda') {
      const data = await store.get('agenda', { type: 'json' }).catch(() => null);
      return { statusCode: 200, headers, body: JSON.stringify({ value: data }) };
    }

    // ─── Standaard CRUD ───────────────────────────────────
    if (action === 'get') {
      const data = await store.get(key, { type: 'json' }).catch(() => null);
      return { statusCode: 200, headers, body: JSON.stringify({ value: data }) };
    }

    if (action === 'set') {
      await store.setJSON(key, value);
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    if (action === 'delete') {
      await store.delete(key);
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    if (action === 'getAll') {
      const keys = ['todos', 'projects', 'hidden_projects', 'user_settings', 'agenda'];
      const results = await Promise.allSettled(
        keys.map(k => store.get(k, { type: 'json' }).catch(() => null))
      );
      const data = {};
      keys.forEach((k, i) => {
        if (results[i].status === 'fulfilled') {
          data[k] = results[i].value;
        }
      });
      return { statusCode: 200, headers, body: JSON.stringify(data) };
    }

    if (action === 'setAll') {
      const { data } = body;
      await Promise.allSettled(
        Object.entries(data).map(([k, v]) => store.setJSON(k, v))
      );
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Onbekende actie: ' + action }) };

  } catch(e) {
    console.error('[Storage] Fout:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
