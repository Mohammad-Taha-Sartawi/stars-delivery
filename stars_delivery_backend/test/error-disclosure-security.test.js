const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  INTERNAL_SERVER_ERROR,
  sendInternalServerError,
  sendInternalServerFailure,
} = require('../src/security/errorResponse');

const backendRoot = path.resolve(__dirname, '..');

const protectedFiles = new Map([
  ['src/index.js', 1],
  ['src/routes/auth.js', 3],
  ['src/routes/passwordRecovery.js', 1],
  ['src/routes/chat.js', 10],
  ['src/routes/adminChat.js', 2],
  ['src/routes/notifications.js', 4],
  ['src/routes/offers.js', 5],
  ['src/routes/orders.js', 8],
  ['src/routes/provider.js', 7],
  ['src/routes/reports.js', 2],
  ['src/routes/users.js', 17],
]);

function read(relative) {
  return fs.readFileSync(
    path.join(backendRoot, relative),
    'utf8',
  );
}

test('generic internal error helper exposes only a fixed safe payload', () => {
  const payloads = [];

  const res = {
    status(code) {
      assert.equal(code, 500);

      return {
        json(payload) {
          payloads.push(payload);
          return payload;
        },
      };
    },
  };

  const simulatedSecret =
    'MongoServerError: secret-host.internal users';

  const result = sendInternalServerError(res);

  assert.deepEqual(
    result,
    { error: 'Server error' },
  );

  assert.equal(
    INTERNAL_SERVER_ERROR,
    'Server error',
  );

  assert.equal(payloads.length, 1);

  assert.equal(
    JSON.stringify(payloads[0]).includes(
      simulatedSecret,
    ),
    false,
  );
});

test('all STARS-009A HTTP 500 sites use the safe helper', () => {
  let total = 0;

  for (
    const [relative, expected]
    of protectedFiles
  ) {
    const source = read(relative);

    const calls =
      source.match(
        /\bsendInternalServerError\s*\(\s*res\s*,?\s*\)/g,
      ) || [];

    assert.equal(
      calls.length,
      expected,
      `${relative} helper-call count`,
    );

    assert.doesNotMatch(
      source,
      /res\.status\s*\(\s*500\s*\)\.json\s*\([^;\n]*(?:err|error)\.message/,
      `${relative} exposes raw 500 exception text`,
    );

    total += calls.length;
  }

  assert.equal(total, 60);
});

test('controlled non-500 application errors remain intact', () => {
  const chat =
    read('src/routes/chat.js');

  const orders =
    read('src/routes/orders.js');

  const offers =
    read('src/routes/offers.js');

  assert.match(
    chat,
    /err instanceof ContactValidationError/,
  );

  assert.match(
    chat,
    /res\.status\(err\.status\)\.json\(\{/,
  );

  assert.match(
    chat,
    /error:\s*err\.message/,
  );

  assert.match(
    chat,
    /code:\s*err\.code/,
  );

  assert.match(
    orders,
    /orderImageUploadErrorMessage\(error\)/,
  );

  assert.match(
    orders,
    /code: 'INVALID_IMAGE_UPLOAD'/,
  );

  for (const source of [offers, orders]) {
    assert.match(
      source,
      /LifecycleConflict/,
    );

    assert.match(
      source,
      /res\.status\(409\)/,
    );

    assert.match(
      source,
      /res\.status\(503\)/,
    );

    assert.match(
      source,
      /Order service is temporarily unavailable/,
    );
  }
});

test('internal error logging remains distinct from client responses', () => {
  const expectedLogging = new Map([
    [
      'src/index.js',
      /console\.error\('Unhandled error:', err\)/,
    ],
    [
      'src/routes/offers.js',
      /console\.error\('Create offer error:', err\.message\)/,
    ],
    [
      'src/routes/orders.js',
      /console\.error\('Create order error:', err\.message\)/,
    ],
    [
      'src/routes/provider.js',
      /console\.error\('Stats error:', err\.message\)/,
    ],
    [
      'src/routes/users.js',
      /console\.error\('Update location error:', err\.message\)/,
    ],
  ]);

  for (
    const [relative, pattern]
    of expectedLogging
  ) {
    assert.match(
      read(relative),
      pattern,
      `${relative} logging unexpectedly changed`,
    );
  }
});

test('socket authentication boundary never forwards caught exception text', () => {
  const source = read('src/index.js');

  assert.doesNotMatch(
    source,
    /next\s*\(\s*new Error\s*\(\s*err\.message\s*\)\s*\)/,
  );

  assert.match(
    source,
    /catch \(err\) \{\s*next\(new Error\('Invalid authentication'\)\);\s*\}/,
  );

  assert.match(
    source,
    /await User\.findById\(/,
  );
});

test('generic admin failure helper preserves success/message shape safely', () => {
  const payloads = [];

  const res = {
    status(code) {
      assert.equal(code, 500);

      return {
        json(payload) {
          payloads.push(payload);
          return payload;
        },
      };
    },
  };

  const result =
    sendInternalServerFailure(res);

  assert.deepEqual(
    result,
    {
      success: false,
      message: 'Server error',
    },
  );

  assert.deepEqual(
    payloads,
    [
      {
        success: false,
        message: 'Server error',
      },
    ],
  );
});

test('all STARS-009B admin 500 sites preserve their response shapes through safe helpers', () => {
  const adminFiles = new Map([
    [
      'src/routes/adminApi.js',
      { error: 4, failure: 0 },
    ],
    [
      'src/routes/adminAreas.js',
      { error: 1, failure: 0 },
    ],
    [
      'src/routes/adminBroadcast.js',
      { error: 0, failure: 2 },
    ],
    [
      'src/routes/adminChat.js',
      { error: 2, failure: 0 },
    ],
    [
      'src/routes/adminCommissions.js',
      { error: 1, failure: 3 },
    ],
    [
      'src/routes/adminDrivers.js',
      { error: 7, failure: 9 },
    ],
    [
      'src/routes/adminOrders.js',
      { error: 2, failure: 4 },
    ],
    [
      'src/routes/adminReports.js',
      { error: 2, failure: 3 },
    ],
    [
      'src/routes/adminUsers.js',
      { error: 2, failure: 3 },
    ],
  ]);

  let errorTotal = 0;
  let failureTotal = 0;

  for (
    const [relative, expected]
    of adminFiles
  ) {
    const source = read(relative);

    const errorCalls =
      source.match(
        /\bsendInternalServerError\s*\(\s*res\s*\)/g,
      ) || [];

    const failureCalls =
      source.match(
        /\bsendInternalServerFailure\s*\(\s*res\s*\)/g,
      ) || [];

    assert.equal(
      errorCalls.length,
      expected.error,
      `${relative} error-shape helper count`,
    );

    assert.equal(
      failureCalls.length,
      expected.failure,
      `${relative} failure-shape helper count`,
    );

    assert.doesNotMatch(
      source,
      /res\.status\s*\(\s*500\s*\)\.json\s*\([^;\n]*(?:err|error)\.message/,
      `${relative} exposes raw admin exception text`,
    );

    errorTotal += errorCalls.length;
    failureTotal += failureCalls.length;
  }

  assert.equal(errorTotal, 21);
  assert.equal(failureTotal, 24);
  assert.equal(
    errorTotal + failureTotal,
    45,
  );
});

test('backend has no raw HTTP 500 exception-message responses after STARS-009', () => {
  const sourceRoot =
    path.join(backendRoot, 'src');

  const pending = [
    sourceRoot,
  ];

  const jsFiles = [];

  while (pending.length) {
    const current = pending.pop();

    for (
      const entry
      of fs.readdirSync(
        current,
        { withFileTypes: true },
      )
    ) {
      const full =
        path.join(
          current,
          entry.name,
        );

      if (entry.isDirectory()) {
        pending.push(full);
      } else if (
        entry.isFile()
        && entry.name.endsWith('.js')
      ) {
        jsFiles.push(full);
      }
    }
  }

  const raw500 =
    /res\.status\s*\(\s*500\s*\)\.json\s*\([^;\n]*(?:err|error)\.message/;

  for (const file of jsFiles) {
    const source =
      fs.readFileSync(
        file,
        'utf8',
      );

    assert.doesNotMatch(
      source,
      raw500,
      `${path.relative(backendRoot, file)} exposes raw HTTP 500 exception text`,
    );
  }
});
