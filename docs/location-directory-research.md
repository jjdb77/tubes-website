# Locatiegidsen voor film en tv: wat andere sites doen (onderzoek 31-8-2026)

Bedoeld als input voor de uitbouw van /compare-film-tv-locations/ naar een Europese
locatiegids (zoeken binnen land/regio, kaart, foto's, links, 1 tot 3 locaties naast elkaar).
Alle sites zijn bezocht, tenzij "niet geverifieerd" staat. Geen scraping gedaan: de
voorwaarden van Film France verbieden geautomatiseerd overnemen en elk hergebruik van foto's.

## Relevantste sites

| Site | Zoeken op | Kaart | Foto's | Links | Vergelijken / shortlist | Aanmelden eigenaar |
|---|---|---|---|---|---|---|
| Film France, locations.filmfrance.net (15.828 publieke resultaten) | tekst met autocomplete; regio, departement, type, omgeving, bouwperiode, stijl, staat, met aantallen; grid/lijst | ja, op detailpagina (OpenStreetMap), alleen plaats/postcode | 5 + "8 andere"; per foto credit en bijschrift; watermerk | "Contact the commission"; technische info achter gratis Pro-account | "Add to location portfolio" (deelbare URL, account nodig) | ja, gratis eigenaarsaccount, max 2 sheets; eigenaar garandeert fotorechten |
| Italy for Movies, italyformovies.it/location | "Cosa/Dove"; 200+ types, 20 regio's, sfeer (~20), staat, periode, stijl; lijst/kaart | ja, Google Maps | 10 per locatie; credits niet gezien | contactpersoon, website locatie, "funding programmes for this location", vergelijkbare locaties, print | favorieten (account), delen | niet op portal; regionale commissies wel |
| Czech Film Commission, filmcommission.cz/en/locations | trefwoord; 12 categorieën; labels seizoen, tijdstip, periode, stijl, regio | nee | 7-foto carrousel met © | geen adres/contact per locatie | nee | nee |
| Portugal Film Commission, portugalfilmcommission.com/en/location | 7 regio's x 22 categorieën (chips) | nee, geen coördinaten | ~6 per locatie met © | toegangstype; contact = commissie | nee | nee |
| Netherlands Film Commission, filmcommission.nl/locations | 13 categoriegalerijen, tekst, tags | nee | 1 per locatie, geen credit | vergunningen via netwerk | nee | nee |
| Screen Ireland / NI Screen (OpenBrolly) | ~100 categorieën ("Doubles for - London"), county, stijl/periode, setting | niet zichtbaar (zoeken achter login) | niet zichtbaar | niet zichtbaar | lijsten (login) | ja, formulier van ~20 min, met machtiging en voorwaarden |
| Film London (Reel-Scout), 4.300+ locaties | niet geverifieerd (403) | Mapme (leverancier) | niet geverifieerd | niet geverifieerd | "packages" | registreren, dan aanmelden |
| Screen Scotland, locations.screen.scot | site lag eruit (Cloudflare 526) | niet geverifieerd | commissie fotografeert zelf; eigenaar kiest zichtbare foto's | niet geverifieerd | mappen (account) | ja, Property Form + foto's, driejaarlijkse check |
| LocationsHub (Reel-Scout, VS) | adres/plaats; categoriechips; lade met stijl e.d. | geen kaart bij resultaten | kaart met foto, hartje, naam, plaats, ID | contactformulier | favorieten + deelbare lightboxes | ja, $4,95/maand |
| Giggster (marktplaats) | capaciteit, prijs, activiteit, type | lijst + kaart | carrousel, prijs per uur, rating | boeken | favorieten | "List your space" |
| FilmMap, thefilmmap.com (open data) | contenttype, locatietype, 91 landen, 400 steden | ja | Wikimedia Commons, licentie per foto | Wikipedia/Wikidata | nee | via Wikidata |
| Wrapbook "Compare States" (incentives) | zoeken + Compare/Remove per staat | kaart met hover | n.v.t. | film office per rij | 2+ staten, identieke rijvolgorde | n.v.t. |

Verder: Film Paris Region gebruikt de Film France-app als white-label (voorgefilterd op Ile-de-France).
Spain Film Commission heeft "AI Locations" (natuurlijke taal en beeldzoeken), geen klassieke catalogus.
Apulia FC en Film in Iceland: alleen galerijen. Screen Malta: archief bestaat, inhoud niet geverifieerd.
EUFCN: geen database; Location Award toont 5 foto's per finalist met ©. Location-Guide.eu is offline.
EP en Cast & Crew: vergelijk tot 3 jurisdicties uit dropdowns, zonder login. Dramatify's Location Bank
zit alleen in de app (adres, contacten, toegangsinfo, parkeren, foto's, types incl. unit base).
Progressive Productions (HU/AT) heeft "My Selection" en verbiedt elk hergebruik van foto's.

## Patronen om over te nemen

1. Facetten met aantallen op onafhankelijke assen: regio, type, omgeving, periode, stijl, staat (Film France). Plus "doubles for"-tags (NI Screen) en sfeertags (Italy for Movies).
2. Kaart/lijst-schakelaar en een kaart op elke detailpagina (Italy for Movies, Film France). OSM/Leaflet volstaat en is licentie-schoon.
3. Kaartopbouw: hoofdfoto, ID-nummer, type + regio, vertrouwensbadge ("pre-spotted by ..."), één knop voor de shortlist.
4. Shortlist als deelbaar object met publieke URL (Film France, LocationsHub). Voor Tubes: vergelijken van 1 tot 3 gratis, opslaan/delen via account = de lead.
5. Detailpagina: credit en bijschrift per foto, "bijgewerkt"-datum, "meld een fout", print, "contact the commission"; technische info en "regelingen voor deze locatie" (Italy for Movies), wat bij ons "incentive in dit land" wordt.
6. Grove locatieprivacy: plaats/postcode en lage zoom, volledig adres pas na toestemming (Film France, SetScouter).
7. Vergelijking: vaste, identieke rijen per kolom, in-/uitklapbare secties, max 3 kolommen, print/PDF (Wrapbook, EP).
8. Regionale white-label-embed (Film Paris Region) als haakje voor samenwerking met commissies.

## Valkuilen

- Login op het zoeken zelf (Screen Ireland, NI Screen, Film London) doodt SEO en leads; zet alleen shortlist/delen achter een account.
- Inconsistente taxonomie (NI Screen: "Cliffs / Coves" naast "Cliffs/Coves"); gebruik een vaste woordenlijst.
- Kwetsbare infrastructuur: Screen Scotland lag eruit, Location-Guide.eu offline, Apulia en Iceland zonder data.
- Ontbrekende coördinaten, credits of contacten (Nederland, Portugal, Tsjechië) maken vergelijken dun; maak ze verplicht in het schema.
- Marktplaatssignalen (prijs per uur, direct boeken) suggereren boeken; vermijden.
- Cookiebanners die klikken opslokken (Film France, Italy for Movies).
- Scrapen: Film France verbiedt geautomatiseerd overnemen en hergebruik van foto's; linken alleen met de credit "https://locations.filmfrance.net / réseau Film France CNC".

## Foto's met respect voor rechten

1. Uploads van eigenaren met garantie (Film France: eigenaar garandeert rechten en geen herkenbare personen; Marche en Trentino: verklaring, gratis, opzegbaar). Bewaar de verklaring bij de upload.
2. Materiaal van filmcommissies alleen met schriftelijke toestemming en met hun credit ("© Czech Film Commission"). Nooit hotlinken.
3. Creative Commons via Wikimedia Commons, gevonden via Wikidata-coördinaten (aanpak FilmMap; hun dataset is CC0 GeoJSON/CSV en mag hergebruikt worden). Toon licentie en maker per foto.
4. Alleen doorlinken voor al het andere: naam, coördinaten, type en link naar de commissiepagina.

Geen enkele commissie biedt een publieke API; FilmMap is de enige open-databron die gevonden is.
