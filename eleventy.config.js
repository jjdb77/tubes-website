import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import markdownIt from "markdown-it";
import { HtmlBasePlugin } from "@11ty/eleventy";
import { imageSize } from "./lib/image-size.js";

// Korte hash per bestand, als ?v= achter de CSS- en JS-links. Daardoor kan de
// browser die bestanden een jaar bewaren en ziet hij een wijziging tóch meteen:
// na een deploy verandert de hash en dus de URL.
function fileHash(file) {
  try {
    return crypto.createHash("sha1").update(fs.readFileSync(file)).digest("hex").slice(0, 8);
  } catch {
    return "0";
  }
}

export default function (eleventyConfig) {
  // Zet alle interne links om als de site in een submap draait
  // (GitHub Pages-testadres). Standaard "/" — voor het echte domein.
  eleventyConfig.addPlugin(HtmlBasePlugin);

  // Testversie: niet laten indexeren door zoekmachines.
  // Actief bij submap-deploy (PATH_PREFIX) of expliciet via PREVIEW=true
  // (zet die env-variabele op Railway uit zodra tubes.media live gaat).
  eleventyConfig.addGlobalData("isPreview", Boolean(process.env.PATH_PREFIX || process.env.PREVIEW));
  eleventyConfig.addGlobalData("assets", {
    css: "/css/style.css?v=" + fileHash("src/css/style.css"),
    js: "/js/site.js?v=" + fileHash("src/js/site.js"),
  });
  const md = markdownIt({ html: true, breaks: false, linkify: true });

  // Markdown-filter voor tekstvelden uit het CMS
  eleventyConfig.addFilter("md", (value) => (value ? md.render(String(value)) : ""));
  eleventyConfig.addFilter("mdInline", (value) => (value ? md.renderInline(String(value)) : ""));
  eleventyConfig.addFilter("year", () => new Date().getFullYear());

  // Markdown → kale tekst (voor titels, omschrijvingen en structured data)
  const toPlainText = (value) =>
    md
      .render(String(value || ""))
      .replace(/<[^>]*>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  eleventyConfig.addFilter("plain", toPlainText);

  // ---------- Artikelen (Insights) ----------

  const countWords = (html) => {
    const text = String(html || "").replace(/<[^>]*>/g, " ").trim();
    return text ? text.split(/\s+/).length : 0;
  };
  eleventyConfig.addFilter("wordCount", countWords);
  eleventyConfig.addFilter("readingTime", (html) => Math.max(1, Math.round(countWords(html) / 220)));

  eleventyConfig.addFilter("readableDate", (value) =>
    new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
  );
  eleventyConfig.addFilter("isoDate", (value) => new Date(value).toISOString().split("T")[0]);

  // Nieuwste artikel bovenaan
  eleventyConfig.addCollection("insights", (collectionApi) =>
    collectionApi.getFilteredByGlob("src/content/insights/*.md").sort((a, b) => b.date - a.date)
  );

  // Geeft width="..." height="..." terug voor een afbeelding uit src/assets.
  // Daarmee reserveert de browser meteen de juiste ruimte en springt de
  // pagina niet tijdens het laden (goed voor de Google-scores).
  eleventyConfig.addFilter("imgSize", (src) => {
    if (!src || String(src).startsWith("http")) return "";
    const size = imageSize(path.join("src", String(src).replace(/^\//, "")));
    return size ? `width="${size.width}" height="${size.height}"` : "";
  });

  // ---------- Structured data (schema.org) ----------
  //
  // Google en AI-zoekmachines lezen dit blok om te begrijpen wat Tubes is,
  // wie het maakt, wat het kost en welke vragen de site beantwoordt.
  // Alles wordt uit de paginasecties afgeleid, zodat het meeloopt met het CMS.

  const sectionsOfType = (sections, type) =>
    (Array.isArray(sections) ? sections : []).filter((s) => s && s.type === type);

  eleventyConfig.addFilter("jsonld", (data) => {
    const { settings = {}, url = "/", title, seoTitle, description, sections = [] } = data || {};
    const base = String(settings.site_url || "").replace(/\/$/, "");
    const abs = (p) => (p && String(p).startsWith("http") ? p : base + (p || ""));
    const orgId = base + "/#organization";
    const siteId = base + "/#website";
    const pageId = abs(url) + "#webpage";
    const softwareId = base + "/#software";
    const isHome = url === "/";
    const pageTitle = seoTitle || (isHome ? `${settings.site_name} | ${settings.tagline}` : `${title} | ${settings.site_name}`);
    const pageDescription = description || settings.footer_text;

    const graph = [];

    graph.push({
      "@type": "Organization",
      "@id": orgId,
      name: settings.site_name,
      legalName: settings.legal?.company,
      alternateName: `${settings.site_name} by ${settings.legal?.company}`,
      description: toPlainText(settings.footer_text),
      url: base + "/",
      logo: { "@type": "ImageObject", url: abs(settings.logo), caption: settings.site_name },
      image: abs(settings.logo),
      email: settings.contact?.email,
      telephone: settings.contact?.phone,
      vatID: settings.legal?.vat,
      address: {
        "@type": "PostalAddress",
        streetAddress: settings.contact?.address_lines?.[0],
        addressLocality: "Amsterdam",
        postalCode: "1103 AD",
        addressCountry: "NL",
      },
      areaServed: [{ "@type": "Place", name: "Europe" }, { "@type": "Place", name: "Worldwide" }],
      sameAs: [settings.socials?.linkedin, settings.socials?.youtube].filter(Boolean),
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "sales",
        email: settings.contact?.email,
        telephone: settings.contact?.phone,
        availableLanguage: ["en", "nl"],
      },
    });

    graph.push({
      "@type": "WebSite",
      "@id": siteId,
      url: base + "/",
      name: settings.site_name,
      description: toPlainText(settings.footer_text),
      inLanguage: "en",
      publisher: { "@id": orgId },
    });

    const webPage = {
      "@type": "WebPage",
      "@id": pageId,
      url: abs(url),
      name: pageTitle,
      description: toPlainText(pageDescription),
      isPartOf: { "@id": siteId },
      about: { "@id": softwareId },
      inLanguage: "en",
      primaryImageOfPage: abs("/assets/images/og-image.png"),
    };

    // Kruimelpad: Home > (Insights >) Deze pagina
    if (!isHome && title) {
      const crumbId = abs(url) + "#breadcrumb";
      const trail = [{ "@type": "ListItem", position: 1, name: "Home", item: base + "/" }];
      if (data.article) {
        trail.push({ "@type": "ListItem", position: 2, name: "Insights", item: base + "/insights/" });
      }
      trail.push({ "@type": "ListItem", position: trail.length + 1, name: title, item: abs(url) });
      webPage.breadcrumb = { "@id": crumbId };
      graph.push({ "@type": "BreadcrumbList", "@id": crumbId, itemListElement: trail });
    }

    // Artikelen: Google en AI-zoekmachines willen weten wie het schreef en wanneer
    if (data.article) {
      webPage["@type"] = "WebPage";
      graph.push({
        "@type": "Article",
        "@id": abs(url) + "#article",
        headline: data.article.headline,
        description: toPlainText(pageDescription),
        datePublished: data.article.date ? new Date(data.article.date).toISOString() : undefined,
        dateModified: new Date(data.article.updated || data.article.date || Date.now()).toISOString(),
        wordCount: data.article.words,
        inLanguage: "en",
        isPartOf: { "@id": pageId },
        mainEntityOfPage: { "@id": pageId },
        author: { "@id": orgId },
        publisher: { "@id": orgId },
        image: abs("/assets/images/og-image.png"),
        about: { "@id": softwareId },
      });
    }

    graph.push(webPage);

    // Het product zelf, met de prijzen van de abonnementskaarten
    if (data.schemaSoftware) {
      const offers = [];
      for (const section of sectionsOfType(sections, "pricing")) {
        for (const plan of section.plans || []) {
          const amount = String(plan.price || "").replace(/[^\d.,]/g, "").replace(",", ".");
          offers.push({
            "@type": "Offer",
            name: plan.name,
            description: toPlainText(plan.text),
            ...(amount
              ? { price: amount, priceCurrency: "EUR", availability: "https://schema.org/InStock" }
              : { availability: "https://schema.org/InStock" }),
            url: base + "/plans/",
            ...(amount
              ? {
                  priceSpecification: {
                    "@type": "UnitPriceSpecification",
                    price: amount,
                    priceCurrency: "EUR",
                    unitText: "MONTH",
                    billingDuration: 1,
                    billingIncrement: 1,
                  },
                }
              : {}),
          });
        }
      }

      graph.push({
        "@type": "SoftwareApplication",
        "@id": softwareId,
        name: settings.site_name,
        applicationCategory: "BusinessApplication",
        applicationSubCategory: "Production Management Software",
        operatingSystem: "Web browser",
        url: base + "/platform/",
        description: toPlainText(settings.footer_text),
        image: abs("/assets/images/og-image.png"),
        softwareHelp: base + "/academy/",
        featureList: [
          "Production budgeting",
          "Production scheduling and planning",
          "Real-time cost control",
          "Forecasting and reporting",
          "Purchase and invoice approval flows",
          "Role-based access and audit trails",
        ],
        publisher: { "@id": orgId },
        provider: { "@id": orgId },
        ...(offers.length ? { offers } : {}),
      });
    }

    // Overzichtspagina met artikelen
    if (Array.isArray(data.itemList) && data.itemList.length) {
      graph.push({
        "@type": "ItemList",
        "@id": abs(url) + "#list",
        itemListElement: data.itemList.map((item, i) => ({
          "@type": "ListItem",
          position: i + 1,
          url: abs(item.url),
          name: item.data?.title,
        })),
      });
    }

    // Veelgestelde vragen op de pagina
    const faqItems = sectionsOfType(sections, "faq").flatMap((s) => s.items || []);
    if (faqItems.length) {
      graph.push({
        "@type": "FAQPage",
        "@id": abs(url) + "#faq",
        isPartOf: { "@id": pageId },
        mainEntity: faqItems.map((item) => ({
          "@type": "Question",
          name: toPlainText(item.question),
          acceptedAnswer: { "@type": "Answer", text: toPlainText(item.answer) },
        })),
      });
    }

    return JSON.stringify({ "@context": "https://schema.org", "@graph": graph }, null, 2);
  });

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
