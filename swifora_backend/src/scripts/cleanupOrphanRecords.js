require('dotenv').config();
const mongoose = require('mongoose');
const Offer = require('../models/Offer');
const Order = require('../models/Order');
const RejectedOrder = require('../models/RejectedOrder');
const { requiredValue } = require('../config');

async function orphanIds(Model, foreignField) {
  const rows = await Model.aggregate([
    {
      $lookup: {
        from: 'orders',
        localField: foreignField,
        foreignField: '_id',
        as: 'order',
      },
    },
    { $match: { 'order.0': { $exists: false } } },
    { $project: { _id: 1 } },
  ]);
  return rows.map((row) => row._id);
}

async function cleanupOrphanRecords({ apply }) {
  await mongoose.connect(requiredValue('MONGODB_URI'));

  const [offerIds, rejectedIds] = await Promise.all([
    orphanIds(Offer, 'orderId'),
    orphanIds(RejectedOrder, 'orderId'),
  ]);

  if (apply) {
    if (offerIds.length > 0) {
      await Offer.deleteMany({ _id: { $in: offerIds } });
    }
    if (rejectedIds.length > 0) {
      await RejectedOrder.deleteMany({ _id: { $in: rejectedIds } });
    }
  }

  console.log(JSON.stringify({
    apply,
    orphanOffers: offerIds.length,
    orphanRejectedOrders: rejectedIds.length,
  }, null, 2));
}

const apply = process.argv.includes('--apply');

cleanupOrphanRecords({ apply })
  .catch((err) => {
    console.error(`Orphan cleanup failed: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  });
