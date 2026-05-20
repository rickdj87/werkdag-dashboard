const { getStore } = require('@netlify/blobs');

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

  const { action, key, value } = body;

  try {
    const store = getStore({
      name: 'werkdag-dashboard',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN || process.env.TOKEN,
    });

    if (action === 'get') {
      if (!key) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Key verplicht' }) };
      const data = await store.get(key, { type: 'json' });
      return { statusCode: 200, headers, body: JSON.stringify({ value: data }) };
    }

    if (action === 'set') {
      if (!key) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Key verplicht' }) };
      await store.setJSON(key, value);
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    if (action === 'delete') {
      if (!key) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Key verplicht' }) };
      await store.delete(key);
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    if (action === 'getAll') {
      // Haal alle werkdag data op in één keer
      const keys = ['todos', 'projects', 'hidden_projects', 'user_settings'];
      const results = await Promise.allSettled(
        keys.map(k => store.get(k, { type: 'json' }))
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
      // Sla meerdere keys op in één keer
      const { data } = body;
      if (!data) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Data verplicht' }) };
      await Promise.all(
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
