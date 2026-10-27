import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calibrationFrom, describeLatency } from '../src/ui/calibrate';
import { clampLatency, LATENCY_MAX_MS } from '../src/ui/storage';

test('calibration takes the average lag of the taps that agree, dropping slips', () => {
  // Seven taps around 60 ms late and one slip 200 ms early.
  assert.equal(calibrationFrom([55, 62, 58, 64, 60, -200, 61, 60], 0), 60);
});

test('calibration made while the music already played early adds that back on', () => {
  // Already 40 ms early; taps still land 20 ms late, so the true lag is 60.
  assert.equal(calibrationFrom([20, 20, 21, 19, 20, 20, 20, 20], 40), 60);
  // Over-corrected: taps now 10 ms early, so back it off.
  assert.equal(calibrationFrom([-10, -10, -10, -10, -10, -10, -10, -10], 40), 30);
});

test('scattered taps are not trusted, and wild numbers are clamped', () => {
  assert.equal(calibrationFrom([0, 200, -200, 100, -100, 150, -150, 250], 0), null);
  assert.equal(calibrationFrom([280, 280, 280, 280, 280, 280, 280, 280], 100), LATENCY_MAX_MS);
  assert.equal(clampLatency(Number.NaN), 0);
});

test('the result reads plainly', () => {
  assert.equal(describeLatency(42), '42 ms late');
  assert.equal(describeLatency(-15), '15 ms early');
  assert.equal(describeLatency(3), 'right on the beat');
});
