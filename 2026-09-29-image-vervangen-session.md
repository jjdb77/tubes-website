# Image vervangen

Branch: tman/image-vervangen-nere8l (commit ff44ec3, gepusht naar main)  
Started: 29-9-2026  
Worktree: image-vervangen-nere8l  

## Wat en waarom

De homepage is visueel bijgewerkt: verouderde screenshots zijn vervangen en de hero is beter afgestemd op de nieuwe presentatie.

## Besloten

- De Forecast-screenshot toont voortaan Fox and the Forest met echte cijfers in alle kolommen.
- De hero gebruikt een nieuw projectdashboard zonder gekopieerde notities.
- De bestaande bestandsnamen blijven behouden; screenshots blijven op de oorspronkelijke breedte.
- De hero-chips heten Budget, Plan en Produce en blijven na het vergroten groot.

## Gewijzigd

- Forecast- en hero-screenshots vervangen.
- Hero-hoekjes aangepast: algemene hoekradius 20 px, met kleinere hoeken op het hero-beeld zodat ze niet door de T lopen.
- Hero-chips 10% groter gemaakt en de animatie aangepast zodat ze één voor één groter worden en groot blijven.
- `CLAUDE.md` aangevuld met de werkwijze voor screenshotvervanging en cache-busting via `imgSrc`.

## Openstaand

- Geen lokale build gedraaid omdat deze worktree geen `node_modules` bevatte.
- Na de Railway-deploy moet nog worden gecontroleerd of de wijzigingen live op de homepage staan.
