// Cloudflare Pages Function — opslag op Cloudflare D1.
// Vervangt netlify/functions/storage.js (die GitHub JSON-bestanden gebruikte).
// Zelfde actie-namen en payload-vormen als voorheen, zodat de frontend
// (cloudGet/cloudSet/cloudGetAll/cloudSetAll in public/js/app.js) ongewijzigd
// kan blijven. Power Automate gebruikt de actie `set_agenda` om de agenda
// direct in D1 te zetten (in plaats van een commit op data/agenda.json).

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

// Tabellen die als "volledige lijst" worden opgeslagen: bij elke set()
// wordt de tabel leeggemaakt en opnieuw gevuld — zelfde gedrag als de oude
// GitHub-opslag, die het hele JSON-bestand overschreef.
const TODO_COLUMNS = ['text', 'done', 'priority', 'date'];
const PROJECT_COLUMNS = ['name', 'pct', 'status', 'deadline', 'color', 'subtasks'];

export async function onRequestOptions() {
  return new Response('', { status: 200, headers: CORS_HEADERS });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const db = env.DB;

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const { action, key, value } = body;

  try {
    if (action === 'set_agenda') {
      let events = body.events;
      if (typeof events === 'string') {
        try { events = JSON.parse(events); } catch (e) { /* laat validatie hieronder afhandelen */ }
      }
      if (!events) return json({ error: 'events verplicht' }, 400);
      await setAgenda(db, events);
      return json({ success: true, count: Array.isArray(events) ? events.length : 0 });
    }

    if (action === 'get_agenda') {
      return json({ value: await getAgenda(db) });
    }

    if (action === 'get') {
      return json({ value: await getValue(db, key) });
    }

    if (action === 'set') {
      await setValue(db, key, value);
      return json({ success: true });
    }

    if (action === 'getAll') {
      const keys = ['todos', 'projects', 'hidden_projects', 'user_settings', 'agenda', 'bugs', 'hidden_modules'];
      const data = {};
      for (const k of keys) data[k] = await getValue(db, k);
      return json(data);
    }

    if (action === 'setAll') {
      for (const [k, v] of Object.entries(body.data || {})) await setValue(db, k, v);
      return json({ success: true });
    }

    return json({ error: 'Onbekende actie: ' + action }, 400);

  } catch (e) {
    console.error('[Storage] Fout:', e.message);
    return json({ error: e.message }, 500);
  }
}

// ─── Generieke get/set over tabellen + settings key-value ────

async function getValue(db, key) {
  if (key === 'todos') return getTodos(db);
  if (key === 'projects') return getProjects(db);
  if (key === 'notes') return getNotes(db);
  if (key === 'agenda') return getAgenda(db);
  return getSetting(db, key);
}

async function setValue(db, key, value) {
  if (key === 'todos') return setTodos(db, value || []);
  if (key === 'projects') return setProjects(db, value || []);
  if (key === 'notes') return setNotes(db, value || []);
  if (key === 'agenda') return setAgenda(db, value?.events || []);
  return setSetting(db, key, value);
}

// ─── Todos ─────────────────────────────────────────────────

async function getTodos(db) {
  const { results } = await db.prepare('SELECT text, done, priority, date FROM todos ORDER BY id').all();
  return results.map(r => ({ text: r.text, done: !!r.done, priority: r.priority, date: r.date }));
}

async function setTodos(db, todos) {
  const stmts = [db.prepare('DELETE FROM todos')];
  for (const t of todos) {
    stmts.push(db.prepare('INSERT INTO todos (text, done, priority, date) VALUES (?, ?, ?, ?)')
      .bind(t.text || '', t.done ? 1 : 0, t.priority ?? null, t.date ?? null));
  }
  await db.batch(stmts);
}

// ─── Projecten ─────────────────────────────────────────────

async function getProjects(db) {
  const { results } = await db.prepare('SELECT name, pct, status, deadline, color, subtasks FROM projects ORDER BY id').all();
  return results.map(r => ({
    name: r.name,
    pct: r.pct,
    status: r.status,
    deadline: r.deadline,
    color: r.color,
    subtasks: r.subtasks ? JSON.parse(r.subtasks) : [],
  }));
}

async function setProjects(db, projects) {
  const stmts = [db.prepare('DELETE FROM projects')];
  for (const p of projects) {
    stmts.push(db.prepare('INSERT INTO projects (name, pct, status, deadline, color, subtasks) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(p.name || '', p.pct ?? 0, p.status ?? null, p.deadline ?? null, p.color ?? null,
        p.subtasks ? JSON.stringify(p.subtasks) : null));
  }
  await db.batch(stmts);
}

// ─── Notities ──────────────────────────────────────────────

async function getNotes(db) {
  const { results } = await db.prepare('SELECT title, content, updated_at FROM notes ORDER BY id').all();
  return results.map(r => ({ title: r.title, content: r.content, updatedAt: r.updated_at }));
}

async function setNotes(db, notes) {
  const stmts = [db.prepare('DELETE FROM notes')];
  for (const n of notes) {
    stmts.push(db.prepare('INSERT INTO notes (title, content) VALUES (?, ?)')
      .bind(n.title ?? null, n.content ?? null));
  }
  await db.batch(stmts);
}

// ─── Instellingen / overige sleutels (key-value) ────────────

async function getSetting(db, key) {
  const row = await db.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first();
  if (!row) return null;
  try { return JSON.parse(row.value); } catch (e) { return null; }
}

async function setSetting(db, key, value) {
  await db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).bind(key, JSON.stringify(value ?? null)).run();
}

// ─── Agenda (Power Automate schrijft hier direct naartoe) ───

async function getAgenda(db) {
  const { results } = await db.prepare('SELECT subject, start, end, location, join_url FROM agenda_events ORDER BY start').all();
  if (results.length === 0) return null;
  const events = results.map(r => ({ subject: r.subject, start: r.start, end: r.end, location: r.location, joinUrl: r.join_url }));
  const meta = await getSetting(db, 'agenda_meta') || {};
  return { events, updatedAt: meta.updatedAt || null, date: meta.date || null };
}

async function setAgenda(db, events) {
  const stmts = [db.prepare('DELETE FROM agenda_events')];
  for (const e of events) {
    stmts.push(db.prepare('INSERT INTO agenda_events (subject, start, end, location, join_url) VALUES (?, ?, ?, ?, ?)')
      .bind(e.subject ?? null, e.start ?? null, e.end ?? null, e.location ?? null, e.joinUrl ?? null));
  }
  await db.batch(stmts);
  await setSetting(db, 'agenda_meta', {
    updatedAt: new Date().toISOString(),
    date: new Date().toLocaleDateString('nl-NL'),
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS_HEADERS });
}
