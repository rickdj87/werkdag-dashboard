// Cloudflare Worker met Cron Trigger — vervangt de Power Automate agenda-sync.
// Haalt elke 5 minuten de gepubliceerde Outlook ICS-agenda op, parseert de
// afspraken (inclusief terugkerende afspraken) en schrijft ze naar de
// agenda_events-tabel in D1 — dezelfde tabel die functions/api/storage.js
// gebruikt, dus de frontend hoeft niets te weten van deze wijziging.
//
// De ICS-link staat als secret (ICS_URL), nooit in code of git.

const DEFAULT_TZ = 'Europe/Amsterdam';
const WINDOW_BEFORE_MS = 1 * 86400000;   // 1 dag terug (voor lopende afspraken)
const WINDOW_AFTER_MS = 10 * 86400000;   // 10 dagen vooruit

export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(syncAgenda(env));
  },

  // Handmatig testen: elk verzoek triggert een sync en geeft alleen een
  // samenvatting terug (geen agenda-inhoud) — veilig om publiek te laten staan.
  async fetch(request, env) {
    try {
      const result = await syncAgenda(env);
      return Response.json(result);
    } catch (e) {
      return Response.json({ ok: false, error: e.message }, { status: 500 });
    }
  },
};

async function syncAgenda(env) {
  if (!env.ICS_URL) throw new Error('ICS_URL secret is niet ingesteld');

  const res = await fetch(env.ICS_URL);
  if (!res.ok) throw new Error(`ICS ophalen mislukt: ${res.status}`);
  const icsText = await res.text();

  const now = Date.now();
  const windowStart = now - WINDOW_BEFORE_MS;
  const windowEnd = now + WINDOW_AFTER_MS;

  const events = parseIcs(icsText, windowStart, windowEnd)
    .sort((a, b) => a.startMs - b.startMs)
    .slice(0, 150); // veiligheidsgrens

  await writeAgendaEvents(env.DB, events);

  return { ok: true, count: events.length, updatedAt: new Date(now).toISOString() };
}

// ─── D1 schrijven (zelfde vorm als functions/api/storage.js) ───────

async function writeAgendaEvents(db, events) {
  const stmts = [db.prepare('DELETE FROM agenda_events')];
  for (const e of events) {
    stmts.push(db.prepare(
      'INSERT INTO agenda_events (subject, start, end, location, join_url) VALUES (?, ?, ?, ?, ?)'
    ).bind(
      e.subject || '(geen titel)',
      new Date(e.startMs).toISOString(),
      new Date(e.endMs).toISOString(),
      e.location || '',
      e.joinUrl || null,
    ));
  }
  await db.batch(stmts);

  await db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).bind('agenda_meta', JSON.stringify({
    updatedAt: new Date().toISOString(),
    date: new Date().toLocaleDateString('nl-NL'),
  })).run();
}

// ─── ICS parsen ──────────────────────────────────────────────────

function parseIcs(text, windowStart, windowEnd) {
  const lines = unfoldLines(text);
  const veventBlocks = [];
  let current = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { current = []; continue; }
    if (line === 'END:VEVENT') { if (current) veventBlocks.push(current); current = null; continue; }
    if (current) current.push(line);
  }

  const results = [];
  for (const block of veventBlocks) {
    try {
      results.push(...parseVevent(block, windowStart, windowEnd));
    } catch (e) {
      // Eén kapotte afspraak mag de rest niet blokkeren.
      console.error('[agenda-sync] kon VEVENT niet parsen:', e.message);
    }
  }
  return results;
}

function unfoldLines(text) {
  const raw = text.split(/\r\n|\n|\r/);
  const out = [];
  for (const line of raw) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

function parseLine(line) {
  const colonIdx = line.indexOf(':');
  if (colonIdx === -1) return null;
  const left = line.slice(0, colonIdx);
  const value = line.slice(colonIdx + 1);
  const [name, ...paramParts] = left.split(';');
  const params = {};
  for (const p of paramParts) {
    const eq = p.indexOf('=');
    if (eq !== -1) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1);
  }
  return { name: name.toUpperCase(), params, value };
}

function unescapeText(s) {
  return (s || '').replace(/\\n/gi, ' ').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
}

function parseVevent(rawLines, windowStart, windowEnd) {
  const fields = rawLines.map(parseLine).filter(Boolean);
  const get = name => fields.find(f => f.name === name) || null;
  const getAll = name => fields.filter(f => f.name === name);

  const summary = unescapeText(get('SUMMARY')?.value);
  const location = unescapeText(get('LOCATION')?.value);
  const dtstartField = get('DTSTART');
  const dtendField = get('DTEND');
  const rruleField = get('RRULE');
  const joinUrl = extractJoinUrl(get('DESCRIPTION')?.value, get('X-MICROSOFT-SKYPETEAMSMEETINGURL')?.value);

  const dtstart = parseIcsDate(dtstartField);
  if (!dtstart) return [];
  const dtend = parseIcsDate(dtendField);
  const durationMs = dtend ? (dtend.ms - dtstart.ms) : 30 * 60000;

  const base = { subject: summary, location, joinUrl };

  if (!rruleField) {
    if (dtstart.ms >= windowStart && dtstart.ms <= windowEnd) {
      return [{ ...base, startMs: dtstart.ms, endMs: dtstart.ms + durationMs }];
    }
    return [];
  }

  const exdates = new Set();
  for (const f of getAll('EXDATE')) {
    for (const part of f.value.split(',')) {
      const d = parseIcsDate({ params: f.params, value: part });
      if (d) exdates.add(dayKey(d.ms));
    }
  }

  const occurrences = expandRecurrence(dtstart.ms, rruleField.value, exdates, windowStart, windowEnd);
  return occurrences.map(ms => ({ ...base, startMs: ms, endMs: ms + durationMs }));
}

function extractJoinUrl(description, teamsUrl) {
  if (teamsUrl) return teamsUrl;
  if (!description) return null;
  const m = unescapeText(description).match(/https?:\/\/teams\.microsoft\.com\/[^\s>]+/i);
  return m ? m[0] : null;
}

function dayKey(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
}

// ─── Datum/tijd parsing (met tijdzone-conversie) ────────────────

function parseIcsDate(field) {
  if (!field) return null;
  const { params, value } = field;
  const v = value.trim();

  if (params.VALUE === 'DATE' || /^\d{8}$/.test(v)) {
    const y = +v.slice(0, 4), mo = +v.slice(4, 6), d = +v.slice(6, 8);
    return { ms: zonedTimeToUtc(y, mo, d, 0, 0, 0, DEFAULT_TZ), allDay: true };
  }

  const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (z) return { ms: Date.UTC(+y, +mo - 1, +d, +h, +mi, +s), allDay: false };

  const tz = resolveTimeZone(params.TZID);
  return { ms: zonedTimeToUtc(+y, +mo, +d, +h, +mi, +s, tz), allDay: false };
}

// Exchange/Outlook publiceert ICS-feeds met Microsoft's eigen Windows-
// tijdzonenamen (bv. "W. Europe Standard Time") in plaats van IANA-namen
// (bv. "Europe/Amsterdam") — Intl herkent die niet. Val terug op een kleine
// vertaaltabel voor de meest voorkomende, en anders op DEFAULT_TZ.
const WINDOWS_TZ_MAP = {
  'W. Europe Standard Time': 'Europe/Amsterdam',
  'Central Europe Standard Time': 'Europe/Berlin',
  'Central European Standard Time': 'Europe/Warsaw',
  'Romance Standard Time': 'Europe/Paris',
  'GMT Standard Time': 'Europe/London',
  'UTC': 'UTC',
};

function resolveTimeZone(tzid) {
  if (!tzid) return DEFAULT_TZ;
  const clean = tzid.replace(/^"|"$/g, '');
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: clean });
    return clean; // geldige IANA-naam, direct gebruiken
  } catch (e) {
    return WINDOWS_TZ_MAP[clean] || DEFAULT_TZ;
  }
}

// Rekent een "wandkloktijd" (jaar/maand/dag/uur/minuut/sec) in een gegeven
// tijdzone om naar een UTC-tijdstip, met behulp van Intl (geen externe
// tijdzone-library nodig). Kan in de zeldzame overlap/gat-uur van een
// DST-overgang een uur afwijken — acceptabel voor een agenda-weergave.
function zonedTimeToUtc(y, mo, d, h, mi, s, timeZone) {
  const guessUtcMs = Date.UTC(y, mo - 1, d, h, mi, s);
  const offsetMinutes = getTimeZoneOffsetMinutes(guessUtcMs, timeZone);
  return guessUtcMs - offsetMinutes * 60000;
}

function getTimeZoneOffsetMinutes(utcMs, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts = dtf.formatToParts(new Date(utcMs));
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  const asIfUtc = Date.UTC(+map.year, +map.month - 1, +map.day, +map.hour, +map.minute, +map.second);
  return (asIfUtc - utcMs) / 60000;
}

// ─── RRULE-expansie ──────────────────────────────────────────────
// Ondersteunt de veelvoorkomende gevallen voor werkagenda's: FREQ=DAILY/
// WEEKLY/MONTHLY met INTERVAL, COUNT, UNTIL en BYDAY (zonder ordinal, bv.
// "2MO"). Dit is bewust geen volledige RFC5545-implementatie — alleen wat
// nodig is om terugkerende afspraken binnen het weergavevenster te tonen.

const DAY_CODE = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

function expandRecurrence(startMs, rruleStr, exdates, windowStart, windowEnd) {
  const rule = {};
  for (const part of rruleStr.split(';')) {
    const [k, v] = part.split('=');
    if (k) rule[k.toUpperCase()] = v;
  }

  const freq = rule.FREQ;
  const interval = Math.max(1, parseInt(rule.INTERVAL || '1', 10));
  const count = rule.COUNT ? parseInt(rule.COUNT, 10) : null;
  const until = rule.UNTIL ? (parseIcsDate({ params: {}, value: rule.UNTIL })?.ms ?? null) : null;
  const byday = rule.BYDAY
    ? rule.BYDAY.split(',').map(s => DAY_CODE[s.replace(/^[+-]?\d+/, '')]).filter(n => n !== undefined)
    : null;

  const start = new Date(startMs);
  const timeMs = { h: start.getUTCHours(), mi: start.getUTCMinutes(), s: start.getUTCSeconds() };
  const out = [];

  const withinLimit = (occurrenceMs, indexFromStart) => {
    if (until !== null && occurrenceMs > until) return false;
    if (count !== null && indexFromStart >= count) return false;
    return true;
  };

  if (freq === 'DAILY') {
    const stepMs = interval * 86400000;
    let idx = 0;
    for (let ms = startMs; ms <= windowEnd; ms += stepMs, idx++) {
      if (!withinLimit(ms, idx)) break;
      if (ms >= windowStart && !exdates.has(dayKey(ms))) out.push(ms);
    }
  } else if (freq === 'WEEKLY' && byday && byday.length) {
    // Loop dag voor dag door het venster; controleer weekday + week-interval.
    const startWeekStamp = mondayStampUTC(startMs);
    const from = Math.min(startMs, windowStart);
    for (let ms = startOfDayUTC(from); ms <= windowEnd; ms += 86400000) {
      if (ms < startMs) continue;
      const d = new Date(ms);
      if (!byday.includes(d.getUTCDay())) continue;
      const weeksSinceStart = Math.round((mondayStampUTC(ms) - startWeekStamp) / (7 * 86400000));
      if (weeksSinceStart % interval !== 0) continue;
      const occurrenceMs = ms - startOfDayUTC(startMs) + startMs; // zelfde tijdstip-op-de-dag als DTSTART
      const idx = weeksSinceStart; // benadering voor COUNT
      if (!withinLimit(occurrenceMs, idx)) continue;
      if (occurrenceMs >= windowStart && occurrenceMs <= windowEnd && !exdates.has(dayKey(occurrenceMs))) {
        out.push(occurrenceMs);
      }
    }
  } else if (freq === 'WEEKLY') {
    const stepMs = interval * 7 * 86400000;
    let idx = 0;
    for (let ms = startMs; ms <= windowEnd; ms += stepMs, idx++) {
      if (!withinLimit(ms, idx)) break;
      if (ms >= windowStart && !exdates.has(dayKey(ms))) out.push(ms);
    }
  } else if (freq === 'MONTHLY') {
    let idx = 0;
    let cursor = new Date(startMs);
    while (true) {
      const ms = Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate(),
        timeMs.h, timeMs.mi, timeMs.s);
      if (ms > windowEnd) break;
      if (!withinLimit(ms, idx)) break;
      if (ms >= windowStart && !exdates.has(dayKey(ms))) out.push(ms);
      cursor.setUTCMonth(cursor.getUTCMonth() + interval);
      idx++;
      if (idx > 60) break; // veiligheidsgrens
    }
  } else {
    // Onbekende/ongebruikelijke FREQ (bv. YEARLY): toon alleen de eerste
    // gebeurtenis als die in het venster valt, geen volledige expansie.
    if (startMs >= windowStart && startMs <= windowEnd) out.push(startMs);
  }

  return out;
}

function startOfDayUTC(ms) {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function mondayStampUTC(ms) {
  const day = startOfDayUTC(ms);
  const weekday = new Date(day).getUTCDay(); // 0=zo
  const diffToMonday = (weekday + 6) % 7;
  return day - diffToMonday * 86400000;
}
