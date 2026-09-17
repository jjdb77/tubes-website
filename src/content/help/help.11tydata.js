// Helpcentrum (/help/): elk bestand in deze map is een artikel. De map is plat
// (makkelijk in het CMS); de categorie staat in de front matter als `collection`
// en bepaalt de URL: /help/<collection>/<bestandsnaam>/. Categorieën staan in
// src/_data/helpcenter.json.
export default {
  layout: "help-article.njk",
  tags: ["help"],
  excludeFromLlms: true,
  eleventyComputed: {
    permalink: (data) => `/help/${data.collection}/${data.page.fileSlug}/`,
    // Google-omschrijving: eigen tekst, anders de samenvatting
    description: (data) => data.description || data.summary,
    // Zolang helpcenter.json "noindex": true heeft, blijft het hele helpcentrum
    // uit Google, sitemap.xml en llms.txt (tot de artikelen zijn nagekeken).
    noindex: (data) => Boolean(data.noindex || data.helpcenter?.noindex),
  },
};
