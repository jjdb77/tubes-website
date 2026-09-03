# Enrichment brief: practical facts for the Tubes locations guide

The guide at https://www.tubes.media/compare-film-tv-locations/ lets a producer put two or
three locations side by side. The comparison has rows for published price, capacity,
facilities, suitability for filming, permit needed and logistics. Most entries have none of
these filled in, so the comparison is thin. Your job is to fill them in, and ONLY with what
the venue itself publishes.

## The single rule that matters

**Never estimate, never infer, never generalise.** If the venue's site does not publish a
number or a statement, leave the field out. An empty field is correct and honest; a guessed
one is a lie the guide would repeat to a producer planning a shoot. "About 200 people" when
the site says nothing is wrong. "Parking available" because most venues have parking is wrong.

## What to do per entry

You get a JSON list of entries: id, name, region, country, type, official_url.
For each one:
1. Open `official_url`. Then look for the venue's own filming, location hire, venue hire,
   or press/production page. Typical paths and words: /filming, /film, /location-hire,
   /venue-hire, /hire, /commercial-filming, /drehgenehmigung, /drehort, /tournage,
   /rodajes, /filmopnames, /verhuur, /noleggio, /riprese. Also check a "Contact",
   "Professionals" or "Business" section.
2. Take only what is published there. Stop after a few pages per entry; if there is nothing,
   record nothing and move on. Many venues publish nothing, that is expected.

## Fields (all optional, include only what is published)

- `price_note`: the published price as text, with the currency and what it covers, e.g.
  "Filming from GBP 1,500 per day for commercial productions (own site)" or
  "Venue hire from EUR 850 per day (own site)". Never convert, never average.
- `price_eur_day`: integer, ONLY when the published price is a plain day rate in euros.
- `capacity`: integer number of people, only when published (seated or standing capacity of
  the venue, or the maximum crew size the venue names).
- `facilities`: what the venue publishes about the space: floor area in m2 or sq ft, number
  of rooms or stages, height, power supply, loading access, blackout, kitchens, dressing
  rooms, wifi, lift, catering space. One or two sentences, factual.
- `suitability`: what the venue says about filming specifically: whether interior and
  exterior filming is allowed, night shoots, drones, whether the site stays open to the
  public during a shoot, restrictions on tripods or lighting, whether a location manager
  must be present, notice period. One or two sentences.
- `permit_needed`: "Yes" or "No", only when the page states that a permit or written
  permission is or is not required.
- `logistics`: access, parking, vehicle sizes, nearest station or airport, distances,
  unit base space. Only what is published.
- `source_urls`: array of the exact pages you took these facts from. Required whenever you
  fill in any other field.

Style: English, no em-dashes, no exclamation marks, no marketing words ("stunning",
"iconic", "perfect", "unique"). Write numbers as the venue writes them, and name the unit.
Do not write sentences that say nothing is published; just leave the field out.

## Method

Load WebFetch with ToolSearch ("select:WebFetch") first; use curl in Bash for status checks
and for fetching pages when WebFetch is slow. WebSearch may be exhausted, do not rely on it.
Work through the list in order. Budget roughly 2 to 4 tool calls per entry and stop when you
reach about 90 tool calls in total, even if the list is not finished: a partial, correct
result is what we want. Batch independent fetches in one message where you can.

## Output

Write a JSON array of patch objects to the output path given in your task. Each object is
`{"id": "<the id>", ...only the fields you found}`. Include an entry ONLY if you found at
least one field. Validate that the file parses. Then reply with at most 12 lines: how many
entries you checked, how many yielded facts, which fields were most often available, and
anything that looked wrong in the underlying entry (dead link, page about a different place).
