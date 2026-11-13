require('dotenv').config();
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../models/User');
const { requiredValue } = require('../config');
const { isValidAdminPassword, MIN_ADMIN_PASSWORD_LENGTH } = require('../security/passwordPolicy');

async function bootstrapAdmin() {
  const email = requiredValue('ADMIN_EMAIL').toLowerCase();
  const fullName = requiredValue('ADMIN_FULL_NAME');
  const password = requiredValue('ADMIN_PASSWORD');

  if (!isValidAdminPassword(password)) {
    throw new Error(`ADMIN_PASSWORD must be at least ${MIN_ADMIN_PASSWORD_LENGTH} characters and must not be the legacy password`);
  }

  await mongoose.connect(requiredValue('MONGODB_URI'));
  const existingAdmin = await User.exists({ role: 'admin' });
  if (existingAdmin) {
    throw new Error('An administrator already exists; refusing to overwrite it');
  }
  const existingUser = await User.exists({ email });
  if (existingUser) {
    throw new Error('The administrator email is already in use');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await User.create({ fullName, email, password: passwordHash, role: 'admin', status: 'active' });
  console.log(`Administrator created for ${email}`);
}

bootstrapAdmin()
  .catch((err) => {
    console.error(`Admin bootstrap failed: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  });