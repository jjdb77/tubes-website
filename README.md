# Tubes website — tubes.media

De website van Tubes, nagebouwd als **statische site** (geen Squarespace meer nodig). Gebouwd met [Eleventy](https://www.11ty.dev/), met een simpel beheersysteem ([Sveltia CMS](https://github.com/sveltia/sveltia-cms)) op `/admin/`.

**Kosten na verhuizing: € 0 hosting** (Cloudflare Pages, gratis) — alleen de domeinregistratie van tubes.media blijft (± € 10–20 per jaar).

---

## Lokaal draaien

```bash
npm install     # eenmalig
npm run dev     # start op http://localhost:8080
```

`npm run build` maakt de definitieve site in de map `_site/`.

## Content bewerken (het beheersysteem)

Er zijn twee manieren:

**1. Via het beheerscherm** — start `npm run dev` en open <http://localhost:8080/admin/>. Kies **"Work with Local Repository"** en selecteer deze projectmap (werkt in Chrome/Edge). Je kunt dan alle pagina's, teksten, afbeeldingen en instellingen bewerken zonder code aan te raken. Na online zetten (zie hieronder) werkt ditzelfde scherm ook op `https://www.tubes.media/admin/` — inloggen met GitHub.

**2. Rechtstreeks in de bestanden** — alle teksten staan in:
- `src/content/pages/*.md` — één bestand per pagina, opgebouwd uit "secties"
- `src/_data/settings.json` — logo, menu, contactgegevens, footer, social media

Elke pagina bestaat uit **secties** (hero, tekst+beeld, kaarten, abonnementen, call-to-action, …). Secties kun je in het beheerscherm toevoegen, verwijderen en herschikken.

## Structuur

```
src/
├── content/pages/     ← alle pagina-inhoud (bewerkbaar via CMS)
├── _data/settings.json ← site-instellingen (bewerkbaar via CMS)
├── admin/             ← het beheerscherm (Sveltia CMS)
├── assets/images/     ← afbeeldingen
├── assets/videos/     ← de 3 video's (van de oude site gedownload)
├── assets/fonts/      ← Manrope + Poppins (zelf-gehost, sneller + AVG-proof)
├── css/ en js/        ← vormgeving en gedrag
└── _includes/         ← paginatemplates (de secties)
```

## Belangrijk om te weten

- **Plans-pagina**: de knop "Choose Producer Pro" linkt naar de Tubes-app (`demo.tubesmedia.online`). Zodra dat `app.tubesmedia.online` wordt: pas de link aan in het CMS (pagina *Plans* → sectie *Abonnementen* → knop) én in *Site-instellingen → Tubes app-URL*.
- **Contactformulier**: werkt nu via het e-mailprogramma van de bezoeker (mailto). Beter: maak een gratis account op [formspree.io](https://formspree.io) of [web3forms.com](https://web3forms.com), en plak het endpoint/de URL in *Site-instellingen → Formulier-endpoint*. Berichten komen dan netjes per e-mail binnen op contact@tubes.media.
- **Academy**: de knop "Access all videos" verwijst nu naar `#` (de oude besloten Squarespace-ledenpagina vervalt bij opzeggen). Zet de trainingsvideo's bijv. als verborgen (unlisted) playlist op het bestaande YouTube-kanaal en zet die link in het CMS.
- **Oude URL `/home-2`** (Company) wordt automatisch doorgestuurd naar `/company/`.

## Online zetten (eenmalig, ± 30 min)

1. **GitHub**: maak een (privé) repository, bijv. `tubes-website`, en push deze map.
2. **Cloudflare Pages** (gratis): maak een account op [pages.cloudflare.com](https://pages.cloudflare.com) → *Create a project* → koppel de GitHub-repo.
   - Build command: `npm run build`
   - Build output directory: `_site`
3. **Domein koppelen**: in Cloudflare Pages → *Custom domains* → voeg `tubes.media` en `www.tubes.media` toe. Verhuis de DNS van het domein naar Cloudflare (of zet de aangegeven CNAME-records bij je huidige registrar).
4. **CMS online activeren**: vul in `src/admin/config.yml` bij `repo:` je GitHub-gebruikersnaam/repo in. Voor inloggen op `/admin/` via GitHub is eenmalig een kleine OAuth-koppeling nodig ([sveltia-cms-auth](https://github.com/sveltia/sveltia-cms-auth), gratis Cloudflare Worker — stappenplan staat op die pagina).
5. **Squarespace opzeggen** — pas nadat het domein en de site via Cloudflare draaien.

## Vindbaarheid (Google e.d.)

De site heeft alles aan boord: unieke paginatitels en omschrijvingen, `sitemap.xml`, `robots.txt`, nette URL's, gestructureerde data (Organization), Open Graph-tags en snelle laadtijden (statisch + gecomprimeerde media).

Na livegang nog doen:
1. Meld de site aan bij [Google Search Console](https://search.google.com/search-console) (domein verifiëren gaat vanzelf als DNS al bij Cloudflare staat).
2. Dien de sitemap in: `https://www.tubes.media/sitemap.xml`.
3. Idem bij [Bing Webmaster Tools](https://www.bing.com/webmasters) (kan importeren vanuit Search Console).

Omdat de URL's gelijk blijven aan de oude site (en `/home-2` wordt doorgestuurd), blijft de bestaande Google-ranking behouden.
