const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
  DATABASE_UNAVAILABLE,
  isDatabaseUnavailableError,
  sendDatabaseUnavailable,
} = require('../src/security/errorResponse');

const backendRoot = path.resolve(__dirname, '..');

const indexSource = fs.readFileSync(
  path.join(backendRoot, 'src/index.js'),
  'utf8',
);

test(
  'database unavailable errors are classified',
  () => {
    assert.equal(
      isDatabaseUnavailableError(
        Object.assign(
          new Error('selection failed'),
          { name: 'MongoServerSelectionError' },
        ),
      ),
      true,
    );

    assert.equal(
      isDatabaseUnavailableError(
        Object.assign(
          new Error('network failed'),
          { name: 'MongoNetworkError' },
        ),
      ),
      true,
    );

    assert.equal(
      isDatabaseUnavailableError(
        new Error('Operation `users.findOne()` buffering timed out after 10000ms'),
      ),
      true,
    );

    assert.equal(
      isDatabaseUnavailableError(new Error('unrelated failure')),
      false,
    );
  },
);

test(
  'database unavailable response is a safe 503 payload',
  () => {
    let statusCode;
    let payload;

    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(body) {
        payload = body;
        return this;
      },
    };

    sendDatabaseUnavailable(res);

    assert.equal(statusCode, 503);

    assert.deepEqual(payload, {
      error: DATABASE_UNAVAILABLE,
      code: 'DATABASE_UNAVAILABLE',
    });
  },
);

test(
  'startup retries MongoDB connection with bounded delays',
  () => {
    assert.match(indexSource, /MONGO_RETRY_DELAYS_MS/);

    assert.match(
      indexSource,
      /serverSelectionTimeoutMS: 10000/,
    );

    assert.match(
      indexSource,
      /setTimeout\(connectMongo, delay\)/,
    );

    assert.match(
      indexSource,
      /Atlas rejected the TLS handshake/,
    );

    assert.match(
      indexSource,
      /mongoose\.connection\.on\('reconnected'/,
    );
  },
);

test(
  'API requests fail fast with 503 while the database is unavailable',
  () => {
    assert.match(
      indexSource,
      /app\.use\('\/api', \(req, res, next\)/,
    );

    assert.match(
      indexSource,
      /req\.path === '\/health'/,
    );

    assert.match(
      indexSource,
      /sendDatabaseUnavailable\(res\)/,
    );

    assert.match(
      indexSource,
      /isDatabaseUnavailableError\(err\)/,
    );
  },
);
