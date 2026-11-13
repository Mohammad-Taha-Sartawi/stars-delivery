const mongoose = require('mongoose');

const passwordRecoveryChallengeSchema =
  new mongoose.Schema(
    {
      // One active recovery challenge per User.
      // Reusing User._id gives a database-level uniqueness
      // boundary without relying on a secondary unique index.
      _id: {
        type:
          mongoose.Schema.Types.ObjectId,
        required: true,
      },

      email: {
        type: String,
        required: true,
        lowercase: true,
        trim: true,
        index: true,
      },

      sessionVersion: {
        type: Number,
        required: true,
        min: 0,
      },

      nonce: {
        type: String,
        required: true,
        select: false,
      },

      codeDigest: {
        type: String,
        required: true,
        select: false,
      },

      attemptsRemaining: {
        type: Number,
        required: true,
        default: 5,
        min: 0,
        max: 5,
      },

      expiresAt: {
        type: Date,
        required: true,
        index: {
          expires: 0,
        },
      },
    },
    {
      timestamps: true,
    },
  );

module.exports =
  mongoose.model(
    'PasswordRecoveryChallenge',
    passwordRecoveryChallengeSchema,
  );
