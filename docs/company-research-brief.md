# Research brief: studios, production and post-production companies

You are collecting entries for https://www.tubes.media/compare-media-production-companies/,
a free SEARCH AND COMPARE directory of film, TV and media companies in Europe, for producers,
line producers and production managers who need a partner: a studio to shoot in, a production
company to co-produce or service a shoot, a post-production house to finish it. Tubes lists
a company, links to its official site, and lets visitors compare up to three side by side on
published facts. Nothing else: no booking, no reviews, no ranking.

## What counts as an entry (include only if ALL of these hold)

1. It is a real, named company or facility with a physical base in the country (city known).
2. It has an official website you have OPENED (WebFetch) and that loads. Company pages on
   LinkedIn, IMDb, Crunchbase or a directory do not count as the official site; they may be
   used as an extra source only.
3. It belongs to exactly one of these three types:
   - **Studio**: a hireable facility: sound stages, backlots, virtual production (LED) stages,
     TV studios, scoring or recording stages. Not a company that merely calls itself a studio.
   - **Production company**: it develops and produces film, series, documentaries, commercials,
     animation or entertainment formats, or provides production services (fixing, servicing
     foreign shoots) as its main business.
   - **Post-production**: editing, colour grading, finishing, VFX, animation services, sound
     post, dubbing, mastering, DCP/deliveries, or a full-service post house.
   Corporate video agencies, wedding videographers, equipment rental, casting agencies,
   distributors and broadcasters are out of scope (a broadcaster's production arm is in scope
   if it operates as a production company with its own site).
4. It is professionally active in film, TV, commercials or streaming content: recent credits,
   clients or a current showreel on its site. Skip one-person operations unless they are
   clearly notable.

## What we want (spread matters)

- Cover the whole country, not only the capital. Major cities and regional hubs each get
  their share (for the UK: London, Manchester, Leeds, Bristol, Cardiff, Glasgow, Belfast ...).
- A mix of the three types, and within production companies a mix of specialisms: feature
  film, TV drama, documentary, commercials, animation, unscripted, service production.
- Both the large, well-known houses and solid mid-size independents. A producer looking for a
  co-producer in Poland or a grading suite in Lisbon should find realistic options.
- Studios that are already in the Tubes locations guide (see the list in this folder if
  present) are ALREADY covered; do not duplicate them. Add only studios that are missing.

## Types and specialisms (use EXACTLY these strings)

`type`: `Studio` | `Production company` | `Post-production`

`specialism` (pick the ONE that fits best):
- Studio: `Sound stages & backlot` | `Virtual production stage` | `TV & broadcast studio` |
  `Sound & music recording`
- Production company: `Feature film` | `TV drama & series` | `Documentary` |
  `Commercials & branded content` | `Animation` | `Entertainment & unscripted` |
  `Service production`
- Post-production: `Picture post & colour` | `VFX & animation` | `Sound post & dubbing` |
  `Full-service post`

## Fields (JSON, one object per entry)

```json
{
  "id": "nl-filmmore",
  "name": "Filmmore",
  "city": "Amsterdam",
  "country": "Netherlands",
  "lat": 52.3676,
  "lng": 4.9041,
  "type": "Post-production",
  "specialism": "Full-service post",
  "summary": "Post-production facility for feature films, documentaries and TV drama: editing, VFX, grading, sound and deliveries.",
  "services": "Editing, VFX, colour grading, sound post, DCP and deliveries",
  "credits": "The Forgotten Battle, Bon Bini Holland, Undercover",
  "facilities": null,
  "group": null,
  "founded": 2006,
  "official_url": "https://filmmore.eu/",
  "source_urls": ["https://filmmore.eu/about"]
}
```

- `id`: two-letter country code, hyphen, lowercase ascii slug of the name (`uk-` for the
  United Kingdom, `cz-` for the Czech Republic).
- `city`, `country`: the country name in English exactly as in the country list below.
- `lat`, `lng`: coordinates of the company's address if the site publishes one, otherwise the
  city centre. City-level accuracy is fine; the map shows where in Europe they are.
- `summary`: ONE sentence, max 220 characters, in your own words, describing what they do,
  based on their own site. No marketing adjectives ("award-winning", "leading").
- `services`: comma-separated list of services as published on the site, max 200 characters.
- `credits`: up to five productions, clients or brands NAMED ON THEIR OWN SITE (or on a
  reliable secondary source such as Wikipedia). If they publish none, `null`.
- `facilities`: only for studios and post houses, only as published: number and size of
  stages, LED volume dimensions, number of grading or mixing suites, Dolby Atmos, etc.
  Otherwise `null`.
- `group`: parent group or network if published (Banijay, Fremantle, ITV Studios, Mediawan,
  Company 3 ...). Otherwise `null`.
- `founded`: year as an integer if published, otherwise `null`.
- `official_url`: the site you opened. Use the canonical URL (after redirects).
- `source_urls`: 1 to 3 URLs you actually used (the about page, a Wikipedia article).

## Rules

- ONLY what the company publishes itself, or what Wikipedia states. Never guess or estimate a
  founding year, staff size, facility size or credit. `null` is better than a guess: a producer
  will plan on these facts.
- Never copy text from another directory or database. Write the summary yourself.
- No em-dashes (the character "—") anywhere. Use commas, colons or brackets.
- Every entry: open the official site with WebFetch before writing it down. A site that does
  not load, redirects to a parked page, or shows a company that has ceased trading: skip it.
- Use WebSearch to find candidates (queries like "post production company Lyon", "production
  company Wroclaw film", "sound stages hire Belgium", "producent film seriale Warszawa",
  "Filmproduktion Hamburg Kino", the local language helps), then WebFetch the official site.
  Film commission "production guide" or "directory" pages on the commission's own site are
  good starting lists (they are public catalogues); the entries you take from them must still
  be verified on the company's own site.
- Write your JSON file incrementally (append every 5 to 10 entries), so nothing is lost if
  you run out of time. Output a single JSON array.

## Countries (English names, exactly)

Austria, Belgium, Bulgaria, Croatia, Czech Republic, Denmark, Estonia, Finland, France,
Germany, Greece, Hungary, Iceland, Ireland, Italy, Latvia, Lithuania, Luxembourg, Malta,
Netherlands, Norway, Poland, Portugal, Romania, Serbia, Slovakia, Slovenia, Spain, Sweden,
Switzerland, United Kingdom.
