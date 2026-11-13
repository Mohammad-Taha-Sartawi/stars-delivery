const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { once } = require('node:events');
const express = require('express');

const {
  MOBILE_AUTH_WINDOW_MS,
  MOBILE_LOGIN_ATTEMPT_LIMIT,
  MOBILE_REGISTRATION_ATTEMPT_LIMIT,
  MOBILE_LOGIN_RATE_LIMIT_RESPONSE,
  MOBILE_REGISTRATION_RATE_LIMIT_RESPONSE,
  createMobileLoginLimiter,
  createMobileRegistrationLimiter,
} = require('../src/security/mobileAuthRateLimit');

const backendRoot =
  path.resolve(__dirname, '..');

function source(relativePath) {
  return fs.readFileSync(
    path.join(
      backendRoot,
      relativePath,
    ),
    'utf8',
  );
}

async function withProbeServer(
  limiter,
  handler,
  callback,
) {
  const app = express();

  app.post(
    '/probe',
    limiter,
    handler,
  );

  const server =
    http.createServer(app);

  server.listen(
    0,
    '127.0.0.1',
  );

  await once(
    server,
    'listening',
  );

  const address =
    server.address();

  const baseUrl =
    `http://127.0.0.1:${address.port}`;

  try {
    await callback(baseUrl);
  } finally {
    await new Promise(
      (resolve, reject) => {
        server.close(
          (error) => {
            if (error) {
              reject(error);
              return;
            }

            resolve();
          },
        );
      },
    );
  }
}

async function post(url) {
  const response =
    await fetch(
      url,
      {
        method: 'POST',
      },
    );

  let body = null;

  try {
    body =
      await response.json();
  } catch {
    body = null;
  }

  return {
    status: response.status,
    body,
  };
}

test(
  'mobile auth limiter policy uses separate bounded login and registration budgets',
  () => {
    assert.equal(
      MOBILE_AUTH_WINDOW_MS,
      15 * 60 * 1000,
    );

    assert.equal(
      MOBILE_LOGIN_ATTEMPT_LIMIT,
      10,
    );

    assert.equal(
      MOBILE_REGISTRATION_ATTEMPT_LIMIT,
      5,
    );

    assert.deepEqual(
      MOBILE_LOGIN_RATE_LIMIT_RESPONSE,
      {
        error:
          'Too many authentication attempts. Please try again later.',
        code: 'AUTH_RATE_LIMITED',
      },
    );

    assert.deepEqual(
      MOBILE_REGISTRATION_RATE_LIMIT_RESPONSE,
      {
        error:
          'Too many registration attempts. Please try again later.',
        code:
          'REGISTRATION_RATE_LIMITED',
      },
    );
  },
);

test(
  'successful login probes do not consume the failed-login budget',
  async () => {
    const limiter =
      createMobileLoginLimiter();

    await withProbeServer(
      limiter,
      (req, res) => {
        if (
          req.query.success === '1'
        ) {
          return res
            .status(200)
            .json({
              ok: true,
            });
        }

        return res
          .status(400)
          .json({
            error:
              'Invalid credentials',
          });
      },
      async (baseUrl) => {
        for (
          let index = 0;
          index < 3;
          index += 1
        ) {
          const response =
            await post(
              `${baseUrl}/probe?success=1`,
            );

          assert.equal(
            response.status,
            200,
          );
        }

        for (
          let index = 0;
          index < 10;
          index += 1
        ) {
          const response =
            await post(
              `${baseUrl}/probe`,
            );

          assert.equal(
            response.status,
            400,
          );
        }

        const limited =
          await post(
            `${baseUrl}/probe`,
          );

        assert.equal(
          limited.status,
          429,
        );

        assert.deepEqual(
          limited.body,
          MOBILE_LOGIN_RATE_LIMIT_RESPONSE,
        );
      },
    );
  },
);

test(
  'registration limiter counts successful creation requests to constrain account spam',
  async () => {
    const limiter =
      createMobileRegistrationLimiter();

    await withProbeServer(
      limiter,
      (_req, res) =>
        res
          .status(201)
          .json({
            created: true,
          }),
      async (baseUrl) => {
        for (
          let index = 0;
          index < 5;
          index += 1
        ) {
          const response =
            await post(
              `${baseUrl}/probe`,
            );

          assert.equal(
            response.status,
            201,
          );
        }

        const limited =
          await post(
            `${baseUrl}/probe`,
          );

        assert.equal(
          limited.status,
          429,
        );

        assert.deepEqual(
          limited.body,
          MOBILE_REGISTRATION_RATE_LIMIT_RESPONSE,
        );
      },
    );
  },
);

test(
  'auth router wires dedicated limiters and removes role-based login enumeration',
  () => {
    const auth =
      source(
        'src/routes/auth.js',
      );

    const rateLimitSource =
      source(
        'src/security/mobileAuthRateLimit.js',
      );

    const index =
      source(
        'src/index.js',
      );

    const registerStart =
      auth.indexOf(
        "router.post('/register'",
      );

    const loginStart =
      auth.indexOf(
        "router.post('/login'",
      );

    const meStart =
      auth.indexOf(
        "router.get(",
        loginStart,
      );

    assert.ok(
      registerStart >= 0,
    );

    assert.ok(
      loginStart > registerStart,
    );

    assert.ok(
      meStart > loginStart,
    );

    const registerSource =
      auth.slice(
        registerStart,
        loginStart,
      );

    const loginSource =
      auth.slice(
        loginStart,
        meStart,
      );

    const meSource =
      auth.slice(
        meStart,
      );

    assert.match(
      registerSource,
      /router\.post\(\s*'\/register',\s*mobileRegistrationLimiter,/,
    );

    assert.match(
      loginSource,
      /router\.post\(\s*'\/login',\s*mobileLoginLimiter,/,
    );

    assert.doesNotMatch(
      meSource,
      /mobile(Login|Registration)Limiter/,
    );

    assert.doesNotMatch(
      auth,
      /No account found for this role/,
    );

    assert.match(
      loginSource,
      /error:\s*invalidCredentialsMessage/,
    );

    const compareIndex =
      loginSource.indexOf(
        'bcrypt.compare(',
      );

    const roleCheckIndex =
      loginSource.indexOf(
        'user.role !== role',
      );

    const accountStateIndex =
      loginSource.indexOf(
        'isActiveMobileAccount(',
      );

    assert.ok(
      compareIndex >= 0,
    );

    assert.ok(
      roleCheckIndex > compareIndex,
    );

    assert.ok(
      accountStateIndex
        > roleCheckIndex,
    );

    assert.match(
      loginSource,
      /if\s*\(!user\s*\|\|\s*!match\s*\|\|\s*user\.role\s*!==\s*role\)/,
    );

    // Preserve historical short-password login:
    // creation/change policy must never be applied here.
    assert.doesNotMatch(
      loginSource,
      /isValidMobilePassword\(password\)/,
    );

    // Login and registration continue to use
    // express-rate-limit's default IP key generator.
    // Password recovery owns a distinct account-scoped limiter,
    // so keep this historical assertion scoped to the original
    // login and registration limiter factories.
    const loginLimiterStart =
      rateLimitSource.indexOf(
        'function createMobileLoginLimiter()',
      );

    const loginAccountLimiterStart =
      rateLimitSource.indexOf(
        'function createMobileLoginAccountLimiter()',
      );

    const registrationLimiterStart =
      rateLimitSource.indexOf(
        'function createMobileRegistrationLimiter()',
      );

    const recoveryKeyStart =
      rateLimitSource.indexOf(
        'function passwordRecoveryAccountKey(',
      );

    assert.ok(
      loginLimiterStart >= 0,
    );

    assert.ok(
      loginAccountLimiterStart
        > loginLimiterStart,
    );

    assert.ok(
      registrationLimiterStart
        > loginAccountLimiterStart,
    );

    assert.ok(
      recoveryKeyStart
        > registrationLimiterStart,
    );

    const loginLimiterSource =
      rateLimitSource.slice(
        loginLimiterStart,
        loginAccountLimiterStart,
      );

    const registrationLimiterSource =
      rateLimitSource.slice(
        registrationLimiterStart,
        recoveryKeyStart,
      );

    assert.doesNotMatch(
      loginLimiterSource,
      /keyGenerator\s*:/,
    );

    assert.doesNotMatch(
      registrationLimiterSource,
      /keyGenerator\s*:/,
    );

    // Preserve the original reverse-proxy boundary:
    // application code must not parse forwarded-for manually.
    assert.doesNotMatch(
      rateLimitSource,
      /x-forwarded-for/i,
    );

    assert.match(
      rateLimitSource,
      /skipSuccessfulRequests:\s*true/,
    );

    assert.match(
      rateLimitSource,
      /standardHeaders:\s*'draft-8'/,
    );

    assert.match(
      rateLimitSource,
      /legacyHeaders:\s*false/,
    );

    // Production currently has one trusted reverse-proxy hop.
    assert.match(
      index,
      /if\s*\(process\.env\.NODE_ENV\s*===\s*'production'\)\s*app\.set\('trust proxy',\s*1\);/,
    );
  },
);
