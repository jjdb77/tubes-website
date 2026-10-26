# The Daily Tubes bijwerken (geplande taak, 3x per dag)

Werkinstructie voor de geplande Claude-taak die /news/ bijwerkt uit De Vector.
Draait om 06.30, 12.30 en 18.30 (Amsterdam). De ochtendmail gaat om 07.00 uit,
dus het nieuws van de nacht zit erin.

## Stappen

1. `git pull` op `main`.
2. `node scripts/fetch-devector.mjs --site` toont de nieuwe stukken in de
   rubrieken Film en Media sinds het nieuwste bericht op de site. Niets nieuw:
   stoppen, niets committen.
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
   via: "<de en-URL uit stap 2>"
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

Faalt een import (opmaak van De Vector veranderd), sla dat stuk over, zet het
niet in de skiplijst, en meld het in de samenvatting van de run.
