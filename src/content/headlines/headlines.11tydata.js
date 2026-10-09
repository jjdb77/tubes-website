// Film- en tv-koppen (/news/<slug>/): elk bericht heeft een eigen pagina met
// het volledige artikel van De Vector (scripts/import-devector.mjs), de bronnen
// en klein "via De Vector".
export default {
  layout: "headline.njk",
  permalink: (data) => `/news/${data.page.fileSlug}/`,
  excludeFromLlms: true,
  // Volledige tekst staat ook op De Vector: buiten Google en de sitemap.
  noindex: true,
  eleventyComputed: {
    description: (data) => data.description || data.summary,
  },
};
