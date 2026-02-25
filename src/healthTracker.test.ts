/**
 * Unit tests for HealthTracker.
 * Run with: npm test
 */
import assert from 'node:assert';
import { HealthTracker } from './healthTracker.js';

const IDS = ['proc-a'];
let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ✓  ${name}`);
    passed++;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`  ✗  ${name}\n     ${msg}`);
    failed++;
  }
}

// ── Test 1: Empty health ───────────────────────────────────────────────────────
test('empty health returns status "healthy" with score 100', () => {
  const tracker = new HealthTracker(IDS);
  const h = tracker.getHealth('proc-a');
  assert.strictEqual(h.status, 'healthy', `expected healthy, got ${h.status}`);
  assert.strictEqual(h.score, 100, `expected score 100, got ${h.score}`);
  assert.strictEqual(h.totalRequests, 0);
});

// ── Test 2: All errors → down ─────────────────────────────────────────────────
test('all-error events cause status "down"', () => {
  const tracker = new HealthTracker(IDS, { minSamples: 3 });
  for (let i = 0; i < 10; i++) tracker.recordEvent('proc-a', 'error', 100);
  const h = tracker.getHealth('proc-a');
  assert.strictEqual(h.status, 'down', `expected down, got ${h.status}`);
  assert.ok(h.errorRate > 0.9, `errorRate should be >0.9, got ${h.errorRate}`);
});

// ── Test 3: Declined events do NOT degrade technical health ───────────────────
test('declined events do not affect technical availability (routing health)', () => {
  const tracker = new HealthTracker(IDS, { minSamples: 3 });
  // 50% declined, 50% success → no errors/timeouts → should stay healthy
  for (let i = 0; i < 10; i++) tracker.recordEvent('proc-a', 'declined', 150);
  for (let i = 0; i < 10; i++) tracker.recordEvent('proc-a', 'success',  150);
  const h = tracker.getHealth('proc-a');
  assert.strictEqual(h.status, 'healthy', `expected healthy, got ${h.status}`);
  assert.ok(h.declineRate >= 0.4 && h.declineRate <= 0.6,
    `declineRate should be ~0.5, got ${h.declineRate}`);
});

// ── Test 4: High latency reduces score ────────────────────────────────────────
test('high latency lowers score below 100', () => {
  const tracker = new HealthTracker(IDS, { minSamples: 3 });
  for (let i = 0; i < 10; i++) tracker.recordEvent('proc-a', 'success', 2500);
  const h = tracker.getHealth('proc-a');
  assert.ok(h.score < 100, `score should be <100 with high latency, got ${h.score}`);
  assert.ok(h.score > 60,  `score should be >60, got ${h.score}`);
  assert.strictEqual(h.status, 'healthy');
});

// ── Test 5: Mixed errors cause degraded status ────────────────────────────────
test('~15% errors cause "degraded" status', () => {
  const tracker = new HealthTracker(IDS, { minSamples: 3 });
  // 85 success + 15 error = 15% error rate → below 92% threshold → degraded
  for (let i = 0; i < 85; i++) tracker.recordEvent('proc-a', 'success', 100);
  for (let i = 0; i < 15; i++) tracker.recordEvent('proc-a', 'error',   100);
  const h = tracker.getHealth('proc-a');
  assert.ok(
    h.status === 'degraded' || h.status === 'down',
    `expected degraded or down, got ${h.status}`
  );
});

// ── Report ────────────────────────────────────────────────────────────────────
console.log(`\nHealthTracker: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
