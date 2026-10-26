# The Daily Tubes bijwerken (geplande taak, 1x per dag)

Werkinstructie voor de geplande Claude-taak die /news/ bijwerkt uit De Vector.
Draait één keer per dag om 06.30 (Amsterdam, wintertijd; cron `30 5 * * *` UTC,
dus in de zomer 07.30). De ochtendmail gaat om 07.00 uit en neemt mee wat er
sinds de vorige mail bij kwam.

## Stappen

1. `git pull` op `main`.
2. `node scripts/fetch-devector.mjs --site` toont de nieuwe stukken sinds het
   nieuwste bericht op de site: de rubrieken Film en Media van de dagelijkse
   editie én het vakblad Screen & Broadcast (`/bladen/film-tv/`). Dat vakblad
   levert verreweg het meeste op (fondsen, coproducties, markten, overnames).
   Niets nieuw: stoppen, niets committen.
3. Kies per stuk: wel of niet. **Wel**: wat ertoe doet voor wie film of tv
   maakt: deals en overnames, streamers en zenders (bestellingen, rechten,
   ontslagen, stopzettingen), prijzen en festivals, box office, markten
   (MIPCOM, Berlinale), financiering, rechten en AI in productie. **Niet**:
   overlijdens, rechtszaken tegen personen, binnenlandse politiek, persvrijheid,
   radio, kranten, roddel, teasers en trailers. Dubbele stukken over hetzelfde:
   alleen het meest volledige.
4. Elk afgewezen stuk als regel in `scripts/devector-skipped.txt`
   (`<datum>/<slug>  # reden`), zodat het niet terugkomt.
5. Per gekozen stuk een stub `src/content/headlines/<engelse-slug>.md`:
   ```
   ---
   date: <datum>
   topic: "<Business | Streaming | Awards & festivals | Box office | Rights & AI>"
   via: "<de Engelse URL uit stap 2: /en/edition/... of /bladen/film-tv/en/...>"
   ---
   ```
   en dan `node scripts/import-devector.mjs <engelse-slug>`.
6. Vervang `title` en `summary` door eigen woorden (Engels). Kop kort en
   feitelijk. Samenvatting één of twee zinnen. Geen em-dashes, geen dubbele
   punt midden in een zin, geen AI-namen of ChatGPT. Niet de tekst van De Vector
   overnemen.
7. `npm run build` moet slagen.
8. Commit (bericht "The Daily Tubes: <n> berichten van <datum>") en push naar
   `main`. Railway deployt; de ochtendmail neemt nieuwe berichten vanzelf mee.

Faalt een import (opmaak van De Vector veranderd, of nog geen Engelse versie:
404), sla dat stuk over, zet het niet in de skiplijst, en meld het in de
samenvatting van de run. Een stuk zonder Engelse versie komt dan vanzelf terug
zodra die er is.
