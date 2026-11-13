const mongoose = require('mongoose');

// A driver's rating of the customer on a completed order (the mirror of
// Rating, where the customer rates the driver). One per order.
const customerRatingSchema = new mongoose.Schema({
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true,
    unique: true,
  },
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  providerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  rating: {
    type: Number,
    min: 1,
    max: 5,
    required: true,
  },
  comment: {
    type: String,
    default: '',
    maxlength: 500,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

customerRatingSchema.index({ customerId: 1, createdAt: -1 });

module.exports = mongoose.model('CustomerRating', customerRatingSchema);
