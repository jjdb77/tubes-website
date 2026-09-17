// Categoriepagina's van het helpcentrum (/help/<slug>/).
// Alleen categorieën met minstens één artikel krijgen een pagina; een lege
// categorie zou anders als lege pagina in sitemap.xml en llms.txt komen.
// De berekende velden staan hier als functies: een tekst als "Planning &
// scheduling" zou via een Nunjucks-string in de front matter een tweede keer
// ge-escaped worden in <title>.
import fs from "node:fs";
import path from "node:path";

// Welke categorieën hebben artikelen? Uit de front matter van de bestanden
// zelf, want in pagination.before zijn de collecties nog niet beschikbaar.
function usedCollections() {
  const dir = "src/content/help";
  const slugs = new Set();
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".md")) continue;
    const m = fs.readFileSync(path.join(dir, file), "utf8").match(/^collection:\s*["']?([a-z0-9-]+)/m);
    if (m) slugs.add(m[1]);
  }
  return slugs;
}

export default {
  pagination: {
    before: (cols) => {
      const slugs = usedCollections();
      return cols.filter((c) => slugs.has(c.slug));
    },
  },
  eleventyComputed: {
    title: (data) => data.col?.name,
    seo_title: (data) => `${data.col?.name} | Tubes Help Center`,
    description: (data) => `${data.col?.description} Guides for Tubes users.`,
    noindex: (data) => Boolean(data.helpcenter?.noindex),
    crumbs: () => [{ name: "Help Center", url: "/help/" }],
  },
};
