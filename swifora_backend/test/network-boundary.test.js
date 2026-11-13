const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  canonicalOrigin,
  parseAllowedOrigins,
  requestOrigin,
  isOriginAllowed,
  createOriginGuard,
  corsOptionsForRequest,
  socketOriginAllowed,
} = require('../src/security/originPolicy');

const { loadAppConfig } =
  require('../src/config');

function request({
  origin,
  host = 'api.example.com',
  protocol = 'https',
} = {}) {
  return {
    protocol,
    headers: {
      host,
      ...(origin
        ? { origin }
        : {}),
    },
  };
}

test('origin canonicalization accepts only origin-shaped HTTP(S) values', () => {
  assert.equal(
    canonicalOrigin(' https://Example.com:443/ '),
    'https://example.com',
  );

  assert.throws(
    () => canonicalOrigin('*'),
    /Wildcard origins are not allowed/,
  );

  assert.throws(
    () => canonicalOrigin('ftp://example.com'),
    /Unsupported origin protocol/,
  );

  assert.throws(
    () => canonicalOrigin(
      'https://example.com/path',
    ),
    /scheme, host, and optional port/,
  );
});

test('allowed origins are parsed, normalized, deduplicated, and optional', () => {
  assert.deepEqual(
    parseAllowedOrigins(''),
    [],
  );

  assert.deepEqual(
    parseAllowedOrigins(
      'https://Admin.Example.com/, http://localhost:5173, https://admin.example.com',
    ),
    [
      'https://admin.example.com',
      'http://localhost:5173',
    ],
  );
});

test('wildcard cannot be configured through CORS_ALLOWED_ORIGINS', () => {
  assert.throws(
    () => parseAllowedOrigins(
      'https://example.com,*',
    ),
    /Wildcard origins are not allowed/,
  );
});

test('native or non-browser requests without Origin remain allowed', () => {
  assert.equal(
    isOriginAllowed(
      undefined,
      request(),
      [],
    ),
    true,
  );
});

test('same-origin browser request is allowed without explicit allowlist', () => {
  assert.equal(
    isOriginAllowed(
      'https://api.example.com',
      request(),
      [],
    ),
    true,
  );
});

test('explicit cross-origin browser origin is allowed', () => {
  assert.equal(
    isOriginAllowed(
      'https://admin.example.com',
      request(),
      ['https://admin.example.com'],
    ),
    true,
  );
});

test('unknown cross-origin browser origin is rejected', () => {
  assert.equal(
    isOriginAllowed(
      'https://evil.example',
      request(),
      ['https://admin.example.com'],
    ),
    false,
  );
});

test('request origin honors request scheme and host', () => {
  assert.equal(
    requestOrigin(
      request({
        host: 'api.example.com:8443',
        protocol: 'https',
      }),
    ),
    'https://api.example.com:8443',
  );
});

test('origin guard returns a structured 403 for rejected browser origins', () => {
  const middleware =
    createOriginGuard({
      allowedOrigins: [
        'https://admin.example.com',
      ],
    });

  let nextCalled = false;
  let statusCode = null;
  let body = null;

  middleware(
    request({
      origin: 'https://evil.example',
    }),
    {
      status(code) {
        statusCode = code;
        return this;
      },
      json(value) {
        body = value;
        return this;
      },
    },
    () => {
      nextCalled = true;
    },
  );

  assert.equal(nextCalled, false);
  assert.equal(statusCode, 403);

  assert.deepEqual(body, {
    error: 'Origin not allowed',
    code: 'ORIGIN_NOT_ALLOWED',
  });
});

test('origin guard passes native and same-origin requests', () => {
  const middleware =
    createOriginGuard();

  let nativePassed = false;
  let sameOriginPassed = false;

  middleware(
    request(),
    {},
    () => {
      nativePassed = true;
    },
  );

  middleware(
    request({
      origin: 'https://api.example.com',
    }),
    {},
    () => {
      sameOriginPassed = true;
    },
  );

  assert.equal(nativePassed, true);
  assert.equal(sameOriginPassed, true);
});

test('CORS options reflect an approved origin without wildcarding native clients', () => {
  assert.deepEqual(
    corsOptionsForRequest(
      request(),
      [],
    ),
    {
      origin: false,
      credentials: true,
      optionsSuccessStatus: 204,
    },
  );

  assert.deepEqual(
    corsOptionsForRequest(
      request({
        origin:
          'https://admin.example.com',
      }),
      ['https://admin.example.com'],
    ),
    {
      origin:
        'https://admin.example.com',
      credentials: true,
      optionsSuccessStatus: 204,
    },
  );
});

test('Socket.IO origin policy matches the HTTP origin policy', () => {
  assert.equal(
    socketOriginAllowed(
      request(),
      [],
    ),
    true,
  );

  assert.equal(
    socketOriginAllowed(
      request({
        origin:
          'https://api.example.com',
      }),
      [],
    ),
    true,
  );

  assert.equal(
    socketOriginAllowed(
      request({
        origin:
          'https://evil.example',
      }),
      [],
    ),
    false,
  );
});

test('loadAppConfig parses optional explicit browser origins', () => {
  const config = loadAppConfig({
    MONGODB_URI:
      'mongodb://127.0.0.1:27017/test',
    JWT_SECRET:
      'network-boundary-jwt-secret-aaaaaaaaaaaaaaa',
    SESSION_SECRET:
      'network-boundary-session-secret-bbbbbbbbbbb',
    CORS_ALLOWED_ORIGINS:
      'https://admin.example.com,http://localhost:5173',
  });

  assert.deepEqual(
    config.allowedOrigins,
    [
      'https://admin.example.com',
      'http://localhost:5173',
    ],
  );
});

test('health endpoint no longer exposes database state, counts, or raw errors', () => {
  const source = fs.readFileSync(
    path.join(
      __dirname,
      '..',
      'src',
      'index.js',
    ),
    'utf8',
  );

  const start =
    source.indexOf("app.get('/api/health'");

  const end =
    source.indexOf(
      "app.use('/api/auth'",
      start,
    );

  assert.ok(start >= 0);
  assert.ok(end > start);

  const block =
    source.slice(start, end);

  assert.match(
    block,
    /readyState === 1/,
  );

  assert.match(
    block,
    /connected \? 200 : 503/,
  );

  assert.match(
    block,
    /'unavailable'/,
  );

  assert.doesNotMatch(
    block,
    /estimatedDocumentCount|countDocuments|dbStatus|err\.message/,
  );
});

test('server enforces shared origin policy for both Express and Socket.IO', () => {
  const source = fs.readFileSync(
    path.join(
      __dirname,
      '..',
      'src',
      'index.js',
    ),
    'utf8',
  );

  assert.match(
    source,
    /createOriginGuard/,
  );

  assert.match(
    source,
    /corsOptionsForRequest/,
  );

  assert.match(
    source,
    /allowRequest:/,
  );

  assert.match(
    source,
    /socketOriginAllowed/,
  );

  assert.doesNotMatch(
    source,
    /cors:\s*\{\s*origin:\s*['"]\*['"]/,
  );

  assert.doesNotMatch(
    source,
    /app\.use\(cors\(\)\)/,
  );
});

test('environment example documents optional origin allowlist without wildcard', () => {
  const source = fs.readFileSync(
    path.join(
      __dirname,
      '..',
      '.env.example',
    ),
    'utf8',
  );

  assert.match(
    source,
    /CORS_ALLOWED_ORIGINS=/,
  );

  assert.doesNotMatch(
    source,
    /CORS_ALLOWED_ORIGINS=\*/,
  );
});
