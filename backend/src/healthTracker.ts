import {
  Processor,
  ProcessorHealth,
  ProcessorStatus,
  TransactionRecord,
  TransactionStatus,
  HealthThresholds,
} from './types';

const DEFAULT_THRESHOLDS: HealthThresholds = {
  degradedErrorRate: 0.10,
  downErrorRate: 0.30,
  degradedResponseTimeMs: 2000,
  downResponseTimeMs: 5000,
};

// 15-second window enables status changes within 5-10 seconds of degradation
const WINDOW_MS = 15_000;

// Require at least this many records before making health judgments to avoid
// false positives from statistical noise on very low-traffic windows.
const MIN_SAMPLES = 8;

// Number of recent events evaluated in addition to the full window for
// rapid detection of sudden degradation spikes.
const RAPID_SAMPLE_SIZE = 8;

export class HealthTracker {
  private records = new Map<string, TransactionRecord[]>();
  private thresholds: HealthThresholds;

  constructor(thresholds: Partial<HealthThresholds> = {}) {
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
  }

  /** Record a completed transaction outcome for a processor. */
  record(processorId: string, status: TransactionStatus, responseTimeMs: number): void {
    if (!this.records.has(processorId)) {
      this.records.set(processorId, []);
    }
    const entry: TransactionRecord = {
      timestamp: Date.now(),
      status,
      responseTimeMs,
    };
    this.records.get(processorId)!.push(entry);
    this.pruneOldRecords(processorId);
  }

  /** Get health snapshot for a single processor. */
  getHealth(processor: Processor): ProcessorHealth {
    const window = this.getWindow(processor.id);

    if (window.length === 0) {
      return {
        id: processor.id,
        name: processor.name,
        feePercent: processor.feePercent,
        status: 'healthy',
        successRate: 1,
        errorRate: 0,
        avgResponseTimeMs: 0,
        totalTransactions: 0,
        enabled: processor.enabled,
      };
    }

    const total = window.length;
    const errors = window.filter((r) => r.status === 'error').length;
    const successes = window.filter((r) => r.status === 'approved').length;
    const avgResponseTimeMs =
      window.reduce((sum, r) => sum + r.responseTimeMs, 0) / total;

    const errorRate = errors / total;
    const successRate = successes / total;

    // With too few samples, keep status healthy to avoid false positives
    if (total < MIN_SAMPLES) {
      return {
        id: processor.id,
        name: processor.name,
        feePercent: processor.feePercent,
        status: 'healthy',
        successRate,
        errorRate,
        avgResponseTimeMs,
        totalTransactions: total,
        enabled: processor.enabled,
      };
    }

    // Rapid-detection: also check the most recent RAPID_SAMPLE_SIZE events.
    // If recent error rate spikes, use the worse of the two for fast response.
    const recent = window.slice(-RAPID_SAMPLE_SIZE);
    let effectiveErrorRate = errorRate;
    let effectiveAvgRt = avgResponseTimeMs;
    if (recent.length >= Math.floor(RAPID_SAMPLE_SIZE / 2)) {
      const recentErrors = recent.filter((r) => r.status === 'error').length;
      const recentAvgRt = recent.reduce((s, r) => s + r.responseTimeMs, 0) / recent.length;
      effectiveErrorRate = Math.max(errorRate, recentErrors / recent.length);
      effectiveAvgRt = Math.max(avgResponseTimeMs, recentAvgRt);
    }

    const status = this.computeStatus(effectiveErrorRate, effectiveAvgRt);

    return {
      id: processor.id,
      name: processor.name,
      feePercent: processor.feePercent,
      status,
      successRate,
      errorRate,
      avgResponseTimeMs,
      totalTransactions: total,
      enabled: processor.enabled,
    };
  }

  /** Get health for all processors. */
  getAllHealth(processors: Processor[]): ProcessorHealth[] {
    return processors.map((p) => this.getHealth(p));
  }

  /** Update thresholds at runtime (stretch: configurable thresholds). */
  updateThresholds(thresholds: Partial<HealthThresholds>): void {
    this.thresholds = { ...this.thresholds, ...thresholds };
  }

  getThresholds(): HealthThresholds {
    return { ...this.thresholds };
  }

  private computeStatus(errorRate: number, avgResponseTimeMs: number): ProcessorStatus {
    const { downErrorRate, downResponseTimeMs, degradedErrorRate, degradedResponseTimeMs } =
      this.thresholds;

    if (errorRate >= downErrorRate || avgResponseTimeMs >= downResponseTimeMs) {
      return 'down';
    }
    if (errorRate >= degradedErrorRate || avgResponseTimeMs >= degradedResponseTimeMs) {
      return 'degraded';
    }
    return 'healthy';
  }

  private getWindow(processorId: string): TransactionRecord[] {
    this.pruneOldRecords(processorId);
    return this.records.get(processorId) ?? [];
  }

  private pruneOldRecords(processorId: string): void {
    const cutoff = Date.now() - WINDOW_MS;
    const arr = this.records.get(processorId);
    if (!arr) return;
    // Remove entries older than the sliding window
    let i = 0;
    while (i < arr.length && arr[i].timestamp < cutoff) i++;
    if (i > 0) arr.splice(0, i);
  }
}
