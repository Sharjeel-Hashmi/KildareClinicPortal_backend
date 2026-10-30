const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const slugify = (text) =>
  String(text || "")
    .toLowerCase()
    .replace(/^dr\.?\s+/, "dr-")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

// Returns `base`, or base-2, base-3 ... until nobody else (excludeId) uses it.
async function uniqueSlug(Model, text, excludeId) {
  const base = slugify(text) || "item";
  for (let i = 1; i <= 50; i += 1) {
    const candidate = i === 1 ? base : `${base}-${i}`;
    const filter = { slug: candidate };
    if (excludeId) filter._id = { $ne: excludeId };
    // eslint-disable-next-line no-await-in-loop
    if (!(await Model.exists(filter))) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export { SLUG_RE, slugify, uniqueSlug };
