# Research brief: film investors and funds in Europe

You are collecting entries for https://www.tubes.media/compare-film-investors/, a free
SEARCH AND COMPARE directory of organisations that put money into films and series in
Europe. A producer looking for finance searches by country, type of money (grant, loan,
equity) and format (feature, documentary, animation, series), and compares up to three
on PUBLISHED FACTS. No ranking, no opinions.

## What counts as an entry (include only if ALL hold)

1. It is an ORGANISATION (public fund, company, bank, fund manager). Never a private
   person, never an individual angel investor, never a named employee.
2. It puts its own money (or public money it manages) into the development, production,
   post-production or distribution of film, TV series, documentary or animation, and says
   so on its own website. A fund that only supports festivals, cinemas or training is out.
3. Its official website has been OPENED by you (WebFetch, or curl with a browser
   User-Agent if WebFetch gets a 403) and loads. Every fact comes from that site, or from
   Wikipedia for the founding year. Press articles, Crunchbase, LinkedIn and databases
   (Cineuropa, Olffi, KFTV) may help you FIND entries but are NOT sources for facts.
4. It is based in, or a fund for, one of these countries: United Kingdom, Ireland, France,
   Belgium, Luxembourg, Netherlands, Switzerland, Germany, Austria, Italy, Spain, Portugal,
   Malta, Greece, Sweden, Norway, Denmark, Finland, Iceland, Estonia, Latvia, Lithuania,
   Poland, Czechia, Slovakia, Hungary, Slovenia, Croatia, Serbia, Romania, Bulgaria. Or it
   is pan-European (Eurimages, Creative Europe MEDIA, Nordisk Film & TV Fond and the like).
5. Out of scope: pure tax rebate or tax credit schemes run by a tax authority (those are on
   /compare-film-incentives/ already), sales agents and distributors (a minimum guarantee
   is a sale, not an investment), crowdfunding platforms, broadcasters (they commission or
   pre-buy; a separate fund run by a broadcaster that awards money by application is in).

## Only what the organisation publishes

- `budget_note`: an annual budget, a maximum per project or a typical amount, ONLY as
  published, with currency, and ending with "(published)". Otherwise `null`. Never
  estimate, never convert currencies.
- `eligibility` and `how_to_apply`: one line each, in your own words, as the site states
  (who may apply, deadlines or rolling intake, "by invitation", "via a co-producer in
  Norway"). Unknown = `null`.
- `summary`: what they fund, in plain words, one or two sentences, at most 300 characters.
  Own words, never copied. No marketing words (leading, premier, world-class, unique,
  innovative, passionate). Name the city or country where natural.
- No em-dashes or en-dashes (— –) anywhere, no semicolons. Use commas, full stops or brackets.

## Fields (JSON, exactly these keys)

```json
{
  "id": "nl-netherlands-film-fund",
  "name": "Netherlands Film Fund (Nederlands Filmfonds)",
  "type": "National film fund",
  "country": "Netherlands",
  "city": "Amsterdam",
  "lat": 52.37,
  "lng": 4.9,
  "summary": "...",
  "formats": ["Feature fiction", "Documentary", "Animation"],
  "instruments": ["Grant", "Soft loan"],
  "stages": ["Development", "Production", "Distribution"],
  "eligibility": "...",
  "how_to_apply": "...",
  "budget_note": null,
  "founded": 1993,
  "official_url": "https://www.filmfonds.nl/",
  "source_urls": ["https://www.filmfonds.nl/..."]
}
```

- `id`: lowercase country code plus slug (`gb-`, `ie-`, `fr-` ...), `eu-` for pan-European.
- `type`: EXACTLY one of
  - `Pan-European fund`
  - `National film fund` (the main public film body of a country, plus other national public funds for film and TV)
  - `Regional film fund` (a region, state, province or city)
  - `Private equity and film finance` (companies and funds that invest equity or provide production finance)
  - `Bank or specialist lender` (banks and lenders that lend against contracts, tax credits or gap)
  - `Tax shelter investor` (companies that raise investment for productions through a national tax shelter, such as the Belgian Tax Shelter)
- `country`: English name from the list above. For pan-European funds use the country of the seat (Eurimages: France).
- `lat`/`lng`: the city of the office, 2 decimals is enough.
- `formats`: subset of `Feature fiction`, `Documentary`, `Animation`, `Series`, `Short film`, `Immersive and games`.
- `instruments`: subset of `Grant`, `Soft loan` (repayable from revenues, recoupable), `Equity`, `Debt and gap finance`, `Tax shelter`.
- `stages`: subset of `Development`, `Production`, `Post-production`, `Distribution`, `Co-production`.
- `founded`: year or `null`.
- `source_urls`: the pages you actually read, 1 to 4.

## Working method

- Start with the national film body and EVERY regional fund of each country in your batch
  (Germany alone has around ten Länder funds; Spain, Italy, France and Belgium have many
  regional funds). The national film body's site often links the regional ones.
- Then private financiers, lenders and tax shelter companies with a public website that
  says they finance film or TV production.
- Prefer WebFetch on known domains over web search (the search limit is shared).
- Write your JSON array to the output file given in your task, and update it as you go
  (so partial work survives). Valid JSON only.
- Reply with: number of entries per country and type, and one line per thing you were
  unsure about or left out (with the reason).
