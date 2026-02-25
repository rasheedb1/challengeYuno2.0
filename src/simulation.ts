import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { Transaction, Metrics, SimulationState, EventType } from './types';
import { SmartRouter } from './smartRouter';
import { HealthTracker } from './healthTracker';
import {
  processTransaction,
  PROCESSOR_IDS,
  PROCESSOR_CONFIGS,
  MAX_COST,
} from './processors';

const TX_INTERVAL_MS = 350; // ~3 transactions per second
const MAX_STORED_TRANSACTIONS = 500;
const TPS_WINDOW_MS = 5_000;

// Ticket price range: $10–$300 USD
const MIN_AMOUNT_CENTS = 1_000;
const MAX_AMOUNT_CENTS = 30_000;

// Seed data: 500 historical transactions on init so the dashboard is populated on first load
const SEED_COUNT = 500;
const SEED_WINDOW_MS = 5 * 60 * 1_000; // spread over the last 5 minutes

// Realistic seed distribution (per challenge acceptance criteria)
// ~82% approved, ~10% declined, ~5% error, ~3% timeout
const SEED_DIST = { timeout: 0.03, error: 0.05, declined: 0.10 };

export class Simulation extends EventEmitter {
  private running = false;
  private startTime: number | null = null;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private readonly recentTransactions: Transaction[] = [];
  private metrics: Metrics = emptyMetrics();
  private tpsWindowStart = Date.now();
  private tpsWindowCount = 0;

  constructor(
    private readonly router: SmartRouter,
    private readonly tracker: HealthTracker,
  ) {
    super();
    this.seedHistoricalData();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.startTime = Date.now();
    this.emitSimulationState();
    this.intervalHandle = setInterval(() => this.fireTransaction(), TX_INTERVAL_MS);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    this.emitSimulationState();
  }

  isRunning(): boolean {
    return this.running;
  }

  getRecentTransactions(): Transaction[] {
    return this.recentTransactions.slice(0, 100);
  }

  getMetrics(): Metrics {
    return { ...this.metrics };
  }

  // ── Seed historical data ──────────────────────────────────────────────────

  /**
   * Generate 500 historical transactions spread over the last 5 minutes.
   * Populates the transaction feed and aggregate metrics immediately on server start
   * so the dashboard shows meaningful data before the simulation is started.
   * Also replays recent events into the health tracker so processor cards show data.
   */
  private seedHistoricalData(): void {
    const now = Date.now();
    const trackerWindowMs = this.tracker.getConfig().windowSizeMs;
    const seeds: Transaction[] = [];

    for (let i = 0; i < SEED_COUNT; i++) {
      const age = Math.random() * SEED_WINDOW_MS;
      const timestamp = now - age;

      // Round-robin processors weighted slightly toward cheaper one
      const processorId = PROCESSOR_IDS[Math.floor(Math.random() * PROCESSOR_IDS.length)];
      const config = PROCESSOR_CONFIGS.find((p) => p.id === processorId)!;
      const amount = randomAmount();

      const status = pickSeedStatus();
      const jitter = Math.random() * config.baseLatencyMs * 0.4;
      const latencyMs =
        status === 'timeout'
          ? 3000
          : Math.round(config.baseLatencyMs + jitter);

      const feeBps = config.costPerTransaction;
      const costSavedBps = MAX_COST - feeBps;
      const costSavedUsd =
        status === 'success' ? (costSavedBps / 10_000) * (amount / 100) : 0;

      const tx: Transaction = {
        id: randomUUID(),
        processorId,
        amount,
        status,
        latencyMs,
        timestamp,
        feeBps,
        costSavedBps,
      };

      seeds.push(tx);
      this.updateMetrics(tx, costSavedUsd);

      // Replay into health tracker for events within the tracker window
      // so processor health cards show data on first load.
      if (age <= trackerWindowMs) {
        this.tracker.recordEvent(processorId, status, latencyMs);
      }
    }

    // Sort newest-first for display
    seeds.sort((a, b) => b.timestamp - a.timestamp);
    for (const tx of seeds) {
      this.recentTransactions.push(tx);
    }
  }

  // ── Live transaction loop ─────────────────────────────────────────────────

  private fireTransaction(): void {
    const amount = randomAmount();
    this.runTransaction(amount).catch(() => {/* swallow individual errors */});
  }

  private async runTransaction(amount: number): Promise<void> {
    const processorId = this.router.selectProcessor();
    if (!processorId) return;

    const result = await processTransaction(processorId, amount);
    this.tracker.recordEvent(processorId, result.status, result.latencyMs);

    const config = PROCESSOR_CONFIGS.find((p) => p.id === processorId);
    const feeBps = config?.costPerTransaction ?? 0;
    const costSavedBps = MAX_COST - feeBps;
    const costSavedUsd =
      result.status === 'success' ? (costSavedBps / 10_000) * (amount / 100) : 0;

    const tx: Transaction = {
      id: randomUUID(),
      processorId,
      amount,
      status: result.status,
      latencyMs: result.latencyMs,
      timestamp: Date.now(),
      feeBps,
      costSavedBps,
    };

    this.storeTransaction(tx);
    this.updateMetrics(tx, costSavedUsd);

    this.emit('transaction', tx);
    this.emit('health', this.tracker.getAllHealth(PROCESSOR_IDS));
    this.emit('metrics', this.getMetrics());
  }

  private storeTransaction(tx: Transaction): void {
    this.recentTransactions.unshift(tx);
    if (this.recentTransactions.length > MAX_STORED_TRANSACTIONS) {
      this.recentTransactions.pop();
    }
  }

  private updateMetrics(tx: Transaction, costSavedUsd: number): void {
    this.metrics.totalTransactions++;

    if (tx.status === 'success') {
      this.metrics.successfulTransactions++;
    } else if (tx.status === 'declined') {
      this.metrics.declinedTransactions++;
    } else {
      // error | timeout — technical failures
      this.metrics.failedTransactions++;
    }

    // Auth rate = approved / total (business metric, per challenge definition)
    this.metrics.authRate =
      this.metrics.totalTransactions > 0
        ? this.metrics.successfulTransactions / this.metrics.totalTransactions
        : 0;

    this.metrics.totalCostSavedUsd += costSavedUsd;

    // Exponential moving average for latency
    const alpha = 0.1;
    this.metrics.avgLatencyMs =
      this.metrics.totalTransactions === 1
        ? tx.latencyMs
        : Math.round(this.metrics.avgLatencyMs * (1 - alpha) + tx.latencyMs * alpha);

    // TPS over a rolling 5-second window
    const now = Date.now();
    this.tpsWindowCount++;
    if (now - this.tpsWindowStart >= TPS_WINDOW_MS) {
      this.metrics.transactionsPerSecond =
        Math.round((this.tpsWindowCount / TPS_WINDOW_MS) * 1000 * 10) / 10;
      this.tpsWindowCount = 0;
      this.tpsWindowStart = now;
    }
  }

  private emitSimulationState(): void {
    const state: SimulationState = { running: this.running, startTime: this.startTime };
    this.emit('simulation', state);
  }
}

function emptyMetrics(): Metrics {
  return {
    totalTransactions: 0,
    successfulTransactions: 0,
    declinedTransactions: 0,
    failedTransactions: 0,
    authRate: 0,
    totalCostSavedUsd: 0,
    avgLatencyMs: 0,
    transactionsPerSecond: 0,
  };
}

function randomAmount(): number {
  return Math.round(Math.random() * (MAX_AMOUNT_CENTS - MIN_AMOUNT_CENTS) + MIN_AMOUNT_CENTS);
}

/** Pick a transaction status matching the realistic seed distribution. */
function pickSeedStatus(): EventType {
  const r = Math.random();
  if (r < SEED_DIST.timeout)                               return 'timeout';
  if (r < SEED_DIST.timeout + SEED_DIST.error)            return 'error';
  if (r < SEED_DIST.timeout + SEED_DIST.error + SEED_DIST.declined) return 'declined';
  return 'success';
}
