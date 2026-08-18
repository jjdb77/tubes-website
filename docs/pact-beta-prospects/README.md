# Pact beta-prospects (augustus 2026)

Britse onafhankelijke productiebedrijven uit de [Pact-ledenlijst](https://www.pact.co.uk/find-a-member.html),
gefilterd op 5 tot 20 medewerkers, als kandidaten voor de beta van Tubes.

Overzichtspagina met de 30 beste kandidaten en de verantwoording:
https://claude.ai/code/artifact/b3a9cfb7-1be1-4944-bae5-3d34bae8d05c

## Bestanden

| Bestand | Inhoud |
| --- | --- |
| `pact-shortlist-5-20.xlsx` | 125 bedrijven met bevestigd 5 tot 20 medewerkers, met trend, bron van het cijfer, contactadres, Companies House-nummer en Pact-link |
| `pact-33-rechecked.xlsx` | 33 twijfelgevallen die handmatig zijn nagetrokken, met uitkomst: in band, te groot, te klein, nog geen jaarrekening, of niet vast te stellen |
| `pact-producers-full.xlsx` | alle 715 leden met activiteit "Production", met alles wat is verzameld |

Elk werkblad heeft een bevroren kopregel, filters op elke kolom en klikbare sites, e-mailadressen en Pact-links.
De teksten in de bestanden zijn Engels.

## Waar de cijfers vandaan komen

De Pact-directory vermeldt geen personeelsomvang. Per lid is daarom de statutaire naam opgezocht bij
Companies House en is het gemiddelde aantal medewerkers uit de laatst ingediende jaarrekening gehaald
(XBRL-veld `AverageNumberEmployees`). Bij gescande jaarrekeningen zonder tekstlaag is de personeelsnoot
via OCR gelezen. Alleen exacte naammatches zijn gebruikt, zodat er geen cijfers van naamgenoten in de
lijst belanden.

Let op bij het gebruik:

- Het cijfer is een jaargemiddelde inclusief freelancers die tijdens een productie op de loonlijst staan.
- De jaarrekening kan een tot twee jaar oud zijn; het boekjaareinde staat in de kolom "Accounts to".
- Voor 217 van de 715 leden is geen cijfer te achterhalen (scans zonder cijfers, of geen zekere match).

## Onderhoud

Dit is een momentopname van 17-8-2026, geen levend bestand. De werkwijze om het opnieuw te draaien staat
in het Claude-geheugen onder `pact-beta-prospects`.
