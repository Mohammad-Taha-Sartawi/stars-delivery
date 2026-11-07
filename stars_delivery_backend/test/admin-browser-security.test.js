const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const express = require('express');

const {
  ensureAdminCsrfToken,
  csrfTokensMatch,
  adminCsrfProtection,
} = require('../src/security/adminCsrf');

const {
  createAdminBrowserHeaders,
} = require('../src/security/adminBrowserHeaders');

const backendRoot =
  path.join(__dirname, '..');

function read(relative) {
  return fs.readFileSync(
    path.join(
      backendRoot,
      relative,
    ),
    'utf8',
  );
}

function runCsrf({
  method = 'GET',
  session = {},
  body = {},
  header = '',
  originalUrl = '/admin/test',
} = {}) {
  let nextCalled = false;
  let statusCode;
  let jsonPayload;
  let renderView;
  let renderPayload;

  const req = {
    method,
    session,
    body,
    originalUrl,
    headers: header
      ? {
          'x-csrf-token': header,
        }
      : {},
    get(name) {
      return this.headers[
        String(name).toLowerCase()
      ];
    },
  };

  const res = {
    locals: {},
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      jsonPayload = payload;
      return this;
    },
    render(view, payload) {
      renderView = view;
      renderPayload = payload;
      return this;
    },
  };

  adminCsrfProtection(
    req,
    res,
    () => {
      nextCalled = true;
    },
  );

  return {
    req,
    res,
    nextCalled,
    statusCode,
    jsonPayload,
    renderView,
    renderPayload,
  };
}

test('safe admin requests create a session-bound CSRF token', () => {
  const result = runCsrf();

  assert.equal(
    result.nextCalled,
    true,
  );

  assert.equal(
    typeof result.req
      .session
      .adminCsrfToken,
    'string',
  );

  assert.equal(
    result.req.session
      .adminCsrfToken
      .length,
    43,
  );

  assert.equal(
    result.res.locals.csrfToken,
    result.req.session
      .adminCsrfToken,
  );
});

test('unsafe admin requests reject missing CSRF token', () => {
  const session = {};

  const safe = runCsrf({
    session,
  });

  assert.equal(
    safe.nextCalled,
    true,
  );

  const result = runCsrf({
    method: 'POST',
    session,
  });

  assert.equal(
    result.nextCalled,
    false,
  );

  assert.equal(
    result.statusCode,
    403,
  );

  assert.deepEqual(
    result.jsonPayload,
    {
      error: 'Invalid CSRF token',
      code: 'CSRF_INVALID',
    },
  );
});

test('unsafe admin requests accept matching CSRF header', () => {
  const session = {};

  const token =
    ensureAdminCsrfToken({
      session,
    });

  const result = runCsrf({
    method: 'DELETE',
    session,
    header: token,
  });

  assert.equal(
    result.nextCalled,
    true,
  );
});

test('HTML login POST accepts body CSRF and rejects invalid body token safely', () => {
  const session = {};

  const token =
    ensureAdminCsrfToken({
      session,
    });

  const valid = runCsrf({
    method: 'POST',
    session,
    body: {
      _csrf: token,
    },
    originalUrl:
      '/admin/login',
  });

  assert.equal(
    valid.nextCalled,
    true,
  );

  const invalid = runCsrf({
    method: 'POST',
    session,
    body: {
      _csrf: 'wrong',
    },
    originalUrl:
      '/admin/login',
  });

  assert.equal(
    invalid.statusCode,
    403,
  );

  assert.equal(
    invalid.renderView,
    'login',
  );

  assert.match(
    invalid.renderPayload.error,
    /إعادة المحاولة/,
  );
});

test('CSRF comparison is exact', () => {
  assert.equal(
    csrfTokensMatch(
      'abc',
      'abc',
    ),
    true,
  );

  assert.equal(
    csrfTokensMatch(
      'abc',
      'abd',
    ),
    false,
  );

  assert.equal(
    csrfTokensMatch(
      'abc',
      'ab',
    ),
    false,
  );
});

test('CSRF comparison safely rejects equal-length Unicode input with different byte length', () => {
  const expected =
    'a'.repeat(43);

  const supplied =
    'é'.repeat(43);

  assert.equal(
    expected.length,
    supplied.length,
  );

  assert.notEqual(
    Buffer.byteLength(expected),
    Buffer.byteLength(supplied),
  );

  assert.doesNotThrow(
    () => {
      csrfTokensMatch(
        expected,
        supplied,
      );
    },
  );

  assert.equal(
    csrfTokensMatch(
      expected,
      supplied,
    ),
    false,
  );
});


function parseCspHeader(value) {
  const directives =
    new Map();

  for (
    const part
    of String(value).split(';')
  ) {
    const trimmed =
      part.trim();

    if (!trimmed) {
      continue;
    }

    const [
      name,
      ...sources
    ] = trimmed.split(/\s+/);

    directives.set(
      name,
      sources,
    );
  }

  return directives;
}

async function getAdminHeaderResponse(
  hostHeader,
) {
  const app = express();

  app.use(
    '/admin',
    createAdminBrowserHeaders(),
  );

  app.get(
    '/admin',
    (req, res) => {
      res.send('ok');
    },
  );

  const server =
    http.createServer(app);

  await new Promise(
    (resolve, reject) => {
      server.once(
        'error',
        reject,
      );

      server.listen(
        0,
        '127.0.0.1',
        resolve,
      );
    },
  );

  try {
    const address =
      server.address();

    return await new Promise(
      (resolve, reject) => {
        http.get(
          {
            host: '127.0.0.1',
            port: address.port,
            path: '/admin',
            headers: {
              Host: hostHeader,
            },
          },
          (res) => {
            res.resume();

            res.once(
              'end',
              () => resolve(res),
            );
          },
        ).once(
          'error',
          reject,
        );
      },
    );
  } finally {
    await new Promise(
      (resolve) => {
        server.close(resolve);
      },
    );
  }
}

test('admin Helmet boundary emits strict CSP and existing safe headers', async () => {
  const response =
    await getAdminHeaderResponse(
      'admin.example.test:8443',
    );

  assert.equal(
    response.headers[
      'x-content-type-options'
    ],
    'nosniff',
  );

  assert.equal(
    response.headers[
      'x-frame-options'
    ],
    'DENY',
  );

  assert.equal(
    response.headers[
      'referrer-policy'
    ],
    'same-origin',
  );

  const rawCsp =
    response.headers[
      'content-security-policy'
    ];

  assert.equal(
    typeof rawCsp,
    'string',
  );

  const csp =
    parseCspHeader(rawCsp);

  const expected = new Map([
    [
      'default-src',
      ["'self'"],
    ],
    [
      'base-uri',
      ["'none'"],
    ],
    [
      'connect-src',
      [
        "'self'",
        'ws://admin.example.test:8443',
        'wss://admin.example.test:8443',
      ],
    ],
    [
      'font-src',
      [
        "'self'",
        'https://fonts.gstatic.com',
        'https://cdnjs.cloudflare.com',
      ],
    ],
    [
      'form-action',
      ["'self'"],
    ],
    [
      'frame-ancestors',
      ["'none'"],
    ],
    [
      'frame-src',
      ["'none'"],
    ],
    [
      'img-src',
      [
        "'self'",
        'data:',
      ],
    ],
    [
      'object-src',
      ["'none'"],
    ],
    [
      'script-src',
      ["'self'"],
    ],
    [
      'script-src-attr',
      ["'none'"],
    ],
    [
      'style-src',
      [
        "'self'",
        'https://fonts.googleapis.com',
        'https://cdnjs.cloudflare.com',
      ],
    ],
    [
      'style-src-attr',
      ["'none'"],
    ],
    [
      'worker-src',
      ["'none'"],
    ],
  ]);

  assert.deepEqual(
    csp,
    expected,
  );

  assert.doesNotMatch(
    rawCsp,
    /'unsafe-inline'/,
  );

  assert.doesNotMatch(
    rawCsp,
    /'unsafe-eval'/,
  );

  assert.doesNotMatch(
    rawCsp,
    /upgrade-insecure-requests/,
  );
});

test('admin CSP never reflects an invalid Host value into connect-src', async () => {
  const response =
    await getAdminHeaderResponse(
      'admin.example.test;script-src *',
    );

  const rawCsp =
    response.headers[
      'content-security-policy'
    ];

  assert.equal(
    typeof rawCsp,
    'string',
  );

  assert.doesNotMatch(
    rawCsp,
    /admin\.example\.test;script-src/,
  );

  const csp =
    parseCspHeader(rawCsp);

  assert.deepEqual(
    csp.get(
      'connect-src',
    ),
    [
      "'self'",
      'ws://invalid.invalid',
      'wss://invalid.invalid',
    ],
  );
});

test('strict admin CSP contains only the audited external browser origins', () => {
  const headers = read(
    'src/security/adminBrowserHeaders.js',
  );

  const adminViews = [
    read(
      'src/views/admin/index.ejs',
    ),
    read(
      'src/views/admin/login.ejs',
    ),
    read(
      'src/views/admin/partials/modals.ejs',
    ),
    read(
      'src/views/admin/partials/sidebar.ejs',
    ),
  ].join('\n');

  assert.match(
    headers,
    /useDefaults:\s*false/,
  );

  for (const source of [
    'https://fonts.googleapis.com',
    'https://fonts.gstatic.com',
    'https://cdnjs.cloudflare.com',
  ]) {
    assert.ok(
      headers.includes(source),
      source,
    );
  }

  assert.doesNotMatch(
    headers,
    /['"]unsafe-inline['"]/,
  );

  assert.doesNotMatch(
    headers,
    /['"]unsafe-eval['"]/,
  );

  assert.doesNotMatch(
    headers,
    /['"]https:['"]/,
  );

  assert.doesNotMatch(
    headers,
    /['"]ws:['"]/,
  );

  assert.doesNotMatch(
    headers,
    /['"]wss:['"]/,
  );

  assert.doesNotMatch(
    headers,
    /upgradeInsecureRequests/,
  );

  assert.match(
    adminViews,
    /https:\/\/fonts\.googleapis\.com/,
  );

  assert.match(
    adminViews,
    /https:\/\/cdnjs\.cloudflare\.com/,
  );

  assert.match(
    adminViews,
    /\/socket\.io\/socket\.io\.js/,
  );

  assert.match(
    adminViews,
    /\/js\/main\.js/,
  );

  assert.doesNotMatch(
    adminViews,
    /<script\b[^>]*\bsrc="https:\/\//i,
  );
});

test('all admin mutation boundaries are wired through CSRF protection', () => {
  const index = read(
    'src/index.js',
  );

  for (const marker of [
    "app.use('/admin/drivers', requireAdminSession, adminCsrfProtection, adminDriverRoutes);",
    "app.use('/admin/users', requireAdminSession, adminCsrfProtection, adminUserRoutes);",
    "app.use('/admin/reports', requireAdminSession, adminCsrfProtection, adminReportRoutes);",
    "app.use('/admin/commissions', requireAdminSession, adminCsrfProtection, adminCommissionRoutes);",
    "app.use('/admin/areas', requireAdminSession, adminCsrfProtection, adminAreaRoutes);",
    "app.use('/admin/broadcast', requireAdminSession, adminCsrfProtection, adminBroadcastRoutes);",
    "app.use('/admin/chat', requireAdminSession, adminCsrfProtection, adminChatRoutes);",
    "app.use('/admin/api', requireAdminSession, adminCsrfProtection, adminApiRoutes);",
    "app.get('/admin', requireAdminSession, adminCsrfProtection, (req, res) => {",
  ]) {
    assert.ok(
      index.includes(marker),
      marker,
    );
  }

  const chat = read(
    'src/routes/chat.js',
  );

  assert.match(
    chat,
    /router\.use\(\s*'\/admin',\s*requireAdminSession,\s*adminCsrfProtection,\s*\);/s,
  );

  const auth = read(
    'src/routes/adminAuth.js',
  );

  assert.match(
    auth,
    /router\.post\('\/login', adminCsrfProtection, adminLoginLimiter,/,
  );

  assert.match(
    auth,
    /router\.post\('\/reset-password', requireAdminSession, adminCsrfProtection,/,
  );

  assert.match(
    auth,
    /router\.post\('\/logout', requireAdminSession, adminCsrfProtection,/,
  );
});

test('admin state-changing GETs are removed from logout and support-chat read acknowledgement', () => {
  const auth = read(
    'src/routes/adminAuth.js',
  );

  assert.doesNotMatch(
    auth,
    /router\.get\('\/logout'/,
  );

  assert.match(
    auth,
    /router\.post\('\/logout'/,
  );

  const chat = read(
    'src/routes/chat.js',
  );

  const getStart =
    chat.indexOf(
      "router.get('/admin/messages/:userId'",
    );

  const readStart =
    chat.indexOf(
      "router.post('/admin/messages/:userId/read'",
    );

  assert.ok(
    getStart >= 0,
  );

  assert.ok(
    readStart > getStart,
  );

  const getHandler =
    chat.slice(
      getStart,
      readStart,
    );

  assert.doesNotMatch(
    getHandler,
    /updateOne|updateMany|deleteMany|\.save\s*\(/,
  );

  assert.match(
    chat,
    /router\.post\('\/admin\/messages\/:userId\/read'/,
  );
});

test('admin HTML and browser JS propagate CSRF token without raw fetch mutation bypasses', () => {
  const login = read(
    'src/views/admin/login.ejs',
  );

  assert.match(
    login,
    /name="_csrf"\s+value="<%= csrfToken %>"/,
  );

  const adminIndex = read(
    'src/views/admin/index.ejs',
  );

  assert.match(
    adminIndex,
    /meta name="csrf-token"\s+content="<%= csrfToken %>"/,
  );

  assert.match(
    adminIndex,
    /form method="POST" action="\/admin\/logout"/,
  );

  assert.doesNotMatch(
    adminIndex,
    /window\.location\.href='\/admin\/logout'/,
  );

  const main = read(
    'src/public/js/main.js',
  );

  assert.match(
    main,
    /function adminFetch\(/,
  );

  assert.doesNotMatch(
    main,
    /fetch\s*\(/,
  );

  assert.match(
    main,
    /X-CSRF-Token/,
  );

  assert.match(
    main,
    /\/api\/chat\/admin\/messages\/\$\{userId\}\/read/,
  );
});

test('Helmet is pinned exactly for reproducible admin browser headers', () => {
  const packageJson =
    JSON.parse(
      read('package.json'),
    );

  assert.equal(
    packageJson.dependencies.helmet,
    '8.3.0',
  );
});
