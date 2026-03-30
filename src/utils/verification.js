const crypto = require('crypto');

async function generateUniqueVerificationToken(User) {
  let token;
  let existingUser;

  do {
    token = crypto.randomBytes(32).toString('hex');
    existingUser = await User.findOne({ where: { verificationToken: token } });
  } while (existingUser);

  return token;
}

module.exports = {
  generateUniqueVerificationToken,
};