// Seeds (or refreshes) the Palestine location catalog in MongoDB from
// src/data/palestine-locations.json. The server also does this on start;
// this script lets operators run it on demand: `npm run locations:seed`.
require('dotenv').config();
const mongoose = require('mongoose');
const { requiredValue } = require('../config');
const { seedLocationCatalog } = require('../services/locationCatalog');

async function main() {
  await mongoose.connect(requiredValue('MONGODB_URI'));
  const { seeded, count } = await seedLocationCatalog();
  console.log(`Location catalog ${seeded ? 'seeded' : 'already up to date'} (${count} governorates)`);
}

main()
  .catch((err) => {
    console.error(`Location seed failed: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  });
