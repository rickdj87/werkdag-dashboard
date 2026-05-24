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

  let body;
  try {
    body = JSON.parse(event.body);
  } catch(e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { action, key, value } = body;

  try {
    const store = getStore('werkdag-dashboard');

    // ─── Power Automate endpoint ──────────────────────────
    // Power Automate stuurt agenda data via action: 'set_agenda'
    if (action === 'set_agenda') {
      const { events } = body;
      if (!events) return { statusCode: 400, headers, body: JSON.stringify({ error: 'events verplicht' }) };

      // Sla agenda op met timestamp
      await store.setJSON('agenda', {
        events,
        updatedAt: new Date().toISOString(),
        date: new Date().toLocaleDateString('nl-NL'),
      });

      console.log(`[Storage] Agenda bijgewerkt: ${events.length} afspraken`);
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, count: events.length }) };
    }

    // ─── Get agenda (door dashboard) ─────────────────────
    if (action === 'get_agenda') {
      const data = await store.get('agenda', { type: 'json' }).catch(() => null);
      return { statusCode: 200, headers, body: JSON.stringify({ value: data }) };
    }

    // ─── Standaard get/set/getAll ─────────────────────────
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
