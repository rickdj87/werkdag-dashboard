// Netlify Blobs storage function
// Vereist: @netlify/blobs package

let getStore;
try {
  ({ getStore } = require('@netlify/blobs'));
} catch(e) {
  // Package niet beschikbaar
  getStore = null;
}

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

  // Check of Netlify Blobs beschikbaar is
  if (!getStore) {
    return { statusCode: 500, headers, body: JSON.stringify({ 
      error: '@netlify/blobs niet beschikbaar. Voeg toe aan package.json.' 
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
      const keys = ['todos', 'projects', 'hidden_projects', 'user_settings'];
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
