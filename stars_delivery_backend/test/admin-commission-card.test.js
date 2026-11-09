const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const backendRoot = path.resolve(__dirname, '..');

function source(file) {
  return fs.readFileSync(path.join(backendRoot, file), 'utf8');
}

test('platform commission card shows a clear shekel amount without percentages', () => {
  const index = source('src/views/admin/index.ejs');
  const main = source('src/public/js/main.js');
  const css = source('src/public/css/style.css');

  const card = index.match(
    /<div class="commission-item total-commission">[\s\S]*?<\/div><\/div>/,
  );
  assert.ok(card, 'the platform commission card must exist');
  assert.match(card[0], /id="totalCommission"/);
  assert.match(card[0], /class="currency">شيكل<\/span>/);
  assert.match(card[0], /fa-coins/);
  assert.doesNotMatch(card[0], /%/);
  assert.doesNotMatch(card[0], /fa-percent/);
  assert.doesNotMatch(card[0], /badge-trend/);

  assert.match(main, /toLocaleString\('en-US'\)/);
  assert.match(css, /\.commission-item\.total-commission/);
  assert.match(css, /\.commission-item\.total-commission \.currency/);
});


test('top driver card shows the full registered name without truncation', () => {
  const index = source('src/views/admin/index.ejs');
  const main = source('src/public/js/main.js');
  const css = source('src/public/css/style.css');

  const card = index.match(
    /<div class="commission-item top-driver"[\s\S]*?<\/div><\/div>/,
  );
  assert.ok(card, 'the top driver card must exist');
  assert.match(card[0], /class="driver-name" id="topDriver"/);
  assert.match(card[0], /id="topDriverEarn"/);
  assert.match(card[0], /شيكل/);
  assert.doesNotMatch(card[0], /badge-trend/);

  const nameRule = css.match(
    /\.commission-item\.top-driver \.driver-name \{[^}]+\}/,
  );
  assert.ok(nameRule, 'the top driver name rule must exist');
  assert.match(nameRule[0], /white-space: normal/);
  assert.match(nameRule[0], /overflow-wrap: anywhere/);
  assert.doesNotMatch(nameRule[0], /ellipsis/);

  assert.match(main, /topDriverEarn/);
  assert.match(main, /toLocaleString\('en-US'\)/);
});


test('pending payout card uses clear wording and real unpaid commissions', () => {
  const index = source('src/views/admin/index.ejs');
  const main = source('src/public/js/main.js');
  const css = source('src/public/css/style.css');
  const adminApi = source('src/routes/adminApi.js');

  const card = index.match(
    /<div class="commission-item pending-payout"[\s\S]*?<\/div><\/div>/,
  );
  assert.ok(card, 'the pending payout card must exist');
  assert.match(card[0], /السائقون المستحقون للدفع/);
  assert.doesNotMatch(card[0], /للصرف/);
  assert.match(card[0], /id="pendingDrivers"/);
  assert.match(card[0], /id="pendingAmount"/);
  assert.match(card[0], /شيكل/);
  assert.doesNotMatch(card[0], /badge-trend/);

  assert.match(css, /\.commission-item\.pending-payout \.payout-count/);
  assert.match(css, /\.commission-item\.pending-payout \.payout-amount/);

  assert.match(main, /pendingAmount/);
  assert.match(main, /toLocaleString\('en-US'\)/);

  // The card now reflects unpaid driver commissions, not blocked users or
  // pending order prices.
  assert.match(adminApi, /provider\.commissionPaid': \{ \$ne: true \}/);
  assert.match(adminApi, /unpaid: \{ \$sum: '\$platformCommission' \}/);
  assert.match(adminApi, /unpaid: \{ \$gt: 0 \}/);
  assert.doesNotMatch(adminApi, /pendingDrivers: totalBlocked/);
});


test('paying dues is available from the dashboard card and driver details', () => {
  const index = source('src/views/admin/index.ejs');
  const main = source('src/public/js/main.js');
  const adminDrivers = source('src/routes/adminDrivers.js');

  const card = index.match(
    /<div class="commission-item pending-payout"[\s\S]*?<\/div><\/div>/,
  );
  assert.ok(card, 'the pending payout card must exist');
  assert.match(card[0], /data-admin-action="openListModal"/);
  assert.match(card[0], /data-admin-arg-1="payouts"/);

  // Clicking the card lists every driver with unpaid dues and a pay action.
  assert.match(main, /type === 'payouts'/);
  assert.match(main, /adminFetch\('\/admin\/commissions'\)/);
  assert.match(main, /driver\.paymentStatus !== 'paid'/);
  assert.match(main, /Number\(driver\.commission\) > 0/);
  assert.match(main, /تم دفع المستحقات/);
  assert.match(main, /loadDashboardStats\(\)/);

  // The same action is present in the driver details panel.
  assert.match(main, /isPaid[\s\S]*تم دفع المستحقات/);
  assert.match(main, /action="markPaid"/);

  // Driver search reports the real payment status.
  assert.match(
    adminDrivers,
    /paymentStatus: match\.commissionPaid === true \? 'paid' : 'unpaid'/,
  );
});
