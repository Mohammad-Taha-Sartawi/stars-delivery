const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

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

function region(
  text,
  startMarker,
  endMarker,
) {
  const start =
    text.indexOf(startMarker);

  assert.ok(
    start >= 0,
    `missing start marker: ${startMarker}`,
  );

  const end =
    text.indexOf(
      endMarker,
      start + startMarker.length,
    );

  assert.ok(
    end > start,
    `missing end marker: ${endMarker}`,
  );

  return text.slice(
    start,
    end,
  );
}

test(
  'customer block/reactivation rotates generation atomically only on real state changes',
  () => {
    const text =
      source(
        'src/routes/adminUsers.js',
      );

    const route =
      region(
        text,
        "router.put('/:id/status'",
        "router.put('/:id/password'",
      );

    assert.match(
      route,
      /const statusChanged\s*=\s*user\.status !== newStatus/,
    );

    assert.match(
      route,
      /if \(statusChanged\)[\s\S]*mobileSessionRotationFilter\(user\)/,
    );

    assert.match(
      route,
      /\$set:\s*\{\s*status:\s*newStatus/,
    );

    assert.match(
      route,
      /\$inc:\s*\{\s*sessionVersion:\s*1/,
    );

    assert.match(
      route,
      /rotation\.matchedCount !== 1/,
    );

    assert.match(
      route,
      /statusChanged[\s\S]*newStatus === 'blocked'[\s\S]*disconnectSockets\(true\)/,
    );

    assert.match(
      route,
      /const shouldDisconnect\s*=[\s\S]*statusChanged[\s\S]*newStatus === 'blocked'/,
    );

    assert.match(
      route,
      /try\s*\{[\s\S]*if \(statusChanged\)[\s\S]*Notification\.create/,
    );

    assert.match(
      route,
      /\}\s*finally\s*\{[\s\S]*if \(shouldDisconnect\)[\s\S]*disconnectSockets\(true\)/,
    );

    assert.doesNotMatch(
      route,
      /await user\.save\(\)/,
    );
  },
);

test(
  'provider block/reactivation uses the same generation-rotation boundary',
  () => {
    const text =
      source(
        'src/routes/adminDrivers.js',
      );

    const route =
      region(
        text,
        "router.put('/:id/status'",
        "router.put('/:id/password'",
      );

    assert.match(
      route,
      /const statusChanged\s*=\s*driver\.status !== newStatus/,
    );

    assert.match(
      route,
      /if \(statusChanged\)[\s\S]*mobileSessionRotationFilter\(driver\)/,
    );

    assert.match(
      route,
      /\$set:\s*\{\s*status:\s*newStatus/,
    );

    assert.match(
      route,
      /\$inc:\s*\{\s*sessionVersion:\s*1/,
    );

    assert.match(
      route,
      /rotation\.matchedCount !== 1/,
    );

    assert.match(
      route,
      /statusChanged[\s\S]*newStatus === 'blocked'[\s\S]*disconnectSockets\(true\)/,
    );

    assert.match(
      route,
      /const shouldDisconnect\s*=[\s\S]*statusChanged[\s\S]*newStatus === 'blocked'/,
    );

    assert.match(
      route,
      /try\s*\{[\s\S]*if \(statusChanged\)[\s\S]*Notification\.create/,
    );

    assert.match(
      route,
      /\}\s*finally\s*\{[\s\S]*if \(shouldDisconnect\)[\s\S]*disconnectSockets\(true\)/,
    );

    assert.doesNotMatch(
      route,
      /await driver\.save\(\)/,
    );
  },
);

for (const [label, file, regionEnd, role] of [
  ['customer', 'src/routes/adminUsers.js', 'module.exports = router;', "account.role !== 'customer'"],
  ['provider', 'src/routes/adminDrivers.js', '// Pending Provider Signups', "account.role !== 'provider'"],
]) {
  test(
    `${label} permanent delete removes the account and disconnects sockets`,
    () => {
      const route =
        region(
          source(file),
          "router.delete('/:id'",
          regionEnd,
        );

      assert.ok(route.includes(role));
      assert.match(
        route,
        /await permanentlyDeleteAccount\(account, \{ io: req\.app\.get\('io'\) \}\)/,
      );
      // An order in progress blocks the delete with a clear message.
      assert.match(route, /AccountDeletionBlockedError/);

      const service = source('src/services/accountDeletion.js');
      // Every device is told and disconnected before the account goes.
      assert.match(
        service,
        /try\s*\{[\s\S]*account_deleted[\s\S]*\}\s*finally\s*\{[\s\S]*disconnectSockets\(true\)/,
      );
      // The account document itself is removed (its sessions then fail auth).
      assert.match(service, /await User\.deleteOne\(\{ _id: user\._id \}\)/);
      assert.match(service, /PushToken\.deleteMany\(\{ userId: user\._id \}\)/);
      assert.match(service, /IN_PROGRESS_STATUSES = \['accepted', 'fulfilling'\]/);
    },
  );
}

test(
  'pending-provider approval remains onboarding rather than session revocation',
  () => {
    const drivers =
      source(
        'src/routes/adminDrivers.js',
      );

    const approval =
      region(
        drivers,
        "router.post('/pending/:id/approve'",
        "router.delete('/pending/:id/reject'",
      );

    assert.match(
      approval,
      /status:\s*'active'/,
    );

    assert.match(
      approval,
      /providerDocuments:\s*\(pending\.providerDocuments \|\| \[\]\)/,
    );

    assert.match(
      approval,
      /PendingProvider\s*\.deleteOne/,
    );

    assert.match(
      approval,
      /executeTransaction/,
    );

    assert.doesNotMatch(
      approval,
      /findByIdAndDelete/,
    );

    assert.doesNotMatch(
      approval,
      /mobileSessionRotationFilter/,
    );

    assert.doesNotMatch(
      approval,
      /sessionVersion/,
    );

    const auth =
      source(
        'src/routes/auth.js',
      );

    const providerStart =
      auth.indexOf(
        "if (role === 'provider')",
      );

    const customerStart =
      auth.indexOf(
        '// Customers register immediately',
        providerStart,
      );

    assert.ok(providerStart >= 0);
    assert.ok(customerStart > providerStart);

    const providerRegistration =
      auth.slice(
        providerStart,
        customerStart,
      );

    assert.match(
      providerRegistration,
      /PendingProvider\.create/,
    );

    assert.match(
      providerRegistration,
      /pending:\s*true/,
    );

    assert.doesNotMatch(
      providerRegistration,
      /jwt\.sign/,
    );
  },
);

test(
  'order blockedUntil remains an operational reservation state and never rotates auth generation',
  () => {
    const lifecycle =
      source(
        'src/services/orderLifecycle.js',
      );

    assert.match(
      lifecycle,
      /blockedUntil/,
    );

    assert.doesNotMatch(
      lifecycle,
      /sessionVersion/,
    );
  },
);
