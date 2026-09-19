# Research brief: software for media companies

You are collecting entries for https://www.tubes.media/compare-media-software/, a free
SEARCH AND COMPARE directory of software for film, TV and media production companies.
Visitors search by task ("call sheets", "cost report", "review and approval"), filter by
category, deployment or vendor country, and put up to three products side by side on
PUBLISHED FACTS. No reviews, no ranking, no ratings. Tubes (the publisher) is listed in it
like any other product, so the list must be fair and factual.

## What counts as an entry (include only if ALL of these hold)

1. It is a real software product or online platform that is currently sold, offered or
   maintained. Discontinued products are out (say so in your notes instead).
2. It is used in the making, managing, finishing or selling of film, TV, commercials,
   animation, documentary or streaming content. General business tools count only when
   they are widely used in this sector for a production task (Xero and Odoo are listed
   for that reason). Hardware is out; software that only exists to drive one vendor's
   hardware is out too.
3. Its official website has been OPENED by you (WebFetch) and loads. Every fact you write
   comes from that site (product, pricing, plans, platform pages, legal/imprint page for the
   vendor's name and country) or from Wikipedia for the founding year. App-store listings,
   review sites (Capterra, G2), Crunchbase and press articles are NOT sources for facts.

## The one rule that matters most: only what the vendor publishes

- `pricing_model` is quoted as published: amount, currency, per what, billing period,
  what is included, and end with "(published)". If there is a free tier or trial, say so.
  If the vendor publishes no price at all, write exactly `Not published`. If the site says
  "contact us" or "request a quote", write `Quote on request`. NEVER estimate, never copy a
  price from a review site, never convert currencies.
- `integrations`, `platforms`: only what the vendor states. Unknown = `null`. A blank is
  better than a guess: a producer will plan on it.
- `founded` is the year the PRODUCT (or the platform) started, shown on the page as
  "Since <year>". For a single-product company that is the company's year. For a
  multi-product vendor (Adobe, Autodesk, Avid, Epic) the company's founding year is NOT the
  product's year: leave `null` unless the vendor or Wikipedia states the product's own year.
- `summary` describes what the product does, in plain words, one or two sentences,
  at most 320 characters. No marketing words (leading, award-winning, best-in-class,
  cutting-edge, world-class, state-of-the-art, powerful, seamless). Name the vendor's
  city or country where that is natural ("Munich-based ...").
- `for_whom`: who uses it, in one line, as the vendor describes its audience.
- No em-dashes (the character "—") anywhere. Use commas, colons or brackets.

## Categories (use EXACTLY one of these strings for `category`)

- `Production management`: running the production itself: projects, crew, schedules,
  approvals, documents, reporting in one place.
- `Budgeting & cost control`: building a budget, tracking actuals, forecasting.
- `Scheduling & call sheets`: stripboards, shooting schedules, day out of days, call sheets.
- `Production accounting & payroll`: purchase orders, cost reports, payroll, accounting.
- `Script & pre-production`: screenwriting, breakdowns, storyboards, shot lists, previs.
- `Location & crew sourcing`: finding places and people: casting, crew databases, location
  marketplaces, permits and bookings.
- `Asset & media management`: MAM/DAM, on-set data management, file transfer, storage,
  archives, review and approval.
- `Post-production & VFX`: editing, colour, finishing, VFX, animation, audio post,
  subtitling, virtual production and live production graphics, render management.
- `Rights & distribution`: rights, licensing, deliveries, distribution, festival
  submissions and festival management, screeners, sales.
- `Business & CRM`: the company around the productions: sales, contacts, contracts,
  facility scheduling, business administration.

A product may ALSO belong to other categories: put those in `also_in` (array of the same
strings), only where it really has that function (Celtx has budgeting; Yamdu has
scheduling). Leave it out otherwise.

`deployment`: exactly one of `Cloud`, `Desktop`, `Cloud + desktop`, `On-premise + cloud`.

## Fields (JSON, one object per entry)

```json
{
  "id": "fuzzlecheck",
  "name": "Fuzzlecheck",
  "vendor": "Fuzzlecheck GmbH",
  "vendor_country": "Germany",
  "category": "Scheduling & call sheets",
  "also_in": ["Production management"],
  "summary": "One or two sentences on what it does, as the vendor describes it.",
  "for_whom": "who uses it",
  "pricing_model": "Subscription from EUR 29 per month ... (published)",
  "deployment": "Cloud",
  "platforms": "Web, iOS, Android",
  "integrations": "Final Draft, Movie Magic Budgeting",
  "founded": 2010,
  "official_url": "https://www.example.com",
  "source_urls": ["https://www.example.com/pricing", "https://www.example.com/imprint"],
  "logo": null,
  "photo": null
}
```

- `id`: lowercase ascii slug of the product name (`adobe-after-effects`, `pro-tools`).
- `name`: the product name as the vendor writes it, without the vendor prefix unless that
  is the product's name (`Adobe Premiere`, `Avid Media Composer`, but `Baselight`).
- `vendor`: the legal or trading name of the company. `vendor_country`: English country
  name of the vendor's headquarters (`United States`, `United Kingdom`, `Netherlands`).
- `source_urls`: the pages you actually read for pricing and product facts (2 or 3).
- `logo` and `photo` are always `null`; we do not use vendor images.

## How to work

- Open the official site with WebFetch first (product page, then pricing/plans, then
  legal/imprint or about page). Use WebSearch only when you do not know the domain or
  cannot find the pricing page; the search budget is shared and small, so at most five
  searches for the whole task.
- Some sites block automated fetching (403) or return only JavaScript. Try the pricing URL
  directly, or Wikipedia for the basics; if you still cannot read the site, SKIP the
  product and say so in your report. Do not fill fields from memory.
- Write the result as a JSON array to the file you were given, and write the file
  progressively (after every few products), so nothing is lost if you run out of time.
- Report at the end: which products you added, which you skipped and why.
