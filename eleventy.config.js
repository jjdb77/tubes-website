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
    // Alleen geladen op de gratis tools (src/tools/*.njk). budget-compare.js is
    // op de Budget Builder ook de lezer voor xlsx/CSV-import.
    budgetCompare: "/js/budget-compare.js?v=" + fileHash("src/js/budget-compare.js"),
    budgetBuilder: "/js/budget-builder.js?v=" + fileHash("src/js/budget-builder.js"),
    budgetTemplates: "/js/budget-templates.js?v=" + fileHash("src/js/budget-templates.js"),
    // Alleen op /budget-plan-produce/ (eigen pagina, los van layout.njk).
    budgetPlanProduceCss: "/css/budget-plan-produce.css?v=" + fileHash("src/css/budget-plan-produce.css"),
    budgetPlanProduceJs: "/js/budget-plan-produce.js?v=" + fileHash("src/js/budget-plan-produce.js"),
  });
  const md = markdownIt({ html: true, breaks: false, linkify: true });

  // Markdown-filter voor tekstvelden uit het CMS
  eleventyConfig.addFilter("md", (value) => (value ? md.render(String(value)) : ""));
  eleventyConfig.addFilter("mdInline", (value) => (value ? md.renderInline(String(value)) : ""));
  eleventyConfig.addFilter("year", () => new Date().getFullYear());
  // Heeft deze pagina een sectie van dit type? Voor CSS en JS die alleen op
  // pagina's met zo'n sectie geladen hoeven te worden (layout.njk).
  eleventyConfig.addFilter("hasSection", (sections, type) => Array.isArray(sections) && sections.some((s) => s && s.type === type));
  // "{city}, {country}" invullen met velden van een item (generieke lijsten)
  eleventyConfig.addFilter("tpl", (template, item) => String(template || "").replace(/\{(\w+)\}/g, (_, k) => (item && item[k] != null ? item[k] : "")));

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

  // Nieuwsberichten (/news/): korte items met datum, samenvatting en link,
  // zonder eigen pagina (permalink: false in het bericht). Nieuwste bovenaan.
  eleventyConfig.addCollection("news", (collectionApi) =>
    collectionApi.getFilteredByGlob("src/content/news/*.md").sort((a, b) => b.date - a.date)
  );

  // Tweede stroom op /news/: posts uit de branche die we op LinkedIn
  // tegenkwamen. Aparte map, want ze hebben andere velden (bron, onderwerp,
  // link naar de post) en een eigen opmaak. Ook zonder eigen pagina.
  // De datum bepaalt alleen de volgorde en de weekkop: van een gevonden post
  // kennen we de exacte plaatsingsdatum meestal niet.
  eleventyConfig.addCollection("linkedin", (collectionApi) =>
    collectionApi.getFilteredByGlob("src/content/linkedin/*.md").sort((a, b) => b.date - a.date)
  );

  // "8 to 14 September 2026": de week (maandag t/m zondag) waarin de datum valt.
  // Over een maandgrens heen wordt het "31 August to 6 September 2026".
  eleventyConfig.addFilter("weekRange", (value) => {
    const d = new Date(value);
    const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7)); // terug naar maandag
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 6);
    const fmt = (date, opts) => date.toLocaleDateString("en-GB", { ...opts, timeZone: "UTC" });
    const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
    const sameMonth = sameYear && start.getUTCMonth() === end.getUTCMonth();
    const from = sameMonth ? fmt(start, { day: "numeric" })
      : sameYear ? fmt(start, { day: "numeric", month: "long" })
      : fmt(start, { day: "numeric", month: "long", year: "numeric" });
    return `${from} to ${fmt(end, { day: "numeric", month: "long", year: "numeric" })}`;
  });

  // "Katya Alexander's", maar "Glassriver Films'" bij een naam op een s
  eleventyConfig.addFilter("possessive", (name) => {
    const value = String(name || "").trim();
    if (!value) return value;
    return /s$/i.test(value) ? `${value}'` : `${value}'s`;
  });

  // Waar wijst de link heen? Bepaalt de knoptekst, want we beloven de bezoeker
  // geen post waar een profiel staat.
  //   post     losse post of artikel  -> "Read X's original post on LinkedIn"
  //   activity berichtenoverzicht     -> "See X's posts on LinkedIn"
  //   profile  profiel of bedrijfspagina -> "See more from X on LinkedIn"
  eleventyConfig.addFilter("linkedinLinkType", (url) => {
    const value = String(url || "");
    if (!value) return "";
    if (/\/feed\/update\/|\/posts\/[^/]+-activity-|\/pulse\//.test(value)) return "post";
    if (/\/recent-activity\/|\/company\/[^/]+\/posts\/?$/.test(value)) return "activity";
    return "profile";
  });

  // Geeft width="..." height="..." terug voor een afbeelding uit src/assets.
  // Daarmee reserveert de browser meteen de juiste ruimte en springt de
  // pagina niet tijdens het laden (goed voor de Google-scores).
  eleventyConfig.addFilter("imgSize", (src) => {
    if (!src || String(src).startsWith("http")) return "";
    const size = imageSize(path.join("src", String(src).replace(/^\//, "")));
    return size ? `width="${size.width}" height="${size.height}"` : "";
  });

  // Zelfde ?v=<hash>-truc als bij CSS/JS, maar dan voor afbeeldingen: een
  // vervangen bestand (zelfde naam, nieuwe inhoud, bv. een nieuwe
  // schermafbeelding) krijgt zo een nieuwe URL en is meteen zichtbaar, ook al
  // hield de browser de oude 30 dagen vast.
  eleventyConfig.addFilter("imgSrc", (src) => {
    if (!src || String(src).startsWith("http")) return src;
    const hash = fileHash(path.join("src", String(src).replace(/^\//, "")));
    return hash === "0" ? src : `${src}?v=${hash}`;
  });

  // ---------- Structured data (schema.org) ----------
  //
  // Google en AI-zoekmachines lezen dit blok om te begrijpen wat Tubes is,
  // wie het maakt, wat het kost en welke vragen de site beantwoordt.
  // Alles wordt uit de paginasecties afgeleid, zodat het meeloopt met het CMS.

  const sectionsOfType = (sections, type) =>
    (Array.isArray(sections) ? sections : []).filter((s) => s && s.type === type);

  // Landen, steden en types worden URL's in de bedrijvengids: "Czech Republic"
  // wordt "czech-republic", "Ta' Xbiex" wordt "ta-xbiex". Accenten eerst
  // wegvouwen, anders krijgt Kosice een andere URL dan Kosice met streepje.
  eleventyConfig.addFilter("slug", (value) =>
    String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
  );

  // "the Netherlands" hoort midden in een zin klein, aan het begin van een zin
  // of in een titel met een hoofdletter. Alleen de eerste letter, want de rest
  // van de naam heeft zijn eigen hoofdletters.
  eleventyConfig.addFilter("capitalize_first", (v) => {
    const s = String(v || "");
    return s.charAt(0).toUpperCase() + s.slice(1);
  });

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
      about: { "@id": data.company || data.product ? abs(url) + "#listed" : softwareId },
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
      // Bedrijvengids: Home > Companies > Land > Bedrijf
      for (const crumb of data.crumbs || []) {
        trail.push({ "@type": "ListItem", position: trail.length + 1, name: crumb.name, item: abs(crumb.url) });
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

    // Bedrijvengids: het bedrijf waar de pagina over gaat. Bewust een aparte
    // Organization met een eigen @id, los van Tubes zelf, zodat Google ziet dat
    // de pagina een vermelding is en geen eigen vestiging.
    if (data.company) {
      const c = data.company;
      graph.push({
        "@type": "Organization",
        "@id": abs(url) + "#listed",
        name: c.name,
        description: toPlainText(c.summary),
        url: c.official_url,
        mainEntityOfPage: { "@id": pageId },
        address: { "@type": "PostalAddress", addressLocality: c.city, addressCountry: c.country },
        ...(c.lat != null && c.lng != null
          ? { location: { "@type": "Place", geo: { "@type": "GeoCoordinates", latitude: c.lat, longitude: c.lng } } }
          : {}),
        ...(c.founded ? { foundingDate: String(c.founded) } : {}),
        ...(c.group ? { parentOrganization: { "@type": "Organization", name: c.group } } : {}),
        ...(c.services ? { knowsAbout: String(c.services).split(/,\s*/).filter(Boolean) } : {}),
        ...(Array.isArray(c.source_urls) && c.source_urls.length ? { sameAs: c.source_urls } : {}),
      });
    }

    // Softwarelijst: het product waar de pagina over gaat. Eigen @id, los van
    // Tubes' eigen SoftwareApplication, zodat een vermelding niet als ons eigen
    // product wordt gelezen. De prijs gaat er alleen in als de leverancier een
    // bedrag publiceert; "quote on request" levert geen Offer op.
    if (data.product) {
      const p = data.product;
      const priceText = String(p.pricing_model || "");
      const m = priceText.match(/(EUR|USD|GBP)\s*([\d.,]+)/i) || priceText.match(/([\u20ac$\u00a3])\s*([\d.,]+)/);
      const currency = m ? { "\u20ac": "EUR", $: "USD", "\u00a3": "GBP" }[m[1]] || m[1].toUpperCase() : null;
      const amount = m ? m[2].replace(/\.(?=\d{3}\b)/g, "").replace(",", ".") : null;
      // Gratis en open source is een echt, controleerbaar bedrag.
      const isFree = !m && /^free\b/i.test(priceText.trim());
      // Een bedrag in een prijsmodel is bijna altijd de ONDERGRENS van een reeks
      // tarieven ("from EUR 49", een instaptier). Dat als vaste prijs opgeven zou
      // meer beweren dan de leverancier publiceert, dus het gaat als lowPrice in
      // een AggregateOffer.
      const offer = isFree
        ? { "@type": "Offer", price: "0", priceCurrency: "USD", availability: "https://schema.org/InStock", url: p.official_url }
        : amount && currency
          ? { "@type": "AggregateOffer", lowPrice: amount, priceCurrency: currency, availability: "https://schema.org/InStock", url: p.official_url }
          : null;
      graph.push({
        "@type": "SoftwareApplication",
        "@id": abs(url) + "#listed",
        name: p.name,
        description: toPlainText(p.summary),
        applicationCategory: "BusinessApplication",
        applicationSubCategory: p.category,
        url: p.official_url,
        mainEntityOfPage: { "@id": pageId },
        ...(p.platforms ? { operatingSystem: p.platforms } : {}),
        ...(p.vendor
          ? { publisher: { "@type": "Organization", name: p.vendor, ...(p.vendor_country ? { address: { "@type": "PostalAddress", addressCountry: p.vendor_country } } : {}) } }
          : {}),
        ...(Array.isArray(p.source_urls) && p.source_urls.length ? { sameAs: p.source_urls } : {}),
        ...(offer ? { offers: offer } : {}),
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
          name: item.data?.title || item.name,
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

  // ---------- Health Check-vragenlijst ----------
  //
  // Vragen kunnen in het CMS op inactief gezet worden: ze blijven dan in
  // healthcheck.json staan (tekst blijft bewaard) maar verschijnen niet op de
  // pagina. Handig om de lijst kort te houden zonder werk weg te gooien; wat
  // uitstaat komt in het gesprek zelf aan bod.
  const isActive = (question) => question && question.active !== false;

  eleventyConfig.addFilter("activeSteps", (steps) =>
    (Array.isArray(steps) ? steps : [])
      .map((step) => ({ ...step, questions: (step.questions || []).filter(isActive) }))
      .filter((step) => step.questions.length)
  );

  // Wat niet gevraagd wordt, noemen we op het rapport als agenda voor de sessie.
  eleventyConfig.addFilter("parkedQuestions", (steps) =>
    (Array.isArray(steps) ? steps : []).flatMap((step) => (step.questions || []).filter((q) => !isActive(q)))
  );

  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });
  eleventyConfig.addPassthroughCopy({ "src/css": "css" });
  eleventyConfig.addPassthroughCopy({ "src/js": "js" });
  eleventyConfig.addPassthroughCopy({ "src/admin": "admin" });
  eleventyConfig.addPassthroughCopy({ "src/mmg": "mmg" });
  eleventyConfig.addPassthroughCopy({ "src/robots.txt": "robots.txt" });

  // /admin alleen als statische kopie meenemen (niet als pagina, niet in de sitemap)
  eleventyConfig.ignores.add("src/admin/**");
  eleventyConfig.ignores.add("src/mmg/**");

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
