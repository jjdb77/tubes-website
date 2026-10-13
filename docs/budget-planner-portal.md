# Budget Planner-portal

Klantportaal en API voor de **Budget Planner**, de lokale Electron-app in
`~/Documents/BudgetPlannerBuilder` (zie de README daar). Productiebedrijven
maken een account, dienen een productie in (brief + documenten), de app haalt
die op met een koppelcode (API-sleutel), draait de planner en zet het
resultaat terug: `budget.json` (budgetbestand van de app),
`tubes-planner.json` (Tubes-export), optioneel een PDF en een samenvatting.
De uitgever (Tubes) kan met een admin-sleutel hetzelfde doen voor elke klant.

Bouwdatum 8-10-2026. Niets hiervan vraagt een nieuwe dependency: Express,
`node:crypto` (scrypt, HMAC, sha256) en een eigen minimale multipart-lezer.

## Bestanden

| Bestand | Wat |
| --- | --- |
| `lib/portal.js` | Alle serverlogica: accounts, sessie, koppelcode, jobs, documenten, resultaat, admin, mail. `mountPortal(app, { dataDir, sendMail, siteUrl })`, aangeroepen in `server.js` vlak vóór het cachebeleid. Exporteert ook `parseMultipart` en `cleanBrief` voor de test. |
| `server.js` | Eén import, één `mountPortal(...)`, en `portal.adminBlock()` op `/beheer` (lijst bedrijven met producties). |
| `src/resources/budget-planner.njk` | Landingspagina `/resources/budget-planner/`: hero uit `sections`, de rest eigen HTML (in/uit, drie stappen, downloads, AI-noot, FAQ, cta). |
| `src/resources/budget-planner-portal.njk` | Portaalpagina `/resources/budget-planner/portal/` (`noindex`), leeg mountpunt `[data-bp-portal]`. |
| `src/js/budget-planner-portal.js` | Het portaal: aanmelden/inloggen, koppelcode, nieuwe productie met uploads, lijst met status, downloads, opmerking, verwijderen. Alles via `fetch` naar de eigen server. |
| `src/css/budget-planner.css` | Opmaak, klassen `bp-*`; alleen op die twee pagina's geladen via `page_css: budgetPlannerCss` (nieuwe generieke haak in `layout.njk`, hash in `eleventy.config.js`). |
| `test/budget-planner-portal.test.mjs` | End-to-end-test, onderdeel van `npm test`. |
| `src/content/pages/resources.md`, `partials/footer.njk`, `_data/settings.json` | Kaart op /resources/ (plek 3), regel in de Explore-footer (Free tools), `footer_nav`. |

## Routes

### Pagina's

- `GET /resources/budget-planner/` landingspagina (in sitemap en llms.txt)
- `GET /resources/budget-planner/portal/` portaal (`noindex`; `#signup`/`#login` scrollen naar het juiste kaartje; `?verified=1|0` toont de uitkomst van de e-mailbevestiging)

### Account (alleen voor de portaalpagina, sessiecookie)

Alle wijzigende aanroepen eisen de header `X-Requested-With` (willekeurige
waarde); zonder die header antwoordt de server 403. Een andere site kan die
header niet meesturen zonder CORS-preflight, en CORS staat niet aan: dat is de
CSRF-bescherming. Een meegestuurde `Origin` moet bovendien bij de eigen host
horen. Cookie `tubes_portal`: HttpOnly, SameSite=Lax, Secure achter https,
30 dagen, HMAC-getekend (bedrijf-id + vervaldatum).

| Methode en pad | Body (JSON) | Antwoord |
| --- | --- | --- |
| `POST /api/portal/signup` | `{ company, contact, email, password, consent: true }` | `{ ok, company, apiKey: null, verificationMailed }`; wachtwoord ≥ 10 tekens; 409 als het e-mailadres al bestaat |
| `POST /api/portal/login` | `{ email, password }` | `{ ok, company, apiKey: { id, created_at } \| null }`; 401 bij fout |
| `POST /api/portal/logout` | | `{ ok }` |
| `GET /api/portal/session` | | `{ ok, company \| null, apiKey }` |
| `POST /api/portal/api-key` | | `{ ok, apiKey: { id, created_at, key } }`; **`key` wordt één keer getoond**, de vorige sleutel vervalt meteen |
| `GET /api/portal/verify?token=` | | redirect naar het portaal met `?verified=1` (of `0`) |
| `POST /api/portal/verify/resend` | | `{ ok, mailed, verified? }` |

`company` = `{ id, company, contact, email, created_at, verified }`.
Rate-limit op signup/login/resend: 10 per 10 minuten per IP.

### API v1 (de app én het portaal)

Basispad **`/api/portal/v1`**, online dus `https://www.tubes.media/api/portal/v1`.
Authenticatie: `Authorization: Bearer <koppelcode>` (bedrijf),
`Authorization: Bearer <PORTAL_ADMIN_KEY>` (admin, ziet en bewerkt alles), of
de sessiecookie van het portaal (dan met `X-Requested-With` op wijzigende
aanroepen). Koppelcode-formaat `bp_<8 hex>_<48 hex>`; op schijf staat alleen
een sha256-hash plus het id. Rate-limit 600 aanroepen per 10 minuten per
sleutel/IP; uploads 30 per 10 minuten per bedrijf. Alle antwoorden
`Cache-Control: no-store`. Fouten: `{ ok: false, error }` met 400/401/403/404/413/415/429.

| Methode en pad | Wie | Wat |
| --- | --- | --- |
| `GET /me` | sleutel, sessie | `{ company, contact, email, verified }` (admin: `{ admin: true, company: null, ... }`) |
| `GET /jobs` | sleutel, sessie, admin | lijst van jobs (admin: alle), nieuwste eerst |
| `GET /admin/jobs` | admin | alle jobs, elk met `company: { id, name, contact, email, api_key_id }` |
| `POST /jobs` | sleutel, sessie | multipart/form-data, zie hieronder; 201 met de job |
| `GET /jobs/:id` | eigenaar, admin | één job |
| `PATCH /jobs/:id` | eigenaar, admin | JSON `{ status: "submitted" \| "in_progress" }` en/of `{ feedback }`; `delivered` alleen via het resultaat |
| `POST /jobs/:id/feedback` | eigenaar, admin | JSON `{ feedback }`; mailt `PORTAL_NOTIFY_EMAIL` |
| `DELETE /jobs/:id` | eigenaar, admin | verwijdert job én bestanden |
| `GET /jobs/:id/documents/:docId` | eigenaar, admin | de bytes, `Content-Disposition: attachment; filename="<originele naam>"` |
| `POST /jobs/:id/result` | eigenaar, admin | multipart: veld `summary` (JSON-string), bestanden `budget` (json), `tubes` (json), optioneel `pdf`; zet status `delivered`, mailt de contactpersoon |
| `GET /jobs/:id/result` | eigenaar, admin | `{ id, title, status, feedback, summary, delivered_at, downloads: { budget, tubes, pdf \| null } }` |
| `GET /jobs/:id/result/budget` `…/tubes` `…/pdf` | eigenaar, admin | de bestanden, `Content-Disposition` met `<titel-slug>.budget.json`, `.tubes-planner.json`, `.pdf` |

**Job-object** (zoals `GET /jobs` het geeft):

```json
{
  "id": "uuid",
  "title": "De laatste veerboot",
  "status": "submitted | in_progress | delivered",
  "created_at": "ISO", "updated_at": "ISO",
  "brief": {
    "title": "…", "format": "feature_film | short_film | documentary | drama_series | commercial | other",
    "genre": "…", "length_minutes": 18, "episodes": null,
    "budget_level": "modest | mid | high", "target_total": 45000,
    "start_phase": "development | preproduction | shoot | post",
    "start_date": "YYYY-MM-DD | null", "deadline": "YYYY-MM-DD | null",
    "shooting_days": 4, "notes": "…", "language": "nl | en", "currency": "EUR"
  },
  "documents": [{ "id": "uuid", "name": "script.fdx", "kind": "script | treatment | synopsis | brief | other", "size": 12345 }],
  "feedback": "",
  "language": "nl",
  "result": null
}
```

Na levering is `result` = `{ summary, delivered_at, downloads }` met `summary`
= `{ total, currency, activities, shooting_days, lines, verdict, summary_text }`
(ontbrekende getallen zijn `null`, teksten `""`).

**`POST /jobs` (multipart)**: tekstvelden met de briefnamen hierboven
(`title` verplicht, de rest optioneel; onbekende keuzes vallen terug op
`other`/`mid`/`development`/`en`/`EUR`), bestanden in het veld `documents`
(meerdere), en per bestand een `documents_kind` in dezelfde volgorde. Alleen
`.fdx .pdf .txt .md`, hoogstens 20 MB per bestand, 10 per productie, 100
producties per account. Bestandsnamen worden nooit gebruikt als pad: de
bytes staan onder het document-id, de naam alleen in de metadata.

**`POST /jobs/:id/result`** met curl (let op: `-F summary='{…}'` inline gaat
mis zodra de JSON een `;` bevat, curl ziet dat als parameterscheiding; lees
hem uit een bestand):

```sh
curl -H "Authorization: Bearer $PORTAL_ADMIN_KEY" \
  -F "summary=<summary.json" -F budget=@film.budget.json -F tubes=@film.tubes-planner.json -F pdf=@film.pdf \
  https://www.tubes.media/api/portal/v1/jobs/<id>/result
```

Typische app-lus: `GET /jobs` → kies `status: "submitted"` → `PATCH` naar
`in_progress` → documenten ophalen → planner draaien → `POST …/result`.

### Installers (achter wachtwoord)

De downloadknoppen op de landingspagina en in het portaal komen uit
`src/js/budget-planner-downloads.js` (mountpunt `[data-bp-downloads]`). Op de
landingspagina staat een wachtwoordveld; een goed wachtwoord zet de cookie
`tubes_portal_dl` (HMAC-getekend, HttpOnly, SameSite=Lax, 7 dagen). In het
portaal telt een ingelogde sessie als ontgrendeld; de admin-sleutel ook.
Installer-id's: `mac-arm64`, `mac-x64`, `win`.

| Methode en pad | Wie | Wat |
| --- | --- | --- |
| `POST /api/portal/download-access` | iedereen, `X-Requested-With` verplicht | JSON `{ password }`, constant-time vergeleken met `PORTAL_DOWNLOAD_PASSWORD`; 10 pogingen per 10 min per IP; 401 bij fout, 503 als de env ontbreekt; antwoord `{ ok, downloads }` + cookie |
| `GET /api/portal/downloads` | cookie, sessie of admin | `{ ok, downloads: [{ id, label, hint, name, size, version, uploaded_at, available }] }` (401 met `locked: true` zonder toegang) |
| `GET /api/portal/download/:id` | cookie, sessie of admin | het bestand, `application/octet-stream`, `Content-Length`, `Content-Disposition: attachment; filename="<originele naam>"`, `no-transform` (geen gzip); 404 zolang niet geüpload |
| `PUT /api/portal/v1/admin/downloads/:id` | admin | installer plaatsen (overschrijft): raw body **of** multipart met veld `file`; `version` en `name` als query of als multipart-velden; tot 200 MB, gestreamd naar schijf (nooit in het geheugen) |
| `DELETE /api/portal/v1/admin/downloads/:id` | admin | installer en metadata weg |
| `GET /api/portal/v1/admin/downloads` | admin | dezelfde lijst als hierboven |

Installer plaatsen vanaf de Mac waar `npm run dist:mac` / `dist:win` draaide:

```sh
KEY=...   # PORTAL_ADMIN_KEY
cd ~/Documents/BudgetPlannerBuilder/dist
curl -T "Budget Builder-0.2.0-mac-arm64.dmg" -H "Authorization: Bearer $KEY" \
  "https://www.tubes.media/api/portal/v1/admin/downloads/mac-arm64?version=0.2.0&name=Budget%20Builder-0.2.0-mac-arm64.dmg"
curl -T "Budget Builder-0.2.0-mac-x64.dmg" -H "Authorization: Bearer $KEY" \
  "https://www.tubes.media/api/portal/v1/admin/downloads/mac-x64?version=0.2.0&name=Budget%20Builder-0.2.0-mac-x64.dmg"
curl -T "Budget Builder-Setup-0.2.0.exe" -H "Authorization: Bearer $KEY" \
  "https://www.tubes.media/api/portal/v1/admin/downloads/win?version=0.2.0&name=Budget%20Builder-Setup-0.2.0.exe"
```

Multipart kan ook: `curl -F file=@"Budget Builder-0.2.0-mac-arm64.dmg" -F version=0.2.0 -F "name=Budget Builder-0.2.0-mac-arm64.dmg" …`.
Zonder `name` wordt de bestandsnaam uit het multipart-deel gebruikt, of
`budget-planner-<id>.dmg|.exe`. Geen redeploy nodig; de knoppen tonen versie
en grootte meteen.

## Opslag

Op de Railway-volume (`RAILWAY_VOLUME_MOUNT_PATH`, lokaal `./data/`), map `portal/`:

```
portal/companies.json        id → { id, name, contact, email, salt, hash (scrypt), createdAt,
                                    verifiedAt, verifyToken, apiKey: { id, hash (sha256), createdAt } }
portal/jobs.json             id → job (zie boven, plus companyId en result.files)
portal/files/<jobId>/<docId>             geüploade documenten
portal/files/<jobId>/result-budget.json  resultaat
portal/files/<jobId>/result-tubes.json
portal/files/<jobId>/result.pdf          (optioneel)
portal/downloads/<id>        de installers (mac-arm64, mac-x64, win), tot 200 MB elk
portal/downloads.json        id → { name, version, size, uploaded_at }
portal/session-secret        HMAC-sleutel (alleen als PORTAL_SESSION_SECRET ontbreekt; tekent ook de downloadcookie)
```

Schrijven gaat atomair (tmp + rename), geen database. Bij tientallen
bedrijven en honderden jobs is dat prima; daarboven is SQLite de volgende stap.

## Env-variabelen (Railway-service tubes-website)

| Variabele | Verplicht | Wat |
| --- | --- | --- |
| `PORTAL_ADMIN_KEY` | ja, anders geen admin-toegang | bearer voor `/admin/jobs` en alle jobs; lang en willekeurig, bv. `openssl rand -hex 32` |
| `PORTAL_DOWNLOAD_PASSWORD` | ja, anders staan de downloads dicht (503) | het wachtwoord dat producenten intypen om de installers te zien; één gedeeld wachtwoord, uitdelen per uitnodiging |
| `PORTAL_SESSION_SECRET` | nee | HMAC-sleutel van de sessiecookie; zonder deze maakt de server er eenmalig een op de volume |
| `PORTAL_NOTIFY_EMAIL` | nee | krijgt mail bij een nieuwe productie en bij een opmerking (standaard joachim@tubes.media) |
| `RESEND_API_KEY`, `MAIL_FROM` | bestaand | zonder sleutel geen bevestigingsmail, geen "budget is klaar"-mail; het portaal werkt dan gewoon, e-mailbevestiging is niet verplicht |
| `RAILWAY_VOLUME_MOUNT_PATH` | bestaand | de volume; zonder volume zijn accounts en bestanden na een deploy weg |

## Lokaal draaien en testen

```sh
npm install
npm run build                      # _site/ (de pagina's)
PORT=3000 RAILWAY_VOLUME_MOUNT_PATH=/tmp/bp-data PORTAL_ADMIN_KEY=dev-admin node server.js
open http://localhost:3000/resources/budget-planner/
```

`npm run dev` (Eleventy) serveert alleen de statische pagina's; het portaal
heeft `node server.js` nodig.

Test: `node test/budget-planner-portal.test.mjs` (ook in `npm test`). Start
server.js op een vrije poort met een tijdelijke datamap en doorloopt:
multipart-lezer en briefvalidatie → aanmelden (CSRF-check, hash op schijf) →
koppelcode (eenmalig, alleen hash bewaard) → productie met twee documenten →
API-lijst met de sleutel → admin-lijst → `in_progress` → resultaat uploaden
(en afgewezen bij kapotte JSON) → portaal ziet `delivered` → downloads →
opmerking → tweede bedrijf ziet niets → verwijderen → installers (fout en goed
wachtwoord, cookie, lege lijst en 404, admin-upload raw én multipart, download
met naam en exacte bytes, sessie ziet downloads, verwijderen) → uitloggen.
27 checks, geen mail (geen `RESEND_API_KEY`).

## Nog niet gedaan / besluiten

- **Installers** moeten nog geüpload worden (zie de curl hierboven) en
  `PORTAL_DOWNLOAD_PASSWORD` moet op Railway staan; tot dan tonen de knoppen
  "not available yet" en geeft het wachtwoordveld 503.
- Eén gedeeld downloadwachtwoord, geen wachtwoord per klant; wie het heeft
  kan de installers een week lang halen (cookie).
- **De app zelf** (BudgetPlannerBuilder) heeft nog geen portaalkoppeling; dit
  document is het contract. Instelling in de app: basis-URL + koppelcode.
- **Taal**: de site is Engelstalig, dus portaal en landingspagina ook. De
  brief kent `language: nl|en` voor de taal van het budget.
- **Wachtwoord vergeten**: geen reset-flow; de pagina verwijst naar
  contact@tubes.media. E-mailbevestiging is optioneel (banner + opnieuw sturen),
  niet blokkerend.
- **Geen CSP** op `/resources/budget-planner/*` (gewone pagina's, mét
  statistiek-script en demo-popup); de `/tools/*`-CSP geldt hier niet.
- **Privacyverklaring**: hoofdstuk 15 beschrijft het portaal (toegevoegd).
- Admin-sleutel heeft geen aparte UI; `/beheer` toont alleen de bedrijven en
  hun producties. Jobs draaien doe je met de app of curl.
- Geen virus-scan op uploads; bestanden worden alleen als bijlage
  teruggegeven (`nosniff`, `attachment`), nooit inline geserveerd.
