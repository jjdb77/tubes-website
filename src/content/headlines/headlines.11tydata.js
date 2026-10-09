// Film- en tv-koppen (/news/<slug>/): elk bericht heeft een eigen pagina met
// het volledige stuk, de oorspronkelijke bronnen en klein "via De Vector".
export default {
  layout: "headline.njk",
  permalink: (data) => `/news/${data.page.fileSlug}/`,
  excludeFromLlms: true,
  eleventyComputed: {
    description: (data) => data.description || data.summary,
  },
};
