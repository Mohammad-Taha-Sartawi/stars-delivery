const test =
  require('node:test');

const assert =
  require('node:assert/strict');

const fs =
  require('node:fs');

const path =
  require('node:path');

const PasswordRecoveryChallenge =
  require('../src/models/PasswordRecoveryChallenge');

const {
  PASSWORD_RECOVERY_CODE_LENGTH,
  PASSWORD_RECOVERY_TTL_MS,
  PASSWORD_RECOVERY_ATTEMPT_LIMIT,
  PASSWORD_RECOVERY_MIN_RESPONSE_MS,
  generatePasswordRecoveryCode,
  generatePasswordRecoveryNonce,
  isPasswordRecoveryCode,
  createPasswordRecoveryCodeDigest,
  verifyPasswordRecoveryCodeDigest,
} =
  require('../src/security/passwordRecovery');

const {
  loadPasswordRecoverySecurityConfig,
  loadPasswordRecoveryMailConfig,
} =
  require('../src/config');

const {
  createPasswordRecoveryMailer,
} =
  require('../src/services/passwordRecoveryMailer');

const root =
  path.resolve(
    __dirname,
    '..',
  );

function source(relativePath) {
  return fs.readFileSync(
    path.join(
      root,
      relativePath,
    ),
    'utf8',
  );
}

const route =
  source(
    'src/routes/passwordRecovery.js',
  );

const auth =
  source(
    'src/routes/auth.js',
  );

const rate =
  source(
    'src/security/mobileAuthRateLimit.js',
  );

const config =
  source(
    'src/config.js',
  );

const envExample =
  source(
    '.env.example',
  );

const packageJson =
  JSON.parse(
    source(
      'package.json',
    ),
  );


test(
  'recovery code is exactly eight numeric digits',
  () => {
    assert.equal(
      PASSWORD_RECOVERY_CODE_LENGTH,
      8,
    );

    assert.equal(
      generatePasswordRecoveryCode(
        () => 42,
      ),
      '00000042',
    );

    assert.equal(
      isPasswordRecoveryCode(
        '12345678',
      ),
      true,
    );

    assert.equal(
      isPasswordRecoveryCode(
        '1234567a',
      ),
      false,
    );
  },
);


test(
  'recovery digest uses contextual keyed HMAC',
  () => {
    const context = {
      secret:
        'recovery-secret-0123456789-ABCDEFGH-xyz',
      userId:
        '507f1f77bcf86cd799439011',
      email:
        'user@example.com',
      sessionVersion:
        4,
      nonce:
        'nonce-value',
      code:
        '12345678',
    };

    const digest =
      createPasswordRecoveryCodeDigest(
        context,
      );

    assert.match(
      digest,
      /^[a-f0-9]{64}$/,
    );

    assert.equal(
      digest.includes(
        context.code,
      ),
      false,
    );

    assert.equal(
      verifyPasswordRecoveryCodeDigest({
        expectedDigest:
          digest,
        ...context,
      }),
      true,
    );

    assert.equal(
      verifyPasswordRecoveryCodeDigest({
        expectedDigest:
          digest,
        ...context,
        code:
          '87654321',
      }),
      false,
    );
  },
);


test(
  'recovery policy is ten minutes five attempts and a response floor',
  () => {
    assert.equal(
      PASSWORD_RECOVERY_TTL_MS,
      10 * 60 * 1000,
    );

    assert.equal(
      PASSWORD_RECOVERY_ATTEMPT_LIMIT,
      5,
    );

    assert.equal(
      PASSWORD_RECOVERY_MIN_RESPONSE_MS,
      300,
    );

    assert.equal(
      generatePasswordRecoveryNonce(
        size =>
          Buffer.alloc(
            size,
            0xab,
          ),
      ).length,
      64,
    );
  },
);


test(
  'recovery secret is dedicated and validated',
  () => {
    const recoverySecret =
      'recovery-secret-0123456789-ABCDEFGH-xyz';

    const result =
      loadPasswordRecoverySecurityConfig({
        PASSWORD_RECOVERY_SECRET:
          recoverySecret,
        JWT_SECRET:
          'jwt-secret-abcdefghijklmnopqrstuvwxyz-0123456789',
        SESSION_SECRET:
          'session-secret-abcdefghijklmnopqrstuvwxyz-012345',
      });

    assert.equal(
      result.recoverySecret,
      recoverySecret,
    );

    assert.throws(
      () =>
        loadPasswordRecoverySecurityConfig({
          PASSWORD_RECOVERY_SECRET:
            'short',
        }),
    );

    assert.throws(
      () =>
        loadPasswordRecoverySecurityConfig({
          PASSWORD_RECOVERY_SECRET:
            recoverySecret,
          JWT_SECRET:
            recoverySecret,
        }),
    );
  },
);


test(
  'SMTP config validates transport and auth pair',
  () => {
    const value =
      loadPasswordRecoveryMailConfig({
        SMTP_HOST:
          'smtp.example.com',
        SMTP_PORT:
          '587',
        SMTP_SECURE:
          'false',
        SMTP_FROM:
          'no-reply@example.com',
        SMTP_USER:
          '',
        SMTP_PASS:
          '',
      });

    assert.equal(
      value.smtpPort,
      587,
    );

    assert.equal(
      value.smtpSecure,
      false,
    );

    assert.throws(
      () =>
        loadPasswordRecoveryMailConfig({
          SMTP_HOST:
            'smtp.example.com',
          SMTP_PORT:
            '99999',
          SMTP_SECURE:
            'false',
          SMTP_FROM:
            'no-reply@example.com',
        }),
    );

    assert.throws(
      () =>
        loadPasswordRecoveryMailConfig({
          SMTP_HOST:
            'smtp.example.com',
          SMTP_PORT:
            '587',
          SMTP_SECURE:
            'maybe',
          SMTP_FROM:
            'no-reply@example.com',
        }),
    );

    assert.throws(
      () =>
        loadPasswordRecoveryMailConfig({
          SMTP_HOST:
            'smtp.example.com',
          SMTP_PORT:
            '587',
          SMTP_SECURE:
            'false',
          SMTP_FROM:
            'no-reply@example.com',
          SMTP_USER:
            'mailer',
          SMTP_PASS:
            '',
        }),
    );
  },
);


test(
  'SMTP adapter requires TLS and certificate validation',
  async () => {
    let transportOptions;

    const fakeNodemailer = {
      createTransport(options) {
        transportOptions =
          options;

        return {
          async sendMail(message) {
            return {
              messageId:
                'test',
              message,
            };
          },
        };
      },
    };

    const mailer =
      createPasswordRecoveryMailer({
        config: {
          smtpHost:
            'smtp.example.com',
          smtpPort:
            587,
          smtpSecure:
            false,
          smtpFrom:
            'no-reply@example.com',
          smtpUser:
            '',
          smtpPass:
            '',
        },
        nodemailerModule:
          fakeNodemailer,
      });

    await mailer.sendRecoveryCode({
      to:
        'user@example.com',
      code:
        '12345678',
    });

    assert.equal(
      transportOptions.requireTLS,
      true,
    );

    assert.equal(
      transportOptions.tls.minVersion,
      'TLSv1.2',
    );

    assert.equal(
      transportOptions.tls.rejectUnauthorized,
      true,
    );

    assert.equal(
      transportOptions.auth,
      undefined,
    );
  },
);


test(
  'challenge schema never stores plaintext OTP and has TTL cleanup',
  () => {
    assert.equal(
      PasswordRecoveryChallenge
        .schema
        .path('code'),
      undefined,
    );

    assert.equal(
      PasswordRecoveryChallenge
        .schema
        .path('codeDigest')
        .options
        .select,
      false,
    );

    assert.equal(
      PasswordRecoveryChallenge
        .schema
        .path('nonce')
        .options
        .select,
      false,
    );

    assert.equal(
      PasswordRecoveryChallenge
        .schema
        .path('attemptsRemaining')
        .options
        .max,
      5,
    );

    const ttl =
      PasswordRecoveryChallenge
        .schema
        .indexes()
        .find(
          ([spec, options]) =>
            spec.expiresAt === 1
            && options.expireAfterSeconds === 0,
        );

    assert.ok(ttl);
  },
);


test(
  'R2 pins Nodemailer and leaves deployment secrets blank',
  () => {
    assert.equal(
      packageJson
        .dependencies
        .nodemailer,
      '10.4.0',
    );

    for (
      const variable
      of [
        'PASSWORD_RECOVERY_SECRET',
        'SMTP_HOST',
        'SMTP_USER',
        'SMTP_PASS',
        'SMTP_FROM',
      ]
    ) {
      assert.match(
        envExample,
        new RegExp(
          `^${variable}=$`,
          'm',
        ),
      );
    }

    assert.match(
      config,
      /PASSWORD_RECOVERY_SECRET must be distinct/,
    );
  },
);


test(
  'recovery has independent request and reset anti-abuse budgets',
  () => {
    assert.match(
      rate,
      /PASSWORD_RECOVERY_REQUEST_IP_LIMIT = 10/,
    );

    assert.match(
      rate,
      /PASSWORD_RECOVERY_REQUEST_ACCOUNT_LIMIT = 3/,
    );

    assert.match(
      rate,
      /PASSWORD_RECOVERY_RESET_IP_LIMIT = 20/,
    );

    assert.match(
      rate,
      /createHash\('sha256'\)/,
    );
  },
);


test(
  'auth mounts recovery under password-recovery boundary',
  () => {
    assert.match(
      auth,
      /require\('\.\/passwordRecovery'\)/,
    );

    assert.match(
      auth,
      /router\.use\(\s*'\/password-recovery',\s*passwordRecoveryRouter,\s*\);/,
    );
  },
);


test(
  'request response is generic delayed and config precedes lookup',
  () => {
    const start =
      route.indexOf(
        '// Recovery request',
      );

    const end =
      route.indexOf(
        '// Recovery reset',
        start,
      );

    const block =
      route.slice(
        start,
        end,
      );

    assert.match(
      block,
      /requestIpLimiter/,
    );

    assert.match(
      block,
      /requestAccountLimiter/,
    );

    assert.ok(
      block.indexOf(
        'loadPasswordRecoveryMailConfig()',
      )
      <
      block.indexOf(
        '.findOne({',
      ),
    );

    assert.match(
      route,
      /status\(202\)[\s\S]*GENERIC_PASSWORD_RECOVERY_REQUEST_RESPONSE/,
    );

    assert.match(
      route,
      /waitForMinimumRecoveryResponse/,
    );
  },
);


test(
  'request stores digest nonce generation attempts and expiry then delivers after response',
  () => {
    const start =
      route.indexOf(
        '// Recovery request',
      );

    const end =
      route.indexOf(
        '// Recovery reset',
        start,
      );

    const block =
      route.slice(
        start,
        end,
      );

    for (
      const marker
      of [
        'findOneAndUpdate',
        'codeDigest',
        'sessionVersion',
        'nonce',
        'attemptsRemaining',
        'expiresAt',
      ]
    ) {
      assert.match(
        block,
        new RegExp(marker),
      );
    }

    assert.ok(
      block.indexOf(
        'await sendGenericRecoveryRequestResponse',
      )
      <
      block.indexOf(
        'scheduleRecoveryCodeDelivery({',
      ),
    );

    assert.doesNotMatch(
      block,
      /console\.(?:log|error)\([^)]*code/i,
    );
  },
);


test(
  'reset enforces OTP format confirmation and shared password policy',
  () => {
    const block =
      route.slice(
        route.indexOf(
          '// Recovery reset',
        ),
      );

    assert.match(
      block,
      /isPasswordRecoveryCode\(code\)/,
    );

    assert.match(
      block,
      /newPassword\s*!==\s*confirmPassword/,
    );

    assert.match(
      block,
      /PASSWORD_CONFIRMATION_MISMATCH/,
    );

    assert.match(
      block,
      /isValidMobilePassword/,
    );
  },
);


test(
  'reset atomically claims attempts before verification and transacts challenge consumption with credential rotation',
  () => {
    const block =
      route.slice(
        route.indexOf(
          '// Recovery reset',
        ),
      );

    const claimIndex =
      block.indexOf(
        '.findOneAndUpdate(',
      );

    const verifyIndex =
      block.indexOf(
        'verifyPasswordRecoveryCodeDigest',
      );

    const transactionIndex =
      block.indexOf(
        'executeTransaction({',
      );

    const consumeIndex =
      block.indexOf(
        '.deleteOne(',
      );

    const rotationIndex =
      block.indexOf(
        'User.updateOne(',
      );

    assert.ok(
      claimIndex >= 0,
    );

    assert.ok(
      verifyIndex
      > claimIndex,
    );

    assert.ok(
      transactionIndex
      > verifyIndex,
    );

    assert.ok(
      consumeIndex
      > transactionIndex,
    );

    assert.ok(
      rotationIndex
      > consumeIndex,
    );

    assert.match(
      block,
      /findOneAndUpdate\([\s\S]*attemptsRemaining:\s*\{\s*\$gt:\s*0[\s\S]*\$inc:\s*\{\s*attemptsRemaining:\s*-1/,
    );

    assert.match(
      block,
      /new:\s*false/,
    );

    assert.doesNotMatch(
      block,
      /PasswordRecoveryChallenge\s*\.\s*updateOne\(/,
    );

    assert.match(
      block,
      /mongoose\.startSession\(\)/,
    );

    assert.match(
      block,
      /PasswordRecoveryConflict/,
    );

    assert.match(
      block,
      /deleteOne\([\s\S]*nonce:[\s\S]*sessionVersion:[\s\S]*expiresAt:/,
    );

    assert.match(
      block,
      /User\.updateOne\([\s\S]*sessionVersion:\s*1[\s\S]*session,/,
    );
  },
);


test(
  'successful reset rotates generation verifies mailbox disconnects sockets and emits no token',
  () => {
    const block =
      route.slice(
        route.indexOf(
          '// Recovery reset',
        ),
      );

    assert.match(
      block,
      /bcrypt\.hash\(\s*newPassword,\s*10/,
    );

    assert.match(
      block,
      /mobileSessionRotationFilter/,
    );

    assert.match(
      block,
      /password:\s*passwordHash/,
    );

    assert.match(
      block,
      /verified:\s*true/,
    );

    assert.match(
      block,
      /sessionVersion:\s*1/,
    );

    assert.match(
      block,
      /\.disconnectSockets\(true\)/,
    );

    assert.match(
      block,
      /PASSWORD_RESET_COMPLETE/,
    );

    assert.match(
      block,
      /schedulePasswordChangedNotice/,
    );

    assert.doesNotMatch(
      block,
      /jwt\.sign/,
    );

    assert.doesNotMatch(
      block,
      /token\s*:/,
    );
  },
);
