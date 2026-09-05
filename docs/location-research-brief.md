# Research brief: locations for the Tubes film & TV locations guide

You are collecting entries for https://www.tubes.media/compare-film-tv-locations/, a free
SEARCH AND COMPARE guide for producers and location managers (no booking, no marketplace).
Tubes lists a location, links to its official page and to the film commission, and lets
visitors compare up to three side by side on practical facts. Nothing else.

## What counts as a location (include only if ALL of these hold)

1. It is a concrete, named, publicly identifiable place with coordinates (not an anonymous
   "3-bed family home in Surrey" from an agency catalogue).
2. It has an official web page you have OPENED and that loads: the venue's own site, or the
   page of the public body that manages it (council, national park, port, railway, museum
   trust, university, hospital trust), or its page in a film commission's public catalogue.
3. At least one of: (a) that page publishes filming / location-hire information, or
   (b) it has a documented production history (name the productions), or
   (c) it is listed in a national or regional film commission's public location catalogue
   (then put that catalogue page in `url`).
4. It is not already in the guide (see existing.md in this folder).

## What we want MORE of (this is the whole point of the exercise)

Ordinary, actually usable production locations, spread across the country, not only
famous landmarks. Aim for at least 60% of your entries in these everyday types:
- Industrial & derelict: factories, warehouses, docks, power stations, mines, gasworks,
  industrial heritage sites, quarries, shipyards.
- Hospital, prison & institution: disused hospitals, former prisons, asylums, barracks,
  courthouses, police stations that are hired for filming.
- Office, school & public building: office buildings and business parks with a filming page,
  universities and colleges, schools, libraries, town halls, museums, government buildings.
- House & apartment: named villas, manor houses, country houses, townhouses, apartment
  buildings, housing estates, farmhouses that publish filming/hire information.
- Hotel & interiors: hotels, spas, restaurants and bars, shops, department stores, markets,
  theatres, cinemas, ballrooms, arenas, stadiums, sports halls, swimming pools.
- Transport & infrastructure: disused airports, railway stations, heritage railways, tram
  depots, bridges, tunnels, ports, motorways (managed sections), ships, lighthouses.
- City & skyline and Historic town & street: named streets, squares, neighbourhoods,
  modernist estates, high-rise districts.
- Village & countryside, Forest & lake, Coast & beach, Mountains & wilderness: named parks,
  forests, lakes, beaches, dunes, moors, with the managing authority's page.
Also add studios (sound stages, backlots, water tanks, virtual production stages) you find
that are missing. Castles, palaces and monasteries are fine but keep them to a minority.

## Types (use EXACTLY one of these strings)

Castle & estate | Palace & landmark | Historic town & street | Village & countryside |
City & skyline | Coast & beach | Mountains & wilderness | Forest & lake | Hotel & interiors |
Church & monastery | Transport & infrastructure | Industrial & derelict | Modern architecture |
Studio & backlot | House & apartment | Hospital, prison & institution |
Office, school & public building | Bar, restaurant & shop | Theatre, arena & venue

(Use "Bar, restaurant & shop" for restaurants, bars, cafes, shops, department stores, markets;
"Theatre, arena & venue" for theatres, cinemas, concert halls, stadiums, arenas, sports halls,
swimming pools, event venues; "Hotel & interiors" for hotels, spas, ballrooms.)

## Fields per entry (JSON object)

Required:
- id: "<cc>-<slug>" lowercase, hyphens, ascii only, cc = ISO 2-letter country code
  (uk, ie, nl, be, de, fr, es, it, hu, cz, at, pl, pt, gr, hr, mt, dk, se, no, fi, is,
  ro, bg, rs, lt, lv, ee, sk, si, lu, ch).
- name: the place's own name (English where one exists, otherwise the local name).
- country: exactly the English country name used in the guide, e.g. "United Kingdom",
  "Czech Republic", "Netherlands", "Romania", "Bulgaria", "Serbia", "Lithuania", "Latvia",
  "Estonia", "Slovakia", "Slovenia", "Luxembourg", "Switzerland".
- region: province / county / region, e.g. "Greater Manchester", "North Holland", "Bavaria".
  Write it in ASCII without accents ("Ile-de-France", "Zlin Region", "Baden-Wurttemberg")
  and use the English name where there is a common one (Brittany, not Bretagne; Lisbon, not
  Lisboa). No "(city)" in brackets: write "Katowice, Silesian Voivodeship". In the United
  Kingdom leave English counties bare ("Surrey", not "Surrey, England") and add the nation
  for the others ("Glasgow, Scotland", "Cardiff, Wales", "Belfast, Northern Ireland").
  Running `node scripts/normalize-regions.mjs` after a round fixes most of this anyway.
- lat, lng: decimal degrees with 4 decimals, the actual spot. Check them: Wikipedia
  infobox, Wikidata, or Nominatim (curl -s -A "tubes-locations-guide" "https://nominatim.openstreetmap.org/search?q=<query>&format=json&limit=1", max 1 request per second).
- type: one of the strings above.
- setting: ONE sentence, max 220 characters, in your own words, factual, describing what the
  place offers a production (look, scale, interiors/exteriors, period). No superlatives,
  no marketing copy, no em-dashes. Never copy sentences from other location databases.
- official_url: the page you opened (venue or managing body). Must load (HTTP 200).
- commission_url: the national film commission's site for that country (or the most
  relevant regional commission). A plain site URL is fine.
- source_urls: array of the URLs where you found the facts (official page, filming page,
  commission catalogue page, Wikipedia article for production history).

Optional, ONLY when the venue itself (or the commission) publishes it. Never estimate,
never infer. Empty is better than a guess:
- known_for: named productions that shot there, comma separated (max 4).
- price_note: published price as text, e.g. "Location hire from GBP 1,200 per day (own site)".
- price_eur_day: integer, only if the published price is a day rate in euros.
- capacity: integer persons, only if published.
- facilities: text, e.g. "Power on site, parking for 40 vehicles, crew rooms, catering space".
- suitability: text, what they say about filming, e.g. "Interior and exterior filming, drones with permission, night shoots possible".
- permit_needed: "Yes" or "No", only if the page states it.
- logistics: text on access, parking, distance to a city or airport, only if published.
- url: the film commission catalogue page for this exact place, if there is one.
- photo: object {thumb, file_page, author, license}. See photo rules.

## Photo rules (strict)

Only Wikimedia Commons, only free licences (CC0, CC BY, CC BY-SA, public domain, any version).
Never use non-free/fair-use files, never hotlink other sites, never copy photos from location
databases. Skip the photo if you cannot find one in a couple of minutes; entries without a
photo are fine (the page shows a type label instead).

Find one with the Commons API (curl is fastest):
curl -s -A "tubes-locations-guide" "https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=<place name>&gsrnamespace=6&gsrlimit=5&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=960&format=json"
Use: thumb = imageinfo[0].thumburl, file_page = imageinfo[0].descriptionurl,
author = extmetadata.Artist.value with HTML tags stripped (plain name), license =
extmetadata.LicenseShortName.value (e.g. "CC BY-SA 4.0"). Skip files whose licence is not in
the allowed list or whose picture is clearly not the place.

## Working method

1. Load WebSearch and WebFetch with ToolSearch ("select:WebSearch,WebFetch") first.
   Use curl in Bash for status checks and APIs; WebFetch to read pages.
2. Good starting points: the national/regional film commission's location pages and
   "filming at ..." pages of venues; search queries like "<country> location filming hire
   factory", "filming at our hospital", "location hire warehouse <city>", "Drehort mieten",
   "location de lieu de tournage", "filmlocatie huren", "lokacije za snimanje", etc.
   Wikipedia categories such as "Filming locations in <country>" and "Film studios in
   <country>" help for production history and coordinates.
3. Do NOT fetch or copy from locations.filmfrance.net (its terms forbid automated use).
   Do not copy text or photos from any location database; link to commission pages instead.
4. For every entry, actually open official_url (WebFetch or curl -I) and confirm it loads.
   Drop entries whose page does not load.
5. Write your own settings. English, no em-dashes (use commas or a colon), no exclamation
   marks, no words like "stunning", "perfect", "iconic".
6. Spread across regions of the country, not only the capital.

## Output

Write a single JSON file (a bare array of entry objects) to the exact output path given in
your task. Validate it with: node -e 'JSON.parse(require("fs").readFileSync("<path>","utf8"))'.
Then reply with a SHORT summary only: number of entries, counts per type, anything you were
unsure about (max 15 lines). Do not paste the JSON in your reply.
