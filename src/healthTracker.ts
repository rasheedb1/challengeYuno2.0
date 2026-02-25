import {
  WindowEvent,
  ProcessorHealth,
  ProcessorStatus,
  ThresholdConfig,
  EventType,
} from './types';

const DEFAULT_CONFIG: ThresholdConfig = {
  windowSizeMs: 15_000,     // 15-second sliding window for fast detection
  degradedThreshold: 0.92,  // below 92% → degraded  (baseline ~99%, so plenty of margin)
  downThreshold: 0.75,      // below 75% → down
  recentSampleSize: 8,      // also check last 8 events for rapid degradation
  minSamples: 8,            // need at least 8 events before downgrading status
};

export class HealthTracker {
  private readonly windows = new Map<string, WindowEvent[]>();
  private config: ThresholdConfig;

  constructor(processorIds: string[], config: Partial<ThresholdConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    for (const id of processorIds) {
      this.windows.set(id, []);
    }
  }

  recordEvent(processorId: string, type: EventType, latencyMs: number): void {
    const events = this.windows.get(processorId);
    if (!events) return;
    events.push({ timestamp: Date.now(), type, latencyMs });
    this.pruneWindow(processorId);
  }

  getHealth(processorId: string): ProcessorHealth {
    this.pruneWindow(processorId);
    const events = this.windows.get(processorId) ?? [];
    const total = events.length;

    if (total === 0) {
      return this.emptyHealth(processorId);
    }

    const successRate = computeSuccessRate(events);

    // With too few samples, report observed stats but keep status healthy
    // to avoid false positives from statistical noise on low-traffic windows.
    if (total < this.config.minSamples) {
      return {
        processorId,
        successRate,
        errorRate: countByType(events, 'error') / total,
        timeoutRate: countByType(events, 'timeout') / total,
        avgLatencyMs: Math.round(computeAvgLatency(events)),
        totalRequests: total,
        status: 'healthy',
        score: computeScore(successRate, computeAvgLatency(events)),
        lastUpdated: Date.now(),
      };
    }
    const errorRate = countByType(events, 'error') / total;
    const timeoutRate = countByType(events, 'timeout') / total;
    const avgLatencyMs = computeAvgLatency(events);

    // Fast-detection: also evaluate only the most recent N events
    const recentEvents = events.slice(-this.config.recentSampleSize);
    const recentSuccessRate =
      recentEvents.length >= Math.floor(this.config.recentSampleSize / 2)
        ? computeSuccessRate(recentEvents)
        : null;

    // Use the worse of full-window vs recent to detect degradation quickly
    const effectiveRate =
      recentSuccessRate !== null
        ? Math.min(successRate, recentSuccessRate)
        : successRate;

    const status = this.computeStatus(effectiveRate);
    const score = computeScore(effectiveRate, avgLatencyMs);

    return {
      processorId,
      successRate,
      errorRate,
      timeoutRate,
      avgLatencyMs: Math.round(avgLatencyMs),
      totalRequests: total,
      status,
      score,
      lastUpdated: Date.now(),
    };
  }

  getAllHealth(processorIds: string[]): ProcessorHealth[] {
    return processorIds.map((id) => this.getHealth(id));
  }

  updateConfig(config: Partial<ThresholdConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): ThresholdConfig {
    return { ...this.config };
  }

  private pruneWindow(processorId: string): void {
    const events = this.windows.get(processorId);
    if (!events) return;
    const cutoff = Date.now() - this.config.windowSizeMs;
    const pruned = events.filter((e) => e.timestamp >= cutoff);
    this.windows.set(processorId, pruned);
  }

  private computeStatus(successRate: number): ProcessorStatus {
    if (successRate >= this.config.degradedThreshold) return 'healthy';
    if (successRate >= this.config.downThreshold) return 'degraded';
    return 'down';
  }

  private emptyHealth(processorId: string): ProcessorHealth {
    return {
      processorId,
      successRate: 1,
      errorRate: 0,
      timeoutRate: 0,
      avgLatencyMs: 0,
      totalRequests: 0,
      status: 'healthy',
      score: 100,
      lastUpdated: Date.now(),
    };
  }
}

function countByType(events: WindowEvent[], type: EventType): number {
  return events.filter((e) => e.type === type).length;
}

function computeSuccessRate(events: WindowEvent[]): number {
  if (events.length === 0) return 1;
  return countByType(events, 'success') / events.length;
}

function computeAvgLatency(events: WindowEvent[]): number {
  if (events.length === 0) return 0;
  return events.reduce((sum, e) => sum + e.latencyMs, 0) / events.length;
}

function computeScore(successRate: number, avgLatencyMs: number): number {
  // 70% weight on success rate, 30% on latency (100ms = full, 3000ms = 0)
  const successScore = successRate * 70;
  const latencyScore = Math.max(0, 30 * (1 - avgLatencyMs / 3000));
  return Math.round(Math.min(100, successScore + latencyScore));
}
