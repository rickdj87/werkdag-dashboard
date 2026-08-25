# Installatiehandleiding — Werkdag Dashboard

Dit dashboard draait op **Cloudflare Pages** (statische site + Pages
Functions) met **Cloudflare D1** als database. Deze handleiding is voor
collega's die het project zelf willen opzetten of overnemen.

## 1. Structuur van de repository

```
public/                  Statische site — dit wordt naar Cloudflare gedeployed
  index.html
  css/style.css
  js/app.js
functions/api/            Cloudflare Pages Functions (serverless backend)
  proxy.js                 Proxy naar Claude, Jira, Slack, Microsoft Graph
  storage.js                CRUD op de D1-database (todos, projecten, agenda, ...)
migrations/                D1-schema (SQL-migraties)
scripts/                   Eenmalig import-script (seed-from-backup.sql)
wrangler.jsonc              Cloudflare-configuratie (Pages + D1-binding)
agenda-sync/                Losse Cloudflare Worker (Cron Trigger, elke 5 min) die de
                             ICS-agenda ophaalt en in D1 zet — vervangt Power Automate
data/                       Archief van de laatste stand vóór de D1-migratie
server.js, electron-main.js Losstaande lokale/Electron-variant (eigen data/*.json-opslag)
```

## 2. Vereisten

- Node.js 18+
- Een Cloudflare-account met toegang tot Pages en D1
- `npm install -g wrangler` (of gebruik de lokale devDependency via `npx wrangler`)

## 3. Lokaal draaien

**Optie A — losse lokale variant (geen Cloudflare nodig):**
```bash
npm install
node server.js          # of: npm start
```
Dit leest/schrijft naar `data/*.json` op je eigen schijf en gebruikt je eigen
`.env` (kopieer `.env.example` naar `.env` en vul je keys in) voor de
proxy-services. Handig om snel te testen zonder Cloudflare-toegang.

**Optie B — tegen de echte Cloudflare-stack (Pages Functions + D1):**
```bash
wrangler login
wrangler pages dev public --d1=DB
```
Dit start een lokale D1-database (in `.wrangler/state/`) met hetzelfde schema
als productie, zodra je de migraties lokaal hebt toegepast (stap 4).

## 4. Cloudflare-resources opzetten (eenmalig, per nieuw account)

```bash
wrangler login

# D1-database aanmaken
wrangler d1 create werkdag-dashboard-db
# → kopieer de database_id uit de output naar wrangler.jsonc

# Schema toepassen
wrangler d1 migrations apply werkdag-dashboard-db --remote      # productie
wrangler d1 migrations apply werkdag-dashboard-db --local       # lokale dev

# Pages-project aanmaken
wrangler pages project create werkdag-dashboard --production-branch=main
```

### Secrets (API keys voor de proxy-functie)

```bash
wrangler pages secret put ANTHROPIC_KEY --project-name=werkdag-dashboard
wrangler pages secret put JIRA_EMAIL --project-name=werkdag-dashboard
wrangler pages secret put JIRA_TOKEN --project-name=werkdag-dashboard
wrangler pages secret put SLACK_TOKEN --project-name=werkdag-dashboard
```
`MS_TOKEN` (Microsoft Graph/agenda) wordt niet als secret gezet — dat token
vult de gebruiker zelf in via de instellingen in het dashboard, en verloopt
elk uur.

### Data importeren (alleen nodig bij een verse database)

`scripts/seed-from-backup.sql` bevat een export van de laatste stand vóór de
migratie. Eenmalig uitvoeren:
```bash
wrangler d1 execute werkdag-dashboard-db --remote --file=./scripts/seed-from-backup.sql
```

### Eerste (handmatige) deploy

```bash
wrangler pages deploy public --project-name=werkdag-dashboard
```
Je site is daarna te bereiken op `https://werkdag-dashboard.pages.dev`.

## 5. Automatisch deployen via GitHub Actions

`.github/workflows/deploy.yml` deployt automatisch bij elke push naar `main`,
**behalve** wanneer alleen bestanden in `data/` wijzigen (dat is puur het
archief, geen reden om opnieuw te deployen).

Zet deze twee repo-secrets in GitHub
(**Settings → Secrets and variables → Actions → New repository secret**):

| Secret | Waarde |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Een API-token met rechten *Cloudflare Pages: Edit*, *D1: Edit* én *Workers Scripts: Edit* (voor de agenda-sync Worker) voor je account. Aanmaken via [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens) → "Create Token" → custom token met die drie permissies. |
| `CLOUDFLARE_ACCOUNT_ID` | Te vinden via `wrangler whoami`, of rechtsonder op elke pagina in het Cloudflare-dashboard. |

Zodra deze secrets staan, deployt elke push naar `main` (met wijzigingen
buiten `data/`) automatisch.

## 6. Agenda-sync — Cloudflare Worker (vervangt Power Automate)

De Outlook-agenda werd eerst door Power Automate weggeschreven, en later
kortstondig via een generieke `set_agenda`-actie op `/api/storage`. Beide
zijn vervangen door een eigen Cloudflare Worker in `agenda-sync/` die zelf
elke **5 minuten** de gepubliceerde ICS-agenda ophaalt, de afspraken
(inclusief terugkerende afspraken) parseert, en direct in de
`agenda_events`-tabel in D1 zet.

**Eenmalig opzetten bij een nieuw account:**
```bash
cd agenda-sync
wrangler login
wrangler secret put ICS_URL     # plak hier de "Agenda publiceren"-link uit Outlook
wrangler deploy
```

De ICS-link haal je op via **Outlook (web) → Instellingen → Agenda →
Gedeelde agenda's → Publiceren** (of: agenda delen → "ICS"-link). Deze link
bevat een geheime token — behandel 'm als een wachtwoord, zet 'm nooit in
code of git, alleen als secret.

**Testen of het werkt** (geeft alleen een aantal terug, geen agenda-inhoud):
```bash
curl https://werkdag-agenda-sync.<jouw-cloudflare-account>.workers.dev/
# {"ok":true,"count":10,"updatedAt":"..."}
```

**Belangrijk:** zodra deze Worker draait, kun je de oude Power
Automate-flow (als die nog actief is) uitzetten of verwijderen in Power
Automate zelf — dat gaat niet vanuit deze repository.

*Bekende beperking:* de RRULE-afhandeling (terugkerende afspraken) dekt de
gangbare gevallen voor een werkagenda (dagelijks/wekelijks/maandelijks,
met `COUNT`/`UNTIL`/`BYDAY`) maar is geen volledige RFC5545-implementatie —
zeer ongebruikelijke herhalingspatronen kunnen gemist worden.

## 7. Databeheer

- **Bekijken:** `wrangler d1 execute werkdag-dashboard-db --remote --command="SELECT * FROM todos"`
- **Backup maken:** `wrangler d1 export werkdag-dashboard-db --remote --output=backup.sql`
- **Schema wijzigen:** nieuwe migratie toevoegen met
  `wrangler d1 migrations create werkdag-dashboard-db <naam>`, daarna
  `wrangler d1 migrations apply werkdag-dashboard-db --remote`.

## 8. Electron-app (desktop)

De Electron-wrapper (`electron-main.js`) start gewoon `server.js` lokaal op
en is niet gekoppeld aan Cloudflare — die gebruikt altijd de lokale
`data/*.json`-bestanden. Bouwen: `npm run build` (macOS `.dmg` via
electron-builder).
