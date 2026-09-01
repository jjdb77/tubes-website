# Tubes website (tubes.media)

Marketingsite van Tubes (productie-managementplatform van Appsolutions, Joachim de Blois). Live op **https://www.tubes.media** sinds 29-7-2026. Squarespace is verlaten; zie "Domein & DNS" voor wat daar nog loopt.

## Let op: parallelle sessies

Er werken soms **meerdere Claude-sessies tegelijk** in deze repo. Doe daarom altijd eerst `git pull` en herlees bestanden vlak voor je ze wijzigt. Commit en push na elke afgeronde wijziging (Railway deployt automatisch bij elke push naar main).

## Stack & structuur

- **Eleventy 3** bouwt de site (`npm run build` → `_site/`), **server.js** (Express, ESM) serveert hem én verzorgt het contactformulier. Start: `npm start`.
- Lokaal ontwikkelen: `npm run dev` → http://localhost:8080 (let op: dev-server serveert alleen de statische site, formulier-endpoint /api/contact werkt dan niet).
- Content: `src/content/pages/*.md` — elke pagina is een lijst "sections" (hero, pricing, compare, cards, feature, textblock, tour, faq, cta, contactform, images, split). Site-instellingen: `src/_data/settings.json`.
- CMS: Sveltia op `/admin/` (lokaal: "Work with Local Repository" in Chrome). Config: `src/admin/config.yml` (labels in het Nederlands).
- Menu staat in settings.json → nav. Platform- en Plans-pagina's bestaan maar staan bewust NIET in het menu.
- **Resources** (`/resources/`, pagina met twee klikbare tegels: locatiegids en incentives per land; kaarten met `url` zijn klikbaar via cards.njk) en **News** (`/news/`, `src/news.njk` + collectie `news` uit `src/content/news/*.md`; items zonder eigen pagina, CMS-collectie "Nieuws") staan sinds 1-9-2026 in het hoofdmenu op verzoek van Joachim.

## Hosting & deploy

- **Railway**, workspace "jjdb77's Projects", project **innovative-healing** (production), service **tubes-website** — naast appsolutions-cloud (de Tubes-app), 4relations en appconnected.
- Auto-deploy bij push naar `main` van **github.com/jjdb77/tubes-website**.
- Domeinen op de service: www.tubes.media en tubes.appconnected.nl (testadres). Het kale tubes.media 301't via Squarespace naar www.
- Truc bij "Waiting for DNS update" in Railway: domein verwijderen en direct opnieuw toevoegen forceert een verse DNS-check.

## Formulier & beheerpagina

- Formulieren (popup bij "Request a Demo" + contactpagina) posten urlencoded naar **/api/contact** (zie server.js). Spam: honeypot-veld `company_website` + rate-limit.
- Berichten: JSONL op de Railway-volume (`RAILWAY_VOLUME_MOUNT_PATH`), te lezen op **/beheer** (Basic Auth, wachtwoord = env `ADMIN_PASSWORD`, gebruikersnaam leeg). CSV-export op /beheer/export.csv.
- Het **volume staat er** (20-8-2026): `tubes-website-volume` op mount /data, dus de berichten overleven een deploy (`data in /data/submissions.jsonl` in de opstartlog). ⚠️ Nog nodig: `ADMIN_PASSWORD` op diezelfde service, anders geeft /beheer 503. Inloggen doe je met een **lege gebruikersnaam** en dat wachtwoord.

## Mail bij een aanvraag (en als het misgaat)

- Twee soorten mail, allebei via **Resend** (`stuurMail()` in server.js), dezelfde dienst als 4Relations gebruikt:
  - **Elke complete aanvraag** gaat naar `LEAD_EMAIL` (standaard joachim@tubes.media en chris.arboit@tubes.media): wie het is, alle antwoorden met de vraagtekst erbij, de vrije opmerking, en of hij in 4Relations staat.
  - **Blijft een aanvraag hangen** (drie mislukte pogingen, dus zo'n half uur), dan gaat er één mail naar `ALERT_EMAIL` (standaard alleen joachim@tubes.media) met de foutmelding. Eén per aanvraag: dat wordt vastgelegd als `crm_alert`-regel, dus een herstart levert geen tweede mail op.
- Env op de Railway-service: `RESEND_API_KEY` (als verwijzing `${{appconnected.RESEND_API_KEY}}`, de echte sleutel staat op de appconnected-service), eventueel `LEAD_EMAIL`, `ALERT_EMAIL`, `LOCATION_EMAIL` (locatiesuggesties, standaard joachim@tubes.media) en `MAIL_FROM`. **Zonder sleutel gebeurt er niets** en werkt de rest gewoon.
- ⚠️ Het afzenderadres moet een domein zijn dat **in Resend geverifieerd is**. Dat is `appsolutions.nl` (vandaar de standaard `Tubes site <info@appsolutions.nl>`); tubes.media is dat nog niet. Wil je vanaf tubes.media mailen, dan moet dat domein eerst in Resend erbij, inclusief DNS-records.
- `MAIL_API_URL` bestaat om het te kunnen testen tegen een eigen endpoint; laat die in productie leeg.
- Time-out staat op 8 seconden. Getest met een nep-endpoint: goed pad, mislukt pad (500) en herstel via de knop.

## Health Check-landingspagina

- ⚠️ De sessie heet in alle teksten **Production Health Check**. Eerder stonden er drie namen door elkaar (Production Finance Health Check, Health Check, assessment); hou het bij die ene. De **URL blijft `/production-finance-health-check/`**, die is al gedeeld en staat in Google; alleen in de SEO-titel staat "production finance" nog als zoekwoord.

- `/production-finance-health-check/` (`src/health-check.njk`) is de conversiepagina voor de gratis **Production Finance Health Check**: een videogesprek van 45 minuten over budgets, actuals, forecasting, approvals en reporting, met een production finance-specialist.
- ⚠️ **De Health Check is dat gesprek, niet de vragenlijst.** De vragenlijst is de voorbereiding erop. Hou dat onderscheid vast bij tekstwijzigingen.
- ⚠️ **Volgorde: eerst de vragen, dan boeken.** In de hero staat **geen e-mailveld**, alleen een knop (`health-check-hero.njk`) die de popover opent. Het e-mailadres wordt daarin gevraagd, in stap 1 van het formulier, niet op de pagina zelf: twee keer vragen is één keer te veel. Alle teksten van de hero (kop, belofte, de sessiestappen rechts, de geruststelling) staan in `healthcheck.json` onder `hero`, dus in het CMS te wijzigen.
- Bewust **geen CMS-secties**: deze twee pagina's zijn eigen templates, geen sectiepagina's. Opmaak staat onderaan `style.css` (alle klassen beginnen met `hc-`), de logica onderaan `site.js`.
- **De vragenlijst**: `/production-finance-health-check/assessment/` (`src/health-check-assessment.njk`), twee stappen.
  - Stap 1: e-mailadres (alleen zonder `?ref`), naam, bedrijf, rol. Stap 2: vijf keuzevragen plus een vrij veld. Daarna verschijnt de agenda met daaronder een overzicht van wat er is ingevuld.
  - Een vraag kan meer antwoorden toelaten (`multiple: true`, vinkjes in plaats van één keuze) en daar een maximum aan stellen (`max: 3`). Bij het maximum gaan de overige keuzes op slot, en de server kapt het ook af. Nu: productietype en huidige software onbeperkt, "waar zit het meeste werk" maximaal drie. Antwoorden worden opgeslagen als één regel, gescheiden door komma's.
  - ⚠️ **De vragen staan in `src/_data/healthcheck.json`**, te wijzigen via het CMS onder "Health Check-vragenlijst". Vraagteksten, keuzes en alle koppen. De `key` van een vraag is de veldnaam in de opslag: **niet meer wijzigen zodra er antwoorden binnen zijn**. Alleen bekende sleutels en bekende keuzes worden opgeslagen. Wijzigingen vergen een deploy, want server.js leest dat bestand bij het opstarten.
  - De vragenset komt van Chris Arboit (e-mail 19-8-2026): productietype, budgetklasse, aantal producties tegelijk, huidige software, waar het meeste werk zit, plus een vrij veld. Een eerdere versie met zes Strong/Could improve/Opportunity-vragen is op zijn advies vervangen; die zit in de geschiedenis.
  - Op /beheer telt per bezoeker de rijkste, meest recente regel: wie terugloopt en opnieuw verstuurt, krijgt geen tweede kaart. Alle regels blijven wel in het bestand staan.
  - ⚠️ Het e-mailadres wordt vastgelegd **bij het doorklikken naar stap 2** (`stage: "email"`), niet pas bij het versturen: anders laat wie halverwege afhaakt geen spoor na. Het id gaat als `lead_id` mee met de rest (`stage: "details"`), zodat /beheer er één aanvraag van maakt.
  - De pagina heeft `noindex: true` en valt daarmee buiten sitemap en llms.txt.
  - ⚠️ De tweekolomsopmaak en de responsieve regels staan **achteraan** in style.css: ze zijn even specifiek als de basisregel, dus alleen wat later staat wint. `.hc-assess-page` zet ook `overflow: visible` terug, want `.section-hero` heeft `overflow: hidden` en daarbinnen blijft `position: sticky` niet hangen.
- **De antwoorden gaan mee naar de agenda** via `?plan=`, het enige veld dat die boekingspagina uit de URL leest (naast `lang`). Er komt dus een regel als "Health Check · Sam Reyes (Northlight Pictures) · Film · £5m to £10m · ..." bij de boeking te staan. `book-a-call.njk` geeft een meegegeven `plan` door in plaats van de standaardwaarde.
  - **Naam, e-mailadres en het vrije veld worden vóóringevuld** (20-8-2026). Naast `plan` sturen we `naam`, `email` en `notities` mee; de boekingspagina zet die in "Your name", "Email address" en "What would you like to talk about?". De bezoeker kan alles nog wijzigen. Die kant staat in de repo **jjdb77/4relations-tubes** (`public/boek.html`, functie `uitLink()`); Engelse namen (`name`, `tel`, `notes`) werken daar ook, en `telefoon` kan mee zodra we een telefoonnummer vragen. `book-a-call.njk` geeft dezelfde velden door, dus het werkt ook zonder de popover.
- **Het blok staat ook op de homepage**, boven "Choose your plan", als sectietype `healthcheck` (`src/_includes/partials/sections/healthcheck.njk`, in het CMS: "Health Check-blok"). Zelfde partials als de landingspagina, dus de teksten lopen nooit uiteen. Het blok bestaat uit `partials/health-check-hero.njk` (tekst plus e-mailveld links, "In 45 minutes, we'll" rechts), `partials/health-check-cta.njk` (het e-mailveld als macro) en `partials/health-check-modal.njk` (de popover). Wie het blok ergens anders neerzet, krijgt de popover automatisch mee.
- **Alles gebeurt in één popover.** De knop op de landingspagina opent een dialog met het formulier; stap 3 daarvan is de agenda zelf, in dezelfde popover (iframe naar `settings.booking_embed_url`, met de antwoorden in `?plan`). Je kunt heen en weer tussen de stappen, en de agenda wordt niet opnieuw geladen als je terugloopt.
  - ⚠️ De popover houdt **in elke stap dezelfde breedte** (1000px): anders springt hij van formaat. Die breedte is bewust gekozen: onder ongeveer 950px stapelt de agenda van 4Relations zichzelf (gegevens boven, kalender eronder) en wordt de popover ellenlang. Boven die breedte staan gegevens, kalender en tijden naast elkaar. Wordt de popover ooit smaller gemaakt, zet dan de hoogte van `.hc-calendar-frame` terug omhoog.
  - Op de pagina staat **geen e-mailveld**: dat wordt in de popover gevraagd, en twee keer vragen is één keer te veel. Verder zijn de voortgangsbalk, de stapregels ("1 YOUR DETAILS") en de uitklapper met het antwoordoverzicht weggehaald, allemaal om de popover kort te houden.
  - Het formulier staat in `src/_includes/partials/health-check-form.njk` en wordt op twee plekken gebruikt: in die popover en als losse pagina `/production-finance-health-check/assessment/` (voor gemailde links met `?ref`). Eén bron, dus ze lopen nooit uiteen. Per pagina staat er één exemplaar, dus de id's blijven uniek.
  - De knoppen blijven gewone links naar die pagina: zonder JavaScript kom je daar uit en werkt alles alsnog.
  - ⚠️ **In `booking_embed_url` hoort de boekingspagina van het afspraaktype** (`/boek/<account>/<slug>`), **nooit een losse afspraaklink** (`/afspraak/<id>`): die hoort bij één geboekte afspraak en de bijbehorende API geeft onafgeschermd naam, e-mailadres en telefoonnummer terug.
  - Doel: `https://4relationstubes.appconnected.nl/boek/joachim/tubes-assessment`. Let op de **eigen omgeving**: dit is `4relationstubes`, niet de `4relations` van de Producer Pro- en Enterprise-links. Die regel heeft daarom een eigen `booking_url` in settings.json.
- Gebeurtenissen voor de trechter: `health-check-page-viewed`, `-email-captured`, `-details-done`, `-requested`, `-assessment-opened`. Die gaan naar GoatCounter als dat aan staat en anders nergens heen.
- **De privacyverklaring staat op `/privacy/`** (`src/content/pages/privacy.md`, gewone sectiepagina dus in het CMS te wijzigen). Het formulier verwijst ernaar en er staat een link in de voettekst. Daarin staat wat er echt gebeurt: welke velden we vragen, dat het e-mailadres al bij het doorklikken wordt vastgelegd, dat de antwoorden meegaan naar de boekingspagina, de leveranciers (Railway, Resend, Google Workspace, ons eigen 4Relations), dat die opslag **in de EU** staat (Amsterdam, sinds de verhuizing), en een bewaartermijn van 24 maanden na het laatste contact. Alleen Resend en Google Workspace zitten nog in de VS.
- ⚠️ De juridische naam is **Appsolutions**, zonder B.V. erachter (bevestigd 26-8-2026): het is nog geen besloten vennootschap. Niet "netjes" aanvullen dus. KvK 34371496, btw NL821706020B01, Daalwijkdreef 47, 1103 AD Amsterdam.
- ⚠️ Verandert er iets aan de opvolging, de leveranciers of de hosting, dan verandert die pagina mee.
- **Hosting staat sinds 26-8-2026 in de EU**: de Railway-services *tubes-website* en *authentic-nurturing* (4RelationsTubes) draaien in **EU West (Amsterdam)** in plaats van US West. Daarmee klopt "EU-based cloud services" op /compliance/ ook echt. Verhuizen ging met de regiokeuze onder Settings > Scale; Railway verplaatst de inhoud van het volume mee (met korte downtime). Vooraf een volumeback-up gemaakt via het tabblad Backups. Alleen Resend (mail) en Google Workspace staan nog buiten de EU; dat staat zo in de privacyverklaring.
- ⚠️ **De privacytekst moet kloppen met wat er echt gebeurt.** Er stond eerst "we use your details only to arrange your Health Check, we do not add you to a mailing list": dat was onwaar, want de pagina bestaat om zakelijke e-mailadressen te verzamelen en de gegevens gaan als prospect naar het CRM. Verandert de opvolging, dan verandert deze tekst mee.
- ⚠️ **Honeypot-les** (raakt ook het contactformulier en de demo-popup): een veld op `left:-9999px` is voor Chrome en wachtwoordmanagers gewoon zichtbaar en wordt meegevuld met autofill. Daarom staat het nu op `display:none` met de negeer-attributen van 1Password en LastPass, en gooit de server een verdacht bericht niet meer weg maar bewaart het met `spam: true` (verborgen op /beheer, zichtbaar via ?spam=1). Nooit meer zwijgend afbreken aan de kant van de browser: dan lijkt het formulier kapot.
- **De Health Check is sinds 20-8-2026 de knop van de site.** "Request a Demo" is vervangen door "Book your free Production Health Check" naar `/production-finance-health-check/`: de heroknoppen van Solutions, Platform, Company, Compliance en Contact, en de balk onderaan die pagina's plus Plans, Insights en de artikelen. De koppen en teksten van die balken zijn meegeschreven, anders staat er "See Tubes in action" boven een Health Check-knop.
  - **Twee knoppen blijven de demo**: die in de voettekst onder het logo, en (sinds 29-8-2026, op verzoek) de knop rechtsboven in de kop op elke pagina **behalve de homepage** (`header.njk`: `page.url == "/"` bepaalt welke van de twee, settings.json's `header_cta_label`/`header_cta_url` vs. `cta_label`/`cta_url`). Dat zijn ook de enige knoppen die de demo-popup nog opent, want die luistert naar knoppen die naar /contact/ wijzen.
  - De knop in de kop heeft alleen op de homepage `data-hc-open`; daar opent hij de popover meteen in plaats van te navigeren. Elders (ook op de Health Check-landingspagina zelf) is het weer een gewone Request a Demo-knop.
  - Onder 1220px verdwijnt de knop in de kop, net als de demo-knop daarvoor onder 1180px: hij is breder, dus de rij logo + menu + knop past eerder niet meer. Op smal scherm staat hij dus alleen in de pagina zelf.
  - De landingspagina staat daarmee **niet meer op noindex**: hij staat weer in sitemap.xml en llms.txt. De vragenlijst blijft wel noindex.

## Health Check-aanvragen naar 4Relations

- Aanvragen blijven **altijd** in de eigen opslag staan (JSONL op de Railway-volume, zichtbaar op /beheer). 4Relations is een kopie, geen vervanging: het versturen gebeurt ná het antwoord aan de bezoeker, dus een storing daar kan nooit een lead kosten.
- Aanzetten met env-variabelen op de Railway-service **tubes-website**. Zolang `CRM_URL` leeg is gebeurt er niets en werkt de rest gewoon. De vier waarden voor de intake van 4RelationTubes:
  - `CRM_URL` = `https://4relationstubes.appconnected.nl/api/assessments/intake`
  - `CRM_AUTH_HEADER` = `x-assessment-token`
  - `CRM_AUTH_PREFIX` = leeg (die intake wil een kale sleutel, geen `Bearer `)
  - `CRM_TOKEN` = de waarde van `ASSESSMENT_TOKEN` op de 4RelationTubes-service (Railway > Variables > oogje). Nooit in de repo, die is publiek.
  - `CRM_STATUS` — gaat mee in de opslag maar bepaalt niets meer: de intake zet nieuwe relaties en contacten zelf op `Lead`.
- **Het doel is `POST /api/assessments/intake`** in 4RelationTubes (code: `server.js`, `verwerkAssessment()` in de repo `jjdb77/4relations-tubes`). Die verwacht de velden **plat**: `name`, `email`, `telephone`, `company`, `title`, `summary`, `answers`, `source`. Daarom stuurt `crmPayload()` in server.js precies dat: `title` is "Production Health Check" (de kolom "Assessment" in de lijst), `summary` is de leesbare regel met rol, antwoorden en de vrije opmerking, en `answers` is de volledige inzending als JSON (vraagtekst per antwoord, plus rol, notes, pagina en het id van de aanvraag). Bewust **geen `score`**: die kan pas uit het gesprek komen.
- 4Relations maakt er zelf een **relatie** (op bedrijfsnaam) en een **contactpersoon** (op e-mailadres) bij, allebei find-or-create met status `Lead`. Twee keer dezelfde persoon geeft dus geen dubbele relatie.
- Een los e-mailadres uit stap 1 gaat er bewust **niet** heen, dat is nog geen lead. Spam-gemarkeerde regels ook niet.
- ⚠️ Verandert die intake van veldnamen, dan is alleen `crmPayload()` in server.js aan te passen. Getest op een lokale kopie van 4Relations: goed pad (relatie + contact + assessment aangemaakt), fout token (401 wordt bewaard als "4Relations mislukt") en herstel via de knop opnieuw proberen.
- Elke poging wordt bewaard. Op /beheer staat per aanvraag "in 4Relations", "4Relations mislukt" (met de foutmelding erin) of "nog niet doorgezet", plus onderaan een knop **opnieuw proberen** die alles wat nog openstaat alsnog verstuurt.
- **Achtervang plus mail**: mislukte doorzendingen gaan elke tien minuten vanzelf opnieuw de deur uit, en elke aanvraag levert een mailtje op. Zie de sectie "Mail bij een aanvraag (en als het misgaat)".
- Time-out staat op 8 seconden. Getest met een nep-endpoint: goed pad, mislukt pad (500) en herstel via de knop.

## Boekingen (Book a call)

- Knoppen op de abonnementskaarten → `/book-a-call/producer-pro/` en `/book-a-call/enterprise/` (doorstuurpagina's uit `src/book-a-call.njk`, gepagineerd over `settings.booking_plans`).
- Doel = `settings.booking_url` + slug (per plan te overrulen via een eigen `booking_url`-veld in `booking_plans`, zie book-a-call.njk: `boeking.booking_url or settings.booking_url`). Producer Pro: `tubes-producer-pro` op `https://4relations.appconnected.nl/boek/joachim`. Enterprise: `tubes-enterprise` op de eigen basis `https://4relations.appconnected.nl/boek/joachim@appsolutions.nl` (15-8-2026 gecorrigeerd, was `tubes-enterprice` op de gedeelde basis).
- booking_url (Producer Pro) = https://4relations.appconnected.nl/boek/joachim (wordt ooit afspraak.tubes.media).

## Artikelen (Insights)

- `src/content/insights/*.md` met `layout: article.njk`, overzicht op `/insights/` (`src/insights.njk`). In het CMS: collectie "Artikelen (Insights)".
- Anders dan de pagina's zijn dit gewone markdown-artikelen, geen secties. Front matter: `title`, `standfirst`, `date`, `permalink`, plus de SEO-velden.
- Leestijd en woordentelling worden berekend (`readingTime`/`wordCount`), niet ingevuld.
- Elk artikel krijgt automatisch Article-structured data, een kruimelpad en onderaan links naar de andere artikelen.
- Let op bij schrijven: **geen em-dashes**, en de lijstopmaak in `.article-body` is bewust anders dan die van `.rich-text` (gewone bullets in plaats van het teal vinkje).

## SEO

- Per pagina in de front matter (en in het CMS onder "SEO: ..."): `seo_title` (volledige `<title>`, leeg = "Paginatitel | Tubes"), `description`, `og_image`, `noindex`, `schema_software`.
- Alle metatags staan in `src/_includes/partials/head-seo.njk`. **Scheidingsteken in titels is een `|`, geen em-dash.**
- Structured data (schema.org) wordt in JS opgebouwd: filter `jsonld` in `eleventy.config.js`. Levert Organization, WebSite, WebPage, BreadcrumbList, plus SoftwareApplication met de prijzen uit de `pricing`-secties (bij `schema_software: true`) en FAQPage uit de `faq`-secties. Testen: search.google.com/test/rich-results.
- `sitemap.xml` en `llms.txt` (samenvatting voor AI-zoekmachines) worden gegenereerd; pagina's met `noindex: true` vallen er automatisch buiten.
- Platform en Plans staan niet in het menu maar wél in `settings.footer_nav`, anders vindt Google ze niet.
- Snelheid telt mee: server.js comprimeert (gzip) en zet cacheheaders; `imgSize`-filter zet width/height op elke afbeelding (tegen layout shift). Afbeeldingen in `src/assets/images` zijn deels WebP met een .png/.jpeg-naam, daarom leest `lib/image-size.js` de afmetingen uit de bytes en niet uit de extensie.
- **Alleen www.tubes.media mag geïndexeerd worden.** server.js stuurt voor elke andere host (o.a. het testadres tubes.appconnected.nl) een `X-Robots-Tag: noindex, nofollow` mee. robots.txt blijft daar bewust alles toestaan, want een crawler moet de pagina kunnen ophalen om die header te zien.
- CSS en JS worden aangeroepen als `{{ assets.css }}` / `{{ assets.js }}`, met een `?v=<hash>` erachter. Daardoor mogen ze een jaar gecachet worden en zie je een wijziging tóch meteen. **Link nooit rechtstreeks naar /css/style.css in een template**, dan kan een bezoeker na een deploy oude opmaak krijgen.
- Afbeeldingen krijgen dezelfde behandeling via het `imgSrc`-filter: **elke `<img src="...">` in een template moet `{{ pad | imgSrc }}` gebruiken**, niet het kale pad. Zo krijgt een vervangen screenshot (zelfde bestandsnaam, nieuwe inhoud) meteen een nieuwe URL in plaats van 30 dagen uit de browsercache van een bezoeker te komen.

## Doorverwijzingen (301)

- **Alle redirects staan in server.js**, in `OLD_PATHS` (oude Squarespace-paden zoals /waarom-tubes en /oplossing; de oude /news-redirect naar /insights/ is op 1-9-2026 verwijderd omdat /news/ nu een eigen pagina is) en `REDIRECT_HOSTS` (tubes.media en en.tubes.media naar www).
- Een `_redirects`-bestand doet hier **niets**: dat is een Netlify/Cloudflare-formaat en Railway draait Express. Het oude bestand is daarom verwijderd.
- De 19 oude 404's kwamen uit Search Console (Pagina's → Niet gevonden). Kijk daar opnieuw als er later paden bijkomen.

## Besloten klantpagina's: /mmg/ (Motion Media Group)

- `src/mmg/` bevat een sales-pitch voor Motion Media Group (Canadees media-investeringsbedrijf, contact Martin Waterman): `onepager.html`, `proposal.html` en de bijbehorende PDF's `Tubes-MMG-Onepager.pdf` / `Tubes-MMG-Proposal.pdf`. Live op https://www.tubes.media/mmg/onepager.html en /mmg/proposal.html.
- De map gaat via `addPassthroughCopy` één-op-één mee naar `_site/mmg/` en staat in `ignores` (Eleventy rendert er niets aan). Het zijn volledig zelfstandige HTML-bestanden (fonts, logo's en PDF als data-URI ingebed), los van de sitetemplates en het CMS.
- **Basic Auth** op alle /mmg/*-paden, geregeld in server.js: gebruikersnaam leeg, wachtwoord = env `MMG_PASSWORD` (fallback in de code: `MMGTubes01!`). Let op: deze repo is publiek, dus die fallback en de documenten zelf zijn op GitHub zichtbaar; repo privé maken is nog een open beslissing.
- robots.txt heeft `Disallow: /mmg/`; de pagina's horen niet in menu, sitemap of zoekmachines.
- Deze bestanden worden vanuit een Claude-sessie gegenereerd en hierheen gekopieerd; kleine tekstwijzigingen kunnen direct in deze bestanden, maar HTML en PDF moeten dan wel allebei aangepast worden (de PDF is een aparte render, geen automatische afgeleide).

## Locatiegids en incentive-vergelijking

Twee vrij toegankelijke pagina's (geen login), volledig los van de Tubes-app; Tubes wordt alleen via tekst en CTA's gepromoot. **Primair** (wens Joachim): het zoeken en vergelijken van concrete locaties. Voor nu alleen Europa, zonder Rusland en Wit-Rusland.

### Locatiegids: /compare-film-tv-locations/

- Doel: een producer zoekt "een locatie in de bergen / een bergdorp / een hotel / een studio / een stad, noem maar op" en vindt plekken om te draaien én huurbare studio's. Zoeken binnen land/regio, kaart, foto's en links, en 1 tot 3 locaties naast elkaar.
- Sectietype `locationguide` (`src/_includes/partials/sections/locationguide.njk`): zoekveld + land- en typefilter, kaart (Leaflet 1.9.4 van cdnjs + OpenStreetMap-tegels, pas geladen zodra de kaart in beeld komt; staat zo in de privacyverklaring), fotokaarten, plakbalk onderaan bij selectie, vergelijking als kolommen (hergebruikt `.loc-compare`), en het suggestieformulier.
- Data: `src/_data/filmlocations.json` (CMS: "Filmlocaties (locatiegids)"). Per locatie: id, name, country, region, lat/lng, type (vaste lijst van 14), setting (1 zin), known_for, official_url, commission_url, photo {thumb, file_page, author, license}. De startset is met agents geverifieerd (aug. 2026); geen maximum, groeit via CMS en suggesties.
- **Foto's: nooit uit andere locatiedatabases kopiëren.** Wikimedia Commons-thumbnails (hotlink met maker + licentie zichtbaar per foto) of eigen uploads met schriftelijke toestemming. Zie docs/location-directory-research.md voor het rechtenverhaal.
- Incentive per land wordt op de kaartjes en in de vergelijking getoond uit locations.json (koppeling op landnaam).
- **AI-zoeken**: knop "Let AI turn this into filters" (of Enter) stuurt alleen de zoekvraag naar `/api/location-search`; server.js laat OpenAI er vaste filters van maken (terms/country/type, JSON), de database gaat nooit mee. Herkende filters staan als bewerkbare chips; zonder sleutel, bij een fout of boven de maandlimiet valt alles terug op gewoon tekstzoeken. **Instellen uitsluitend via Railway-variabelen** (besluit Joachim 1-9-2026, geen beheerformulier en niets op de volume): `OPENAI_API_KEY`, optioneel `AI_MODEL` (whitelist in server.js) en `AI_MONTHLY_LIMIT_EUR` (standaard 10). `/beheer/ai` is alleen-lezen: sleutel gezet ja/nee (laatste 4 tekens), model, limiet, verbruik deze maand (ruwe bovengrens, teller in `ai-usage.json` op de volume) en een testknop. Rate-limit 10/10min/IP. **Nooit een sleutel in de repo of het CMS** (repo is publiek). Staat zo ook in de privacyverklaring (zoekvraag naar OpenAI).

### Incentive-vergelijking: /compare-film-incentives/

- Landen/regelingen vergelijken op geld; "opzich grappig, laat maar staan" (Joachim), maar secundair aan de gids.
- Content: `src/content/pages/compare-film-incentives.md` (gewone secties). Het sectietype `locations` (`src/_includes/partials/sections/locations.njk`) rendert de vergelijkingstool, de volledige tabel en het formulier "Missing a location?".
- Cijfers: `src/_data/locations.json`, in het CMS onder "Locaties (vergelijkingspagina)". Per locatie: `rate` (rekenpercentage), `rate_label` (getoond), optioneel `tiers` (getrapt), `net_factor` (VK: krediet is belast), `film_uplift`, `spend_uplift`, `base_share` (max. aandeel van het budget), `cap` (bedrag in lokale valuta), `labour_only`/`labour_bonus` (Canada: alleen lonen), `assumption` (aanname die de tool toont), `funding`, `notes`, `source`. `updated` = datum in "Figures checked on ...". `fx` = ruwe wisselkoersen, alleen om plafonds om te rekenen.
- De tool: zoekveld, kies **1 tot 3 locaties**, en die komen **naast elkaar** te staan (kolom per locatie, eigenschappen als rijen, bovenaan de **indicatieve nettowaarde** op de ingevulde spend, met de aannames erbij; hoogste waarde gemarkeerd). Rekent in de browser (inline script in de sectie). Het zoekveld filtert ook de grote tabel eronder. Cijfers zijn in aug. 2026 geverifieerd met bronlinks; houd twijfel als twijfel in `notes` (zie [[eerlijke-claims-op-de-site]]).
- Locatie voorstellen ("Suggest a location"): post naar /api/contact met bericht "Location request: <locatie>" plus toelichting. Staat op /beheer (kolom page = /compare-film-tv-locations/) én gaat meteen per mail naar `LOCATION_EMAIL` (standaard joachim@tubes.media) via `meldLocatieSuggestie()` in server.js, met dezelfde Resend-instellingen als de Health Check-mail. Gewone contact-/demoberichten mailen (nog) niet, die staan alleen op /beheer.
- De geverifieerde niet-Europese entries voor Canada (Ontario/BC/Quebec), VS (Georgia/New Mexico/Californië/New York), Australië, Nieuw-Zeeland en Zuid-Afrika staan in git (commit e0dfd82, `src/_data/locations.json`) en kunnen terug zodra gewenst.
- Beide pagina's staan in `settings.footer_nav` (niet in het hoofdmenu) en lopen automatisch mee in sitemap en llms.txt. Onderzoek naar vergelijkbare sites: `docs/location-directory-research.md`.

## Domein & DNS (niet slopen)

- tubes.media is geregistreerd bij **Squarespace**; DNS daar bevat: Google Workspace **MX-records (e-mail — NOOIT aanraken)**, TXT google-site-verification, _dmarc, en de www-CNAME naar Railway.
- Squarespace vraagt bij elke DNS-wijziging om opnieuw inloggen via Google. Een agent kan dat niet, dus die laatste klik doet Joachim zelf.
- **Subdomeinen op Railway hebben twee records nodig**: de CNAME (bijv. `en` → `dnmjf7fd.up.railway.app`) én een TXT `_railway-verify.<naam>`. Railway toont beide bij het toevoegen van het domein.
- Sinds 1-8-2026 wijst **en.tubes.media** naar Railway in plaats van de oude Weglot-proxy, en 301't via server.js naar www. Let's Encrypt-certificaat kwam binnen een minuut.
- ⚠️ Squarespace meldt dat het joachim@appsolutions.nl niet kan bereiken, en het domein verloopt **10 mei 2027**. Verlengingsmails komen dus mogelijk niet aan; e-mailadres in het Squarespace-account nakijken.
- Google Workspace levert contact@/joachim@tubes.media. Vóór het opzeggen van Squarespace checken of Workspace via Squarespace gefactureerd wordt.
- Er staat **geen SPF-record** op tubes.media (alleen de google-site-verification-TXT). Toevoegen van `v=spf1 include:_spf.google.com ~all` scheelt spamklassering, ook al vóór de verhuizing naar TransIP.
- Etappe 2 (gepland): domein verhuizen naar TransIP en Squarespace volledig opzeggen. Volledig draaiboek + DNS-kopieerlijst staat in het Claude-geheugen (memory: tubes-website-rebuild).

## Schrijf- en stijlregels

- Sitetaal: **Engels**. **Geen em-dashes (—)** in teksten (Joachim: "typisch AI"); herschrijf met komma's, dubbele punten of haakjes.
- Huisstijl: app-design-system (tokens uit claude.ai/design-project "Tubes Design System"): lichtgrijs canvas #F6F7F9, wit, pastelblauw #EAF1FC, teal #0E9C88 voor acties, goud #E6C263 als accent, Mulish. Logo = origineel goud-navy wordmark (PNG, `logo-tubes.png`) — geen tekstvarianten maken, dat traject is afgesloten.
- Geen klantlogo's/namen als "trusted by" (RTL/Talpa/Tuvalu gebruiken Tubes niet; de ervaring-tekst op Company mag wel).
- Prijzen: Producer Pro **vanaf** € 49/mnd incl. 2 users en max. 3 actieve projecten, € 25/mnd per extra user t/m 10; daarboven Enterprise (onbeperkt projecten). "Actief" = tegelijk lopend, niet per jaar. De kaart toont een klein "From" via het veld `price_prefix`.
- Prijskaarten (Home + /plans/) tonen automatisch de lokale valuta: JS in `src/js/site.js` detecteert het land via `ipapi.co` (client-side, geen server-wijziging) en rekent elk `€ NN`-bedrag binnen `.pricing-grid` om. Koersen liggen **vast** (ingevroren op 14-08-2026, niet live): USD 1.1525, GBP 0.8541, CAD 1.6064, AUD 1.6335, DKK 7.4758 — eurolanden houden €, GB/AU/CA/DK krijgen hun eigen valuta, de rest van de wereld valt terug op USD. Bezoeker kan dit overrulen via het valutaveld boven de kaarten (`pricing.njk`); keuze blijft staan via `localStorage`. Koersen bijwerken = alleen de `rate`-waarden in site.js aanpassen, geen contentwijziging nodig.

## Openstaand

- [ ] Railway: `ADMIN_PASSWORD` op tubes-website zetten (het volume staat er sinds 20-8-2026); daarmee werkt /beheer. In Railway kun je Variables > New Variable gebruiken en als waarde `${{ secret(28) }}` invullen, dan genereert Railway er zelf een.
- [x] **4Relations staat aan** (20-8-2026): de vier `CRM_*`-variabelen staan op de Railway-service tubes-website, `CRM_TOKEN` als verwijzing `${{authentic-nurturing.ASSESSMENT_TOKEN}}` zodat de sleutel maar op één plek staat. Getest met een echte aanvraag: die staat als assessment in 4RelationTubes, met relatie Appsolutions en contactpersoon eraan gekoppeld.
- [ ] Health Check operationeel maken: een vaste vragenlijst voor de 45 minuten en een sjabloon voor de findings-samenvatting. De pagina belooft "geen standaard demo" en drie concrete verbeterkansen; zonder dat draaiboek maakt het gesprek die belofte niet waar.
- [ ] Meten welke ingang beter werkt: "Request a Demo" versus "Free Health Check", en niet alleen de formulierconversie maar de hele keten (e-mail → aanvraag → gesprek gehouden → serieuze kans).
- [x] Google Search Console: sitemap https://www.tubes.media/sitemap.xml ingediend op 1-8-2026, status "Succesvol", 13 pagina's
- [x] Bing Webmaster Tools: www.tubes.media stond er al (geverifieerd, naast www.appsolutions.nl); sitemap ingediend op 1-8-2026. Telt dubbel omdat de zoekfunctie van ChatGPT op de Bing-index draait.
- [ ] Optioneel: IndexNow aanzetten (staat in Bing Webmaster Tools). Meldt nieuwe/gewijzigde URL's direct aan Bing in plaats van te wachten op een crawl; nuttig omdat er vaak gedeployd wordt. Vergt een sleutelbestand op de site plus een ping bij deploy.
- [x] **en.tubes.media gered** (1-8-2026): wijst naar Railway, 301't naar www, certificaat actief. De links van Product Hunt, LinkedIn en AlternativeTo komen weer aan.
- [ ] Die drie profielen alsnog naar https://www.tubes.media/ laten wijzen (een directe link is beter dan een 301), plus Capterra claimen en de prijs op AlternativeTo corrigeren ($100-990 → € 49/mnd). Zie docs/directory-listings.md.
- [ ] SPF-record toevoegen bij Squarespace: TXT @ met `v=spf1 include:_spf.google.com ~all`
- [ ] Squarespace-account: e-mailadres nakijken (verlengingsmails komen nu niet aan, domein verloopt 10-5-2027)
- [ ] Etappe 2: Workspace-facturering checken → domein naar TransIP → Squarespace opzeggen (+ SPF/DKIM toevoegen bij TransIP)
- [ ] Academy-video's: nieuwe plek kiezen ("Access all videos"-knop staat verborgen)
- [ ] Optioneel: GoatCounter-code voor statistieken (veld bestaat in CMS)
