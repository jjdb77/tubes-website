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

## Hosting & deploy

- **Railway**, workspace "jjdb77's Projects", project **innovative-healing** (production), service **tubes-website** — naast appsolutions-cloud (de Tubes-app), 4relations en appconnected.
- Auto-deploy bij push naar `main` van **github.com/jjdb77/tubes-website**.
- Domeinen op de service: www.tubes.media en tubes.appconnected.nl (testadres). Het kale tubes.media 301't via Squarespace naar www.
- Truc bij "Waiting for DNS update" in Railway: domein verwijderen en direct opnieuw toevoegen forceert een verse DNS-check.

## Formulier & beheerpagina

- Formulieren (popup bij "Request a Demo" + contactpagina) posten urlencoded naar **/api/contact** (zie server.js). Spam: honeypot-veld `company_website` + rate-limit.
- Berichten: JSONL op de Railway-volume (`RAILWAY_VOLUME_MOUNT_PATH`), te lezen op **/beheer** (Basic Auth, wachtwoord = env `ADMIN_PASSWORD`, gebruikersnaam leeg). CSV-export op /beheer/export.csv.
- ⚠️ Vereist op de Railway-service: een volume (bijv. mount /data) én `ADMIN_PASSWORD`. Zolang die missen: /beheer geeft 503 en berichten overleven een redeploy niet.

## Health Check-aanvragen naar 4Relations

- Aanvragen blijven **altijd** in de eigen opslag staan (JSONL op de Railway-volume, zichtbaar op /beheer). 4Relations is een kopie, geen vervanging: het versturen gebeurt ná het antwoord aan de bezoeker, dus een storing daar kan nooit een lead kosten.
- Aanzetten met env-variabelen op de Railway-service:
  - `CRM_URL` — het adres dat een client/lead aanmaakt. **Zolang die leeg is gebeurt er niets** en werkt de rest gewoon.
  - `CRM_TOKEN` — de sleutel. Nooit in de repo, die is publiek.
  - `CRM_AUTH_HEADER` — naam van de header, standaard `Authorization`.
  - `CRM_AUTH_PREFIX` — wat vóór de sleutel komt, standaard `Bearer ` (leeg zetten als 4Relations een kale sleutel wil).
  - `CRM_STATUS` — status van de client, standaard `prospect`.
- Wat er verstuurd wordt: het **bedrijf als client** (met die status), de **persoon als contact** (naam, e-mail, rol), en daaronder de Health Check-gegevens (wat ze willen verbeteren, waar ze nu mee werken, de vrije opmerking en de antwoorden per vraag met de vraagtekst erbij). Twee momenten: bij de complete aanvraag (`kind: "request"`) en bij het ingevulde zelfbeeld (`kind: "assessment"`). Een los e-mailadres uit stap 1 gaat er bewust **niet** heen, dat is nog geen lead. Spam-gemarkeerde regels ook niet.
- Elke poging wordt bewaard. Op /beheer staat per aanvraag "in 4Relations", "4Relations mislukt" (met de foutmelding erin) of "nog niet doorgezet", plus onderaan een knop **opnieuw proberen** die alles wat nog openstaat alsnog verstuurt. Handig als 4Relations even plat lag of als de sleutel verkeerd stond.
- Time-out staat op 8 seconden. Getest met een nep-endpoint: goed pad, mislukt pad (500) en herstel via de knop.

## Boekingen (Book a call)

- Knoppen op de abonnementskaarten → `/book-a-call/producer-pro/` en `/book-a-call/enterprise/` (doorstuurpagina's uit `src/book-a-call.njk`, gepagineerd over `settings.booking_plans`).
- Doel = `settings.booking_url` + slug (per plan te overrulen via een eigen `booking_url`-veld in `booking_plans`, zie book-a-call.njk: `boeking.booking_url or settings.booking_url`). Producer Pro: `tubes-producer-pro` op `https://4relations.appconnected.nl/boek/joachim`. Enterprise: `tubes-enterprise` op de eigen basis `https://4relations.appconnected.nl/boek/joachim@appsolutions.nl` (15-8-2026 gecorrigeerd, was `tubes-enterprice` op de gedeelde basis).
- booking_url (Producer Pro) = https://4relations.appconnected.nl/boek/joachim (wordt ooit afspraak.tubes.media).

## Health Check-landingspagina

- `/production-finance-health-check/` (`src/health-check.njk`) is de conversiepagina voor de gratis **Production Finance Health Check**: een sessie van 45 minuten over budgetten, actuals, forecasting, approvals en reporting. Het doel van de pagina is één ding: het zakelijke e-mailadres.
- De keuzeknoppen van het aanvraagformulier (wat maak je vooral, wat wil je verbeteren, waar werk je nu mee) staan ook in `healthcheck.json` onder `lead_form`, te wijzigen in het CMS. Productietype is de qualifier uit het advies van Chris Arboit; naam, bedrijf, rol en huidige software stonden er al.
- Bewust **geen CMS-secties**. Het tweestapsformulier en het assessment-beeld passen niet in het sectiesysteem, dus tekst wijzig je in het bestand zelf en niet in Sveltia. Opmaak staat onderaan `style.css` (blok "Health Check", alle klassen beginnen met `hc-`), de logica onderaan `site.js`.
- **Volgorde is de hele truc**: eerst de waarde van de Health Check, Tubes pas ná "Areas we assess". Niet omdraaien, en het Tubes-blok niet laten uitgroeien tot een productpitch.
- De zes beoordeelde gebieden zijn: budgetstructuur en versiebeheer, budget naar productie (wat er ná goedkeuring gebeurt), actuals en reconciliatie, forecasting, approvals en controls, reporting en zichtbaarheid. Labels zijn Strong / Could improve / Opportunity; **geen cijfer of score**, dat zou een uitslag suggereren die er niet is.
- Het formulier post twee keer naar **/api/health-check**: stap 1 alleen het e-mailadres, stap 2 de rest met `lead_id` erbij. Zelfde JSONL-opslag en dezelfde beheerpagina als het contactformulier. /beheer laat de regel van stap 1 weg zodra stap 2 binnen is, en zet er een label bij. Gratis e-maildomeinen (gmail e.d.) worden niet geweigerd maar gemarkeerd.
- Mislukt stap 1 (server even weg), dan gaat de bezoeker gewoon door naar stap 2 en gaat het e-mailadres daar alsnog mee. Er wordt nooit een bevestiging getoond zonder dat de aanvraag echt is opgeslagen.
- **De agenda opent in een popover** (`src/_includes/partials/booking-modal.njk`), zodat de bezoeker de pagina niet verlaat. Adres staat in `settings.booking_embed_url`. De iframe krijgt zijn src pas bij het openen, en de knop blijft een gewone link naar `/book-a-call/health-check/`: zonder JavaScript, of als het insluiten bij iemand niet werkt, komt hij daar alsnog uit (er staat ook een "open in a new tab" onderin).
  - ⚠️ **In `booking_embed_url` hoort de boekingspagina van het afspraaktype** (`/boek/<account>/<slug>`), **nooit een losse afspraaklink** (`/afspraak/<id>`). Zo'n afspraaklink hoort bij één geboekte afspraak en de bijbehorende API geeft onafgeschermd naam, e-mailadres en telefoonnummer terug. Die op een openbare pagina insluiten lekt dus persoonsgegevens.
  - Getest: de agenda rendert in het frame en de API is publiek en cookieloos, dus derde-partij-cookies vormen geen probleem. Klikken ín het frame kon niet geautomatiseerd getest worden.
- ⚠️ **De Health Check is het gesprek van 45 minuten op video, niet de vragenlijst.** Zo staat het ook in de teksten: de vragenlijst heet "Help us prepare" en is voorbereiding, zodat de 45 minuten niet aan de basis opgaan. Hou dat onderscheid vast bij tekstwijzigingen.
- **Het einddoel is de agenda.** Na de aanvraag is de eerste knop "Pick a time" naar `/book-a-call/health-check/`, en het rapport van de vragenlijst eindigt met dezelfde knop. Wie liever voorstellen per mail wil, kan dat; dat staat eronder.
  - Doel: `https://4relationstubes.appconnected.nl/boek/joachim/tubes-assessment`. Let op de **eigen omgeving**: dit is `4relationstubes.appconnected.nl`, niet de `4relations.appconnected.nl` van de andere twee boekingslinks. Daarom heeft die regel een eigen `booking_url` in settings.json, net als de Enterprise-regel. `book-a-call.njk` kan ook met een lege slug om (dan de algemene agenda).
- **De vragenlijst staat op een eigen adres**: `/production-finance-health-check/assessment/` (`src/health-check-assessment.njk`). Opzet: **vier stappen**, drie thema's en het rapport als vierde. Bovenaan één segment per stap plus de teller "x of 14 answered". Rechts een paneel dat met de stap meewisselt. Alles-onder-elkaar is geprobeerd en weer teruggedraaid: het moeten stappen zijn, met het rapport als laatste.
  - ⚠️ **De vragen staan in `src/_data/healthcheck.json`, niet in de template.** Te wijzigen via het CMS onder "Health Check-vragenlijst": vraagtekst, toelichting, thema's, leestips, de drie labels en alle rapportteksten. Voeg je een vraag of een hele stap toe, dan lopen de pagina, de voortgangsbalk, het rapport, de opslag en /beheer vanzelf mee; er hoeft geen code aangepast te worden. Wel nodig: een deploy, want server.js leest dat bestand bij het opstarten (bij een CMS-wijziging gebeurt dat automatisch, Sveltia commit naar GitHub en Railway deployt).
  - ⚠️ **Zes vragen op de pagina, de rest staat op inactief.** Advies van Chris Arboit (19-8-2026): de Health Check is het gesprek, de vragenlijst is een korte voorbereiding. De acht andere vragen (budgetsjablonen, cashflow, verplichtingen, co-producenten, grootboek, valuta, incentives, portefeuille) blijven in `healthcheck.json` staan met `active: false`, worden onderaan het rapport genoemd als agenda voor het gesprek, en zijn met één vinkje in het CMS weer aan te zetten. Filteren gebeurt met de filters `activeSteps` en `parkedQuestions` in eleventy.config.js.
  - De zes actieve vragen zijn precies de zes gebieden die de landingspagina noemt. Zet je er een aan of uit, kijk dan of dat rijtje nog klopt.
  - Elke vraag heeft vier keuzes: Strong / Could improve / Opportunity / **Not applicable**. Die laatste is er bewust, zodat iedereen dezelfde vragen kan krijgen: wie niet internationaal werkt zet valuta op niet van toepassing, wie in de boekhouding zit doet dat met de bedrijfsbrede vragen. Daardoor blijven de antwoorden onderling vergelijkbaar en kan de lijst langer zijn. In het rapport telt "Not applicable" niet mee in de balkjes en komt het nooit bij de bevindingen.
  - Er wordt ook naar de **rol** gevraagd (keuzelijst, optioneel). Die bepaalt níet welke vragen je krijgt, daar is de n.v.t.-knop voor; hij helpt het gesprek op de juiste hoogte te voeren en gaat mee naar 4Relations. Rollen zijn te wijzigen in het CMS.
  - De `key` van een vraag is de veldnaam in de opslag. **Die verander je niet meer zodra er antwoorden binnen zijn**, anders raken oude en nieuwe antwoorden los van elkaar. Onbekende sleutels en onbekende labels weigert de server, dus er belandt geen losse tekst in de opslag.
  - Rechts loopt een kolom mee met dat thema: waar het meestal misgaat, plus een of twee artikelen uit Insights om te lezen terwijl je nadenkt. Onder die kolom staat altijd de uitleg van de drie labels.
  - ⚠️ `.hc-assess-page` zet `overflow: visible` terug, want `.section-hero` heeft `overflow: hidden` en daarbinnen blijft een `position: sticky`-element niet hangen.
  - **Het rapport** wordt opgebouwd uit de eigen antwoorden: per thema een balkje met de verdeling, daarna "waar we mee beginnen" met hoogstens drie punten (eerst wat als kans is aangemerkt, dan wat beter kan), elk met de bevinding uit het databestand en een artikel om te lezen, en tot slot alle antwoorden uitklapbaar. Bewust **geen cijfer en geen oordeel**: dat kan pas uit het gesprek komen. De antwoorden worden verstuurd vóór het rapport in beeld komt, dus ze staan dan al vast.
  - Elke vraag heeft een korte naam (`short`) voor de zin "You marked 2 areas as an opportunity: ...": de volle labels bevatten zelf al een "and" en dat leest niet in een opsomming.
  Twee manieren erheen:
  - vanaf het bedankscherm van de aanvraag, met `?ref=<id>` erachter. De pagina vraagt dan geen e-mailadres meer: de server zoekt dat zelf bij die aanvraag, zodat het niet in de link hoeft.
  - als losse link (bijvoorbeeld in je antwoordmail aan iemand die al een sessie heeft staan). Dan vraagt de pagina wel het zakelijke e-mailadres, en koppelt de server op dat adres.
  Bewust **pas ná de aanvraag**: die is dan al opgeslagen, dus de vragenlijst kan geen enkele lead kosten. De antwoorden komen als aparte regel binnen (`stage: "assessment"`) en /beheer vouwt ze in de kaart van de bijbehorende aanvraag; is er geen aanvraag te vinden, dan staan ze er apart met een eigen label. Alleen de zes bekende sleutels en de drie labels worden bewaard.
  ⚠️ De tweekolomsopmaak en de responsieve regels staan om die reden **achteraan** in style.css: ze zijn even specifiek als de basisregel, dus alleen wat later staat wint. Zet een media query voor deze pagina dus nooit vóór de basisregel.
  De pagina heeft `noindex: true` en valt daarmee automatisch buiten sitemap en llms.txt: het is een vragenlijst voor genodigden, geen marketingpagina.
- Gebeurtenissen voor de trechter: `health-check-page-viewed`, `-email-entered`, `-email-captured`, `-assessment-started`, `-requested`, plus `-assessment-opened` en `-assessment-completed` op de vragenlijstpagina. Die gaan naar GoatCounter als dat aan staat en anders nergens heen; er is bewust geen nieuw analyticsplatform bijgekomen.
- Links ernaartoe: de footer op elke pagina, plus een tweede heroknop op Home en Contact.
- Er is **geen aparte privacyverklaring**; het formulier verwijst naar /compliance/. Komt er een echte privacy policy, dan moet die link mee.
- ⚠️ **De privacytekst moet kloppen met wat er echt gebeurt.** Er stond eerst "we use your details only to arrange your Health Check, we do not add you to a mailing list": dat was onwaar, want de pagina bestaat om zakelijke e-mailadressen te verzamelen en de gegevens gaan als prospect naar het CRM. Nu staat er wat er wél gebeurt (opslag in eigen systeem, opvolging, niet verkopen, verwijderen op verzoek). Verandert de opvolging, dan verandert deze tekst mee.
- ⚠️ **Honeypot-les** (raakt ook het contactformulier en de demo-popup): een veld op `left:-9999px` is voor Chrome en wachtwoordmanagers gewoon zichtbaar en wordt meegevuld met autofill. Daarom staat het nu op `display:none` met de negeer-attributen van 1Password en LastPass, en gooit de server een verdacht bericht niet meer weg maar bewaart het met `spam: true` (verborgen op /beheer, zichtbaar via ?spam=1). Nooit meer zwijgend afbreken aan de kant van de browser: dan lijkt het formulier kapot.

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

- **Alle redirects staan in server.js**, in `OLD_PATHS` (oude Squarespace-paden zoals /waarom-tubes, /news, /oplossing) en `REDIRECT_HOSTS` (tubes.media en en.tubes.media naar www).
- Een `_redirects`-bestand doet hier **niets**: dat is een Netlify/Cloudflare-formaat en Railway draait Express. Het oude bestand is daarom verwijderd.
- De 19 oude 404's kwamen uit Search Console (Pagina's → Niet gevonden). Kijk daar opnieuw als er later paden bijkomen.

## Besloten klantpagina's: /mmg/ (Motion Media Group)

- `src/mmg/` bevat een sales-pitch voor Motion Media Group (Canadees media-investeringsbedrijf, contact Martin Waterman): `onepager.html`, `proposal.html` en de bijbehorende PDF's `Tubes-MMG-Onepager.pdf` / `Tubes-MMG-Proposal.pdf`. Live op https://www.tubes.media/mmg/onepager.html en /mmg/proposal.html.
- De map gaat via `addPassthroughCopy` één-op-één mee naar `_site/mmg/` en staat in `ignores` (Eleventy rendert er niets aan). Het zijn volledig zelfstandige HTML-bestanden (fonts, logo's en PDF als data-URI ingebed), los van de sitetemplates en het CMS.
- **Basic Auth** op alle /mmg/*-paden, geregeld in server.js: gebruikersnaam leeg, wachtwoord = env `MMG_PASSWORD` (fallback in de code: `MMGTubes01!`). Let op: deze repo is publiek, dus die fallback en de documenten zelf zijn op GitHub zichtbaar; repo privé maken is nog een open beslissing.
- robots.txt heeft `Disallow: /mmg/`; de pagina's horen niet in menu, sitemap of zoekmachines.
- Deze bestanden worden vanuit een Claude-sessie gegenereerd en hierheen gekopieerd; kleine tekstwijzigingen kunnen direct in deze bestanden, maar HTML en PDF moeten dan wel allebei aangepast worden (de PDF is een aparte render, geen automatische afgeleide).

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

- [ ] Railway: volume + ADMIN_PASSWORD op tubes-website (activeert /beheer)
- [ ] **4Relations aanzetten**: de koppeling is gebouwd en getest, maar staat uit tot `CRM_URL` en `CRM_TOKEN` op de Railway-service staan. Nodig van 4Relations: het adres van het endpoint dat een client aanmaakt, de manier van authenticeren, en of het veldschema past bij wat wij sturen (zie "Health Check-aanvragen naar 4Relations"). Wijkt het schema af, dan is alleen `crmPayload()` in server.js aan te passen.
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
