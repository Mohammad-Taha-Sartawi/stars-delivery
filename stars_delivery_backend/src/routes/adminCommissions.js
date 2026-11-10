const { sendInternalServerError, sendInternalServerFailure } = require('../security/errorResponse');
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Order = require('../models/Order');
const CommissionPayment = require('../models/CommissionPayment');
const { splitCommission, isCommissionDue } = require('../services/commissionLedger');
const { serviceTypesLabel } = require('../services/providerServiceTypes');

function primaryPhone(user) {
  const phones = Array.isArray(user.phoneNumbers) ? user.phoneNumbers : [];
  return (
    phones.find((phone) => phone.primary)?.number
    || phones[0]?.number
    || user.phone
    || ''
  );
}

router.get('/', async (req, res) => {
  try {
    const providers = await User.find({
      role: 'provider',
      deleted: { $ne: true },
    }).lean();
    let totalUnpaid = 0, totalPaid = 0, unpaidDrivers = 0, paidDrivers = 0;
    const driverRows = [];

    for (const driver of providers) {
      const orders = await Order.find({
        providerId: driver._id,
        status: { $in: ['accepted', 'fulfilling', 'completed'] },
      }).lean();
      const { unpaid, paid } = splitCommission(orders, driver);
      const totalEarnings = orders.reduce((s, o) => s + (o.providerEarning || 0), 0);
      const paidAt = driver.commissionPaidAt ? new Date(driver.commissionPaidAt) : null;
      const resetAt = driver.commissionResetAt ? new Date(driver.commissionResetAt) : null;
      let paymentStatus = 'unpaid';
      if (unpaid > 0) {
        paymentStatus = 'unpaid';
      } else if (resetAt && (!paidAt || resetAt >= paidAt)) {
        paymentStatus = 'reset';
      } else if (paid > 0 || paidAt) {
        paymentStatus = 'paid';
      }

      if (unpaid > 0) {
        totalUnpaid += unpaid;
        unpaidDrivers++;
      }
      if (paid > 0) {
        totalPaid += paid;
        paidDrivers++;
      }

      driverRows.push({
        _id: driver._id.toString(),
        driverId: driver.publicId || driver._id.toString().slice(-8),
        name: driver.fullName || driver.name,
        phone: primaryPhone(driver),
        serviceType: serviceTypesLabel(driver.serviceTypes),
        commission: unpaid,
        paidCommission: paid,
        earnings: totalEarnings,
        paymentStatus
      });
    }

    driverRows.sort((a, b) => b.commission - a.commission);
    res.json({ totalUnpaid, totalPaid, unpaidDrivers, paidDrivers, driverRows });
  } catch (err) {
    sendInternalServerError(res);
  }
});

async function resetDriverCommissionById(driverId) {
  const driver = await User.findById(driverId);

  if (!driver || driver.role !== 'provider') {
    return { success: false, message: 'السائق غير موجود' };
  }

  const orders = await Order.find({
    providerId: driver._id,
    status: { $in: ['accepted', 'fulfilling', 'completed'] },
    platformCommission: { $gt: 0 },
  }).lean();

  const dueOrders = orders.filter((order) =>
    isCommissionDue(order, driver),
  );
  const adjustmentAmount = Number(driver.commissionAdjustment) || 0;
  const now = new Date();

  if (dueOrders.length > 0) {
    // Return the platform commission to the driver: move it from
    // platformCommission into providerEarning, so it is no longer counted as
    // platform revenue or as an outstanding due.
    await Order.bulkWrite(
      dueOrders.map((order) => ({
        updateOne: {
          filter: {
            _id: order._id,
            platformCommission: order.platformCommission,
          },
          update: [
            {
              $set: {
                providerEarning: {
                  $add: ['$providerEarning', '$platformCommission'],
                },
                platformCommission: 0,
                commissionWaivedAt: now,
              },
            },
          ],
        },
      })),
    );
  }

  driver.commissionResetAt = now;
  driver.commissionAdjustment = 0;
  await driver.save();

  return {
    success: true,
    driverName: driver.fullName,
    orders: dueOrders.length,
    amount: Math.max(
      0,
      dueOrders.reduce(
        (sum, order) => sum + (order.platformCommission || 0),
        0,
      ) + adjustmentAmount,
    ),
  };
}

router.put('/reset-all', async (req, res) => {
  try {
    const providers = await User.find({ role: 'provider' }).select('_id');
    let drivers = 0;
    let orders = 0;
    let amount = 0;

    for (const provider of providers) {
      const result = await resetDriverCommissionById(provider._id);
      if (result.success) {
        drivers++;
        orders += result.orders;
        amount += result.amount;
      }
    }

    res.json({ success: true, drivers, orders, amount });
  } catch (err) {
    sendInternalServerFailure(res);
  }
});

router.put('/reset/:id', async (req, res) => {
  try {
    const result = await resetDriverCommissionById(req.params.id);
    if (!result.success) {
      return res.status(404).json(result);
    }
    res.json(result);
  } catch (err) {
    sendInternalServerFailure(res);
  }
});

router.put('/pay/:id', async (req, res) => {
  try {
    const driver = await User.findById(req.params.id);
    if (!driver || driver.role !== 'provider') return res.json({ success: false, message: 'السائق غير موجود' });

    const orders = await Order.find({
      providerId: driver._id,
      status: { $in: ['accepted', 'fulfilling', 'completed'] },
    }).lean();
    const { unpaid } = splitCommission(orders, driver);

    if (unpaid > 0) {
      await CommissionPayment.create({
        driverId: driver._id,
        amount: unpaid,
        method: 'manual_admin',
        note: 'تم تأكيد الدفع من لوحة التحكم',
      });
    }

    driver.commissionPaid = true;
    driver.commissionPaidAt = new Date();
    driver.commissionResetAt = null;
    driver.commissionAdjustment = 0;
    await driver.save();
    res.json({
      success: true,
      amount: unpaid,
      message: `تم تحديث حالة السائق (${driver.fullName}) إلى مدفوع`,
    });
  } catch (err) {
    sendInternalServerFailure(res);
  }
});

module.exports = router;
