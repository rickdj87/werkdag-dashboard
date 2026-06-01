// Storage function die GitHub gebruikt als database
// Slaat data op als JSON bestanden in de GitHub repository

const OWNER = 'rickdj87';
const REPO = 'werkdag-dashboard';
const DATA_PATH = 'data';

async function githubGet(token, path) {
  const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${DATA_PATH}/${path}`, {
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'Werkdag-Dashboard',
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub get fout: ${res.status}`);
  const data = await res.json();
  return JSON.parse(Buffer.from(data.content, 'base64').toString('utf8'));
}

async function githubSet(token, path, value) {
  // Haal huidige SHA op
  let sha = null;
  try {
    const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${DATA_PATH}/${path}`, {
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'Werkdag-Dashboard',
      },
    });
    if (res.ok) {
      const data = await res.json();
      sha = data.sha;
    }
  } catch(e) {}

  const content = Buffer.from(JSON.stringify(value, null, 2)).toString('base64');
  const body = {
    message: `Update ${path}`,
    content,
  };
  if (sha) body.sha = sha;

  const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${DATA_PATH}/${path}`, {
    method: 'PUT',
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'Werkdag-Dashboard',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`GitHub set fout: ${res.status} - ${err.message}`);
  }
  return true;
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

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'GITHUB_TOKEN niet ingesteld' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch(e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { action, key, value } = body;

  try {
    // ─── Power Automate agenda ────────────────────────────
    if (action === 'set_agenda') {
      let events = body.events;
      if (typeof events === 'string') {
        try { events = JSON.parse(events); } catch(e) {}
      }
      if (!events) return { statusCode: 400, headers, body: JSON.stringify({ error: 'events verplicht' }) };

      await githubSet(token, 'agenda.json', {
        events,
        updatedAt: new Date().toISOString(),
        date: new Date().toLocaleDateString('nl-NL'),
      });

      console.log(`[Storage] Agenda bijgewerkt: ${Array.isArray(events) ? events.length : '?'} afspraken`);
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, count: Array.isArray(events) ? events.length : 0 }) };
    }

    if (action === 'get_agenda') {
      const data = await githubGet(token, 'agenda.json');
      return { statusCode: 200, headers, body: JSON.stringify({ value: data }) };
    }

    if (action === 'get') {
      const data = await githubGet(token, key + '.json');
      return { statusCode: 200, headers, body: JSON.stringify({ value: data }) };
    }

    if (action === 'set') {
      await githubSet(token, key + '.json', value);
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    if (action === 'getAll') {
      const keys = ['todos', 'projects', 'hidden_projects', 'user_settings', 'agenda'];
      const results = await Promise.allSettled(
        keys.map(k => githubGet(token, k + '.json'))
      );
      const data = {};
      keys.forEach((k, i) => {
        if (results[i].status === 'fulfilled') data[k] = results[i].value;
      });
      return { statusCode: 200, headers, body: JSON.stringify(data) };
    }

    if (action === 'setAll') {
      const { data } = body;
      await Promise.allSettled(
        Object.entries(data).map(([k, v]) => githubSet(token, k + '.json', v))
      );
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Onbekende actie: ' + action }) };

  } catch(e) {
    console.error('[Storage] Fout:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
