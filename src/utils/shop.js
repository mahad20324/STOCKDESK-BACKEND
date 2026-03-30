function slugifyShopName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}

async function generateUniqueShopSlug(Shop, name) {
  const base = slugifyShopName(name) || 'shop';
  let slug = base;
  let suffix = 1;

  while (await Shop.findOne({ where: { slug } })) {
    slug = `${base}-${suffix}`;
    suffix += 1;
  }

  return slug;
}

module.exports = {
  generateUniqueShopSlug,
  slugifyShopName,
};