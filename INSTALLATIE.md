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
| `CLOUDFLARE_API_TOKEN` | Een API-token met rechten *Cloudflare Pages: Edit* en *D1: Edit* voor je account. Aanmaken via [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens) → "Create Token" → custom token met die twee permissies. |
| `CLOUDFLARE_ACCOUNT_ID` | Te vinden via `wrangler whoami`, of rechtsonder op elke pagina in het Cloudflare-dashboard. |

Zodra deze secrets staan, deployt elke push naar `main` (met wijzigingen
buiten `data/`) automatisch.

## 6. Power Automate — agenda-koppeling omzetten

De Outlook-agenda werd voorheen door Power Automate weggeschreven naar
`data/agenda.json` via een commit op GitHub. Dat gaat nu direct naar D1.
Pas de HTTP-actie in de Power Automate-flow aan:

- **Oude URL:** de Netlify-functie (`.../.netlify/functions/storage`)
- **Nieuwe URL:** `https://werkdag-dashboard.pages.dev/api/storage`
- **Body:** ongewijzigd — nog steeds `{"action": "set_agenda", "events": [...]}`

Dit moet handmatig in Power Automate aangepast worden; dat kan niet vanuit
deze repository.

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
