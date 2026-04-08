const { Op } = require('sequelize');

function normalizeUsername(value) {
  if (!value) {
    return '';
  }

  return String(value)
    .trim()
    .toLowerCase()
    .replace(/@.*$/, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

function buildCandidates({ username, name }) {
  const candidates = [username, name]
    .map(normalizeUsername)
    .filter(Boolean);

  return candidates.length > 0 ? candidates : ['user'];
}

async function isUsernameTaken(User, username, shopId, excludeUserId) {
  const where = { username, shopId: shopId ?? null };

  if (excludeUserId) {
    where.id = { [Op.ne]: excludeUserId };
  }

  const existing = await User.findOne({ where });
  return Boolean(existing);
}

async function generateUniqueUsername(User, details, excludeUserId, shopId) {
  const candidates = buildCandidates(details);

  for (const candidate of candidates) {
    if (!(await isUsernameTaken(User, candidate, shopId, excludeUserId))) {
      return candidate;
    }
  }

  const base = candidates[0];
  let suffix = 1;

  while (await isUsernameTaken(User, `${base}_${suffix}`, shopId, excludeUserId)) {
    suffix += 1;
  }

  return `${base}_${suffix}`;
}

async function backfillMissingUsernames(User) {
  const users = await User.findAll({
    where: {
      [Op.or]: [{ username: null }, { username: '' }],
    },
  });

  for (const user of users) {
    user.username = await generateUniqueUsername(
      User,
      { username: user.username, name: user.name },
      user.id,
      user.shopId
    );
    await user.save();
  }
}

module.exports = {
  generateUniqueUsername,
  backfillMissingUsernames,
  normalizeUsername,
};