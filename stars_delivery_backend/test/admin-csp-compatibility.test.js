const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const backendRoot = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(
    path.join(backendRoot, relativePath),
    'utf8',
  );
}

const adminViewPaths = [
  'src/views/admin/index.ejs',
  'src/views/admin/login.ejs',
  'src/views/admin/partials/modals.ejs',
  'src/views/admin/partials/sidebar.ejs',
];

const adminViews = adminViewPaths
  .map(read)
  .join('\n');

const browserSource = read(
  'src/public/js/main.js',
);

const cssSource = read(
  'src/public/css/style.css',
);

const compatibilitySurface =
  `${adminViews}\n${browserSource}`;

test('admin CSP compatibility removes inline event attributes', () => {
  const inlineEvents = compatibilitySurface.match(
    /\son(?:click|change|submit|load|error|input|keyup|keydown|keypress|focus|blur|mouseover|mouseout)\s*=/gi,
  ) || [];

  assert.equal(
    inlineEvents.length,
    0,
  );

  assert.doesNotMatch(
    compatibilitySurface,
    /\.setAttribute\s*\(\s*['"]on[A-Za-z]+['"]/i,
  );
});

test('admin CSP compatibility removes inline style state', () => {
  const inlineStyles = compatibilitySurface.match(
    /\sstyle\s*=/gi,
  ) || [];

  assert.equal(
    inlineStyles.length,
    0,
  );

  assert.doesNotMatch(
    browserSource,
    /\.style\.[A-Za-z_$][A-Za-z0-9_$-]*\s*=/,
  );

  assert.doesNotMatch(
    browserSource,
    /\.setAttribute\s*\(\s*['"]style['"]/i,
  );
});

test('presentation tokens preserve all migrated inline styles externally', () => {
  const tokenMatches = [
    ...compatibilitySurface.matchAll(
      /data-presentation="([^"]+)"/g,
    ),
  ];

  // Three fake trend chips were replaced by real order counters, and the
  // commissions dash placeholder was replaced by a reset action.
  assert.equal(
    tokenMatches.length,
    74,
  );

  const tokens = new Set(
    tokenMatches.map(
      (match) => match[1],
    ),
  );

  assert.ok(
    tokens.size > 0,
  );

  for (const token of tokens) {
    assert.match(
      cssSource,
      new RegExp(
        `\\[data-presentation="${token}"\\]`,
      ),
    );
  }

  assert.match(
    cssSource,
    /\.csp-hidden\s*\{/,
  );

  assert.match(
    cssSource,
    /\.csp-inline-block\s*\{/,
  );
});

test('delegated browser actions replace legacy inline handlers', () => {
  const clickActions = compatibilitySurface.match(
    /data-admin-action="/g,
  ) || [];

  const fileChangeTargets = compatibilitySurface.match(
    /data-file-name-target="/g,
  ) || [];

  // The pending-payout dashboard card, driver details and commissions table
  // expose pay and reset actions.
  assert.equal(
    clickActions.length,
    66,
  );

  assert.equal(
    fileChangeTargets.length,
    0,
  );

  assert.match(
    browserSource,
    /const adminActionHandlers = Object\.freeze\(\{/,
  );

  assert.match(
    browserSource,
    /closest\(\s*'\[data-admin-action\]'/,
  );

  assert.doesNotMatch(
    browserSource,
    /data-file-name-target/,
  );
});

test('delegated admin actions require the admin session capability', () => {
  assert.match(
    browserSource,
    /const adminActionCapability\s*=\s*adminCsrfToken\s*\|\|\s*null;/,
  );

  assert.match(
    browserSource,
    /querySelectorAll\(\s*'\[data-admin-action\]'\s*,?\s*\)/,
  );

  assert.match(
    browserSource,
    /element\.setAttribute\(\s*'data-admin-capability',\s*adminActionCapability,\s*\)/,
  );

  assert.match(
    browserSource,
    /!adminActionCapability\s*\|\|\s*trigger\.getAttribute\(\s*'data-admin-capability',?\s*\)\s*!==\s*adminActionCapability/,
  );

  const generatedActions = browserSource.match(
    /data-admin-action="/g,
  ) || [];

  const generatedCapabilities = browserSource.match(
    /data-admin-capability="\$\{escapeHtml\(adminActionCapability \|\| ''\)\}"/g,
  ) || [];

  assert.equal(
    generatedActions.length,
    42,
  );

  assert.equal(
    generatedCapabilities.length,
    42,
  );

  const generatedActionLines = browserSource
    .split('\n')
    .filter(
      (line) =>
        line.includes(
          'data-admin-action="',
        ),
    );

  for (const line of generatedActionLines) {
    assert.match(
      line,
      /data-admin-capability=/,
    );
  }
});

test('strict script-src compatibility blockers stay absent', () => {
  assert.doesNotMatch(
    compatibilitySurface,
    /\bjavascript:/i,
  );

  assert.doesNotMatch(
    browserSource,
    /\beval\s*\(/,
  );

  assert.doesNotMatch(
    browserSource,
    /\bnew\s+Function\s*\(/,
  );

  assert.doesNotMatch(
    browserSource,
    /\bset(?:Timeout|Interval)\s*\(\s*['"]/,
  );

  assert.doesNotMatch(
    adminViews,
    /<script\b(?![^>]*\bsrc\s*=)/i,
  );

  assert.doesNotMatch(
    adminViews,
    /<style\b/i,
  );
});

test('STARS-010B1 preserves the audited external admin resource dependencies', () => {
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
