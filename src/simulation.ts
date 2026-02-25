import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { Transaction, Metrics, SimulationState } from './types';
import { SmartRouter } from './smartRouter';
import { HealthTracker } from './healthTracker';
import {
  processTransaction,
  PROCESSOR_IDS,
  MAX_COST,
  PROCESSOR_CONFIGS,
} from './processors';

const TX_INTERVAL_MS = 350; // ~3 transactions per second
const MAX_STORED_TRANSACTIONS = 100;
const TPS_WINDOW_MS = 5_000;

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
    return this.recentTransactions.slice(0, 20);
  }

  getMetrics(): Metrics {
    return { ...this.metrics };
  }

  private fireTransaction(): void {
    const amount = randomAmount();
    this.runTransaction(amount).catch(() => {/* swallow individual errors */});
  }

  private async runTransaction(amount: number): Promise<void> {
    const processorId = this.router.selectProcessor();
    if (!processorId) return;

    const result = await processTransaction(processorId, amount);
    this.tracker.recordEvent(processorId, result.status, result.latencyMs);

    const processorCost = PROCESSOR_CONFIGS.find((p) => p.id === processorId)?.costPerTransaction ?? 0;
    const costSaved = MAX_COST - processorCost;

    const tx: Transaction = {
      id: randomUUID(),
      processorId,
      amount,
      status: result.status,
      latencyMs: result.latencyMs,
      timestamp: Date.now(),
      costSaved,
    };

    this.storeTransaction(tx);
    this.updateMetrics(tx);

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

  private updateMetrics(tx: Transaction): void {
    this.metrics.totalTransactions++;

    if (tx.status === 'success') {
      this.metrics.successfulTransactions++;
    } else {
      this.metrics.failedTransactions++;
    }

    this.metrics.totalCostSaved += tx.costSaved;

    // Exponential moving average for latency
    const alpha = 0.1;
    this.metrics.avgLatencyMs =
      this.metrics.totalTransactions === 1
        ? tx.latencyMs
        : Math.round(this.metrics.avgLatencyMs * (1 - alpha) + tx.latencyMs * alpha);

    // TPS calculation over a rolling 5-second window
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
    failedTransactions: 0,
    totalCostSaved: 0,
    avgLatencyMs: 0,
    transactionsPerSecond: 0,
  };
}

function randomAmount(): number {
  // Random amount between $1.00 and $100.00 (in cents)
  return Math.round(Math.random() * 9900 + 100);
}
