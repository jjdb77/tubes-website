// Hub van het helpcentrum: noindex volgt de schakelaar in helpcenter.json.
export default {
  eleventyComputed: {
    noindex: (data) => Boolean(data.helpcenter?.noindex),
  },
};
