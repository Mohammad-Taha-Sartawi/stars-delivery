require('dotenv').config();
const mongoose = require('mongoose');
const Offer = require('../models/Offer');
const { requiredValue } = require('../config');

async function auditOfferDuplicates() {
  await mongoose.connect(requiredValue('MONGODB_URI'));
  const duplicates = await Offer.aggregate([
    { $group: { _id: { providerId: '$providerId', orderId: '$orderId' }, count: { $sum: 1 }, offerIds: { $push: '$_id' } } },
    { $match: { count: { $gt: 1 } } },
  ]);
  console.log(JSON.stringify({ duplicateGroups: duplicates.length, duplicates }, null, 2));
}

auditOfferDuplicates()
  .catch((err) => {
    console.error(`Offer duplicate audit failed: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  });