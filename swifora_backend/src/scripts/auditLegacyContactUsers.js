require('dotenv').config();

const mongoose = require('mongoose');
const User = require('../models/User');
const { requiredValue } = require('../config');

async function auditLegacyContactUsers() {
  await mongoose.connect(requiredValue('MONGODB_URI'));

  const users = await User.find({
    email: /@guest\.local$/i,
  })
    .select('_id email role status +password createdAt')
    .lean();

  const report = users.map((user) => ({
    id: user._id,
    email: user.email,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
    passwordUsesBcrypt:
      /^\\$2[aby]\\$\\d{2}\\$/.test(user.password || ''),
  }));

  console.log(JSON.stringify({
    legacyGuestUsers: report.length,
    nonBcryptPasswordUsers: report.filter(
      (user) => !user.passwordUsesBcrypt,
    ).length,
    users: report,
  }, null, 2));
}

auditLegacyContactUsers()
  .catch((err) => {
    console.error(
      `Legacy contact user audit failed: ${err.message}`,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });
