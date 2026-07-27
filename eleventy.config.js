import markdownIt from "markdown-it";
import { HtmlBasePlugin } from "@11ty/eleventy";

export default function (eleventyConfig) {
  // Zet alle interne links om als de site in een submap draait
  // (GitHub Pages-testadres). Standaard "/" — voor het echte domein.
  eleventyConfig.addPlugin(HtmlBasePlugin);

  // Testversie: niet laten indexeren door zoekmachines.
  // Actief bij submap-deploy (PATH_PREFIX) of expliciet via PREVIEW=true
  // (zet die env-variabele op Railway uit zodra tubes.media live gaat).
  eleventyConfig.addGlobalData("isPreview", Boolean(process.env.PATH_PREFIX || process.env.PREVIEW));
  const md = markdownIt({ html: true, breaks: false, linkify: true });

  // Markdown-filter voor tekstvelden uit het CMS
  eleventyConfig.addFilter("md", (value) => (value ? md.render(String(value)) : ""));
  eleventyConfig.addFilter("mdInline", (value) => (value ? md.renderInline(String(value)) : ""));
  eleventyConfig.addFilter("year", () => new Date().getFullYear());

  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });
  eleventyConfig.addPassthroughCopy({ "src/css": "css" });
  eleventyConfig.addPassthroughCopy({ "src/js": "js" });
  eleventyConfig.addPassthroughCopy({ "src/admin": "admin" });
  eleventyConfig.addPassthroughCopy({ "src/robots.txt": "robots.txt" });
  eleventyConfig.addPassthroughCopy({ "src/_redirects": "_redirects" });

  // /admin alleen als statische kopie meenemen (niet als pagina, niet in de sitemap)
  eleventyConfig.ignores.add("src/admin/**");

  eleventyConfig.setServerOptions({ showAllHosts: true });

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      data: "_data"
    },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
    pathPrefix: process.env.PATH_PREFIX || "/"
  };
}
