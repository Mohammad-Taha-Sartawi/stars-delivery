const {
  test,
  before,
  after,
  beforeEach,
} = require('node:test');

const assert =
  require('node:assert/strict');

const http =
  require('node:http');

const express =
  require('express');

const mongoose =
  require('mongoose');

const User =
  require('../src/models/User');

const PasswordRecoveryChallenge =
  require('../src/models/PasswordRecoveryChallenge');

const {
  createPasswordRecoveryCodeDigest,
} =
  require('../src/security/passwordRecovery');

const recoveryMailerModule =
  require('../src/services/passwordRecoveryMailer');


// ============================================================
// Runtime environment
// ============================================================

const RECOVERY_SECRET =
  '4f6bc8990d8e42b398a0c7e6a56f1a22d981b7c45ea8f6d0c7b0f3e2a91d4c68';

const ENV_VALUES = {
  PASSWORD_RECOVERY_SECRET:
    RECOVERY_SECRET,

  JWT_SECRET:
    'a7e4f8c2b9d1460fa763e5b917cd264ea12c5f07d83491bce6f2950a3d8f4b61',

  SESSION_SECRET:
    '9d76c13a4be04a928e57fca23518b69ed04f7831c6a952bdfe3710248ac5d69f',

  SMTP_HOST:
    'smtp.invalid.test',

  SMTP_PORT:
    '587',

  SMTP_SECURE:
    'false',

  SMTP_USER:
    '',

  SMTP_PASS:
    '',

  SMTP_FROM:
    'Stars Delivery <no-reply@stars.invalid>',
};

const originalEnvironment = {};

for (
  const [name, value]
  of Object.entries(
    ENV_VALUES,
  )
) {
  originalEnvironment[name] =
    process.env[name];

  process.env[name] =
    value;
}


// ============================================================
// Mailer replacement BEFORE route import.
// ============================================================

const sentRecoveryCodes = [];
const sentChangedNotices = [];

const fakeMailer = {
  async sendRecoveryCode(payload) {
    sentRecoveryCodes.push(
      payload,
    );

    return {
      messageId:
        'runtime-recovery-message',
    };
  },

  async sendPasswordChangedNotice(payload) {
    sentChangedNotices.push(
      payload,
    );

    return {
      messageId:
        'runtime-change-message',
    };
  },
};

const originalGetMailer =
  recoveryMailerModule
    .getPasswordRecoveryMailer;

recoveryMailerModule
  .getPasswordRecoveryMailer =
    () => fakeMailer;

const routeModulePath =
  require.resolve(
    '../src/routes/passwordRecovery',
  );

delete require.cache[
  routeModulePath
];

const recoveryRouter =
  require(
    '../src/routes/passwordRecovery'
  );


// ============================================================
// Original dependency methods for final restoration.
// ============================================================

const originalMethods = {
  userFindOne:
    User.findOne,

  userFindById:
    User.findById,

  userUpdateOne:
    User.updateOne,

  challengeFindOneAndUpdate:
    PasswordRecoveryChallenge
      .findOneAndUpdate,

  challengeDeleteOne:
    PasswordRecoveryChallenge
      .deleteOne,

  startSession:
    mongoose.startSession,
};


// ============================================================
// HTTP application.
// ============================================================

const disconnects = [];

const app =
  express();

app.use(
  express.json(),
);

app.set(
  'io',
  {
    in(room) {
      return {
        disconnectSockets(force) {
          disconnects.push({
            room,
            force,
          });
        },
      };
    },
  },
);

app.use(
  '/api/auth/password-recovery',
  recoveryRouter,
);

let server;
let port;

before(
  async () => {
    server =
      await new Promise(
        (resolve, reject) => {
          const candidate =
            app.listen(
              0,
              '127.0.0.1',
              () =>
                resolve(
                  candidate,
                ),
            );

          candidate.once(
            'error',
            reject,
          );
        },
      );

    port =
      server
        .address()
        .port;
  },
);

after(
  async () => {
    if (server) {
      await new Promise(
        resolve =>
          server.close(
            resolve,
          ),
      );
    }

    User.findOne =
      originalMethods
        .userFindOne;

    User.findById =
      originalMethods
        .userFindById;

    User.updateOne =
      originalMethods
        .userUpdateOne;

    PasswordRecoveryChallenge
      .findOneAndUpdate =
        originalMethods
          .challengeFindOneAndUpdate;

    PasswordRecoveryChallenge
      .deleteOne =
        originalMethods
          .challengeDeleteOne;

    mongoose.startSession =
      originalMethods
        .startSession;

    recoveryMailerModule
      .getPasswordRecoveryMailer =
        originalGetMailer;

    delete require.cache[
      routeModulePath
    ];

    for (
      const name
      of Object.keys(
        ENV_VALUES,
      )
    ) {
      const original =
        originalEnvironment[
          name
        ];

      if (
        original
        === undefined
      ) {
        delete process.env[
          name
        ];
      } else {
        process.env[name] =
          original;
      }
    }
  },
);

beforeEach(
  () => {
    sentRecoveryCodes.length = 0;
    sentChangedNotices.length = 0;
    disconnects.length = 0;

    User.findOne =
      () => {
        throw new Error(
          'Unexpected User.findOne',
        );
      };

    User.findById =
      () => {
        throw new Error(
          'Unexpected User.findById',
        );
      };

    User.updateOne =
      async () => {
        throw new Error(
          'Unexpected User.updateOne',
        );
      };

    PasswordRecoveryChallenge
      .findOneAndUpdate =
        () => {
          throw new Error(
            'Unexpected challenge findOneAndUpdate',
          );
        };

    PasswordRecoveryChallenge
      .deleteOne =
        async () => {
          throw new Error(
            'Unexpected challenge deleteOne',
          );
        };

    mongoose.startSession =
      async () => {
        throw new Error(
          'Unexpected mongoose.startSession',
        );
      };
  },
);


// ============================================================
// Helpers
// ============================================================

function selected(value) {
  return {
    async select() {
      return value;
    },
  };
}

function activeUser(
  email,
  sessionVersion = 0,
) {
  return {
    _id:
      '507f1f77bcf86cd799439011',

    email,

    role:
      'customer',

    status:
      'active',

    deleted:
      false,

    sessionVersion,
  };
}

function challengeFor({
  email,
  code = '12345678',
  sessionVersion = 0,
  attemptsRemaining = 5,
  nonce = 'runtime-nonce-01',
} = {}) {
  const user =
    activeUser(
      email,
      sessionVersion,
    );

  return {
    _id:
      user._id,

    email,

    sessionVersion,

    nonce,

    codeDigest:
      createPasswordRecoveryCodeDigest({
        secret:
          RECOVERY_SECRET,

        userId:
          user._id,

        email,

        sessionVersion,

        nonce,

        code,
      }),

    attemptsRemaining,

    expiresAt:
      new Date(
        Date.now()
        + 60_000,
      ),
  };
}

function post(
  path,
  body,
) {
  return new Promise(
    (resolve, reject) => {
      const payload =
        JSON.stringify(
          body,
        );

      const request =
        http.request(
          {
            hostname:
              '127.0.0.1',

            port,

            path:
              `/api/auth/password-recovery${path}`,

            method:
              'POST',

            headers: {
              'content-type':
                'application/json',

              'content-length':
                Buffer.byteLength(
                  payload,
                ),
            },
          },
          response => {
            let text = '';

            response.setEncoding(
              'utf8',
            );

            response.on(
              'data',
              chunk => {
                text += chunk;
              },
            );

            response.on(
              'end',
              () => {
                let parsed = {};

                if (text) {
                  parsed =
                    JSON.parse(
                      text,
                    );
                }

                resolve({
                  status:
                    response.statusCode,

                  body:
                    parsed,
                });
              },
            );
          },
        );

      request.once(
        'error',
        reject,
      );

      request.end(
        payload,
      );
    },
  );
}

async function waitFor(
  predicate,
  timeoutMs = 1000,
) {
  const deadline =
    Date.now()
    + timeoutMs;

  while (
    Date.now()
    < deadline
  ) {
    if (predicate()) {
      return;
    }

    await new Promise(
      resolve =>
        setTimeout(
          resolve,
          10,
        ),
    );
  }

  throw new Error(
    'Timed out waiting for runtime condition',
  );
}

function validPassword(
  suffix,
) {
  return (
    `RuntimeRecovery-${suffix}-Password-2026`
  );
}


// ============================================================
// 1. Existing account request
// ============================================================

test(
  'runtime request returns generic 202 while storing only digest and mailing code out-of-band',
  {
    concurrency: false,
  },
  async () => {
    const email =
      'runtime-one@example.com';

    const user =
      activeUser(
        email,
      );

    let challengeWrite;

    User.findOne =
      filter => {
        assert.equal(
          filter.email,
          email,
        );

        return selected(
          user,
        );
      };

    PasswordRecoveryChallenge
      .findOneAndUpdate =
        async (
          filter,
          update,
          options,
        ) => {
          challengeWrite = {
            filter,
            update,
            options,
          };

          return {
            _id:
              user._id,
          };
        };

    const response =
      await post(
        '/request',
        {
          email:
            '  RUNTIME-ONE@EXAMPLE.COM ',
        },
      );

    assert.equal(
      response.status,
      202,
    );

    assert.deepEqual(
      response.body,
      {
        message:
          'If an eligible account exists for this email, a recovery code will be sent.',
      },
    );

    await waitFor(
      () =>
        sentRecoveryCodes.length
        === 1,
    );

    const sent =
      sentRecoveryCodes[0];

    assert.equal(
      sent.to,
      email,
    );

    assert.match(
      sent.code,
      /^\d{8}$/,
    );

    assert.ok(
      challengeWrite,
    );

    assert.equal(
      challengeWrite
        .filter
        ._id,
      user._id,
    );

    const persisted =
      challengeWrite
        .update
        .$set;

    assert.equal(
      Object.prototype
        .hasOwnProperty
        .call(
          persisted,
          'code',
        ),
      false,
    );

    assert.match(
      persisted.codeDigest,
      /^[a-f0-9]{64}$/,
    );

    assert.equal(
      JSON.stringify(
        response.body,
      ).includes(
        sent.code,
      ),
      false,
    );
  },
);


// ============================================================
// 2. Missing account request
// ============================================================

test(
  'runtime missing-account request has the same generic HTTP response and sends no mail',
  {
    concurrency: false,
  },
  async () => {
    let challengeWrites = 0;

    User.findOne =
      () =>
        selected(
          null,
        );

    PasswordRecoveryChallenge
      .findOneAndUpdate =
        async () => {
          challengeWrites += 1;

          return null;
        };

    const response =
      await post(
        '/request',
        {
          email:
            'missing-runtime@example.com',
        },
      );

    assert.equal(
      response.status,
      202,
    );

    assert.deepEqual(
      response.body,
      {
        message:
          'If an eligible account exists for this email, a recovery code will be sent.',
      },
    );

    assert.equal(
      challengeWrites,
      0,
    );

    assert.equal(
      sentRecoveryCodes.length,
      0,
    );
  },
);


// ============================================================
// 3. Six concurrent wrong OTPs
// ============================================================

test(
  'runtime atomic claim allows only five concurrent OTP verification attempts',
  {
    concurrency: false,
  },
  async () => {
    const email =
      'runtime-attempts@example.com';

    const user =
      activeUser(
        email,
      );

    const challenge =
      challengeFor({
        email,
        code:
          '12345678',
      });

    let remaining = 5;
    let claimCalls = 0;
    let userLookups = 0;

    PasswordRecoveryChallenge
      .findOneAndUpdate =
        (
          filter,
          update,
          options,
        ) => ({
          async select() {
            claimCalls += 1;

            assert.equal(
              filter.email,
              email,
            );

            assert.deepEqual(
              filter
                .attemptsRemaining,
              {
                $gt: 0,
              },
            );

            assert.equal(
              update
                .$inc
                .attemptsRemaining,
              -1,
            );

            assert.equal(
              options.new,
              false,
            );

            if (
              remaining <= 0
            ) {
              return null;
            }

            const before =
              remaining;

            remaining -= 1;

            return {
              ...challenge,
              attemptsRemaining:
                before,
            };
          },
        });

    User.findById =
      () => {
        userLookups += 1;

        return selected(
          user,
        );
      };

    const wrongCodes = [
      '00000001',
      '00000002',
      '00000003',
      '00000004',
      '00000005',
      '00000006',
    ];

    const responses =
      await Promise.all(
        wrongCodes.map(
          code =>
            post(
              '/reset',
              {
                email,
                code,

                newPassword:
                  validPassword(
                    code,
                  ),

                confirmPassword:
                  validPassword(
                    code,
                  ),
              },
            ),
        ),
      );

    assert.deepEqual(
      responses.map(
        item =>
          item.status,
      ),
      [
        400,
        400,
        400,
        400,
        400,
        400,
      ],
    );

    assert.equal(
      claimCalls,
      6,
    );

    assert.equal(
      remaining,
      0,
    );

    // The sixth request receives no claimed challenge and
    // therefore never reaches account/code verification.
    assert.equal(
      userLookups,
      5,
    );

    assert.equal(
      disconnects.length,
      0,
    );
  },
);


// ============================================================
// 4. Correct reset transaction
// ============================================================

test(
  'runtime valid OTP transaction consumes challenge before rotating password then disconnects sessions',
  {
    concurrency: false,
  },
  async () => {
    const email =
      'runtime-success@example.com';

    const code =
      '12345678';

    const password =
      validPassword(
        'success',
      );

    const user =
      activeUser(
        email,
      );

    const challenge =
      challengeFor({
        email,
        code,
      });

    const events = [];

    PasswordRecoveryChallenge
      .findOneAndUpdate =
        () => ({
          async select() {
            events.push(
              'attempt-claim',
            );

            return challenge;
          },
        });

    User.findById =
      () =>
        selected(
          user,
        );

    const session = {
      async withTransaction(
        work,
      ) {
        events.push(
          'tx-begin',
        );

        await work();

        events.push(
          'tx-commit',
        );
      },

      async endSession() {
        events.push(
          'tx-end',
        );
      },
    };

    mongoose.startSession =
      async () =>
        session;

    PasswordRecoveryChallenge
      .deleteOne =
        async (
          filter,
          options,
        ) => {
          events.push(
            'challenge-consume',
          );

          assert.equal(
            options.session,
            session,
          );

          assert.equal(
            filter.nonce,
            challenge.nonce,
          );

          return {
            deletedCount: 1,
          };
        };

    User.updateOne =
      async (
        filter,
        update,
        options,
      ) => {
        events.push(
          'credential-rotation',
        );

        assert.equal(
          options.session,
          session,
        );

        assert.equal(
          options.runValidators,
          true,
        );

        assert.equal(
          filter.email,
          email,
        );

        assert.equal(
          update
            .$set
            .verified,
          true,
        );

        assert.equal(
          update
            .$inc
            .sessionVersion,
          1,
        );

        assert.notEqual(
          update
            .$set
            .password,
          password,
        );

        assert.match(
          update
            .$set
            .password,
          /^\$2/,
        );

        return {
          matchedCount: 1,
        };
      };

    const response =
      await post(
        '/reset',
        {
          email,
          code,

          newPassword:
            password,

          confirmPassword:
            password,
        },
      );

    assert.equal(
      response.status,
      200,
    );

    assert.equal(
      response
        .body
        .code,
      'PASSWORD_RESET_COMPLETE',
    );

    assert.equal(
      Object.prototype
        .hasOwnProperty
        .call(
          response.body,
          'token',
        ),
      false,
    );

    const expectedOrder = [
      'attempt-claim',
      'tx-begin',
      'challenge-consume',
      'credential-rotation',
      'tx-commit',
      'tx-end',
    ];

    assert.deepEqual(
      events,
      expectedOrder,
    );

    assert.deepEqual(
      disconnects,
      [
        {
          room:
            `user:${user._id}`,

          force:
            true,
        },
      ],
    );

    await waitFor(
      () =>
        sentChangedNotices.length
        === 1,
    );

    assert.equal(
      sentChangedNotices[0]
        .to,
      email,
    );
  },
);


// ============================================================
// 5. Rotation conflict rollback
// ============================================================

test(
  'runtime rotation conflict aborts the transaction so challenge consumption rolls back',
  {
    concurrency: false,
  },
  async () => {
    const email =
      'runtime-rollback@example.com';

    const code =
      '12345678';

    const password =
      validPassword(
        'rollback',
      );

    const user =
      activeUser(
        email,
      );

    const challenge =
      challengeFor({
        email,
        code,
      });

    let challengePresent = true;
    const events = [];

    PasswordRecoveryChallenge
      .findOneAndUpdate =
        () => ({
          async select() {
            return challenge;
          },
        });

    User.findById =
      () =>
        selected(
          user,
        );

    const session = {
      async withTransaction(
        work,
      ) {
        const snapshot =
          challengePresent;

        events.push(
          'tx-begin',
        );

        try {
          await work();

          events.push(
            'tx-commit',
          );
        } catch (error) {
          // Simulate Mongo transaction rollback.
          challengePresent =
            snapshot;

          events.push(
            'tx-abort',
          );

          throw error;
        }
      },

      async endSession() {
        events.push(
          'tx-end',
        );
      },
    };

    mongoose.startSession =
      async () =>
        session;

    PasswordRecoveryChallenge
      .deleteOne =
        async () => {
          assert.equal(
            challengePresent,
            true,
          );

          challengePresent =
            false;

          events.push(
            'challenge-consume',
          );

          return {
            deletedCount: 1,
          };
        };

    User.updateOne =
      async () => {
        events.push(
          'rotation-conflict',
        );

        return {
          matchedCount: 0,
        };
      };

    const response =
      await post(
        '/reset',
        {
          email,
          code,

          newPassword:
            password,

          confirmPassword:
            password,
        },
      );

    assert.equal(
      response.status,
      400,
    );

    assert.equal(
      response
        .body
        .code,
      'PASSWORD_RECOVERY_INVALID',
    );

    assert.equal(
      challengePresent,
      true,
    );

    assert.ok(
      events.includes(
        'tx-abort',
      ),
    );

    assert.equal(
      events.includes(
        'tx-commit',
      ),
      false,
    );

    assert.equal(
      disconnects.length,
      0,
    );

    assert.equal(
      sentChangedNotices.length,
      0,
    );
  },
);


// ============================================================
// 6. Concurrent correct requests
// ============================================================

test(
  'runtime concurrent correct OTP submissions have exactly one transactional winner',
  {
    concurrency: false,
  },
  async () => {
    const email =
      'runtime-concurrent@example.com';

    const code =
      '12345678';

    const user =
      activeUser(
        email,
      );

    const challenge =
      challengeFor({
        email,
        code,
      });

    let claimRemaining = 5;
    let challengePresent = true;
    let userUpdates = 0;

    PasswordRecoveryChallenge
      .findOneAndUpdate =
        () => ({
          async select() {
            if (
              claimRemaining <= 0
            ) {
              return null;
            }

            claimRemaining -= 1;

            return challenge;
          },
        });

    User.findById =
      () =>
        selected(
          user,
        );

    mongoose.startSession =
      async () => ({
        async withTransaction(
          work,
        ) {
          await work();
        },

        async endSession() {},
      });

    PasswordRecoveryChallenge
      .deleteOne =
        async () => {
          // Yield once so both requests can reach the
          // transaction boundary.
          await new Promise(
            resolve =>
              setImmediate(
                resolve,
              ),
          );

          if (
            !challengePresent
          ) {
            return {
              deletedCount: 0,
            };
          }

          challengePresent =
            false;

          return {
            deletedCount: 1,
          };
        };

    User.updateOne =
      async () => {
        userUpdates += 1;

        return {
          matchedCount: 1,
        };
      };

    const responses =
      await Promise.all(
        [
          post(
            '/reset',
            {
              email,
              code,

              newPassword:
                validPassword(
                  'concurrent-A',
                ),

              confirmPassword:
                validPassword(
                  'concurrent-A',
                ),
            },
          ),

          post(
            '/reset',
            {
              email,
              code,

              newPassword:
                validPassword(
                  'concurrent-B',
                ),

              confirmPassword:
                validPassword(
                  'concurrent-B',
                ),
            },
          ),
        ],
      );

    const statuses =
      responses
        .map(
          response =>
            response.status,
        )
        .sort(
          (a, b) =>
            a - b,
        );

    assert.deepEqual(
      statuses,
      [
        200,
        400,
      ],
    );

    assert.equal(
      userUpdates,
      1,
    );

    assert.equal(
      challengePresent,
      false,
    );

    assert.equal(
      disconnects.length,
      1,
    );

    const success =
      responses.find(
        response =>
          response.status
          === 200,
      );

    assert.ok(
      success,
    );

    assert.equal(
      success
        .body
        .code,
      'PASSWORD_RESET_COMPLETE',
    );

    assert.equal(
      Object.prototype
        .hasOwnProperty
        .call(
          success.body,
          'token',
        ),
      false,
    );
  },
);
