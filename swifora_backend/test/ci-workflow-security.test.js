const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workflowPath = path.join(
  __dirname,
  '..',
  '..',
  '.github',
  'workflows',
  'ci.yml',
);

const workflow = fs.readFileSync(
  workflowPath,
  'utf8',
).replace(/\r\n?/g, '\n');

test(
  'CI runs on pushes pull requests and manual dispatch without privileged triggers',
  () => {
    assert.match(
      workflow,
      /^on:\n  push:\n  pull_request:\n  workflow_dispatch:\s*$/m,
    );

    assert.doesNotMatch(
      workflow,
      /\bpull_request_target\s*:/,
    );

    assert.doesNotMatch(
      workflow,
      /\bworkflow_run\s*:/,
    );
  },
);

test(
  'CI grants only repository read permission',
  () => {
    assert.match(
      workflow,
      /^permissions:\n  contents: read\s*$/m,
    );

    assert.doesNotMatch(
      workflow,
      /^\s+[A-Za-z_-]+:\s*write\s*$/m,
    );
  },
);

test(
  'CI cancels superseded runs for the same workflow ref',
  () => {
    assert.match(
      workflow,
      /^concurrency:\n  group: ci-\$\{\{ github\.workflow \}\}-\$\{\{ github\.ref \}\}\n  cancel-in-progress: true$/m,
    );
  },
);

test(
  'CI uses pinned Ubuntu runner families and bounded timeouts',
  () => {
    assert.equal(
      (
        workflow.match(
          /runs-on: ubuntu-24\.04/g,
        ) || []
      ).length,
      2,
    );

    assert.match(
      workflow,
      /timeout-minutes: 15/,
    );

    assert.match(
      workflow,
      /timeout-minutes: 20/,
    );
  },
);

test(
  'every external action is pinned to an immutable full commit SHA',
  () => {
    const useLines = workflow
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith('uses:'));

    assert.equal(
      useLines.length,
      4,
    );

    for (const line of useLines) {
      assert.match(
        line,
        /^uses:\s+[^@\s]+@[0-9a-f]{40}(?:\s+#\s+v[0-9.]+)?$/,
      );
    }

    assert.equal(
      (
        workflow.match(
          /actions\/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1/g,
        ) || []
      ).length,
      2,
    );

    assert.match(
      workflow,
      /actions\/setup-node@820762786026740c76f36085b0efc47a31fe5020/,
    );

    assert.match(
      workflow,
      /subosito\/flutter-action@1a449444c387b1966244ae4d4f8c696479add0b2/,
    );
  },
);

test(
  'checkout credentials are never persisted',
  () => {
    assert.equal(
      (
        workflow.match(
          /persist-credentials: false/g,
        ) || []
      ).length,
      2,
    );
  },
);

test(
  'backend CI pins Node and disables setup-node package-manager caching',
  () => {
    assert.match(
      workflow,
      /node-version: '24\.13\.1'/,
    );

    assert.match(
      workflow,
      /package-manager-cache: false/,
    );

    assert.match(
      workflow,
      /working-directory: swifora_backend\n\s+run: npm ci/,
    );
  },
);

test(
  'backend CI enforces lockfile syntax tests and high-severity dependency audit',
  () => {
    assert.match(
      workflow,
      /git diff --exit-code -- swifora_backend\/package-lock\.json/,
    );

    assert.match(
      workflow,
      /run: npm run check/,
    );

    assert.match(
      workflow,
      /run: npm test/,
    );

    assert.match(
      workflow,
      /run: npm run test:integration/,
    );

    assert.match(
      workflow,
      /npm audit --omit=dev --audit-level=high/,
    );
  },
);

test(
  'Flutter CI pins the approved stable toolchain without dependency caches',
  () => {
    assert.match(
      workflow,
      /flutter-version: '3\.47\.4'/,
    );

    assert.match(
      workflow,
      /channel: stable/,
    );

    assert.match(
      workflow,
      /cache: false/,
    );

    assert.match(
      workflow,
      /pub-cache: false/,
    );
  },
);

test(
  'Flutter CI resolves from the tracked lockfile and runs the complete test suite',
  () => {
    assert.match(
      workflow,
      /run: flutter pub get/,
    );

    assert.match(
      workflow,
      /git diff --exit-code -- pubspec\.lock/,
    );

    assert.match(
      workflow,
      /run: flutter test/,
    );
  },
);

test(
  'Flutter analyzer gate preserves exactly the approved non-error baseline',
  () => {
    assert.match(
      workflow,
      /\[ "\$ANALYZE_RC" -ne 1 \]/,
    );

    assert.match(
      workflow,
      /\[ "\$ANALYZE_COUNT" != "12" \]/,
    );

    assert.match(
      workflow,
      /\[ "\$ANALYZE_ERRORS" != "0" \]/,
    );

    assert.match(
      workflow,
      /issues found\\\./,
    );

    assert.match(
      workflow,
      /error\[\[:space:\]\]\+\-/,
    );
  },
);

test(
  'CI requires no deployment secrets and never attempts release signing or deployment',
  () => {
    assert.doesNotMatch(
      workflow,
      /\$\{\{\s*secrets\./,
    );

    assert.doesNotMatch(
      workflow,
      /\bflutter build\b/,
    );

    assert.doesNotMatch(
      workflow,
      /\bassembleRelease\b|\bbundleRelease\b/,
    );

    assert.doesNotMatch(
      workflow,
      /key\.properties|keystore|PROVIDER_DOCUMENTS_DIR|SMTP_PASS|JWT_SECRET|SESSION_SECRET/,
    );
  },
);
