import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { Processor, Transaction, TransactionStatus, ProcessorHealth } from './types';
import { HealthTracker } from './healthTracker';
import { SmartRouter } from './smartRouter';

function generateId(): string {
  return randomUUID();
}

export const PROCESSORS: Processor[] = [
  { id: 'veloce',   name: 'Veloce Card Gateway', feePercent: 2.1, enabled: true },
  { id: 'pagorp',   name: 'PagoRapido',           feePercent: 1.8, enabled: true },
  { id: 'meridian', name: 'Meridian Processor',   feePercent: 2.5, enabled: true },
];

const CURRENCIES = ['MXN', 'BRL', 'COP', 'ARS', 'CLP'];

interface ProcessorBehavior {
  approvedRate: number;
  declinedRate: number;
  errorRate: number;
  minResponseMs: number;
  maxResponseMs: number;
}

const NORMAL_BEHAVIOR: ProcessorBehavior = {
  approvedRate: 0.85,
  declinedRate: 0.10,
  errorRate: 0.05,
  minResponseMs: 80,
  maxResponseMs: 400,
};

const DEGRADED_BEHAVIOR: ProcessorBehavior = {
  approvedRate: 0.55,
  declinedRate: 0.10,
  errorRate: 0.35,
  minResponseMs: 3000,
  maxResponseMs: 8000,
};

export class TransactionSimulator extends EventEmitter {
  private running = false;
  private tickHandle: ReturnType<typeof setInterval> | null = null;
  private degradedProcessors = new Set<string>();
  private recentTransactions: Transaction[] = [];
  private readonly maxRecent = 100;

  constructor(
    private readonly healthTracker: HealthTracker,
    private readonly smartRouter: SmartRouter
  ) {
    super();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    // Tick every 100ms — emit 1-2 transactions per tick (~10-20/sec)
    this.tickHandle = setInterval(() => this.tick(), 100);
    this.emit('stateChange', { running: true });
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.tickHandle) {
      clearInterval(this.tickHandle);
      this.tickHandle = null;
    }
    this.emit('stateChange', { running: false });
  }

  degrade(processorId: string): void {
    this.degradedProcessors.add(processorId);
    this.emit('stateChange', { degraded: [...this.degradedProcessors] });
  }

  recover(processorId: string): void {
    this.degradedProcessors.delete(processorId);
    this.emit('stateChange', { degraded: [...this.degradedProcessors] });
  }

  isRunning(): boolean { return this.running; }
  getDegradedProcessors(): string[] { return [...this.degradedProcessors]; }
  getRecentTransactions(): Transaction[] { return [...this.recentTransactions]; }

  // ── Private ──────────────────────────────────────────────────────────────

  private tick(): void {
    const count = Math.random() < 0.5 ? 1 : 2;
    for (let i = 0; i < count; i++) {
      this.simulateTransaction();
    }
  }

  private simulateTransaction(): void {
    // Build a health map for the router
    const healthMap = new Map<string, ProcessorHealth>(
      PROCESSORS.map((p) => [p.id, this.healthTracker.getHealth(p)])
    );

    const processor = this.smartRouter.selectProcessor(PROCESSORS, healthMap);
    if (!processor) return; // all processors down

    const behavior = this.degradedProcessors.has(processor.id)
      ? DEGRADED_BEHAVIOR
      : NORMAL_BEHAVIOR;

    const responseTimeMs = this.randomBetween(behavior.minResponseMs, behavior.maxResponseMs);
    const status = this.pickStatus(behavior);
    const amount = this.randomBetween(100, 15000);
    const currency = CURRENCIES[Math.floor(Math.random() * CURRENCIES.length)];
    const fee = parseFloat(((amount * processor.feePercent) / 100).toFixed(2));

    const tx: Transaction = {
      id: generateId(),
      processorId: processor.id,
      processorName: processor.name,
      amount: parseFloat(amount.toFixed(2)),
      currency,
      status,
      responseTimeMs: Math.round(responseTimeMs),
      timestamp: Date.now(),
      fee,
    };

    // Record in health tracker
    this.healthTracker.record(processor.id, status, responseTimeMs);

    // Add to recent transactions (cap at maxRecent)
    this.recentTransactions.unshift(tx);
    if (this.recentTransactions.length > this.maxRecent) {
      this.recentTransactions.pop();
    }

    this.emit('transaction', tx);
  }

  private pickStatus(behavior: ProcessorBehavior): TransactionStatus {
    const r = Math.random();
    if (r < behavior.approvedRate) return 'approved';
    if (r < behavior.approvedRate + behavior.declinedRate) return 'declined';
    return 'error';
  }

  private randomBetween(min: number, max: number): number {
    return min + Math.random() * (max - min);
  }
}
