
// ═══ MODULE BEHEER ═══════════════════════════════════════
const MODULES = [
  { id: 'module-braindump',    name: 'Brain dump',          icon: '🧠', desc: 'Ochtend brain dump — verwerk gedachten naar to-do' },
  { id: 'card-agenda',          name: 'Agenda',              icon: '📅', desc: 'Outlook agenda van vandaag en de rest van de week' },
  { id: 'card-projecten',       name: 'Lopende projecten',   icon: '📊', desc: 'Actieve projecten met voortgang en deadlines' },
  { id: 'card-bug-melden',      name: 'Bug melden',          icon: '🐛', desc: 'Snel een bug rapporteren via Slack' },
  { id: 'card-bug-tracker',     name: 'Bug tracker',         icon: '🔴', desc: 'Overzicht van open bugs per product' },
  { id: 'card-todo',            name: 'To-do',               icon: '✅', desc: 'Takenlijst met prioriteiten' },
  { id: 'card-focustimer',      name: 'Focustimer',          icon: '⏱', desc: 'Pomodoro timer voor gefocust werken' },
  { id: 'card-snelle-notities', name: 'Snelle notities',     icon: '📌', desc: 'Gekleurde sticky notes' },
  { id: 'card-weer',            name: 'Weer',                icon: '🌤', desc: 'Weerswidget voor Deventer' },
  { id: 'module-notities',      name: 'Dagelijkse notities', icon: '📝', desc: 'Aantekeningen per dag, navigeerbaar per datum' },
  { id: 'module-slack',         name: 'Slack kanalen',       icon: '💬', desc: 'Snelle toegang tot kanalen en ongelezen berichten' },
  { id: 'module-spotify',       name: 'Spotify',             icon: '🎵', desc: 'Muziekspeler en bediening vanuit het dashboard' },
  { id: 'module-claude',        name: 'Claude assistent',    icon: '🤖', desc: 'AI assistent met ParnasSys werkcontext' },
];

let hiddenModules = JSON.parse(localStorage.getItem('ps_hidden_modules') || '[]');

function applyModuleVisibility() {
  MODULES.forEach(m => {
    const el = document.getElementById(m.id);
    if (!el) return;
    const hide = hiddenModules.includes(m.id);
    if (m.id.startsWith('card-')) {
      // Individuele kaart: verberg de kaart zelf
      const card = el.querySelector('.card, .focus-card, .weather-card');
      if (card) card.style.display = hide ? 'none' : '';
      // Als alle kaarten in een grid verborgen zijn, verberg de rij
      updateGridVisibility();
    } else {
      el.style.display = hide ? 'none' : '';
    }
  });
}

function updateGridVisibility() {
  // Verberg lege grid-rijen automatisch
  document.querySelectorAll('.grid-main, .grid-bottom').forEach(grid => {
    const visibleCards = Array.from(grid.querySelectorAll('.card, .focus-card, .weather-card'))
      .filter(c => c.style.display !== 'none');
    grid.parentElement.style.display = visibleCards.length === 0 ? 'none' : '';
  });
}

function toggleModule(moduleId) {
  const idx = hiddenModules.indexOf(moduleId);
  if (idx === -1) hiddenModules.push(moduleId);
  else hiddenModules.splice(idx, 1);
  saveHiddenModules();
  applyModuleVisibility();
  renderModulesList();
}

function renderModulesList() {
  const list = document.getElementById('modules-list');
  if (!list) return;
  const visibleCount = MODULES.filter(m => !hiddenModules.includes(m.id)).length;
  const countEl = document.getElementById('modules-visible-count');
  if (countEl) countEl.textContent = visibleCount + ' van ' + MODULES.length + ' zichtbaar';
  const rows = MODULES.map(m => {
    const hidden = hiddenModules.includes(m.id);
    return '<div class="module-toggle-item" onclick="toggleModule(\'' + m.id + '\')">' +
      '<span class="module-toggle-icon">' + m.icon + '</span>' +
      '<div class="module-toggle-info">' +
        '<div class="module-toggle-name' + (hidden ? ' hidden-mod' : '') + '">' + m.name + '</div>' +
        '<div class="module-toggle-desc">' + (m.desc || '') + '</div>' +
      '</div>' +
      '<div class="module-toggle-switch ' + (hidden ? '' : 'on') + '"></div>' +
    '</div>';
  }).join('');
  list.innerHTML =
    '<div class="module-bulk-btns">' +
      '<button class="module-bulk-btn" onclick="setAllModules(true);event.stopPropagation()">Alles tonen</button>' +
      '<button class="module-bulk-btn" onclick="setAllModules(false);event.stopPropagation()">Alles verbergen</button>' +
    '</div>' +
    '<div class="module-toggle-grid">' + rows + '</div>';
}

function setAllModules(visible) {
  hiddenModules = visible ? [] : MODULES.map(m => m.id);
  saveHiddenModules();
  applyModuleVisibility();
  renderModulesList();
  notify(visible ? 'Alle modules zichtbaar' : 'Alle modules verborgen', 'info');
}

// ─── State ───────────────────────────────────────────────
let cfg = {};
const PROXY_URL = '/api/proxy';

async function callProxy(service, payload) {
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Verzoek duurde te lang (>10s)')), 10000)
  );
  const fetchPromise = fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ service, payload }),
  }).then(res => {
    if (!res.ok) throw new Error('Proxy fout: ' + res.status);
    return res.json();
  });
  return Promise.race([fetchPromise, timeoutPromise]);
}
let todos = JSON.parse(localStorage.getItem('ps_todos') || '[]');
let bugs = JSON.parse(localStorage.getItem('ps_bugs') || JSON.stringify([
  { id: 'PRO-001', title: 'Voortgangsbalk verkeerde weergave', status: 'Open', prio: 'Normaal', category: 'parro', jiraUrl: '', zendesk: '' },
  { id: 'SK-001', title: 'Voorbeeld Schoolkassa bug', status: 'Open', prio: 'Normaal', category: 'schoolkassa', jiraUrl: '', zendesk: '' }
]));
let projects = JSON.parse(localStorage.getItem('ps_projects') || '[]');
let chatHistory = [];
let hiddenProjects = JSON.parse(localStorage.getItem('ps_hidden_projects') || '[]');
let demoMode = false;

const SYSTEM_PROMPT = `Je bent een behulpzame AI-assistent voor een productspecialist bij ParnasSys, een Nederlands softwarebedrijf dat administratiesoftware maakt voor het primair onderwijs.

De gebruiker werkt met: Microsoft 365 agenda, Jira (bug tracking/sprints), Slack (#bugs-productie, #dev-parnassys, #releases), en dit dashboard.

Help met: user stories, acceptatiecriteria, sprintreviews, backlog refinement, bug rapportages, klantcommunicatie, Agile/Scrum. 
Antwoord altijd in het Nederlands. Wees direct en praktisch. Korte alinea's. Gebruik **vetgedrukte tekst** voor termen.`;

// ─── Setup ───────────────────────────────────────────────
// ═══ THEMA SYSTEEM ═══════════════════════════════════════
const THEMES = [
  { id: 'dark', name: 'Donker', bg: '#0E0E0C', bg2: '#1C1C19', accent: '#C8F55A', text: '#F0EDE6' },
  { id: 'light', name: 'Licht', bg: '#F5F4F0', bg2: '#FFFFFF', accent: '#1A6B3C', text: '#1A1916' },
  { id: 'notion', name: 'Notion', bg: '#FFFFFF', bg2: '#F7F6F3', accent: '#2F80ED', text: '#37352F' },
  { id: 'notion-dark', name: 'Notion Dark', bg: '#191919', bg2: '#2F2F2F', accent: '#529CCA', text: '#E8E8E6' },
  { id: 'ocean', name: 'Ocean', bg: '#0A1628', bg2: '#153055', accent: '#64B4FF', text: '#E8F4FF' },
  { id: 'forest', name: 'Forest', bg: '#0D1F0D', bg2: '#1A2E1A', accent: '#64C864', text: '#E8F5E8' },
  { id: 'sunset', name: 'Sunset', bg: '#1A0A0A', bg2: '#3A1818', accent: '#FF8C50', text: '#FFF0E8' },
  { id: 'nord', name: 'Nord', bg: '#2E3440', bg2: '#434C5E', accent: '#88C0D0', text: '#ECEFF4' },
  { id: 'rose', name: 'Rose', bg: '#1A0F14', bg2: '#3A2030', accent: '#FF96B4', text: '#FFF0F5' },
  { id: 'parnassys', name: 'ParnasSys', bg: '#FDF5F6', bg2: '#FFFFFF', accent: '#C8396B', text: '#2C1A20' },
  { id: 'parnassys-dark', name: 'ParnasSys Dark', bg: '#1A0D11', bg2: '#2A1520', accent: '#E85A8A', text: '#F5E8ED' },
  { id: 'redactioneel', name: 'Redactioneel', bg: '#0A0806', bg2: '#100E09', accent: '#D4813A', text: '#EDE8E0' },
];

const ACCENTS = [
  { name: 'Lime', color: '#C8F55A', text: '#0E0E0C' },
  { name: 'Blauw', color: '#6BA8FF', text: '#0E0E0C' },
  { name: 'Groen', color: '#5BDB8A', text: '#0E0E0C' },
  { name: 'Oranje', color: '#FFB84D', text: '#0E0E0C' },
  { name: 'Paars', color: '#C97FFF', text: '#0E0E0C' },
  { name: 'Rood', color: '#FF6B6B', text: '#0E0E0C' },
  { name: 'Roze', color: '#FF96B4', text: '#0E0E0C' },
  { name: 'Cyaan', color: '#64B4FF', text: '#0E0E0C' },
  { name: 'Mint', color: '#64C864', text: '#0E0E0C' },
  { name: 'Goud', color: '#FFD700', text: '#0E0E0C' },
];

function openThemeModal() {
  renderThemeSwatches();
  renderAccentDots();
  renderModulesList();
  document.getElementById('theme-modal').classList.add('open');
}

function closeThemeModal() {
  document.getElementById('theme-modal').classList.remove('open');
}

function renderThemeSwatches() {
  const grid = document.getElementById('theme-swatches');
  if (!grid) return;
  grid.innerHTML = THEMES.map(t => `
    <div class="theme-swatch ${selectedTheme === t.id ? 'active' : ''}" onclick="applyFullTheme('${t.id}')" title="${t.name}">
      <div class="theme-swatch-preview" style="background:${t.bg};">
        <div class="theme-swatch-bar" style="background:${t.bg2};"></div>
        <div class="theme-swatch-content">
          <div class="theme-swatch-line" style="background:${t.accent};width:70%;"></div>
          <div class="theme-swatch-line" style="background:${t.text}30;width:90%;"></div>
          <div class="theme-swatch-line" style="background:${t.text}20;width:60%;"></div>
        </div>
      </div>
      <div class="theme-swatch-name" style="background:${t.bg2};color:${t.text};">${t.name}</div>
    </div>`).join('');
}

function renderAccentDots() {
  const grid = document.getElementById('accent-dots');
  if (!grid) return;
  grid.innerHTML = ACCENTS.map(a => `
    <div class="accent-dot ${selectedAccent === a.color ? 'active' : ''}"
      style="background:${a.color};"
      onclick="applyAccent('${a.color}','${a.text}','${a.name.toLowerCase()}')"
      title="${a.name}">
    </div>`).join('');
}

function applyFullTheme(themeId) {
  selectedTheme = themeId;
  document.documentElement.setAttribute('data-theme', themeId);
  // Verwijder inline stijlen zodat CSS data-theme variabelen werken
  const vars = ['--bg','--bg2','--bg3','--bg4','--border','--border2','--border3','--text','--text2','--text3','--send-bg','--send-icon','--user-bg','--user-text'];
  vars.forEach(v => document.documentElement.style.removeProperty(v));
  // Pas accent aan als het thema een eigen accent heeft
  const theme = THEMES.find(t => t.id === themeId);
  if (theme && themeId !== 'dark' && themeId !== 'light') {
    selectedAccent = theme.accent;
    selectedAccentText = theme.text === '#1A1916' ? '#F0EDE6' : '#0E0E0C';
    document.documentElement.style.setProperty('--accent', theme.accent);
    document.documentElement.style.setProperty('--accent-dim', theme.accent + '25');
    document.documentElement.style.setProperty('--accent-text', selectedAccentText);
  }
  localStorage.setItem('ps_theme', themeId);
  renderThemeSwatches();
  renderAccentDots();
}

function applyAccent(color, textColor, name) {
  selectedAccent = color;
  selectedAccentText = textColor;
  selectedColor = name;
  document.documentElement.style.setProperty('--accent', color);
  document.documentElement.style.setProperty('--accent-dim', color + '25');
  document.documentElement.style.setProperty('--accent-text', textColor);
  localStorage.setItem('ps_accent', color);
  localStorage.setItem('ps_accent_text', textColor);
  localStorage.setItem('ps_color', name);
  renderAccentDots();
}

// ═══ SLACK KANALEN BEHEER ═══════════════════════════════
function openSlackManageModal() {
  renderSlackManageLists();
  document.getElementById('slack-manage-modal').classList.add('open');
}

function closeSlackManageModal() {
  document.getElementById('slack-manage-modal').classList.remove('open');
  loadSlack();
}

function renderSlackManageLists() {
  const pEl = document.getElementById('slack-prominent-list');
  const nEl = document.getElementById('slack-normal-list');
  if (!pEl || !nEl) return;

  pEl.innerHTML = SLACK_CHANNELS.prominent.map((ch, i) => `
    <div class="manage-item">
      <span class="manage-drag">⠿</span>
      <div style="flex:1;">
        <div class="manage-item-name">${ch.name}</div>
        <div class="manage-item-sub">${ch.id}${ch.urgent ? ' · Urgent' : ''}</div>
      </div>
      <button class="project-delete-btn" onclick="removeSlackChannel('prominent',${i})">×</button>
    </div>`).join('') || '<div class="empty-state">Geen prioriteit kanalen</div>';

  nEl.innerHTML = SLACK_CHANNELS.normal.map((ch, i) => `
    <div class="manage-item">
      <span class="manage-drag">⠿</span>
      <div style="flex:1;">
        <div class="manage-item-name">${ch.name}</div>
        <div class="manage-item-sub">${ch.id}</div>
      </div>
      <button class="project-delete-btn" onclick="removeSlackChannel('normal',${i})">×</button>
    </div>`).join('') || '<div class="empty-state">Geen overige kanalen</div>';
}

function removeSlackChannel(type, idx) {
  SLACK_CHANNELS[type].splice(idx, 1);
  saveSlackChannels();
  renderSlackManageLists();
}

function addSlackChannel() {
  const name = document.getElementById('new-slack-name').value.trim();
  const id = document.getElementById('new-slack-id').value.trim();
  const type = document.getElementById('new-slack-type').value;
  const urgent = document.getElementById('new-slack-urgent').checked;
  if (!name || !id) { notify('Vul naam en kanaal ID in', 'error'); return; }
  const ch = { id, name: name.startsWith('#') ? name : '#' + name };
  if (type === 'prominent') ch.urgent = urgent;
  SLACK_CHANNELS[type].push(ch);
  saveSlackChannels();
  document.getElementById('new-slack-name').value = '';
  document.getElementById('new-slack-id').value = '';
  renderSlackManageLists();
  notify('Kanaal toegevoegd: ' + ch.name, 'success');
}

function saveSlackChannels() {
  localStorage.setItem('ps_slack_channels', JSON.stringify(SLACK_CHANNELS));
}

function loadSlackChannels() {
  const saved = localStorage.getItem('ps_slack_channels');
  if (saved) {
    const parsed = JSON.parse(saved);
    SLACK_CHANNELS.prominent = parsed.prominent || SLACK_CHANNELS.prominent;
    SLACK_CHANNELS.normal = parsed.normal || SLACK_CHANNELS.normal;
  }
}

// ═══ BUG TAGS BEHEER ════════════════════════════════════
let bugTags = JSON.parse(localStorage.getItem('ps_bug_tags') || '["PARRO","SCHOOLKASSA","OVERIG"]');

function openBugSettings() {
  renderBugTagsList();
  document.getElementById('bug-settings-modal').classList.add('open');
}

function renderBugTagsList() {
  const list = document.getElementById('bug-project-tags-list');
  if (!list) return;
  list.innerHTML = bugTags.map((tag, i) => `
    <div class="manage-item">
      <div class="manage-item-name">${tag}</div>
      <button class="project-delete-btn" onclick="removeBugTag(${i})">×</button>
    </div>`).join('');
  updateBugTagsDropdown();
}

function addBugTag() {
  const input = document.getElementById('new-bug-tag');
  const val = input.value.trim().toUpperCase();
  if (!val) return;
  if (bugTags.includes(val)) { notify('Tag bestaat al', 'error'); return; }
  bugTags.push(val);
  localStorage.setItem('ps_bug_tags', JSON.stringify(bugTags));
  input.value = '';
  renderBugTagsList();
  notify('Tag toegevoegd: ' + val, 'success');
}

function removeBugTag(i) {
  bugTags.splice(i, 1);
  localStorage.setItem('ps_bug_tags', JSON.stringify(bugTags));
  renderBugTagsList();
}

function updateBugTagsDropdown() {
  const sel = document.getElementById('bug-project');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = bugTags.map(tag => {
    const channels = tag === 'PARRO' ? '→ #parro-bugs + #par-bugs' : '→ #par-bugs';
    return `<option value="${tag}" ${current === tag ? 'selected' : ''}>${tag} ${channels}</option>`;
  }).join('');
}

// ═══ FOCUSTIMER INSTELLINGEN ════════════════════════════
let focusWorkMinutes = parseInt(localStorage.getItem('ps_focus_work') || '25');
let focusBreakMinutes = parseInt(localStorage.getItem('ps_focus_break') || '5');

function openFocusSettings() {
  document.getElementById('focus-work-input').value = focusWorkMinutes;
  document.getElementById('focus-break-input').value = focusBreakMinutes;
  document.getElementById('focus-settings-modal').classList.add('open');
}

function saveFocusSettings() {
  const work = parseInt(document.getElementById('focus-work-input').value) || 25;
  const brk = parseInt(document.getElementById('focus-break-input').value) || 5;
  focusWorkMinutes = Math.min(Math.max(work, 1), 90);
  focusBreakMinutes = Math.min(Math.max(brk, 1), 30);
  localStorage.setItem('ps_focus_work', focusWorkMinutes);
  localStorage.setItem('ps_focus_break', focusBreakMinutes);
  // Reset timer met nieuwe tijden
  focusReset();
  document.getElementById('focus-sessions-label').textContent =
    `Pomodoro · ${focusWorkMinutes} min werk · ${focusBreakMinutes} min pauze`;
  document.getElementById('focus-settings-modal').classList.remove('open');
  notify('Focustimer bijgewerkt', 'success');
}

// ─── Thema ────────────────────────────────────────────────
let selectedTheme = localStorage.getItem('ps_theme') || 'dark';
let selectedColor = localStorage.getItem('ps_color') || 'lime';
let selectedAccent = localStorage.getItem('ps_accent') || '#C8F55A';
let selectedAccentText = localStorage.getItem('ps_accent_text') || '#0E0E0C';

function selectTheme(theme) {
  selectedTheme = theme;
  ['dark','light','system'].forEach(t => {
    document.getElementById('theme-' + t)?.classList.toggle('selected', t === theme);
  });
  applyTheme(theme);
}

function selectColor(name, accent, accentText) {
  selectedColor = name;
  selectedAccent = accent;
  selectedAccentText = accentText;
  document.querySelectorAll('.color-option').forEach(el => el.classList.remove('selected'));
  document.getElementById('color-' + name)?.classList.add('selected');
  document.documentElement.style.setProperty('--accent', accent);
  document.documentElement.style.setProperty('--accent-text', accentText);
  document.documentElement.style.setProperty('--accent-dim', accent + '20');
}

function applyTheme(theme) {
  // Gebruik applyFullTheme als het een known theme is
  if (THEMES.find(t => t.id === theme)) { applyFullTheme(theme); return; }
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const useDark = theme === 'dark' || (theme === 'system' && prefersDark);
  if (useDark) {
    document.documentElement.style.setProperty('--bg', '#0E0E0C');
    document.documentElement.style.setProperty('--bg2', '#141412');
    document.documentElement.style.setProperty('--bg3', '#1C1C19');
    document.documentElement.style.setProperty('--bg4', '#242420');
    document.documentElement.style.setProperty('--border', 'rgba(255,255,255,0.07)');
    document.documentElement.style.setProperty('--border2', 'rgba(255,255,255,0.12)');
    document.documentElement.style.setProperty('--border3', 'rgba(255,255,255,0.18)');
    document.documentElement.style.setProperty('--text', '#F0EDE6');
    document.documentElement.style.setProperty('--text2', '#9A9890');
    document.documentElement.style.setProperty('--text3', '#5A5955');
    document.documentElement.style.setProperty('--send-bg', '#F0EDE6');
    document.documentElement.style.setProperty('--send-icon', '#1A1916');
    document.documentElement.style.setProperty('--user-bg', '#1A1916');
    document.documentElement.style.setProperty('--user-text', '#F0EDE6');
  } else {
    document.documentElement.style.setProperty('--bg', '#F5F4F0');
    document.documentElement.style.setProperty('--bg2', '#FFFFFF');
    document.documentElement.style.setProperty('--bg3', '#EEECE8');
    document.documentElement.style.setProperty('--bg4', '#E4E2DE');
    document.documentElement.style.setProperty('--border', 'rgba(0,0,0,0.08)');
    document.documentElement.style.setProperty('--border2', 'rgba(0,0,0,0.14)');
    document.documentElement.style.setProperty('--border3', 'rgba(0,0,0,0.22)');
    document.documentElement.style.setProperty('--text', '#1A1916');
    document.documentElement.style.setProperty('--text2', '#5A5955');
    document.documentElement.style.setProperty('--text3', '#9A9890');
    document.documentElement.style.setProperty('--send-bg', '#1A1916');
    document.documentElement.style.setProperty('--send-icon', '#F0EDE6');
    document.documentElement.style.setProperty('--user-bg', '#1A1916');
    document.documentElement.style.setProperty('--user-text', '#F0EDE6');
  }
}

function saveTheme() {
  localStorage.setItem('ps_theme', selectedTheme);
  localStorage.setItem('ps_color', selectedColor);
  localStorage.setItem('ps_accent', selectedAccent);
  localStorage.setItem('ps_accent_text', selectedAccentText);
}

function loadTheme() {
  const t = localStorage.getItem('ps_theme') || 'dark';
  const a = localStorage.getItem('ps_accent') || '#C8F55A';
  const at = localStorage.getItem('ps_accent_text') || '#0E0E0C';
  applyFullTheme(t);
  if (a) {
    document.documentElement.style.setProperty('--accent', a);
    document.documentElement.style.setProperty('--accent-dim', a + '25');
    document.documentElement.style.setProperty('--accent-text', at);
  }
  loadSlackChannels();
  updateBugTagsDropdown();
  // Focustimer tijden laden
  focusSeconds = focusWorkMinutes * 60;
}

// ─── Wizard navigatie ────────────────────────────────────
let currentStep = 1;
const TOTAL_STEPS = 6;

function wizardNext() {
  if (currentStep === 1) {
    const name = document.getElementById('slack-name').value.trim();
    const email = document.getElementById('jira-email').value.trim();
    if (!name || !email) {
      notify('Vul je naam en e-mailadres in om verder te gaan', 'error');
      return;
    }
  }
  if (currentStep === TOTAL_STEPS) {
    saveAndStart();
    return;
  }
  goToStep(currentStep + 1);
}

function wizardBack() {
  if (currentStep > 1) goToStep(currentStep - 1);
}

function goToStep(step) {
  document.getElementById('wizard-step-' + currentStep).classList.remove('active');
  currentStep = step;
  document.getElementById('wizard-step-' + step).classList.add('active');
  updateWizardUI();
}

function updateWizardUI() {
  for (let i = 1; i <= TOTAL_STEPS; i++) {
    const num = document.getElementById('step-num-' + i);
    const label = document.getElementById('step-label-' + i);
    if (!num || !label) continue;
    if (i < currentStep) {
      num.className = 'wizard-step-num done';
      num.textContent = '✓';
      label.className = 'wizard-step-label inactive';
    } else if (i === currentStep) {
      num.className = 'wizard-step-num active';
      num.textContent = i;
      label.className = 'wizard-step-label active';
    } else {
      num.className = 'wizard-step-num inactive';
      num.textContent = i;
      label.className = 'wizard-step-label inactive';
    }
  }
  const backBtn = document.getElementById('wizard-back-btn');
  const nextBtn = document.getElementById('wizard-next-btn');
  if (backBtn) backBtn.style.display = currentStep > 1 ? 'block' : 'none';
  if (nextBtn) nextBtn.textContent = currentStep === TOTAL_STEPS ? 'Dashboard starten →' : 'Volgende →';
}

// ─── Setup opslaan ────────────────────────────────────────
function skipSetup() {
  demoMode = true;
  cfg = {};
  startDashboard();
}

function saveAndStart() {
  const prev = cfg;
  const val = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
  cfg = {
    msToken:    val('ms-token')     || prev.msToken    || '',
    jiraDomain: val('jira-domain')  || prev.jiraDomain || '',
    jiraEmail:  val('jira-email')   || prev.jiraEmail  || '',
    jiraToken:  val('jira-token')   || prev.jiraToken  || '',
    slackToken: val('slack-token')  || prev.slackToken || '',
    slackName:  val('slack-name')   || prev.slackName  || '',
    claudeKey:  val('claude-token') || prev.claudeKey  || '',
  };
  if (cfg.slackName) {
    const cleaned = cfg.slackName.replace(/[._]/g, ' ').trim();
    const first = cleaned.split(' ')[0];
    first && (document.getElementById('greeting-name').textContent = first.charAt(0).toUpperCase() + first.slice(1));
  }
  localStorage.setItem('ps_cfg', JSON.stringify(cfg));
  saveTheme();
  saveUserSettings();
  startDashboard();
}

function showSetup() {
  const setVal = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val; };
  const setPlaceholder = (id, val) => { const el = document.getElementById(id); if (el && val) el.placeholder = '(al ingesteld — laat leeg om te bewaren)'; };
  setVal('slack-name', cfg.slackName);
  setVal('jira-email', cfg.jiraEmail);
  setVal('jira-domain', cfg.jiraDomain);
  setPlaceholder('ms-token', cfg.msToken);
  setPlaceholder('jira-token', cfg.jiraToken);
  setPlaceholder('slack-token', cfg.slackToken);
  setPlaceholder('claude-token', cfg.claudeKey);
  currentStep = 1;
  for (let i = 1; i <= 6; i++) {
    const panel = document.getElementById('wizard-step-' + i);
    if (panel) panel.classList.toggle('active', i === 1);
  }
  updateWizardUI();
  document.getElementById('setup-screen').style.display = 'flex';
  document.getElementById('dashboard').classList.remove('visible');
}

function loadSavedCfg() {
  const saved = localStorage.getItem('ps_cfg');
  if (saved) {
    cfg = JSON.parse(saved);
    if (cfg.slackName) {
      const first = cfg.slackName.split(' ')[0];
      document.getElementById('greeting-name').textContent = first;
    } else if (cfg.jiraEmail) {
      const name = cfg.jiraEmail.split('@')[0];
      document.getElementById('greeting-name').textContent = name.charAt(0).toUpperCase() + name.slice(1);
    }
    return true;
  }
  return false;
}

// ─── Dashboard init ──────────────────────────────────────
function startDashboard() {
  document.getElementById('setup-screen').style.display = 'none';
  document.getElementById('dashboard').classList.add('visible');
  setDate();
  loadAgenda();
  loadProjects();
  loadBugs();
  loadSlack();
  renderTodos();
  initNotes();
  initChat();
  startAutoRefresh();
  initOfflineDetection();
  initSpotify();
  focusUpdateDisplay();
  renderStickyNotes();
  loadWeather();
  loadCloudData();
  applyModuleVisibility();
  initNotifications();
  bdInit();
}

function setDate() {
  const d = new Date();
  const days = ['Zondag','Maandag','Dinsdag','Woensdag','Donderdag','Vrijdag','Zaterdag'];
  const months = ['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'];
  document.getElementById('topbar-date').textContent = `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  const hour = d.getHours();
  const greeting = hour < 12 ? 'Goedemorgen' : hour < 17 ? 'Goedemiddag' : 'Goedenavond';
  const el = document.getElementById('greeting-text');
  if (el) el.textContent = greeting;

  // Redactioneel sidebar updaten
  const esDay = document.getElementById('es-day');
  const esMonth = document.getElementById('es-month');
  const esWeek = document.getElementById('es-week');
  if (esDay) esDay.textContent = d.getDate();
  if (esMonth) {
    const mns = ['JAN','FEB','MRT','APR','MEI','JUN','JUL','AUG','SEP','OKT','NOV','DEC'];
    esMonth.textContent = mns[d.getMonth()];
  }
  if (esWeek) {
    const jan4 = new Date(d.getFullYear(), 0, 4);
    const w1 = new Date(jan4);
    w1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
    esWeek.textContent = Math.ceil((d - w1) / (7 * 24 * 60 * 60 * 1000)) + 1;
  }
}

function refreshAll() {
  loadAgenda(); loadProjects(); loadBugs();
  notify('Dashboard vernieuwd', 'info');
}

function initOfflineDetection() {
  const banner = document.getElementById('offline-banner');
  if (!banner) return;
  const update = () => { banner.style.display = navigator.onLine ? 'none' : 'block'; };
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  update();
}

function startAutoRefresh() {
  // Agenda elke 30 minuten automatisch vernieuwen
  setInterval(() => {
    loadAgenda();
  }, 30 * 60 * 1000);
  // Datum/begroeting elke minuut updaten
  setInterval(() => {
    setDate();
  }, 60 * 1000);
}

// ─── Token vernieuw modal ────────────────────────────────
function showTokenRefresh() {
  document.getElementById('token-input').value = '';
  document.getElementById('token-modal').classList.add('open');
}

function closeTokenModal() {
  document.getElementById('token-modal').classList.remove('open');
}

function saveNewToken() {
  const token = document.getElementById('token-input').value.trim();
  if (!token || !token.startsWith('eyJ')) {
    notify('Plak een geldig token (begint met eyJ...)', 'error');
    return;
  }
  // Token opslaan in cfg
  cfg.msToken = token;
  localStorage.setItem('ps_cfg', JSON.stringify(cfg));
  closeTokenModal();
  notify('Token opgeslagen — agenda wordt geladen...', 'success');
  loadAgenda();
}

// ─── Agenda (Microsoft Graph) ────────────────────────────
async function loadAgenda() {
  const list = document.getElementById('agenda-list');
  list.innerHTML = '<div class="loading-state"><div class="spin"></div>Ophalen...</div>';
  document.getElementById('week-list').innerHTML = '<div class="loading-state"><div class="spin"></div>Ophalen...</div>';

  // Probeer eerst agenda uit GitHub (gevuld door Power Automate)
  const cloudAgenda = await cloudGet('agenda');
  if (cloudAgenda && cloudAgenda.events && cloudAgenda.events.length > 0) {
    const now = new Date();

    // Robuuste datum parsing — Power Automate geeft strings zonder Z
    // en start kan een string zijn of {dateTime: "..."} object
    const parseDate = e => {
      const raw = e.start?.dateTime || e.start?.date || e.start || '';
      let str = String(raw).trim().replace(/\.0+$/, '');
      if (!str) return null;
      // Heeft al tijdzone-info? Gebruik direct.
      if (str.match(/Z$|[+\-]\d{2}:?\d{2}$/)) return new Date(str);
      // Power Automate levert UTC zonder suffix — voeg Z toe zodat
      // de browser automatisch omrekent naar lokale NL-tijd.
      return new Date(str + 'Z');
    };

    const todayStr = now.toDateString();
    const todayEvents = cloudAgenda.events.filter(e => {
      const d = parseDate(e);
      return d && !isNaN(d) && d.toDateString() === todayStr;
    }).sort((a, b) => (parseDate(a) || 0) - (parseDate(b) || 0));

    const weekEvents = cloudAgenda.events.filter(e => {
      const d = parseDate(e);
      return d && !isNaN(d) && d > now && d.toDateString() !== todayStr;
    }).sort((a, b) => (parseDate(a) || 0) - (parseDate(b) || 0));

    renderAgenda(todayEvents);
    renderWeek(weekEvents);
    document.getElementById('agenda-count').textContent = todayEvents.length + ' afspraken';

    // Verberg token vernieuw knop als Power Automate data beschikbaar is
    const tokenBtn = document.getElementById('token-refresh-btn');
    if (tokenBtn) tokenBtn.style.display = 'none';
    return;
  }

  // Geen cloud data — gebruik Graph API als token beschikbaar
  if (demoMode || !cfg.msToken) { renderAgendaDemo(); renderWeekDemo(); return; }

  const now = new Date();
  const todayStart = new Date(now); todayStart.setHours(0,0,0,0);
  const todayEnd = new Date(now); todayEnd.setHours(23,59,59,999);

  // Einde van de werkweek (vrijdag 23:59)
  const weekEnd = new Date(now);
  const dayOfWeek = now.getDay();
  const daysUntilFriday = dayOfWeek <= 5 ? 5 - dayOfWeek : 6;
  weekEnd.setDate(now.getDate() + daysUntilFriday);
  weekEnd.setHours(23,59,59,999);

  try {
    // Vandaag ophalen
    const data1 = await callProxy('graph', {
      token: cfg.msToken,
      url: `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${todayStart.toISOString()}&endDateTime=${todayEnd.toISOString()}&$orderby=start/dateTime&$top=20`
    });
    renderAgenda(data1.value || []);

    // Rest van de week ophalen (morgen t/m vrijdag)
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);

    if (tomorrowStart <= weekEnd) {
      const data2 = await callProxy('graph', {
        token: cfg.msToken,
        url: `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${tomorrowStart.toISOString()}&endDateTime=${weekEnd.toISOString()}&$orderby=start/dateTime&$top=50`
      });
      renderWeek(data2.value || []);
    } else {
      document.getElementById('week-list').innerHTML = '<div class="empty-state">Einde van de werkweek bereikt</div>';
    }
  } catch(e) {
    console.error('[Agenda] Fout:', e.message);
    // Toon token verlopen melding met directe actieknop
    const list = document.getElementById('agenda-list');
    list.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;gap:10px;padding:20px 0;">
      <div style="font-size:13px;color:var(--text2);text-align:center;">Agenda token verlopen of niet ingesteld</div>
      <button onclick="showTokenRefresh()" style="font-size:12px;padding:8px 18px;background:var(--accent);color:var(--accent-text);border:none;border-radius:var(--r);cursor:pointer;font-weight:500;font-family:var(--font-body);">
        🔑 Token vernieuwen — 30 seconden
      </button>
    </div>`;
    renderWeekDemo();
  }
}

function renderAgenda(events) {
  // Sla events op voor notificatie-checker
  window._currentAgendaEvents = (window._currentAgendaEvents || []);
  // Voeg toe en dedupleer op subject+start
  events.forEach(e => {
    const key = (e.subject || '') + (e.start?.dateTime || e.start || '');
    if (!window._currentAgendaEvents.find(x => (x.subject||'')+(x.start?.dateTime||x.start||'') === key)) {
      window._currentAgendaEvents.push(e);
    }
  });
  // Sorteer op starttijd
  events = events.slice().sort(function(a, b) {
    var getMs = function(e) {
      var raw = (typeof e.start === 'object' ? (e.start && (e.start.dateTime || e.start.date)) : e.start) || '';
      var s = String(raw).trim().replace(/\.0+$/, '');
      if (!s) return 0;
      if (s.match(/Z$|[+\-]\d{2}:?\d{2}$/)) return new Date(s).getTime();
      return new Date(s + 'Z').getTime();
    };
    return getMs(a) - getMs(b);
  });
  const list = document.getElementById('agenda-list');
  document.getElementById('agenda-count').textContent = events.length + ' afspraken';
  if (!events.length) { list.innerHTML = '<div class="empty-state">Geen afspraken vandaag</div>'; return; }
  const colors = ['#6BA8FF','#C8F55A','#FFB84D','#FF6B6B','#5BDB8A','#C97FFF'];
  list.innerHTML = events.map((e, i) => {
    const parseEvtDate = v => {
      const raw = (typeof v === 'object' ? (v?.dateTime || v?.date) : v) || '';
      const s = String(raw).trim().replace(/\.0+$/, '');
      if (!s) return new Date(NaN);
      // Heeft al tijdzone? Gebruik direct.
      if (s.match(/Z$|[+\-]\d{2}:?\d{2}$/)) return new Date(s);
      // Power Automate levert UTC zonder suffix — voeg Z toe.
      return new Date(s + 'Z');
    };
    const start = parseEvtDate(e.start);
    const end = parseEvtDate(e.end);
    const fmt = t => isNaN(t) ? '--:--' : t.toLocaleTimeString('nl-NL', {hour:'2-digit', minute:'2-digit', timeZone:'Europe/Amsterdam'});
    const color = colors[i % colors.length];
    const loc = e.location?.displayName || e.location || '';
    const teamsUrl = e.onlineMeeting?.joinUrl || e.joinUrl || '';
    return `<div class="agenda-item">
      <span class="agenda-time">${fmt(start)}<br>${fmt(end)}</span>
      <div class="agenda-bar" style="background:${color}"></div>
      <div class="agenda-content">
        <div class="agenda-name">${e.subject || 'Geen titel'}</div>
        ${loc ? `<div class="agenda-meta">${loc}</div>` : ''}
        ${teamsUrl ? `<a class="agenda-link" href="${teamsUrl}" target="_blank">Teams → deelnemen</a>` : ''}
      </div>
    </div>`;
  }).join('');
}

function renderAgendaDemo() {
  const demo = [
    { subject: 'Stand-up sprint 24', start:{dateTime:'2026-05-14T09:00:00'}, end:{dateTime:'2026-05-14T09:30:00'}, location:{displayName:'Microsoft Teams'}, onlineMeeting:{joinUrl:'#'} },
    { subject: 'Klantgesprek — Basisschool De Bron', start:{dateTime:'2026-05-14T10:00:00'}, end:{dateTime:'2026-05-14T11:00:00'}, location:{displayName:'Teams'}, onlineMeeting:{joinUrl:'#'} },
    { subject: 'Backlog refinement', start:{dateTime:'2026-05-14T13:00:00'}, end:{dateTime:'2026-05-14T14:00:00'}, location:{displayName:'Vergaderzaal A'} },
    { subject: 'Review: release 3.12', start:{dateTime:'2026-05-14T15:30:00'}, end:{dateTime:'2026-05-14T16:00:00'}, location:{displayName:'Teams'}, onlineMeeting:{joinUrl:'#'} },
  ];
  renderAgenda(demo);
}

function renderWeek(events) {
  const weekList = document.getElementById('week-list');
  const days = ['Zondag','Maandag','Dinsdag','Woensdag','Donderdag','Vrijdag'];
  const daysFull = ['zo','ma','di','wo','do','vr'];
  const now = new Date();

  // Groepeer events per dag
  const grouped = {};
  events.forEach(e => {
    const d = (() => { const raw = (typeof e.start === 'object' ? (e.start?.dateTime || e.start?.date) : e.start) || ''; const s = String(raw).trim().replace(/\.0+$/, ''); if (!s) return new Date(NaN); if (s.match(/Z$|[+\-]\d{2}:?\d{2}$/)) return new Date(s); return new Date(s + 'Z'); })();
    const key = d.toDateString();
    if (!grouped[key]) grouped[key] = { date: d, events: [] };
    grouped[key].events.push(e);
  });

  // Bouw dagen op van morgen t/m vrijdag
  const rows = [];
  for (let i = 1; i <= 5; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    if (d.getDay() === 0 || d.getDay() === 6) continue; // skip weekend
    if (d.getDay() < now.getDay() && i > 1) continue;
    const key = d.toDateString();
    const dayEvents = grouped[key]?.events || [];
    const dayName = days[d.getDay()];
    const dateStr = d.getDate() + ' ' + ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'][d.getMonth()];
    const colors = ['#6BA8FF','#C8F55A','#FFB84D','#FF6B6B','#5BDB8A','#C97FFF'];

    const eventsHtml = dayEvents.length
      ? dayEvents.slice(0, 4).map((e, i) => {
          const st = (() => { const raw = (typeof e.start === 'object' ? (e.start?.dateTime || e.start?.date) : e.start) || ''; const s = String(raw).trim().replace(/\.0+$/, ''); if (!s) return new Date(NaN); if (s.match(/Z$|[+\-]\d{2}:?\d{2}$/)) return new Date(s); return new Date(s + 'Z'); })();
          const fmt = t => t.toLocaleTimeString('nl-NL', {hour:'2-digit', minute:'2-digit', timeZone:'Europe/Amsterdam'});
          return `<div class="week-event">
            <div class="week-event-dot" style="background:${colors[i%colors.length]}"></div>
            <span class="week-event-time">${fmt(st)}</span>
            <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:160px;">${e.subject || 'Afspraak'}</span>
          </div>`;
        }).join('') + (dayEvents.length > 4 ? `<div class="week-empty">+${dayEvents.length-4} meer</div>` : '')
      : '<span class="week-empty">Geen afspraken</span>';

    rows.push(`<div class="week-day">
      <div class="week-day-name">${dayName}<br><span style="font-size:10px;font-weight:400;">${dateStr}</span></div>
      <div class="week-events">${eventsHtml}</div>
    </div>`);
  }

  weekList.innerHTML = rows.length ? rows.join('') : '<div class="empty-state">Geen afspraken deze week</div>';
}

function renderWeekDemo() {
  const demoWeek = [
    { subject: 'Sprint planning', start:{dateTime: getNextWeekday(1)+'T09:00:00'}, end:{dateTime: getNextWeekday(1)+'T10:00:00'} },
    { subject: 'Klantgesprek Stad Rotterdam', start:{dateTime: getNextWeekday(1)+'T14:00:00'}, end:{dateTime: getNextWeekday(1)+'T15:00:00'} },
    { subject: '1-op-1 met manager', start:{dateTime: getNextWeekday(2)+'T10:30:00'}, end:{dateTime: getNextWeekday(2)+'T11:00:00'} },
    { subject: 'Demo Parro release', start:{dateTime: getNextWeekday(3)+'T13:00:00'}, end:{dateTime: getNextWeekday(3)+'T14:00:00'} },
    { subject: 'Retrospective sprint 24', start:{dateTime: getNextWeekday(3)+'T15:00:00'}, end:{dateTime: getNextWeekday(3)+'T16:00:00'} },
    { subject: 'Sprint review', start:{dateTime: getNextWeekday(4)+'T09:30:00'}, end:{dateTime: getNextWeekday(4)+'T10:30:00'} },
  ];
  renderWeek(demoWeek);
}

function getNextWeekday(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().split('T')[0];
}

// ─── Projecten (lokaal beheer + optioneel Jira) ─────────
async function loadProjects() {
  // Altijd eerst lokale projecten tonen voor snelle weergave
  if (projects.length) renderProjects();

  // Als Jira token beschikbaar: haal live data op en merge met lokale voortgang
  if (demoMode || !cfg.jiraDomain || !cfg.jiraToken) {
    if (!projects.length) renderProjectsDemo();
    return;
  }

  try {
    const data = await callProxy('jira', {
      email: cfg.jiraEmail,
      token: cfg.jiraToken,
      url: `https://${cfg.jiraDomain}/rest/api/3/project/search?maxResults=10`,
      method: 'GET'
    });
    if (!data.values) throw new Error('Geen Jira data');

    // Merge: behoud lokale voortgang en status, update namen vanuit Jira
    const jiraProjects = data.values.slice(0,8);
    const colors = ['#C8F55A','#6BA8FF','#5BDB8A','#FFB84D','#FF6B6B','#C97FFF'];
    projects = jiraProjects.map((p, i) => {
      const existing = projects.find(lp => lp.id === p.id || lp.name === p.name);
      return {
        id: p.id,
        name: p.name,
        pct: existing?.pct || 0,
        status: existing?.status || 'Actief',
        deadline: existing?.deadline || '',
        color: existing?.color || colors[i % colors.length],
      };
    });
    localStorage.setItem('ps_projects', JSON.stringify(projects));
    renderProjects();
  } catch(e) {
    console.error('[Jira projecten] Fout:', e.message);
    if (!projects.length) renderProjectsDemo();
  }
}

function renderProjects() {
  const list = document.getElementById('project-list');
  const visible = projects.filter(p => !hiddenProjects.includes(p.id || p.name));
  const active = visible.filter(p => p.status !== 'Afgerond');
  document.getElementById('projects-count').textContent = active.length + ' actief';
  if (!visible.length) {
    list.innerHTML = '<div class="empty-state">Geen zichtbare projecten — klik op "+ Beheren" om projecten in te schakelen</div>';
    return;
  }
  const colors = ['#C8F55A','#6BA8FF','#5BDB8A','#FFB84D','#FF6B6B','#C97FFF'];
  list.innerHTML = visible.map((p, i) => {
    const color = p.color || colors[i % colors.length];
    const statusMap = {
      'Actief': 'badge-accent', 'In review': 'badge-amber',
      'Bijna klaar': 'badge-green', 'In uitvoering': 'badge-blue', 'Afgerond': 'badge-muted'
    };
    const badgeClass = statusMap[p.status] || 'badge-accent';
    const deadline = p.deadline ? new Date(p.deadline).toLocaleDateString('nl-NL', {day:'numeric',month:'short'}) : '';
    return `<div class="project-item">
      <div class="project-info">
        <div class="project-name">${p.name}</div>
        ${deadline ? `<div class="project-deadline">Deadline ${deadline}</div>` : '<div class="project-deadline">&nbsp;</div>'}
      </div>
      <div class="project-right">
        <div class="progress-wrap">
          <div class="progress-track"><div class="progress-fill" style="width:${p.pct}%;background:${color}"></div></div>
          <span class="progress-pct">${p.pct}%</span>
        </div>
        <span class="card-badge ${badgeClass}">${p.status}</span>
      </div>
    </div>`;
  }).join('');
}

function renderProjectsDemo() {
  projects = [
    { name: 'Rapportmodule v2', pct: 72, status: 'In review', color: '#6BA8FF', deadline: '2026-05-15' },
    { name: 'SSO integratie', pct: 45, status: 'Actief', color: '#C8F55A', deadline: '2026-06-01' },
    { name: 'Leerling-import', pct: 88, status: 'Bijna klaar', color: '#5BDB8A', deadline: '2026-05-20' },
    { name: 'Dashboard herdesign', pct: 20, status: 'In uitvoering', color: '#FFB84D', deadline: '2026-06-10' },
    { name: 'API documentatie', pct: 60, status: 'Actief', color: '#C8F55A', deadline: '2026-05-30' },
  ];
  renderProjects();
}

// ─── Project modal ────────────────────────────────────────
function openProjectModal() {
  renderProjectEditList();
  document.getElementById('project-modal').classList.add('open');
}

function closeProjectModal() {
  document.getElementById('project-modal').classList.remove('open');
  renderProjects();
}

function renderProjectEditList() {
  const list = document.getElementById('project-edit-list');
  if (!projects.length) { list.innerHTML = '<div class="empty-state" style="padding:8px 0;">Nog geen projecten</div>'; return; }
  const colors = ['#C8F55A','#6BA8FF','#5BDB8A','#FFB84D','#FF6B6B','#C97FFF'];
  list.innerHTML = projects.map((p, i) => {
    const color = p.color || colors[i % colors.length];
    const key = p.id || p.name;
    const isHidden = hiddenProjects.includes(key);
    const subtasks = p.subtasks || [];
    const doneSubs = subtasks.filter(s => s.done).length;
    const pct = subtasks.length > 0 ? Math.round((doneSubs / subtasks.length) * 100) : p.pct;

    const subtasksHtml = subtasks.map((s, si) => `
      <div class="subtask-item">
        <div class="subtask-check ${s.done ? 'done' : ''}" onclick="toggleSubtask(${i}, ${si})"></div>
        <span class="subtask-text ${s.done ? 'done' : ''}">${s.text}</span>
        <button class="subtask-del" onclick="deleteSubtask(${i}, ${si})">×</button>
      </div>`).join('');

    return `<div class="project-edit-row" style="flex-direction:column;align-items:flex-start;gap:8px;${isHidden ? 'opacity:0.45;' : ''}">
      <div style="display:flex;align-items:center;justify-content:space-between;width:100%;gap:8px;">
        <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;">
          <div class="project-edit-name" style="${isHidden ? 'text-decoration:line-through;' : ''}">${p.name}</div>
          <button onclick="toggleProjectVisibility('${key}')"
            style="font-size:10px;padding:2px 8px;border-radius:10px;border:1px solid var(--border2);background:${isHidden ? 'var(--bg3)' : 'var(--accent-dim)'};color:${isHidden ? 'var(--text3)' : 'var(--accent)'};cursor:pointer;font-family:var(--font-body);flex-shrink:0;">
            ${isHidden ? 'Verborgen' : 'Zichtbaar'}
          </button>
        </div>
        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
          <span style="font-size:11px;font-family:var(--font-mono);color:${color};">${pct}%</span>
          <select class="form-select" style="font-size:11px;padding:4px 8px;height:28px;" onchange="updateProjectStatus(${i}, this.value)">
            ${['Actief','In review','Bijna klaar','In uitvoering','Afgerond'].map(s =>
              `<option value="${s}" ${p.status===s?'selected':''}>${s}</option>`
            ).join('')}
          </select>
          <button class="project-delete-btn" onclick="deleteProject(${i})" title="Verwijderen">×</button>
        </div>
      </div>
      <div style="width:100%;">
        <div class="subtask-progress"><div class="subtask-progress-fill" style="width:${pct}%;background:${color};"></div></div>
        <div class="subtask-list">${subtasksHtml}</div>
        <div class="subtask-add">
          <input type="text" id="subtask-input-${i}" placeholder="Onderdeel toevoegen..."
            onkeydown="if(event.key==='Enter')addSubtask(${i})">
          <button onclick="addSubtask(${i})">+ Voeg toe</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function toggleProjectVisibility(key) {
  const idx = hiddenProjects.indexOf(key);
  if (idx === -1) {
    hiddenProjects.push(key);
  } else {
    hiddenProjects.splice(idx, 1);
  }
  saveHiddenProjects();
  renderProjectEditList();
}

function updateProjectPct(i, val) {
  projects[i].pct = parseInt(val);
  saveProjectsCloud();
}

function updateProjectStatus(i, val) {
  projects[i].status = val;
  saveProjectsCloud();
  renderProjectEditList();
}

function deleteProject(i) {
  projects.splice(i, 1);
  saveProjectsCloud();
  renderProjectEditList();
}

function addSubtask(projectIdx) {
  const input = document.getElementById(`subtask-input-${projectIdx}`);
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  if (!projects[projectIdx].subtasks) projects[projectIdx].subtasks = [];
  projects[projectIdx].subtasks.push({ text, done: false });
  updateProjectPctFromSubtasks(projectIdx);
  saveProjectsCloud();
  renderProjectEditList();
}

function toggleSubtask(projectIdx, subtaskIdx) {
  if (!projects[projectIdx].subtasks) return;
  projects[projectIdx].subtasks[subtaskIdx].done = !projects[projectIdx].subtasks[subtaskIdx].done;
  updateProjectPctFromSubtasks(projectIdx);
  saveProjectsCloud();
  renderProjectEditList();
  renderProjects();
}

function deleteSubtask(projectIdx, subtaskIdx) {
  if (!projects[projectIdx].subtasks) return;
  projects[projectIdx].subtasks.splice(subtaskIdx, 1);
  updateProjectPctFromSubtasks(projectIdx);
  saveProjectsCloud();
  renderProjectEditList();
  renderProjects();
}

function updateProjectPctFromSubtasks(projectIdx) {
  const subtasks = projects[projectIdx].subtasks || [];
  if (subtasks.length === 0) return;
  const done = subtasks.filter(s => s.done).length;
  projects[projectIdx].pct = Math.round((done / subtasks.length) * 100);
}

function showAllProjects() {
  hiddenProjects = [];
  saveHiddenProjects();
  renderProjectEditList();
}

function hideAllProjects() {
  hiddenProjects = projects.map(p => p.id || p.name);
  saveHiddenProjects();
  renderProjectEditList();
}

function addProject() {
  const name = document.getElementById('new-project-name').value.trim();
  const status = document.getElementById('new-project-status').value;
  const deadline = document.getElementById('new-project-deadline').value;
  if (!name) { notify('Vul een projectnaam in', 'error'); return; }
  const colors = ['#C8F55A','#6BA8FF','#5BDB8A','#FFB84D','#FF6B6B','#C97FFF'];
  projects.push({ name, pct: 0, status, deadline, color: colors[projects.length % colors.length] });
  saveProjectsCloud();
  document.getElementById('new-project-name').value = '';
  document.getElementById('new-project-deadline').value = '';
  renderProjectEditList();
  notify('Project toegevoegd: ' + name, 'success');
}

// ─── Bug tracker ────────────────────────────────────────
async function loadBugs() {
  renderBugList();
}

function renderBugList() {
  const parro = bugs.filter(b => b.category === 'parro');
  const schoolkassa = bugs.filter(b => b.category === 'schoolkassa');
  const open = bugs.filter(b => b.status !== 'Opgelost').length;
  document.getElementById('bugs-count').textContent = open + ' open';
  renderBugSection('bug-list-parro', parro);
  renderBugSection('bug-list-schoolkassa', schoolkassa);
}

function renderBugSection(elId, list) {
  const el = document.getElementById(elId);
  if (!list.length) {
    el.innerHTML = '<div class="empty-state" style="padding:8px 0 4px;">Geen bugs — klik op "+ Beheren" om toe te voegen</div>';
    return;
  }
  el.innerHTML = list.map((b, i) => {
    const isOpgelost = b.status === 'Opgelost';
    const isHoog = b.prio === 'Hoog';
    const badgeClass = isOpgelost ? 'badge-green' : isHoog ? 'badge-red' : 'badge-amber';
    const jiraLink = b.jiraUrl ? `<a href="${b.jiraUrl}" target="_blank" style="font-size:11px;color:var(--blue);text-decoration:none;margin-left:4px;" title="Open in Jira">↗</a>` : '';
    const zdLink = b.zendesk ? `<a href="${b.zendesk}" target="_blank" style="font-size:11px;color:var(--text3);text-decoration:none;" title="Open in Zendesk">ZD↗</a>` : '';
    return `<div class="bug-row">
      <span class="bug-id">${b.id}${jiraLink}</span>
      <span class="bug-title">${b.title}</span>
      <div class="bug-right">
        ${zdLink}
        <span class="card-badge ${badgeClass}" style="cursor:pointer;" onclick="toggleBugStatus(${bugs.indexOf(b)})" title="Klik om status te wijzigen">${b.status}</span>
      </div>
    </div>`;
  }).join('');
}

function toggleBugStatus(i) {
  const statuses = ['Open', 'In behandeling', 'Opgelost'];
  const cur = statuses.indexOf(bugs[i].status);
  bugs[i].status = statuses[(cur + 1) % statuses.length];
  saveBugs();
  renderBugList();
}

// ─── Bug beheer modal ────────────────────────────────────
function openBugModal() {
  renderBugEditList();
  document.getElementById('bug-modal').classList.add('open');
}

function closeBugModal() {
  document.getElementById('bug-modal').classList.remove('open');
  renderBugList();
}

function renderBugEditList() {
  const list = document.getElementById('bug-edit-list');
  if (!bugs.length) { list.innerHTML = '<div class="empty-state">Nog geen bugs</div>'; return; }
  list.innerHTML = bugs.map((b, i) => `
    <div class="project-edit-row" style="flex-direction:column;align-items:flex-start;gap:8px;">
      <div style="display:flex;align-items:center;justify-content:space-between;width:100%;">
        <span style="font-size:13px;font-weight:500;color:var(--text);">${b.id} — ${b.title}</span>
        <button class="project-delete-btn" onclick="deleteBug(${i})">×</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;width:100%;">
        <select class="form-select" style="font-size:11px;padding:4px 8px;height:28px;" onchange="updateBugField(${i},'status',this.value)">
          ${['Open','In behandeling','Opgelost'].map(s => `<option value="${s}" ${b.status===s?'selected':''}>${s}</option>`).join('')}
        </select>
        <select class="form-select" style="font-size:11px;padding:4px 8px;height:28px;" onchange="updateBugField(${i},'prio',this.value)">
          ${['Hoog','Normaal','Laag'].map(s => `<option value="${s}" ${b.prio===s?'selected':''}>${s}</option>`).join('')}
        </select>
        <select class="form-select" style="font-size:11px;padding:4px 8px;height:28px;" onchange="updateBugField(${i},'category',this.value)">
          <option value="parro" ${b.category==='parro'?'selected':''}>Parro</option>
          <option value="schoolkassa" ${b.category==='schoolkassa'?'selected':''}>Schoolkassa</option>
        </select>
      </div>
      <input class="form-input" style="font-size:11px;padding:5px 10px;" placeholder="Jira URL (optioneel)" value="${b.jiraUrl||''}" oninput="updateBugField(${i},'jiraUrl',this.value)">
    </div>`).join('');
}

function updateBugField(i, field, val) {
  bugs[i][field] = val;
  saveBugs();
}

function deleteBug(i) {
  bugs.splice(i, 1);
  saveBugs();
  renderBugEditList();
}

function addBugToTracker() {
  const id = document.getElementById('new-bug-id').value.trim();
  const title = document.getElementById('new-bug-title').value.trim();
  const cat = document.getElementById('new-bug-cat').value;
  const prio = document.getElementById('new-bug-prio').value;
  const jiraUrl = document.getElementById('new-bug-jira').value.trim();
  if (!title) { notify('Vul een omschrijving in', 'error'); return; }
  bugs.push({ id: id || '—', title, status: 'Open', prio, category: cat, jiraUrl, zendesk: '' });
  saveBugs();
  document.getElementById('new-bug-id').value = '';
  document.getElementById('new-bug-title').value = '';
  document.getElementById('new-bug-jira').value = '';
  renderBugEditList();
  notify('Bug toegevoegd aan tracker', 'success');
}

// ─── Bug submitten ────────────────────────────────────────
function updateChannelLabel(project) {
  const sel = document.getElementById('bug-channel');
  if (project === 'PARRO') {
    sel.innerHTML = '<option value="auto">→ #parro-bugs + #par-bugs</option>';
  } else {
    sel.innerHTML = '<option value="auto">→ #par-bugs</option>';
  }
}

async function submitBug() {
  const title = document.getElementById('bug-title').value.trim();
  const desc = document.getElementById('bug-desc').value.trim();
  const channel = document.getElementById('bug-channel').value;
  const prio = document.getElementById('bug-prio').value;
  const project = document.getElementById('bug-project').value;
  const zendesk = document.getElementById('bug-zendesk').value.trim();
  if (!title) { notify('Vul een omschrijving in', 'error'); return; }

  const btn = document.querySelector('.submit-btn');
  btn.disabled = true; btn.textContent = 'Bezig...';

  const now = new Date();
  const datePart = now.getFullYear().toString().slice(-2) + String(now.getMonth()+1).padStart(2,'0') + String(now.getDate()).padStart(2,'0');
  const bugId = project + '-' + datePart + '-' + Math.floor(Math.random()*100).toString().padStart(2,'0');
  const category = project === 'PARRO' ? 'parro' : 'schoolkassa';

  // Slack bericht sturen
  if (cfg.slackToken) {
    const channels = project === 'PARRO' ? ['parro-bugs', 'par-bugs'] : ['par-bugs'];
    for (const ch of channels) {
      try {
        let msg = `[${project}] ${title}`;
        if (zendesk) msg += `
${zendesk}`;
        if (desc) msg += `
_${desc}_`;
        const data = await callProxy('slack', {
          token: cfg.slackToken,
          url: 'https://slack.com/api/chat.postMessage',
          body: { channel: '#' + ch, text: msg }
        });
        if (data.ok) notify('Verstuurd naar #' + ch, 'success');
        else notify('Slack #' + ch + ': ' + (data.error || 'onbekende fout'), 'error');
      } catch(e) { notify('Slack fout: ' + e.message, 'error'); }
    }
  } else {
    notify('Geen Slack token — stel in via Instellingen', 'error');
  }

  // Lokaal opslaan in buglijst
  bugs.unshift({ id: bugId, title: `[${project}] ${title}`, status: 'Open', prio, category, jiraUrl: '', zendesk });
  saveBugs();
  renderBugList();

  document.getElementById('bug-title').value = '';
  document.getElementById('bug-desc').value = '';
  document.getElementById('bug-zendesk').value = '';
  btn.disabled = false; btn.textContent = 'Verstuur naar Slack + Jira →';
}


// ─── Slack ───────────────────────────────────────────────
const SLACK_CHANNELS = {
  prominent: [
    { id: 'C02GR6XPUMV', name: '#par-productieverstoringen', urgent: true },
    { id: 'C3FN5H274',   name: '#parro-support', urgent: false },
    { id: 'C07NJLRG92S', name: '#schoolkassa-support', urgent: false },
  ],
  normal: [
    { id: 'CENCH90EA',   name: '#par-1stelijns' },
    { id: 'G6BSY0J1K',   name: '#par-pssys_sd_privé' },
    { id: 'C027K52CM7B', name: '#par-sd-inhoudelijke-mededelingen' },
    { id: 'CMKLHCAR5',   name: '#par-lerenvanelkaar' },
  ]
};

let slackUnread = {};
let slackLastMsg = {};

async function loadSlack() {
  renderSlackChannels();
  document.getElementById('slack-status').textContent = 'Laden...';
  await pollSlackUnread();
  setInterval(pollSlackUnread, 60000);
}

async function pollSlackUnread() {
  try {
    // Haal alle kanalen op via proxy
    const allChannels = [
      ...SLACK_CHANNELS.prominent.map(c => c.id),
      ...SLACK_CHANNELS.normal.map(c => c.id)
    ];

    // Per kanaal conversations.info ophalen via proxy
    const results = await Promise.allSettled(
      allChannels.map(id => callProxy('slack', {
        url: `https://slack.com/api/conversations.info?channel=${id}&include_num_members=false`,
        body: null,
        method: 'GET'
      }))
    );

    results.forEach((result, i) => {
      const id = allChannels[i];
      if (result.status === 'fulfilled' && result.value?.channel) {
        const ch = result.value.channel;
        slackUnread[id] = ch.unread_count || 0;
        if (ch.latest?.text) {
          slackLastMsg[id] = ch.latest.text
            .replace(/<[^>]+>/g, '') // strip Slack markup
            .slice(0, 45);
        }
      }
    });

    renderSlackChannels();
    const now = new Date();
    document.getElementById('slack-refresh-time').textContent =
      now.toLocaleTimeString('nl-NL', {hour:'2-digit', minute:'2-digit'});
    document.getElementById('slack-status').textContent = 'Verbonden';
    document.getElementById('slack-status').className = 'card-badge badge-green';
  } catch(e) {
    console.error('[Slack] Fout:', e.message);
    document.getElementById('slack-status').textContent = 'Fout';
    document.getElementById('slack-status').className = 'card-badge badge-red';
  }
}

function renderSlackChannels() {
  const prominentEl = document.getElementById('slack-prominent');
  const normalEl = document.getElementById('slack-normal');

  prominentEl.innerHTML = SLACK_CHANNELS.prominent.map(ch => {
    const unread = slackUnread[ch.id] || 0;
    const urgentClass = ch.urgent ? ' urgent' : '';
    const dotColor = ch.urgent ? 'var(--red)' : unread > 0 ? 'var(--amber)' : 'var(--green)';
    const preview = slackLastMsg[ch.id] || 'Klik om te openen in Slack';
    return `<a class="slack-card prominent${urgentClass}" href="#" onclick="openSlackChannel('${ch.id}');return false;">
      <div class="slack-card-left">
        <div class="slack-card-dot" style="background:${dotColor}"></div>
        <div class="slack-card-info">
          <div class="slack-card-name">${ch.name}</div>
          <div class="slack-card-preview">${preview}</div>
        </div>
      </div>
      <span class="slack-unread ${unread > 0 ? 'has' : 'none'}">${unread > 0 ? unread : '—'}</span>
    </a>`;
  }).join('');

  normalEl.innerHTML = SLACK_CHANNELS.normal.map(ch => {
    const unread = slackUnread[ch.id] || 0;
    const dotColor = unread > 0 ? 'var(--amber)' : 'var(--green)';
    return `<a class="slack-card" href="#" onclick="openSlackChannel('${ch.id}');return false;">
      <div class="slack-card-left">
        <div class="slack-card-dot" style="background:${dotColor}"></div>
        <div class="slack-card-name">${ch.name}</div>
      </div>
      <span class="slack-unread ${unread > 0 ? 'has' : 'none'}">${unread > 0 ? unread : '—'}</span>
    </a>`;
  }).join('');
}

function openSlackChannel(channelId) {
  // Probeer eerst de Slack app te openen via deep link
  window.location.href = `slack://channel?id=${channelId}&team=T02K9FWQ4`;
  // Als de app niet opent, open dan de browser versie na 1 seconde
  setTimeout(() => {
    window.open(`https://app.slack.com/client/T02K9FWQ4/${channelId}`, '_blank');
  }, 1000);
}

// ─── Focustimer ──────────────────────────────────────────
let focusIsRunning = false;
let focusIsBreak = false;
let focusSeconds = 25 * 60;
let focusSessions = 0;
let focusInterval = null;
let FOCUS_WORK = focusWorkMinutes * 60;
let FOCUS_BREAK = focusBreakMinutes * 60;
const FOCUS_CIRCUMFERENCE = 2 * Math.PI * 52;

function focusToggle() {
  if (focusIsRunning) {
    clearInterval(focusInterval);
    focusIsRunning = false;
    document.getElementById('focus-start-btn').textContent = 'Hervat';
  } else {
    focusIsRunning = true;
    document.getElementById('focus-start-btn').textContent = 'Pauze';
    if (!focusIsBreak) spotifyStartFocusMusic();
    focusInterval = setInterval(() => {
      focusSeconds--;
      focusUpdateDisplay();
      if (focusSeconds <= 0) {
        clearInterval(focusInterval);
        focusIsRunning = false;
        if (!focusIsBreak) {
          focusSessions++;
          notify('🍅 Focussessie klaar! Neem een pauze.', 'success');
          try { new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAA').play(); } catch(e) {}
        } else {
          notify('⏰ Pauze voorbij! Tijd om te werken.', 'info');
        }
        focusIsBreak = !focusIsBreak;
        focusSeconds = focusIsBreak ? FOCUS_BREAK : FOCUS_WORK;
        focusUpdateDisplay();
        document.getElementById('focus-start-btn').textContent = 'Start';
      }
    }, 1000);
  }
}

function focusReset() {
  clearInterval(focusInterval);
  focusIsRunning = false;
  focusIsBreak = false;
  FOCUS_WORK = focusWorkMinutes * 60;
  FOCUS_BREAK = focusBreakMinutes * 60;
  focusSeconds = FOCUS_WORK;
  focusUpdateDisplay();
  document.getElementById('focus-start-btn').textContent = 'Start';
}

function focusSkip() {
  clearInterval(focusInterval);
  focusIsRunning = false;
  if (!focusIsBreak) { focusSessions++; }
  focusIsBreak = !focusIsBreak;
  focusSeconds = focusIsBreak ? FOCUS_BREAK : FOCUS_WORK;
  focusUpdateDisplay();
  document.getElementById('focus-start-btn').textContent = 'Start';
}

function focusUpdateDisplay() {
  const mins = Math.floor(focusSeconds / 60);
  const secs = focusSeconds % 60;
  document.getElementById('focus-time').textContent =
    String(mins).padStart(2,'0') + ':' + String(secs).padStart(2,'0');

  const total = focusIsBreak ? FOCUS_BREAK : FOCUS_WORK;
  const pct = focusSeconds / total;
  const offset = FOCUS_CIRCUMFERENCE * (1 - pct);
  const ring = document.getElementById('focus-ring-fill');
  if (ring) {
    ring.style.strokeDashoffset = offset;
    ring.style.stroke = focusIsBreak ? 'var(--green)' : 'var(--accent)';
  }

  const phase = document.getElementById('focus-phase');
  if (phase) {
    phase.textContent = focusIsBreak ? 'Pauze' : 'Werken';
    phase.className = 'focus-phase ' + (focusIsBreak ? 'break' : 'work');
  }

  const badge = document.getElementById('focus-sessions-badge');
  if (badge) badge.textContent = focusSessions + ' sessies';
}

// ─── Snelle notities ─────────────────────────────────────
const STICKY_COLORS = ['#FFF176','#A5D6A7','#90CAF9','#FFCC80','#F48FB1','#CE93D8'];
let stickyNotes = JSON.parse(localStorage.getItem('ps_sticky') || '[]');

function renderStickyNotes() {
  const grid = document.getElementById('sticky-grid');
  if (!grid) return;
  document.getElementById('sticky-count').textContent = stickyNotes.length;
  grid.innerHTML = stickyNotes.map((note, i) => `
    <div class="sticky-note" style="background:${note.color};">
      <textarea rows="4" oninput="updateSticky(${i}, this.value)"
        style="color:rgba(0,0,0,0.75);">${note.text}</textarea>
      <button class="sticky-note-del" onclick="deleteSticky(${i})">×</button>
    </div>`).join('') +
    `<button class="sticky-add-btn" onclick="addSticky()" title="Notitie toevoegen">+</button>`;
}

function addSticky() {
  const color = STICKY_COLORS[stickyNotes.length % STICKY_COLORS.length];
  stickyNotes.push({ text: '', color });
  localStorage.setItem('ps_sticky', JSON.stringify(stickyNotes));
  renderStickyNotes();
  // Focus op de nieuwe notitie
  setTimeout(() => {
    const textareas = document.querySelectorAll('.sticky-note textarea');
    if (textareas.length) textareas[textareas.length - 1].focus();
  }, 50);
}

function updateSticky(i, text) {
  stickyNotes[i].text = text;
  clearTimeout(window._stickyTimer);
  window._stickyTimer = setTimeout(() => {
    localStorage.setItem('ps_sticky', JSON.stringify(stickyNotes));
  }, 500);
}

function deleteSticky(i) {
  stickyNotes.splice(i, 1);
  localStorage.setItem('ps_sticky', JSON.stringify(stickyNotes));
  renderStickyNotes();
}

// ─── Weer ─────────────────────────────────────────────────
const WEATHER_ICONS = {
  0: '☀️', 1: '🌤️', 2: '⛅', 3: '☁️',
  45: '🌫️', 48: '🌫️',
  51: '🌦️', 53: '🌦️', 55: '🌧️',
  61: '🌧️', 63: '🌧️', 65: '🌧️',
  71: '🌨️', 73: '🌨️', 75: '❄️',
  80: '🌦️', 81: '🌧️', 82: '⛈️',
  95: '⛈️', 96: '⛈️', 99: '⛈️',
};
const WEATHER_DESC = {
  0:'Helder',1:'Overwegend helder',2:'Gedeeltelijk bewolkt',3:'Bewolkt',
  45:'Mist',48:'Bevriezende mist',51:'Lichte motregen',53:'Matige motregen',55:'Zware motregen',
  61:'Lichte regen',63:'Matige regen',65:'Zware regen',
  71:'Lichte sneeuw',73:'Matige sneeuw',75:'Zware sneeuw',
  80:'Lichte buien',81:'Matige buien',82:'Zware buien',
  95:'Onweer',96:'Onweer met hagel',99:'Zwaar onweer',
};
const DAYS = ['zo','ma','di','wo','do','vr','za'];

async function loadWeather() {
  try {
    // Open-Meteo API — gratis, geen token nodig, Enschede coördinaten
    const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=52.255&longitude=6.158&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=Europe%2FAmsterdam&forecast_days=5');
    if (!res.ok) throw new Error('Weer API fout');
    const data = await res.json();
    renderWeather(data);
    document.getElementById('weather-badge').textContent = 'Live';
    document.getElementById('weather-badge').className = 'card-badge badge-green';
  } catch(e) {
    console.error('[Weer] Fout:', e.message);
    document.getElementById('weather-body').innerHTML = '<div class="empty-state">Kon weer niet ophalen</div>';
    document.getElementById('weather-badge').textContent = 'Fout';
    document.getElementById('weather-badge').className = 'card-badge badge-red';
  }
}

function renderWeather(data) {
  const c = data.current;
  const d = data.daily;
  const code = c.weather_code;
  const temp = Math.round(c.temperature_2m);
  const humidity = c.relative_humidity_2m;
  const wind = Math.round(c.wind_speed_10m);
  const icon = WEATHER_ICONS[code] || '🌡️';
  const desc = WEATHER_DESC[code] || 'Onbekend';

  const forecastHtml = d.time.slice(1, 5).map((date, i) => {
    const day = new Date(date);
    const dayName = DAYS[day.getDay()];
    const dayIcon = WEATHER_ICONS[d.weather_code[i+1]] || '🌡️';
    const maxT = Math.round(d.temperature_2m_max[i+1]);
    const minT = Math.round(d.temperature_2m_min[i+1]);
    return `<div class="weather-day">
      <div class="weather-day-name">${dayName}</div>
      <div class="weather-day-icon">${dayIcon}</div>
      <div class="weather-day-temp">${maxT}°</div>
      <div class="weather-day-temp" style="color:var(--text3);font-size:11px;">${minT}°</div>
    </div>`;
  }).join('');

  document.getElementById('weather-body').innerHTML = `
    <div class="weather-main">
      <div class="weather-icon">${icon}</div>
      <div>
        <div class="weather-temp">${temp}°C</div>
        <div class="weather-desc">${desc}</div>
        <div class="weather-loc">Deventer</div>
      </div>
    </div>
    <div class="weather-details">
      <div class="weather-detail">
        <div class="weather-detail-val">${humidity}%</div>
        <div class="weather-detail-label">Vochtig</div>
      </div>
      <div class="weather-detail">
        <div class="weather-detail-val">${wind} km/h</div>
        <div class="weather-detail-label">Wind</div>
      </div>
      <div class="weather-detail">
        <div class="weather-detail-val">${Math.round(d.temperature_2m_max[0])}°/${Math.round(d.temperature_2m_min[0])}°</div>
        <div class="weather-detail-label">Max/Min</div>
      </div>
    </div>
    <div class="weather-forecast">${forecastHtml}</div>`;
}

// ─── Spotify ────────────────────────────────────────────
const SPOTIFY_CLIENT_ID = '60f186f4c6f24e9f9857148027c1e377';
const SPOTIFY_REDIRECT = window.location.origin;
const SPOTIFY_SCOPES = 'user-read-playback-state user-modify-playback-state user-read-currently-playing streaming app-remote-control user-read-private user-read-email playlist-read-private';

let spotifyToken = localStorage.getItem('spotify_token') || null;
let spotifyPlayer = null;
let spotifyDeviceId = null;
let spotifyPlayerReady = false;
let spotifyPollTimer = null;
let spotifyCurrentTrack = null;
let spotifyShellBuilt = false;
let spotifyLastTrackId = null;
let spotifyDraggingVolume = false;
let spotifySearchTimer = null;
let spotifyPlaylists = null;
let spotifyFavoritePlaylist = JSON.parse(localStorage.getItem('spotify_fav_playlist') || 'null');
let spotifyFocusPlaylistId = localStorage.getItem('spotify_focus_playlist_id') || null;
let spotifyPausedForEvents = new Set();

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

async function spotifyLogin() {
  // PKCE flow — vereist door Spotify sinds 2024
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const state = Math.random().toString(36).slice(2);
  localStorage.setItem('spotify_state', state);
  localStorage.setItem('spotify_code_verifier', codeVerifier);
  const params = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    response_type: 'code',
    redirect_uri: SPOTIFY_REDIRECT,
    scope: SPOTIFY_SCOPES,
    state,
    code_challenge_method: 'S256',
    code_challenge: codeChallenge,
  });
  window.location.href = 'https://accounts.spotify.com/authorize?' + params.toString();
}

function generateCodeVerifier() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array)).replace(/[+/=]/g, c => ({'+':'-','/':'_','=':''}[c]));
}

async function generateCodeChallenge(verifier) {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/[+/=]/g, c => ({'+':'-','/':'_','=':''}[c]));
}

async function spotifyHandleCallback() {
  // PKCE: code zit in URL query params, niet in hash
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const state = params.get('state');
  if (!code) return;

  const codeVerifier = localStorage.getItem('spotify_code_verifier');
  if (!codeVerifier) return;

  // Verwijder code uit URL
  history.replaceState(null, null, window.location.pathname);

  try {
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: SPOTIFY_CLIENT_ID,
        grant_type: 'authorization_code',
        code,
        redirect_uri: SPOTIFY_REDIRECT,
        code_verifier: codeVerifier,
      }),
    });
    const data = await res.json();
    if (data.access_token) {
      spotifyToken = data.access_token;
      localStorage.setItem('spotify_token', spotifyToken);
      // Sla refresh token op voor automatisch vernieuwen
      if (data.refresh_token) {
        localStorage.setItem('spotify_refresh_token', data.refresh_token);
      }
      localStorage.removeItem('spotify_code_verifier');
      initSpotify();
    }
  } catch(e) {
    console.error('[Spotify] Token exchange fout:', e.message);
  }
}

async function spotifyRefreshToken() {
  const refreshToken = localStorage.getItem('spotify_refresh_token');
  if (!refreshToken) { renderSpotifyLogin(); return; }
  try {
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: SPOTIFY_CLIENT_ID,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });
    const data = await res.json();
    if (data.access_token) {
      spotifyToken = data.access_token;
      localStorage.setItem('spotify_token', spotifyToken);
      if (data.refresh_token) localStorage.setItem('spotify_refresh_token', data.refresh_token);
      spotifyFetchNowPlaying();
    } else {
      renderSpotifyLogin();
    }
  } catch(e) {
    renderSpotifyLogin();
  }
}

function initSpotify() {
  if (!spotifyToken) {
    spotifyHandleCallback();
    return;
  }
  initSpotifyPlayer();
  spotifyFetchNowPlaying();
  clearInterval(spotifyPollTimer);
  spotifyPollTimer = setInterval(spotifyFetchNowPlaying, 5000);
  renderSpotifyFavShortcut();
}

function initSpotifyPlayer() {
  if (spotifyPlayer || !spotifyToken) return;

  const createPlayer = () => {
    if (spotifyPlayer) return;
    spotifyPlayer = new window.Spotify.Player({
      name: 'Werkdag Dashboard',
      getOAuthToken: cb => {
        const t = localStorage.getItem('spotify_token') || spotifyToken;
        cb(t);
      },
      volume: 0.7,
    });

    spotifyPlayer.addListener('ready', ({ device_id }) => {
      spotifyDeviceId = device_id;
      spotifyPlayerReady = true;
      console.log('[Spotify] Player klaar, device ID:', device_id);
      updateSpotifyPlayerUI();
    });

    spotifyPlayer.addListener('not_ready', () => {
      spotifyPlayerReady = false;
      updateSpotifyPlayerUI();
    });

    spotifyPlayer.addListener('player_state_changed', state => {
      if (!state) return;
      applySpotifyState(normalizeFromSdk(state));
    });

    spotifyPlayer.addListener('authentication_error', ({ message }) => {
      console.error('[Spotify] Auth fout:', message);
      spotifyRefreshToken();
    });

    spotifyPlayer.addListener('account_error', ({ message }) => {
      console.error('[Spotify] Account fout:', message);
      notify('Spotify Premium vereist voor afspelen via dashboard', 'error');
    });

    spotifyPlayer.connect().then(success => {
      console.log('[Spotify] Connect:', success ? 'gelukt' : 'mislukt');
    });
  };

  // SDK al geladen? Direct aanmaken
  if (window.Spotify && window.Spotify.Player) {
    createPlayer();
  } else {
    // Wacht op SDK callback
    window.onSpotifyWebPlaybackSDKReady = createPlayer;
  }
}

function updateSpotifyPlayerUI() {
  ensureSpotifyShell();
  const btn = document.getElementById('spotify-play-here-btn');
  if (btn) btn.style.display = spotifyPlayerReady ? 'flex' : 'none';
}

async function spotifyApiFetch(path, options = {}) {
  if (!spotifyToken) return null;
  const res = await fetch('https://api.spotify.com/v1' + path, {
    ...options,
    headers: { Authorization: `Bearer ${spotifyToken}`, ...(options.headers || {}) },
  });
  if (res.status === 401) {
    spotifyToken = null;
    localStorage.removeItem('spotify_token');
    await spotifyRefreshToken();
    return null;
  }
  return res;
}

async function playOnDashboard() {
  if (!spotifyToken || !spotifyDeviceId) return;
  await spotifyApiFetch('/me/player', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_ids: [spotifyDeviceId], play: true }),
  });
  setTimeout(spotifyFetchNowPlaying, 500);
}

async function spotifyFetchNowPlaying() {
  if (!spotifyToken) return;
  try {
    const res = await spotifyApiFetch('/me/player');
    if (!res) return; // token werd vernieuwd; volgende poll pakt het weer op
    if (res.status === 204 || !res.ok) { applySpotifyState(null); return; }
    const data = await res.json();
    if (!data || !data.item) { applySpotifyState(null); return; }
    applySpotifyState(normalizeFromWebApi(data));
  } catch(e) {
    console.error('[Spotify] Fout:', e.message);
  }
}

function normalizeFromWebApi(data) {
  const track = data.item;
  if (!track) return null;
  return {
    isPlaying: !!data.is_playing,
    progressMs: data.progress_ms || 0,
    durationMs: track.duration_ms || 0,
    trackId: track.id,
    trackName: track.name || 'Onbekend',
    artistName: (track.artists || []).map(a => a.name).join(', '),
    artUrl: track.album?.images?.[0]?.url || '',
    shuffle: !!data.shuffle_state,
    repeat: data.repeat_state || 'off',
    volumePercent: data.device?.volume_percent ?? null,
  };
}

function normalizeFromSdk(state) {
  const track = state.track_window?.current_track;
  if (!track) return null;
  return {
    isPlaying: !state.paused,
    progressMs: state.position || 0,
    durationMs: track.duration_ms || 0,
    trackId: track.id,
    trackName: track.name || 'Onbekend',
    artistName: (track.artists || []).map(a => a.name).join(', '),
    artUrl: track.album?.images?.[0]?.url || '',
    shuffle: !!state.shuffle,
    repeat: state.repeat_mode === 2 ? 'track' : state.repeat_mode === 1 ? 'context' : 'off',
    volumePercent: null, // SDK-status geeft geen volume — laatst bekende waarde blijft staan
  };
}

function spotifyFmtTime(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0');
}

function setPlayIcon(isPlaying) {
  const btn = document.getElementById('spotify-play-btn');
  if (!btn) return;
  btn.title = isPlaying ? 'Pauzeren' : 'Afspelen';
  btn.innerHTML = isPlaying
    ? '<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>'
    : '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
}

function applySpotifyState(norm) {
  ensureSpotifyShell();

  const badge = document.getElementById('spotify-badge');
  badge.textContent = norm ? (norm.isPlaying ? '▶ Speelt' : '⏸ Gepauzeerd') : 'Actief';
  badge.className = norm && norm.isPlaying ? 'card-badge badge-green' : 'card-badge badge-muted';
  document.getElementById('spotify-sub').textContent = 'Verbonden';

  const artWrap = document.getElementById('spotify-art-wrap');
  if (artWrap) artWrap.classList.toggle('playing', !!(norm && norm.isPlaying));

  if (!norm) {
    document.getElementById('spotify-now-track').textContent = 'Niets aan het afspelen';
    document.getElementById('spotify-now-artist').textContent = '';
    document.getElementById('spotify-progress-fill').style.width = '0%';
    document.getElementById('spotify-time-elapsed').textContent = '0:00';
    document.getElementById('spotify-time-remaining').textContent = '-0:00';
    setPlayIcon(false);
    spotifyCurrentTrack = null;
    spotifyLastTrackId = null;
    return;
  }

  spotifyCurrentTrack = norm;

  if (norm.trackId !== spotifyLastTrackId) {
    spotifyLastTrackId = norm.trackId;
    const artEl = document.getElementById('spotify-art-el');
    if (artEl) {
      artEl.outerHTML = norm.artUrl
        ? `<img class="spotify-art-lg" id="spotify-art-el" src="${norm.artUrl}" alt="Album art">`
        : `<div class="spotify-art-lg-placeholder" id="spotify-art-el">♪</div>`;
    }
  }

  document.getElementById('spotify-now-track').textContent = norm.trackName;
  document.getElementById('spotify-now-artist').textContent = norm.artistName;

  const pct = norm.durationMs ? Math.round((norm.progressMs / norm.durationMs) * 100) : 0;
  document.getElementById('spotify-progress-fill').style.width = pct + '%';
  document.getElementById('spotify-time-elapsed').textContent = spotifyFmtTime(norm.progressMs);
  document.getElementById('spotify-time-remaining').textContent = '-' + spotifyFmtTime(Math.max(0, norm.durationMs - norm.progressMs));

  setPlayIcon(norm.isPlaying);

  const shuffleBtn = document.getElementById('spotify-shuffle-btn');
  if (shuffleBtn) shuffleBtn.classList.toggle('active', norm.shuffle);

  const repeatBtn = document.getElementById('spotify-repeat-btn');
  if (repeatBtn) {
    repeatBtn.classList.toggle('active', norm.repeat !== 'off');
    const existingDot = repeatBtn.querySelector('.sp-repeat-one-dot');
    if (norm.repeat === 'track' && !existingDot) {
      repeatBtn.insertAdjacentHTML('beforeend', '<span class="sp-repeat-one-dot"></span>');
    } else if (norm.repeat !== 'track' && existingDot) {
      existingDot.remove();
    }
  }

  if (norm.volumePercent !== null && !spotifyDraggingVolume) {
    const slider = document.getElementById('spotify-volume-slider');
    if (slider) slider.value = norm.volumePercent;
  }
}

function ensureSpotifyShell() {
  if (spotifyShellBuilt) return;
  const body = document.getElementById('spotify-body');
  if (!body) return;
  body.innerHTML = `
    <div class="spotify-tabs">
      <button class="sp-tab active" id="sp-tab-now" onclick="spotifySwitchTab('now')">Nu speelt</button>
      <button class="sp-tab" id="sp-tab-search" onclick="spotifySwitchTab('search')">Zoeken</button>
      <button class="sp-tab" id="sp-tab-playlists" onclick="spotifySwitchTab('playlists')">Playlists</button>
    </div>
    <div class="spotify-panel active" id="spotify-panel-now">
      <div class="spotify-player">
        <div class="spotify-art-wrap" id="spotify-art-wrap">
          <div class="spotify-art-lg-placeholder" id="spotify-art-el">♪</div>
          <div class="spotify-eq" id="spotify-eq"><span></span><span></span><span></span></div>
        </div>
        <div class="spotify-now-info">
          <div class="spotify-now-track" id="spotify-now-track">Niets aan het afspelen</div>
          <div class="spotify-now-artist" id="spotify-now-artist"></div>
          <div class="spotify-progress-wrap">
            <span class="spotify-time" id="spotify-time-elapsed">0:00</span>
            <div class="spotify-progress spotify-progress-clickable" id="spotify-progress-bar" onclick="spotifySeekClick(event)">
              <div class="spotify-progress-fill" id="spotify-progress-fill" style="width:0%"></div>
            </div>
            <span class="spotify-time" id="spotify-time-remaining" style="text-align:right">-0:00</span>
          </div>
        </div>
      </div>
      <div class="spotify-controls-row">
        <button class="sp-toggle-btn" id="spotify-shuffle-btn" onclick="spotifyToggleShuffle()" title="Shuffle">
          <svg viewBox="0 0 24 24"><path d="M10.59 9.17 5.41 4 4 5.41l5.17 5.17zm4.83-4.76 2.71 2.71L4 21l1.41 1.41 14.12-14.12 2.7 2.7V3h-6.81zm2.71 10.76-1.41 1.41 3 3H14v2h6.83z"/></svg>
        </button>
        <button class="sp-btn" onclick="spotifyPrev()" title="Vorige">
          <svg viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>
        </button>
        <button class="sp-btn play" id="spotify-play-btn" onclick="spotifyTogglePlay()" title="Afspelen">
          <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
        </button>
        <button class="sp-btn" onclick="spotifyNext()" title="Volgende">
          <svg viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zm2-8.14L11.03 12 8 14.14V9.86zM16 6h2v12h-2z"/></svg>
        </button>
        <button class="sp-toggle-btn" id="spotify-repeat-btn" onclick="spotifyToggleRepeat()" title="Herhalen">
          <svg viewBox="0 0 24 24"><path d="M7 7h10v3l4-4-4-4v3H5v6h2zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2z"/></svg>
        </button>
      </div>
      <div class="spotify-volume-row">
        <svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>
        <input type="range" min="0" max="100" value="50" class="spotify-volume-slider" id="spotify-volume-slider"
          oninput="spotifyDraggingVolume=true" onchange="spotifySetVolume(this.value)">
      </div>
      <button class="spotify-login-btn" id="spotify-play-here-btn" onclick="playOnDashboard()"
        style="display:none;width:100%;margin-top:12px;justify-content:center;background:var(--bg3);color:var(--text2);border:1px solid var(--border2);">
        ▶ Afspelen via dashboard
      </button>
    </div>
    <div class="spotify-panel" id="spotify-panel-search">
      <input class="spotify-search-input" id="spotify-search-input" placeholder="Zoek nummers, artiesten of albums..." oninput="spotifyOnSearchInput(this.value)">
      <div id="spotify-search-results"></div>
    </div>
    <div class="spotify-panel" id="spotify-panel-playlists">
      <div id="spotify-playlists-list" class="spotify-nothing">Log in om je playlists te zien</div>
    </div>
    <div style="text-align:center;padding:8px 20px 4px;">
      <a href="#" onclick="spotifyLogout();return false;" style="font-size:11px;color:var(--text3);text-decoration:underline;">Spotify-account loskoppelen</a>
    </div>
  `;
  spotifyShellBuilt = true;
  updateSpotifyPlayerUI();
}

function spotifyLogout() {
  localStorage.removeItem('spotify_token');
  localStorage.removeItem('spotify_refresh_token');
  localStorage.removeItem('spotify_code_verifier');
  localStorage.removeItem('spotify_state');
  spotifyToken = null;
  clearInterval(spotifyPollTimer);
  if (spotifyPlayer) { try { spotifyPlayer.disconnect(); } catch(e) {} spotifyPlayer = null; }
  spotifyPlayerReady = false;
  spotifyDeviceId = null;
  spotifyPlaylists = null;
  renderSpotifyLogin();
  notify('Spotify-account loskoppeld — log opnieuw in voor toegang tot playlists', 'info');
}

function spotifySwitchTab(tab) {
  ['now', 'search', 'playlists'].forEach(t => {
    const tabBtn = document.getElementById('sp-tab-' + t);
    const panel = document.getElementById('spotify-panel-' + t);
    if (tabBtn) tabBtn.classList.toggle('active', t === tab);
    if (panel) panel.classList.toggle('active', t === tab);
  });
  if (tab === 'playlists' && !spotifyPlaylists) spotifyLoadPlaylists();
}

function renderSpotifyLogin() {
  spotifyShellBuilt = false;
  document.getElementById('spotify-badge').textContent = 'Inloggen';
  document.getElementById('spotify-badge').className = 'card-badge badge-amber';
  document.getElementById('spotify-sub').textContent = 'Niet verbonden';
  const slot = document.getElementById('spotify-fav-shortcut-slot');
  if (slot) slot.innerHTML = '';
  document.getElementById('spotify-body').innerHTML = `
    <div class="spotify-login">
      <div class="spotify-nothing">Log in om je muziek te zien en bedienen</div>
      <button class="spotify-login-btn" onclick="spotifyLogin()">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="white"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>
        Inloggen met Spotify
      </button>
    </div>`;
}

async function spotifyTogglePlay() {
  if (!spotifyToken) return;
  try {
    const res = await spotifyApiFetch('/me/player');
    if (!res) return;
    if (res.status === 204 || !res.ok) {
      if (spotifyDeviceId) await playOnDashboard();
      else notify('Start Spotify eerst op een apparaat', 'info');
      return;
    }
    const state = await res.json();
    await spotifyApiFetch(`/me/player/${state.is_playing ? 'pause' : 'play'}`, { method: 'PUT' });
    setTimeout(spotifyFetchNowPlaying, 300);
  } catch(e) {
    console.error('[Spotify] Toggle fout:', e.message);
  }
}

async function spotifyPause() {
  await spotifyApiFetch('/me/player/pause', { method: 'PUT' });
}

async function spotifyNext() {
  if (!spotifyToken) return;
  try {
    await spotifyApiFetch('/me/player/next', { method: 'POST' });
    setTimeout(spotifyFetchNowPlaying, 600);
  } catch(e) { console.error('[Spotify] Next fout:', e.message); }
}

async function spotifyPrev() {
  if (!spotifyToken) return;
  try {
    await spotifyApiFetch('/me/player/previous', { method: 'POST' });
    setTimeout(spotifyFetchNowPlaying, 600);
  } catch(e) { console.error('[Spotify] Prev fout:', e.message); }
}

async function spotifyToggleShuffle() {
  if (!spotifyToken || !spotifyCurrentTrack) return;
  spotifyCurrentTrack.shuffle = !spotifyCurrentTrack.shuffle;
  applySpotifyState(spotifyCurrentTrack);
  await spotifyApiFetch(`/me/player/shuffle?state=${spotifyCurrentTrack.shuffle}`, { method: 'PUT' });
}

async function spotifyToggleRepeat() {
  if (!spotifyToken || !spotifyCurrentTrack) return;
  const order = ['off', 'context', 'track'];
  spotifyCurrentTrack.repeat = order[(order.indexOf(spotifyCurrentTrack.repeat) + 1) % order.length];
  applySpotifyState(spotifyCurrentTrack);
  await spotifyApiFetch(`/me/player/repeat?state=${spotifyCurrentTrack.repeat}`, { method: 'PUT' });
}

function spotifySetVolume(val) {
  spotifyDraggingVolume = false;
  if (!spotifyToken) return;
  spotifyApiFetch(`/me/player/volume?volume_percent=${Math.round(val)}`, { method: 'PUT' });
}

function spotifySeekClick(e) {
  if (!spotifyToken || !spotifyCurrentTrack || !spotifyCurrentTrack.durationMs) return;
  const bar = document.getElementById('spotify-progress-bar');
  const rect = bar.getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  const positionMs = Math.round(ratio * spotifyCurrentTrack.durationMs);
  spotifyCurrentTrack.progressMs = positionMs;
  applySpotifyState(spotifyCurrentTrack);
  spotifyApiFetch(`/me/player/seek?position_ms=${positionMs}`, { method: 'PUT' });
}

// ─── Spotify — zoeken ────────────────────────────────────

function spotifyOnSearchInput(value) {
  clearTimeout(spotifySearchTimer);
  const q = value.trim();
  const results = document.getElementById('spotify-search-results');
  if (!q) { results.innerHTML = ''; return; }
  spotifySearchTimer = setTimeout(() => spotifySearch(q), 400);
}

async function spotifySearch(q) {
  const results = document.getElementById('spotify-search-results');
  results.innerHTML = '<div class="spotify-nothing">Zoeken...</div>';
  try {
    const res = await spotifyApiFetch('/search?q=' + encodeURIComponent(q) + '&type=track,artist,album&limit=6');
    if (!res || !res.ok) { results.innerHTML = '<div class="spotify-nothing">Zoeken mislukt</div>'; return; }
    const data = await res.json();
    const tracks = data.tracks?.items || [];
    const artists = data.artists?.items || [];
    const albums = data.albums?.items || [];
    if (!tracks.length && !artists.length && !albums.length) {
      results.innerHTML = '<div class="spotify-nothing">Niets gevonden</div>';
      return;
    }
    let html = '';
    if (tracks.length) {
      html += '<div class="spotify-result-group-label">Nummers</div>' + tracks.map(t => spotifyResultRow(
        t.album?.images?.slice(-1)[0]?.url, t.name, (t.artists || []).map(a => a.name).join(', '), t.uri, 'track')).join('');
    }
    if (artists.length) {
      html += '<div class="spotify-result-group-label">Artiesten</div>' + artists.map(a => spotifyResultRow(
        a.images?.slice(-1)[0]?.url, a.name, 'Artiest', a.uri, 'artist', true)).join('');
    }
    if (albums.length) {
      html += '<div class="spotify-result-group-label">Albums</div>' + albums.map(al => spotifyResultRow(
        al.images?.slice(-1)[0]?.url, al.name, (al.artists || []).map(a => a.name).join(', '), al.uri, 'album')).join('');
    }
    results.innerHTML = html;
  } catch(e) {
    results.innerHTML = '<div class="spotify-nothing">Zoeken mislukt</div>';
  }
}

function spotifyResultRow(imgUrl, name, sub, uri, type, round) {
  const art = imgUrl
    ? `<img class="spotify-result-art${round ? ' round' : ''}" src="${imgUrl}" alt="">`
    : `<div class="spotify-result-art${round ? ' round' : ''}"></div>`;
  return `<div class="spotify-result-item" onclick="spotifyPlayUri('${uri}', '${type}')">
    ${art}
    <div class="spotify-result-info">
      <div class="spotify-result-name">${escapeHtml(name)}</div>
      <div class="spotify-result-sub">${escapeHtml(sub)}</div>
    </div>
  </div>`;
}

async function spotifyPlayUri(uri, type) {
  if (!spotifyToken) return;
  const body = type === 'track' ? { uris: [uri] } : { context_uri: uri };
  const query = spotifyDeviceId ? `?device_id=${spotifyDeviceId}` : '';
  const res = await spotifyApiFetch('/me/player/play' + query, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (res && res.status === 404) notify('Open Spotify op een apparaat en probeer opnieuw', 'info');
  setTimeout(spotifyFetchNowPlaying, 500);
}

// ─── Spotify — playlists ─────────────────────────────────

async function spotifyLoadPlaylists() {
  if (!spotifyToken) return;
  const list = document.getElementById('spotify-playlists-list');
  list.innerHTML = '<div class="spotify-nothing">Laden...</div>';
  try {
    const res = await spotifyApiFetch('/me/playlists?limit=50');
    if (!res || !res.ok) { list.innerHTML = '<div class="spotify-nothing">Kon playlists niet laden</div>'; return; }
    const data = await res.json();
    spotifyPlaylists = data.items || [];
    if (!spotifyPlaylists.length) { list.innerHTML = '<div class="spotify-nothing">Geen playlists gevonden</div>'; return; }
    list.innerHTML = spotifyPlaylists.map(spotifyPlaylistRow).join('');
  } catch(e) {
    list.innerHTML = '<div class="spotify-nothing">Kon playlists niet laden</div>';
  }
}

function spotifyPlaylistRow(p) {
  const img = p.images?.[p.images.length - 1]?.url || p.images?.[0]?.url;
  const isFav = spotifyFavoritePlaylist?.id === p.id;
  const isFocus = spotifyFocusPlaylistId === p.id;
  const art = img ? `<img class="spotify-playlist-art" src="${img}" alt="">` : `<div class="spotify-playlist-art"></div>`;
  return `<div class="spotify-playlist-item">
    <div onclick="spotifyPlayPlaylist('${p.id}')" style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;">
      ${art}
      <div class="spotify-playlist-info">
        <div class="spotify-playlist-name">${escapeHtml(p.name)}</div>
        <div class="spotify-playlist-sub">${p.tracks?.total ?? 0} nummers</div>
      </div>
    </div>
    <div class="spotify-playlist-actions">
      <button class="spotify-playlist-icon-btn${isFav ? ' active' : ''}" onclick="event.stopPropagation();spotifyToggleFavoritePlaylist('${p.id}')" title="Favoriet (snelkoppeling)">
        <svg viewBox="0 0 24 24"><path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
      </button>
      <button class="spotify-playlist-icon-btn${isFocus ? ' active' : ''}" onclick="event.stopPropagation();spotifySetFocusPlaylist('${p.id}')" title="Gebruiken als focusmuziek">
        <svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm0-14a6 6 0 1 0 0 12 6 6 0 0 0 0-12zm0 10a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm0-6a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/></svg>
      </button>
    </div>
  </div>`;
}

function spotifyRerenderPlaylists() {
  if (spotifyPlaylists) document.getElementById('spotify-playlists-list').innerHTML = spotifyPlaylists.map(spotifyPlaylistRow).join('');
}

async function spotifyPlayPlaylist(id) {
  await spotifyPlayUri('spotify:playlist:' + id, 'playlist');
}

function spotifyToggleFavoritePlaylist(id) {
  if (spotifyFavoritePlaylist?.id === id) {
    spotifyFavoritePlaylist = null;
  } else {
    const p = spotifyPlaylists?.find(pl => pl.id === id);
    if (!p) return;
    spotifyFavoritePlaylist = { id, name: p.name, image: p.images?.[0]?.url || '' };
  }
  localStorage.setItem('spotify_fav_playlist', JSON.stringify(spotifyFavoritePlaylist));
  renderSpotifyFavShortcut();
  saveUserSettings();
  spotifyRerenderPlaylists();
}

function spotifySetFocusPlaylist(id) {
  spotifyFocusPlaylistId = (spotifyFocusPlaylistId === id) ? null : id;
  localStorage.setItem('spotify_focus_playlist_id', spotifyFocusPlaylistId || '');
  saveUserSettings();
  notify(spotifyFocusPlaylistId ? '🎯 Focusmuziek ingesteld' : 'Focusmuziek uitgeschakeld', 'info');
  spotifyRerenderPlaylists();
}

function renderSpotifyFavShortcut() {
  const slot = document.getElementById('spotify-fav-shortcut-slot');
  if (!slot) return;
  if (!spotifyFavoritePlaylist) { slot.innerHTML = ''; return; }
  slot.innerHTML = `<button class="spotify-fav-shortcut" onclick="spotifyPlayPlaylist('${spotifyFavoritePlaylist.id}')" title="Snel starten">
    ⭐<span>${escapeHtml(spotifyFavoritePlaylist.name)}</span>
  </button>`;
}

// ─── Spotify — integraties (agenda + Pomodoro) ──────────

function checkMeetingAutoPause() {
  if (!spotifyToken || !spotifyCurrentTrack?.isPlaying) return;
  const now = new Date();
  const allEvents = window._currentAgendaEvents || [];
  allEvents.forEach(e => {
    const attr = e.attributes || e;
    const startRaw = attr.start?.dateTime || attr.start?.date || attr.start || '';
    let startStr = String(startRaw).trim().replace(/\.0+$/, '');
    if (!startStr) return;
    const startDate = startStr.match(/Z$|[+\-]\d{2}:?\d{2}$/) ? new Date(startStr) : new Date(startStr + 'Z');
    if (isNaN(startDate)) return;
    const diffMinutes = (startDate - now) / 60000;
    const key = (attr.subject || attr.title || 'Afspraak') + startStr;
    if (diffMinutes <= 0 && diffMinutes > -1 && !spotifyPausedForEvents.has(key)) {
      spotifyPausedForEvents.add(key);
      spotifyPause();
      notify('⏸ Muziek gepauzeerd — vergadering begint', 'info');
    }
  });
}

function spotifyStartFocusMusic() {
  if (!spotifyToken) return;
  if (!spotifyFocusPlaylistId) {
    notify('Geen focusplaylist ingesteld — kies er een via Spotify → Playlists → 🎯', 'info');
    return;
  }
  spotifyPlayUri('spotify:playlist:' + spotifyFocusPlaylistId, 'playlist');
}

// ─── Dagelijkse notities ────────────────────────────────
let notesDate = new Date();
notesDate.setHours(0,0,0,0);
let notesSaveTimer = null;

function notesKey(date) {
  return 'ps_notes_' + date.toISOString().split('T')[0];
}

function initNotes() {
  cleanOldNotes();
  loadNotesForDate(notesDate);
}

function cleanOldNotes() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const keys = Object.keys(localStorage).filter(k => k.startsWith('ps_notes_'));
  keys.forEach(key => {
    const dateStr = key.replace('ps_notes_', '');
    if (new Date(dateStr) < cutoff) localStorage.removeItem(key);
  });
}

function loadNotesForDate(date) {
  const key = notesKey(date);
  const saved = localStorage.getItem(key) || '';
  document.getElementById('notes-area').value = saved;
  const today = new Date(); today.setHours(0,0,0,0);
  const diff = Math.round((date - today) / 86400000);
  const label = diff === 0 ? 'Vandaag' : diff === -1 ? 'Gisteren' : diff === 1 ? 'Morgen' :
    date.toLocaleDateString('nl-NL', {day:'numeric', month:'short'});
  document.getElementById('notes-date-label').textContent = label;
  document.getElementById('notes-area').placeholder = diff === 0
    ? 'Aantekeningen voor vandaag... (standup, klantgesprekken, actiepunten)'
    : 'Notities van ' + label.toLowerCase() + '...';
  document.getElementById('notes-saved').textContent = saved ? 'Opgeslagen' : 'Nog niets geschreven';
}

function saveNotes() {
  clearTimeout(notesSaveTimer);
  notesSaveTimer = setTimeout(() => {
    const key = notesKey(notesDate);
    localStorage.setItem(key, document.getElementById('notes-area').value);
    document.getElementById('notes-saved').textContent = 'Opgeslagen om ' +
      new Date().toLocaleTimeString('nl-NL', {hour:'2-digit', minute:'2-digit'});
  }, 600);
}

function changeNotesDate(delta) {
  notesDate.setDate(notesDate.getDate() + delta);
  loadNotesForDate(notesDate);
}

function clearNotes() {
  if (!confirm('Notities van deze dag verwijderen?')) return;
  localStorage.removeItem(notesKey(notesDate));
  document.getElementById('notes-area').value = '';
  document.getElementById('notes-saved').textContent = 'Leeggemaakt';
}

// ─── Bug templates ───────────────────────────────────────
const BUG_TEMPLATES = {
  ui: {
    title: "UI toont verkeerde weergave bij [beschrijf scherm/functie]",
    desc: "Stappen:\n1. Ga naar [scherm]\n2. Klik op [actie]\n3. Zie: [wat er fout gaat]\n\nVerwacht: [wat er zou moeten staan]\nBrowser/app versie: "
  },
  crash: {
    title: "Applicatie crasht / geeft foutmelding bij [actie]",
    desc: "Stappen:\n1. Ga naar [scherm]\n2. Voer [actie] uit\n3. Foutmelding: [kopieer de melding]\n\nFrequentie: altijd / soms\nOmgeving: productie / test"
  },
  performance: {
    title: "Trage werking bij [functie/scherm]",
    desc: "Stappen:\n1. Ga naar [scherm]\n2. Voer [actie] uit\n3. Laadtijd: [X seconden]\n\nVerwachte laadtijd: [X seconden]\nAantal records/gebruikers: "
  },
  data: {
    title: "Verkeerde data getoond bij [functie]",
    desc: "Stappen:\n1. Ga naar [scherm]\n2. Zie: [verkeerde waarde]\n\nVerwacht: [juiste waarde]\nBetrokken record/ID: \nOmgeving: productie / test"
  },
  toegang: {
    title: "Toegangsprobleem bij [functie/rol]",
    desc: "Stappen:\n1. Log in als [rol/gebruiker]\n2. Ga naar [scherm]\n3. Zie: [foutmelding of blokkade]\n\nVerwacht: toegang tot [functie]\nGetroffen gebruikers: "
  }
};

function applyTemplate(type) {
  const t = BUG_TEMPLATES[type];
  if (!t) return;
  document.getElementById('bug-title').value = t.title;
  document.getElementById('bug-desc').value = t.desc;
  document.getElementById('bug-title').focus();
}

// ─── To-do ───────────────────────────────────────────────
function renderTodos() {
  const list = document.getElementById('todo-list');
  const open = todos.filter(t => !t.done).length;
  const done = todos.filter(t => t.done).length;
  document.getElementById('todo-count').textContent = open + ' open';

  if (!todos.length) {
    list.innerHTML = '<div class="empty-state">Nog geen taken</div>';
    return;
  }

  // Sorteerfunctie
  const today = new Date(); today.setHours(0,0,0,0);
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);

  function todoSortKey(t) {
    if (t.done) return '9999-99-99';
    if (t.date) return t.date; // ISO datum — sorteert chronologisch
    if (t.priority === 'Vandaag') return today.toISOString().split('T')[0];
    if (t.priority === 'Morgen') return tomorrow.toISOString().split('T')[0];
    return '9998-99-99'; // Geen datum — voor done maar na rest
  }

  const sorted = todos
    .map((t, i) => ({ ...t, _idx: i }))
    .sort((a, b) => todoSortKey(a).localeCompare(todoSortKey(b)));

  function dateBadge(t) {
    if (t.date) {
      const d = new Date(t.date + 'T00:00:00');
      const diff = Math.round((d - today) / 86400000);
      if (diff < 0) return '<span class="todo-date-badge overdue">Te laat</span>';
      if (diff === 0) return '<span class="todo-date-badge today">Vandaag</span>';
      if (diff === 1) return '<span class="todo-date-badge tomorrow">Morgen</span>';
      return '<span class="todo-date-badge">' + d.toLocaleDateString('nl-NL', {day:'numeric',month:'short'}) + '</span>';
    }
    if (t.priority === 'Vandaag') return '<span class="todo-date-badge today">Vandaag</span>';
    if (t.priority === 'Morgen') return '<span class="todo-date-badge tomorrow">Morgen</span>';
    return '<span class="todo-date-badge">Geen datum</span>';
  }

  let html = '';
  const openItems = sorted.filter(t => !t.done);
  const doneItems = sorted.filter(t => t.done);

  html += openItems.map(t => `
    <div class="todo-item">
      <div class="todo-check" onclick="toggleTodo(${t._idx})"></div>
      <span class="todo-text">${t.text}</span>
      ${dateBadge(t)}
      <button class="todo-delete" onclick="deleteTodo(${t._idx})" title="Verwijderen">×</button>
    </div>`).join('');

  if (doneItems.length > 0) {
    html += '<div class="todo-section-label" style="margin-top:6px;">Afgerond (' + doneItems.length + ')</div>';
    html += doneItems.map(t => `
      <div class="todo-item">
        <div class="todo-check done" onclick="toggleTodo(${t._idx})"></div>
        <span class="todo-text done">${t.text}</span>
        ${dateBadge(t)}
        <button class="todo-delete" onclick="deleteTodo(${t._idx})" title="Verwijderen">×</button>
      </div>`).join('');
  }

  list.innerHTML = html;
}

function toggleTodo(i) {
  todos[i].done = !todos[i].done;
  saveTodos();
  renderTodos();
}

function addTodo() {
  const input = document.getElementById('todo-input');
  const prioEl = document.getElementById('todo-prio-select');
  const dateEl = document.getElementById('todo-date-input');
  const text = input.value.trim();
  if (!text) return;
  const priority = prioEl ? prioEl.value : 'Vandaag';
  const date = dateEl && dateEl.value ? dateEl.value : null;
  todos.push({ text, done: false, priority, date });
  saveTodos();
  input.value = '';
  if (dateEl) dateEl.value = '';
  renderTodos();
}

function deleteTodo(i) {
  todos.splice(i, 1);
  saveTodos();
  renderTodos();
}

function clearDoneTodos() {
  todos = todos.filter(t => !t.done);
  saveTodos();
  renderTodos();
}

// ─── Claude chat ─────────────────────────────────────────
function initChat() {
  const win = document.getElementById('chat-window');
  if (win && win.children.length === 0) {
    addChatMsg('ai', 'Hoi! Ik ben je ParnasSys assistent. Ik ken jouw werkcontext en help je met vragen over bugs, projecten, klantgesprekken en sprintprocessen. Waar kan ik je mee helpen?');
  }
}

function addChatMsg(role, text) {
  const win = document.getElementById('chat-window');
  const div = document.createElement('div');
  div.className = 'chat-msg ' + role;
  const html = formatChat(text);
  div.innerHTML = `<div class="chat-bubble ${role}">${html}</div>`;
  win.appendChild(div);
  win.scrollTop = win.scrollHeight;
}

function formatChat(t) {
  return t
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .split(/\n\n+/).map(p => {
      if (p.startsWith('- ')) {
        return '<ul>' + p.split('\n').map(l => `<li>${l.replace(/^- /,'')}</li>`).join('') + '</ul>';
      }
      return `<p>${p.replace(/\n/g,'<br>')}</p>`;
    }).join('');
}

async function sendChat() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;
  const btn = document.getElementById('chat-send');
  btn.disabled = true;
  addChatMsg('user', text);
  chatHistory.push({ role: 'user', content: text });
  input.value = '';

  // Typing indicator
  const win = document.getElementById('chat-window');
  const typing = document.createElement('div');
  typing.className = 'chat-msg ai'; typing.id = 'typing';
  typing.innerHTML = '<div class="chat-bubble ai"><div class="typing-dots"><div class="tdot"></div><div class="tdot"></div><div class="tdot"></div></div></div>';
  win.appendChild(typing); win.scrollTop = win.scrollHeight;

  if (!cfg.claudeKey && !demoMode) {
    typing.remove();
    addChatMsg('ai', 'Geen Claude API key ingesteld. Ga naar Instellingen om hem toe te voegen.');
    btn.disabled = false; return;
  }

  if (demoMode && !cfg.claudeKey) {
    await new Promise(r => setTimeout(r, 800));
    typing.remove();
    addChatMsg('ai', 'Dit is de demo-modus. Voeg een Claude API key toe in Instellingen voor echte antwoorden.');
    btn.disabled = false; return;
  }

  try {
    const data = await callProxy('claude', {
      apiKey: cfg.claudeKey,
      system: SYSTEM_PROMPT,
      messages: chatHistory,
    });
    const reply = data.content?.[0]?.text || 'Er ging iets mis.';
    typing.remove();
    addChatMsg('ai', reply);
    chatHistory.push({ role: 'assistant', content: reply });
    if (chatHistory.length > 20) chatHistory = chatHistory.slice(-20);
  } catch(e) {
    console.error('[Claude] Fout:', e.message);
    typing.remove();
    addChatMsg('ai', 'Verbindingsfout: ' + e.message);
  }
  btn.disabled = false;
}

// ─── Online opslag (Cloudflare D1) ───────────────────────
const STORAGE_URL = '/api/storage';
let syncTimer = null;
let bugsSyncTimer = null;

async function cloudGet(key) {
  try {
    const res = await fetch(STORAGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get', key }),
    });
    const data = await res.json();
    return data.value;
  } catch(e) {
    console.error('[Storage] get fout:', e.message);
    return null;
  }
}

async function cloudSet(key, value) {
  try {
    await fetch(STORAGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'set', key, value }),
    });
  } catch(e) {
    console.error('[Storage] set fout:', e.message);
  }
}

async function cloudGetAll() {
  try {
    const res = await fetch(STORAGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'getAll' }),
    });
    return await res.json();
  } catch(e) {
    console.error('[Storage] getAll fout:', e.message);
    return null;
  }
}

async function cloudSetAll(data) {
  try {
    await fetch(STORAGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'setAll', data }),
    });
  } catch(e) {
    console.error('[Storage] setAll fout:', e.message);
  }
}

// Laad alle online data bij opstarten
async function loadCloudData() {
  const cloudData = await cloudGetAll();
  if (!cloudData) return; // Offline of fout — gebruik localStorage

  // To-do's
  if (cloudData.todos && cloudData.todos.length > 0) {
    todos = cloudData.todos;
    localStorage.setItem('ps_todos', JSON.stringify(todos));
  }

  // Projecten
  if (cloudData.projects && cloudData.projects.length > 0) {
    projects = cloudData.projects;
    localStorage.setItem('ps_projects', JSON.stringify(projects));
  }

  // Verborgen projecten
  if (cloudData.hidden_projects) {
    hiddenProjects = cloudData.hidden_projects;
    localStorage.setItem('ps_hidden_projects', JSON.stringify(hiddenProjects));
  }

  // Bugs
  if (cloudData.bugs && cloudData.bugs.length > 0) {
    bugs = cloudData.bugs;
    localStorage.setItem('ps_bugs', JSON.stringify(bugs));
  }

  // Verborgen modules
  if (cloudData.hidden_modules) {
    hiddenModules = cloudData.hidden_modules;
    localStorage.setItem('ps_hidden_modules', JSON.stringify(hiddenModules));
    applyModuleVisibility();
    renderModulesList();
  }

  // Gebruikersinstellingen (naam, thema)
  if (cloudData.user_settings) {
    const s = cloudData.user_settings;
    if (s.slackName && cfg) {
      cfg.slackName = s.slackName;
      const first = s.slackName.replace(/[._]/g, ' ').trim().split(' ')[0];
      const el = document.getElementById('greeting-name');
      if (el && first) el.textContent = first.charAt(0).toUpperCase() + first.slice(1);
    }
    if (s.theme) { selectedTheme = s.theme; applyTheme(s.theme); }
    if (s.accent) { selectColor(s.colorName || 'lime', s.accent, s.accentText || '#0E0E0C'); }
    if (s.spotifyFavoritePlaylist !== undefined) {
      spotifyFavoritePlaylist = s.spotifyFavoritePlaylist;
      localStorage.setItem('spotify_fav_playlist', JSON.stringify(spotifyFavoritePlaylist));
      renderSpotifyFavShortcut();
    }
    if (s.spotifyFocusPlaylistId !== undefined) {
      spotifyFocusPlaylistId = s.spotifyFocusPlaylistId;
      localStorage.setItem('spotify_focus_playlist_id', spotifyFocusPlaylistId || '');
    }
  }

  // Herrender alles
  renderTodos();
  renderProjects();
  renderBugList();
}

// Sla to-do's op — lokaal + online
function saveTodos() {
  localStorage.setItem('ps_todos', JSON.stringify(todos));
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => cloudSet('todos', todos), 1000);
}

// Sla projecten op — lokaal + online
function saveProjectsCloud() {
  localStorage.setItem('ps_projects', JSON.stringify(projects));
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => cloudSet('projects', projects), 1000);
}

// Sla verborgen projecten op — lokaal + online
function saveHiddenProjects() {
  localStorage.setItem('ps_hidden_projects', JSON.stringify(hiddenProjects));
  cloudSet('hidden_projects', hiddenProjects);
}

// Sla bugs op — lokaal + online
function saveBugs() {
  localStorage.setItem('ps_bugs', JSON.stringify(bugs));
  clearTimeout(bugsSyncTimer);
  bugsSyncTimer = setTimeout(() => cloudSet('bugs', bugs), 1000);
}

// Sla verborgen modules op — lokaal + online
function saveHiddenModules() {
  localStorage.setItem('ps_hidden_modules', JSON.stringify(hiddenModules));
  cloudSet('hidden_modules', hiddenModules);
}

// Sla gebruikersinstellingen op — online
function saveUserSettings() {
  cloudSet('user_settings', {
    slackName: cfg?.slackName || '',
    theme: selectedTheme,
    accent: selectedAccent,
    accentText: selectedAccentText,
    colorName: selectedColor,
    spotifyFavoritePlaylist: spotifyFavoritePlaylist || null,
    spotifyFocusPlaylistId: spotifyFocusPlaylistId || null,
  });
}



// ─── Notificatie modal beheer ────────────────────────
function testNotification() {
  if (!('Notification' in window)) {
    notify('Je browser ondersteunt geen notificaties', 'error'); return;
  }
  if (Notification.permission === 'denied') {
    notify('Notificaties geblokkeerd — zie uitleg in het paneel', 'error'); return;
  }
  if (Notification.permission === 'default') {
    Notification.requestPermission().then(p => {
      if (p === 'granted') testNotification();
      else notify('Toestemming geweigerd', 'error');
    });
    return;
  }
  const notif = new Notification('📅 Testmelding werkdag dashboard', {
    body: 'Notificaties werken correct! Je ontvangt een melding ' + (notifSettings.minutesBefore || 5) + ' minuten voor elke afspraak.',
    icon: 'data:image/svg+xml,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 100 100\'><rect width=\'100\' height=\'100\' fill=\'%230E0E0C\' rx=\'20\'/><path d=\'M26 52l17 17 31-35\' stroke=\'%23C8F55A\' stroke-width=\'12\' stroke-linecap=\'round\' stroke-linejoin=\'round\' fill=\'none\'/></svg>',
    tag: 'test-notif',
  });
  notif.onclick = () => { window.focus(); notif.close(); };
  setTimeout(() => notif.close(), 8000);
  notify('🔔 Testmelding verstuurd — check je scherm', 'success');
}

function openNotifSettings() {
  updateNotifModal();
  document.getElementById('notif-settings-modal').classList.add('open');
}

function updateNotifModal() {
  const enabled = notifSettings.enabled;
  const mb = notifSettings.minutesBefore || 5;
  const toggle = document.getElementById('notif-toggle');
  const knob = document.getElementById('notif-toggle-knob');
  const options = document.getElementById('notif-options');
  const warning = document.getElementById('notif-permission-warning');

  if (toggle) {
    toggle.style.background = enabled ? 'var(--accent)' : 'var(--bg4)';
    toggle.style.border = '1px solid ' + (enabled ? 'var(--accent)' : 'var(--border2)');
  }
  if (knob) knob.style.transform = enabled ? 'translateX(16px)' : 'translateX(0)';
  if (options) options.style.opacity = enabled ? '1' : '0.4';
  if (options) options.style.pointerEvents = enabled ? 'auto' : 'none';

  // Check browser toestemming
  if (warning) {
    warning.style.display = (enabled && Notification.permission === 'denied') ? 'block' : 'none';
  }

  // Timing knoppen
  [1, 5, 10, 15].forEach(m => {
    const btn = document.getElementById('notif-btn-' + m);
    if (btn) btn.classList.toggle('active', m === mb);
  });
}

function toggleNotifEnabled() {
  notifSettings.enabled = !notifSettings.enabled;
  if (notifSettings.enabled && Notification.permission === 'default') {
    Notification.requestPermission().then(p => {
      if (p === 'granted') notify('🔔 Notificaties ingeschakeld', 'success');
      updateNotifModal();
    });
  }
  saveNotifSettings();
  updateNotifModal();
  notify(notifSettings.enabled ? '🔔 Notificaties ingeschakeld' : '🔕 Notificaties uitgeschakeld', 'info');
}

function setNotifMinutes(m) {
  notifSettings.minutesBefore = m;
  notifiedEvents.clear(); // Reset zodat nieuwe timing direct werkt
  saveNotifSettings();
  updateNotifModal();
  const label = m === 1 ? '1 minuut' : m + ' minuten';
  notify('⏰ Melding ' + label + ' van tevoren', 'info');
}

// ─── Afspraak notificaties ────────────────────────────
let notifiedEvents = new Set();

// Notificatie instellingen
let notifSettings = JSON.parse(localStorage.getItem('ps_notif_settings') || '{"enabled":true,"minutesBefore":5}');

function saveNotifSettings() {
  localStorage.setItem('ps_notif_settings', JSON.stringify(notifSettings));
}

function initNotifications() {
  if (!('Notification' in window)) return;
  if (notifSettings.enabled && Notification.permission === 'default') {
    Notification.requestPermission().then(p => {
      if (p === 'granted') notify('🔔 Afspraak-notificaties ingeschakeld', 'success');
    });
  }
  setInterval(() => { checkUpcomingMeetings(); checkMeetingAutoPause(); }, 60 * 1000);
  setTimeout(() => { checkUpcomingMeetings(); checkMeetingAutoPause(); }, 3000);
}

function checkUpcomingMeetings() {
  if (!notifSettings.enabled) return;
  if (Notification.permission !== 'granted') return;

  const now = new Date();
  const allEvents = window._currentAgendaEvents || [];
  const mb = notifSettings.minutesBefore || 5;

  allEvents.forEach(e => {
    const attr = e.attributes || e;
    const startRaw = attr.start?.dateTime || attr.start?.date || attr.start || '';
    let startStr = String(startRaw).trim().replace(/\.0+$/, '');
    if (!startStr) return;
    const startDate = startStr.match(/Z$|[+\-]\d{2}:?\d{2}$/)
      ? new Date(startStr) : new Date(startStr + 'Z');
    if (isNaN(startDate)) return;

    const diffMinutes = (startDate - now) / 60000;
    const eventKey = (attr.subject || attr.title || 'Afspraak') + startStr + mb;

    // Stuur als de afspraak binnen mb minuten begint en nog niet gemeld is
    if (diffMinutes >= 0 && diffMinutes <= mb && !notifiedEvents.has(eventKey)) {
      notifiedEvents.add(eventKey);
      const title = attr.subject || attr.title || 'Afspraak';
      const location = attr.location?.displayName || attr.location || '';
      const startFmt = startDate.toLocaleTimeString('nl-NL', {
        hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam'
      });
      const minLabel = mb === 1 ? '1 minuut' : mb + ' minuten';
      const notif = new Notification('📅 Over ' + minLabel + ': ' + title, {
        body: startFmt + (location ? ' · ' + location : ''),
        icon: 'data:image/svg+xml,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 100 100\'><rect width=\'100\' height=\'100\' fill=\'%230E0E0C\' rx=\'20\'/><path d=\'M26 52l17 17 31-35\' stroke=\'%23C8F55A\' stroke-width=\'12\' stroke-linecap=\'round\' stroke-linejoin=\'round\' fill=\'none\'/></svg>',
        tag: eventKey, renotify: false,
      });
      notif.onclick = () => { window.focus(); notif.close(); };
      setTimeout(() => notif.close(), 10000);
    }
  });
}


// ─── Brain dump ──────────────────────────────────────
let bdSavedDumps = JSON.parse(localStorage.getItem('ps_braindumps') || '{}');

function bdInit() {
  // Laad eventuele opgeslagen dump van vandaag
  const today = new Date().toISOString().split('T')[0];
  const saved = bdSavedDumps[today];
  if (saved && saved.text) {
    document.getElementById('bd-textarea').value = saved.text;
    document.getElementById('bd-sub').textContent = 'Vandaag om ' + (saved.time || '?');
    bdUpdateCount();
  }
}

function bdUpdateCount() {
  const val = document.getElementById('bd-textarea').value;
  const lines = val.split('\n').filter(l => l.trim().length > 0);
  document.getElementById('bd-count').textContent = lines.length + (lines.length === 1 ? ' regel' : ' regels');
  document.getElementById('bd-verwerk-btn').disabled = lines.length === 0;
  const badge = document.getElementById('bd-badge');
  if (lines.length > 0) {
    badge.textContent = lines.length + ' gedachten';
    badge.className = 'braindump-badge active';
  } else {
    badge.textContent = 'Leeg';
    badge.className = 'braindump-badge';
  }
  // Auto-opslaan
  const today = new Date().toISOString().split('T')[0];
  const now = new Date().toLocaleTimeString('nl-NL', {hour:'2-digit', minute:'2-digit'});
  bdSavedDumps[today] = { text: val, time: now };
  localStorage.setItem('ps_braindumps', JSON.stringify(bdSavedDumps));
}

function bdVerwerk() {
  const val = document.getElementById('bd-textarea').value;
  const lines = val.split('\n').filter(l => l.trim().length > 0);
  document.getElementById('bd-phase-dump').style.display = 'none';
  document.getElementById('bd-phase-verwerk').style.display = 'flex';

  const list = document.getElementById('bd-item-list');
  list.innerHTML = lines.map((line, i) => `
    <div class="braindump-item" id="bd-row-${i}">
      <input type="checkbox" class="braindump-item-check" id="bd-cb-${i}" onchange="bdUpdateVoeg()">
      <span class="braindump-item-text">${line.trim()}</span>
      <select class="braindump-item-prio" id="bd-prio-${i}">
        <option>Vandaag</option>
        <option>Morgen</option>
        <option>Geen datum</option>
      </select>
      <button class="braindump-skip-btn" onclick="bdSkip(${i})" title="Overslaan">×</button>
    </div>`).join('');
}

function bdSkip(i) {
  document.getElementById('bd-row-' + i).classList.add('skipped');
  document.getElementById('bd-cb-' + i).checked = false;
  bdUpdateVoeg();
}

function bdUpdateVoeg() {
  const checked = document.querySelectorAll('#bd-item-list input[type=checkbox]:checked').length;
  const btn = document.getElementById('bd-voeg-btn');
  btn.disabled = checked === 0;
  btn.textContent = checked > 0 ? 'Voeg ' + checked + ' toe aan to-do' : 'Voeg toe aan to-do';
}

function bdVoegToe() {
  const checkboxes = document.querySelectorAll('#bd-item-list input[type=checkbox]:checked');
  let count = 0;
  checkboxes.forEach(cb => {
    const i = cb.id.replace('bd-cb-', '');
    const text = document.getElementById('bd-row-' + i).querySelector('.braindump-item-text').textContent;
    const prio = document.getElementById('bd-prio-' + i).value;
    todos.push({ text, done: false, priority: prio, date: null });
    count++;
  });
  if (count > 0) {
    saveTodos();
    renderTodos();
  }

  // Archiveer de volledige dump in dagelijkse notities
  const today = new Date().toISOString().split('T')[0];
  const notesKey = 'ps_notes_' + today;
  const existing = localStorage.getItem(notesKey) || '';
  const dumpText = document.getElementById('bd-textarea').value.trim();
  const notesEntry = (existing ? existing + '\n\n' : '') + '── Brain dump ──\n' + dumpText;
  localStorage.setItem(notesKey, notesEntry);

  // Toon klaar-fase
  document.getElementById('bd-phase-verwerk').style.display = 'none';
  document.getElementById('bd-phase-klaar').style.display = 'flex';
  document.getElementById('bd-klaar-text').textContent = count + ' taken toegevoegd aan je to-do lijst. De volledige dump is opgeslagen in je dagelijkse notities.';
  document.getElementById('bd-badge').textContent = '✓ Gedaan';
  document.getElementById('bd-badge').className = 'braindump-badge done';
  document.getElementById('bd-sub').textContent = 'Verwerkt om ' + new Date().toLocaleTimeString('nl-NL', {hour:'2-digit', minute:'2-digit'});
  notify('🧠 Brain dump verwerkt — ' + count + ' taken toegevoegd', 'success');
}

function bdTerug() {
  document.getElementById('bd-phase-verwerk').style.display = 'none';
  document.getElementById('bd-phase-dump').style.display = 'flex';
}

function bdReset() {
  document.getElementById('bd-textarea').value = '';
  document.getElementById('bd-phase-klaar').style.display = 'none';
  document.getElementById('bd-phase-dump').style.display = 'flex';
  document.getElementById('bd-badge').textContent = 'Leeg';
  document.getElementById('bd-badge').className = 'braindump-badge';
  document.getElementById('bd-sub').textContent = 'Nog niet gestart vandaag';
  bdUpdateCount();
}

// ─── Notificaties ────────────────────────────────────────
function notify(msg, type = 'info') {
  const bar = document.getElementById('notif-bar');
  const div = document.createElement('div');
  div.className = 'notif ' + type;
  div.textContent = msg;
  bar.appendChild(div);
  setTimeout(() => { div.style.opacity = '0'; div.style.transition = 'opacity 0.3s'; setTimeout(() => div.remove(), 300); }, 3000);
}

// ─── Init ────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  loadTheme();
  updateWizardUI();
  if (loadSavedCfg()) {
    const email = cfg.jiraEmail || '';
    if (email) {
      const name = email.split('@')[0];
      document.getElementById('greeting-name').textContent = name.charAt(0).toUpperCase() + name.slice(1);
    }
    startDashboard();
  }
});
