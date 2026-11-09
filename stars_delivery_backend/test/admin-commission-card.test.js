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
