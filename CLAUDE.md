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

## Boekingen (Book a call)

- Knoppen op de abonnementskaarten → `/book-a-call/producer-pro/` en `/book-a-call/enterprise/` (doorstuurpagina's uit `src/book-a-call.njk`, gepagineerd over `settings.booking_plans`).
- Doel = `settings.booking_url` + slug. Slugs: `tubes-producer-pro` en `tubes-enterprice` (**met c** — zo heet de pagina in 4relations, niet "corrigeren").
- booking_url = https://4relations.appconnected.nl/boek/joachim (wordt ooit afspraak.tubes.media).

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

## Doorverwijzingen (301)

- **Alle redirects staan in server.js**, in `OLD_PATHS` (oude Squarespace-paden zoals /waarom-tubes, /news, /oplossing) en `REDIRECT_HOSTS` (tubes.media en en.tubes.media naar www).
- Een `_redirects`-bestand doet hier **niets**: dat is een Netlify/Cloudflare-formaat en Railway draait Express. Het oude bestand is daarom verwijderd.
- De 19 oude 404's kwamen uit Search Console (Pagina's → Niet gevonden). Kijk daar opnieuw als er later paden bijkomen.

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
- Prijzen: Producer Pro € 49/mnd incl. 2 users, € 29,50/mnd per extra user t/m 10; daarboven Enterprise. Op de site staat het als "€ 29.50" (Engelse notatie).

## Openstaand

- [ ] Railway: volume + ADMIN_PASSWORD op tubes-website (activeert /beheer)
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
