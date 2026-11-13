const express = require('express');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

const User =
  require('../models/User');

const PasswordRecoveryChallenge =
  require('../models/PasswordRecoveryChallenge');

const {
  sendInternalServerError,
} = require('../security/errorResponse');

const {
  loadPasswordRecoverySecurityConfig,
  loadPasswordRecoveryMailConfig,
} = require('../config');

const {
  normalizeMobileEmail,
  isValidMobileEmail,
} = require('../security/mobileEmail');

const {
  isReservedGuestEmail,
} = require('../services/contactRequest');

const {
  isActiveMobileAccount,
  mobileSessionVersion,
  mobileSessionRotationFilter,
} = require('../services/mobileSession');

const {
  MIN_MOBILE_PASSWORD_LENGTH,
  MAX_MOBILE_PASSWORD_LENGTH,
  isValidMobilePassword,
} = require('../security/passwordPolicy');

const {
  executeTransaction,
} = require('../services/transaction');

const {
  PASSWORD_RECOVERY_TTL_MS,
  PASSWORD_RECOVERY_ATTEMPT_LIMIT,
  GENERIC_PASSWORD_RECOVERY_REQUEST_RESPONSE,
  INVALID_PASSWORD_RECOVERY_RESPONSE,
  PASSWORD_RECOVERY_UNAVAILABLE_RESPONSE,
  generatePasswordRecoveryCode,
  generatePasswordRecoveryNonce,
  isPasswordRecoveryCode,
  createPasswordRecoveryCodeDigest,
  verifyPasswordRecoveryCodeDigest,
  waitForMinimumRecoveryResponse,
} = require('../security/passwordRecovery');

const {
  getPasswordRecoveryMailer,
} = require('../services/passwordRecoveryMailer');

const {
  createPasswordRecoveryRequestIpLimiter,
  createPasswordRecoveryRequestAccountLimiter,
  createPasswordRecoveryResetIpLimiter,
} = require('../security/mobileAuthRateLimit');

const router =
  express.Router();

class PasswordRecoveryConflict extends Error {
  constructor() {
    super(
      'Password recovery state changed',
    );

    this.name =
      'PasswordRecoveryConflict';
  }
}

const requestIpLimiter =
  createPasswordRecoveryRequestIpLimiter();

const requestAccountLimiter =
  createPasswordRecoveryRequestAccountLimiter();

const resetIpLimiter =
  createPasswordRecoveryResetIpLimiter();

async function sendGenericRecoveryRequestResponse(
  res,
  startedAt,
) {
  await waitForMinimumRecoveryResponse(
    startedAt,
  );

  return res
    .status(202)
    .json(
      GENERIC_PASSWORD_RECOVERY_REQUEST_RESPONSE,
    );
}

async function sendInvalidRecoveryResponse(
  res,
  startedAt,
) {
  await waitForMinimumRecoveryResponse(
    startedAt,
  );

  return res
    .status(400)
    .json(
      INVALID_PASSWORD_RECOVERY_RESPONSE,
    );
}

async function sendRecoveryUnavailableResponse(
  res,
  startedAt,
) {
  await waitForMinimumRecoveryResponse(
    startedAt,
  );

  return res
    .status(503)
    .json(
      PASSWORD_RECOVERY_UNAVAILABLE_RESPONSE,
    );
}

function scheduleRecoveryCodeDelivery({
  email,
  code,
  userId,
  nonce,
}) {
  setImmediate(
    async () => {
      try {
        await getPasswordRecoveryMailer()
          .sendRecoveryCode({
            to: email,
            code,
          });
      } catch (_err) {
        try {
          // Delete only the challenge whose delivery failed.
          // A newer request is protected by its new nonce.
          await PasswordRecoveryChallenge
            .deleteOne({
              _id: userId,
              nonce,
            });
        } catch (_cleanupErr) {
          // Deliberately hidden from the HTTP caller.
        }

        console.error(
          'Password recovery delivery failed',
        );
      }
    },
  );
}

function schedulePasswordChangedNotice(
  email,
) {
  setImmediate(
    async () => {
      try {
        await getPasswordRecoveryMailer()
          .sendPasswordChangedNotice({
            to: email,
          });
      } catch (_err) {
        console.error(
          'Password recovery notification delivery failed',
        );
      }
    },
  );
}


// ------------------------------------------------------------
// Recovery request
// ------------------------------------------------------------

router.post(
  '/request',
  requestIpLimiter,
  requestAccountLimiter,
  async (req, res) => {
    const startedAt =
      Date.now();

    let recoverySecret;

    try {
      ({
        recoverySecret,
      } =
        loadPasswordRecoverySecurityConfig());

      // Configuration is checked before account lookup so
      // service availability cannot enumerate accounts.
      loadPasswordRecoveryMailConfig();
    } catch (_configError) {
      return sendRecoveryUnavailableResponse(
        res,
        startedAt,
      );
    }

    const email =
      normalizeMobileEmail(
        req.body?.email,
      );

    try {
      if (
        !isValidMobileEmail(email)
        || isReservedGuestEmail(email)
      ) {
        return sendGenericRecoveryRequestResponse(
          res,
          startedAt,
        );
      }

      const user =
        await User
          .findOne({
            email,
          })
          .select(
            '_id email role status deleted sessionVersion',
          );

      if (
        !isActiveMobileAccount(user)
      ) {
        return sendGenericRecoveryRequestResponse(
          res,
          startedAt,
        );
      }

      const sessionVersion =
        mobileSessionVersion(user);

      if (sessionVersion === null) {
        return sendGenericRecoveryRequestResponse(
          res,
          startedAt,
        );
      }

      const code =
        generatePasswordRecoveryCode();

      const nonce =
        generatePasswordRecoveryNonce();

      const codeDigest =
        createPasswordRecoveryCodeDigest({
          secret: recoverySecret,
          userId: user._id,
          email,
          sessionVersion,
          nonce,
          code,
        });

      const expiresAt =
        new Date(
          Date.now()
          + PASSWORD_RECOVERY_TTL_MS,
        );

      await PasswordRecoveryChallenge
        .findOneAndUpdate(
          {
            _id: user._id,
          },
          {
            $set: {
              email,
              sessionVersion,
              nonce,
              codeDigest,
              attemptsRemaining:
                PASSWORD_RECOVERY_ATTEMPT_LIMIT,
              expiresAt,
            },
          },
          {
            upsert: true,
            new: true,
            runValidators: true,
            setDefaultsOnInsert: true,
          },
        );

      await sendGenericRecoveryRequestResponse(
        res,
        startedAt,
      );

      // Delivery begins after the non-enumerating response.
      // The plaintext code exists only in process memory and
      // the outbound email payload.
      scheduleRecoveryCodeDelivery({
        email,
        code,
        userId: user._id,
        nonce,
      });

      return undefined;
    } catch (_err) {
      console.error(
        'Password recovery request processing failed',
      );

      return sendGenericRecoveryRequestResponse(
        res,
        startedAt,
      );
    }
  },
);


// ------------------------------------------------------------
// Recovery reset
// ------------------------------------------------------------

router.post(
  '/reset',
  resetIpLimiter,
  async (req, res) => {
    const startedAt =
      Date.now();

    let recoverySecret;

    try {
      ({
        recoverySecret,
      } =
        loadPasswordRecoverySecurityConfig());
    } catch (_configError) {
      return sendRecoveryUnavailableResponse(
        res,
        startedAt,
      );
    }

    const email =
      normalizeMobileEmail(
        req.body?.email,
      );

    const code =
      typeof req.body?.code === 'string'
        ? req.body.code.trim()
        : '';

    const newPassword =
      typeof req.body?.newPassword === 'string'
        ? req.body.newPassword
        : '';

    const confirmPassword =
      typeof req.body?.confirmPassword === 'string'
        ? req.body.confirmPassword
        : '';

    if (
      !isValidMobileEmail(email)
      || isReservedGuestEmail(email)
      || !isPasswordRecoveryCode(code)
    ) {
      return sendInvalidRecoveryResponse(
        res,
        startedAt,
      );
    }

    if (
      newPassword
      !== confirmPassword
    ) {
      await waitForMinimumRecoveryResponse(
        startedAt,
      );

      return res.status(400).json({
        error:
          'New password and confirmation do not match',
        code:
          'PASSWORD_CONFIRMATION_MISMATCH',
      });
    }

    if (
      !isValidMobilePassword(
        newPassword,
      )
    ) {
      await waitForMinimumRecoveryResponse(
        startedAt,
      );

      return res.status(400).json({
        error:
          `Password must be between ${MIN_MOBILE_PASSWORD_LENGTH} and ${MAX_MOBILE_PASSWORD_LENGTH} characters and must not be an obvious placeholder`,
        code: 'PASSWORD_POLICY',
      });
    }

    try {
      const now =
        new Date();

      // Atomically reserve ONE of the five allowed OTP
      // attempts before any code comparison.
      //
      // Under concurrency, only five requests can successfully
      // claim the challenge. A sixth request cannot obtain the
      // digest for verification.
      const challenge =
        await PasswordRecoveryChallenge
          .findOneAndUpdate(
            {
              email,

              attemptsRemaining: {
                $gt: 0,
              },

              expiresAt: {
                $gt: now,
              },
            },
            {
              $inc: {
                attemptsRemaining: -1,
              },
            },
            {
              // The pre-decrement document contains the digest
              // associated with the attempt being claimed.
              new: false,
              runValidators: true,
            },
          )
          .select(
            '+codeDigest +nonce',
          );

      if (!challenge) {
        return sendInvalidRecoveryResponse(
          res,
          startedAt,
        );
      }

      const user =
        await User
          .findById(
            challenge._id,
          )
          .select(
            '_id email role status deleted sessionVersion',
          );

      const currentSessionVersion =
        mobileSessionVersion(user);

      if (
        !isActiveMobileAccount(user)
        || normalizeMobileEmail(
          user?.email,
        ) !== email
        || currentSessionVersion === null
        || currentSessionVersion
          !== challenge.sessionVersion
      ) {
        return sendInvalidRecoveryResponse(
          res,
          startedAt,
        );
      }

      const codeMatches =
        verifyPasswordRecoveryCodeDigest({
          expectedDigest:
            challenge.codeDigest,

          secret:
            recoverySecret,

          userId:
            user._id,

          email,

          sessionVersion:
            challenge.sessionVersion,

          nonce:
            challenge.nonce,

          code,
        });

      // The attempt was already atomically spent above.
      if (!codeMatches) {
        return sendInvalidRecoveryResponse(
          res,
          startedAt,
        );
      }

      const passwordHash =
        await bcrypt.hash(
          newPassword,
          10,
        );

      const rotationFilter =
        mobileSessionRotationFilter(
          user,
        );

      if (!rotationFilter) {
        return sendInvalidRecoveryResponse(
          res,
          startedAt,
        );
      }

      try {
        // The exact challenge consumption and credential
        // rotation form one transaction.
        //
        // Consequences:
        //
        // - a newer nonce invalidates this request;
        // - only one concurrent valid reset can consume;
        // - if User.updateOne conflicts/fails, challenge deletion
        //   rolls back with the transaction;
        // - sessionVersion remains the authoritative credential
        //   generation boundary.
        await executeTransaction({
          startSession:
            () => mongoose.startSession(),

          work:
            async session => {
              const consumption =
                await PasswordRecoveryChallenge
                  .deleteOne(
                    {
                      _id:
                        challenge._id,

                      nonce:
                        challenge.nonce,

                      sessionVersion:
                        challenge.sessionVersion,

                      expiresAt: {
                        $gt: new Date(),
                      },
                    },
                    {
                      session,
                    },
                  );

              if (
                consumption.deletedCount !== 1
              ) {
                throw new PasswordRecoveryConflict();
              }

              const rotation =
                await User.updateOne(
                  {
                    _id:
                      user._id,

                    role:
                      user.role,

                    email,

                    ...rotationFilter,
                  },
                  {
                    $set: {
                      password:
                        passwordHash,

                      // Successful recovery proves possession
                      // of the current recovery mailbox.
                      verified: true,
                    },

                    $inc: {
                      sessionVersion: 1,
                    },
                  },
                  {
                    runValidators: true,
                    session,
                  },
                );

              if (
                rotation.matchedCount !== 1
              ) {
                // Throwing is important: withTransaction must
                // abort the already-executed challenge delete.
                throw new PasswordRecoveryConflict();
              }
            },
        });
      } catch (err) {
        if (
          err
          instanceof PasswordRecoveryConflict
        ) {
          return sendInvalidRecoveryResponse(
            res,
            startedAt,
          );
        }

        throw err;
      }

      const io =
        req.app.get('io');

      if (io) {
        io.in(
          `user:${user._id}`,
        ).disconnectSockets(true);
      }

      await waitForMinimumRecoveryResponse(
        startedAt,
      );

      res.json({
        message:
          'Password reset successful. Please sign in again.',
        code:
          'PASSWORD_RESET_COMPLETE',
      });

      schedulePasswordChangedNotice(
        email,
      );

      return undefined;
    } catch (_err) {
      return sendInternalServerError(
        res,
      );
    }
  },
);

module.exports = router;
