import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatNumber } from '../src/ui/format';

test('plain below 1,000', () => {
  assert.equal(formatNumber(0), '0');
  assert.equal(formatNumber(4.5), '4.5');
  assert.equal(formatNumber(67.5), '67');
  assert.equal(formatNumber(999.9), '999');
});

test('suffixes with 3 significant digits, never rounding up', () => {
  assert.equal(formatNumber(1_000), '1K');
  assert.equal(formatNumber(1_234), '1.23K');
  assert.equal(formatNumber(12_345), '12.3K');
  assert.equal(formatNumber(999_999), '999K');
  assert.equal(formatNumber(2_500_000), '2.5M');
  assert.equal(formatNumber(7e9), '7B');
  assert.equal(formatNumber(3.21e12), '3.21T');
  assert.equal(formatNumber(1e15), '1aa');
  assert.equal(formatNumber(1e18), '1ab');
  assert.equal(formatNumber(1e93), '1ba');
});

test('scientific notation option', () => {
  assert.equal(formatNumber(123_456, true), '1.23e5');
  assert.equal(formatNumber(12, true), '12');
});
