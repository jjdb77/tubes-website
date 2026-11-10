# Sessie 8 en 9-10-2026: The Daily Tubes (branche-nieuws op /news/)

Branch `tman/indrustrie-news-kl7ppr`, alles naar main gepusht en live. Bij afsluiten nagekeken: worktree schoon, laatste commit f0e9893 zit in main, geen testservers meer actief.

## Wat en waarom

Joachim vroeg om nieuws van de afgelopen twee weken op /news/, met devector.nl (nieuwsdienst van Appsolutions, door AI geschreven) als bron, en een koppeling met De Vector Zakelijk om nieuws te blijven ophalen.

## Wat er veranderd is

- **Film- en tv-koppen op /news/**: negen berichten van 24-9 t/m 7-10-2026 (Paramount/Warner, Emmy's naar Prime Video, Gouden Kalveren, Paff, Netflix-reclameabonnement, Videoland-podcasts, Meta en AI-training, Nederlandse videomarkt, Digger). Collectie `headlines` in `src/content/headlines/`.
- **Elk bericht een eigen pagina** op `/news/<slug>/` met het volledige De Vector-artikel: foto (maker en licentie), tekst, perspectieven, fact check, noot en bronnen. Kaart op /news/ toont eigen kop en samenvatting.
- **Scripts**: `scripts/fetch-devector.mjs` (API `feed.json`, sleutel via `DEVECTOR_API_KEY`, niet in de repo) en `scripts/import-devector.mjs <slug> [url]` (neemt een artikel volledig over).
- **"What's new at Tubes"** naar een eigen pagina `/whats-new/`, met vijf nieuwe eigen berichten (30-9 t/m 4-10: filmfondsen, rollen, How a film is made + woordenlijst, Budgeting € 29, pagina's per stap).
- **Nieuwe naam**: /news/ heet "The Daily Tubes" (was Industry news): kop, footer, footer_nav, tegel op /resources/.
- **Abonneren per e-mail**: inschrijfblok op /news/ en onder elk artikel, dubbele opt-in, ochtendmail na 7 uur alleen als er nieuwe artikelen zijn, afmelden met link of List-Unsubscribe. Opslag op de volume, aantal op /beheer. Privacyverklaring hoofdstuk 15.
- CLAUDE.md bijgewerkt (Nieuws, De Vector-koppeling, The Daily Tubes per e-mail).

## Keuzes

- **AI niet op de voorgrond** (verzoek Joachim): geen AI-namen of "written with ChatGPT" op de pagina's, bronnen zijn de oorspronkelijke berichtgeving, "via De Vector" klein onderaan. Geen verborgen link (spambeleid Google). De fact check houdt één regel "Automated fact check", anders lijkt het door een mens nagelopen.
- **Dubbele inhoud**: de artikelpagina's staan op noindex en buiten de sitemap, omdat dezelfde tekst op devector.nl staat. /news/ met eigen samenvattingen staat wel in Google (voorstel Joachim). Tekst licht herschrijven helpt niet.
- Selectie: alleen nieuws dat ertoe doet voor wie film of tv maakt; geen overlijdens, politiek of persvrijheid.
- Afzender mail: "The Daily Tubes <info@appsolutions.nl>", want alleen dat domein is in Resend geverifieerd.

## Getest

- Lokaal met nep-mailendpoint: inschrijven, weigeren zonder token, bevestigen, ochtendmail met alleen nieuwe artikelen, afmelden met één klik.
- Live: pagina's, noindex, digest.json en weigering zonder token. Geen echte mail via Resend verstuurd.

## Openstaand

- De API-sleutel van De Vector is nergens opgeslagen (schrijven naar `~/.config` werd geblokkeerd); Joachim moet hem opnieuw geven of zelf in zijn shell zetten. De sleutel stond in het gesprek; eventueel intrekken en vernieuwen.
- Een dagelijkse mail vraagt dagelijks nieuws ophalen en importeren (nu handwerk).
- Zelf inschrijven om de bevestigingsmail via Resend te controleren.
- Afzender @tubes.media vereist dat domein in Resend (staat al bij Openstaand in CLAUDE.md).
