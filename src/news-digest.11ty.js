// Lijst van The Daily Tubes-artikelen voor de ochtendmail (server.js, dailyRonde).
export default class {
  data() {
    return { permalink: "/news/digest.json", eleventyExcludeFromCollections: true };
  }
  render({ collections }) {
    const items = (collections.headlines || []).map((item) => ({
      slug: item.fileSlug,
      url: item.url,
      title: item.data.title,
      summary: item.data.summary || "",
      topic: item.data.topic || "",
      date: item.date.toISOString().slice(0, 10),
      photo: item.data.photo?.src || "",
    }));
    return JSON.stringify({ items });
  }
}
