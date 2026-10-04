// Rollen in mediaproductie: elk bestand in deze map is een rol, op
// /production-roles/<bestandsnaam>/. Indeling (sector en afdeling) in de front
// matter als `groups`, de namen in src/_data/productionRoles.json.
export default {
  layout: "role.njk",
  excludeFromLlms: true,
  eleventyComputed: {
    permalink: (data) => `/production-roles/${data.page.fileSlug}/`,
    description: (data) => data.description || data.summary,
  },
};
